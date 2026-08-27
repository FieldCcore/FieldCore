'use strict';

/**
 * agreementScheduler.js
 * Core automation engine for FieldCore recurring agreements.
 * Runs nightly — processes all active agreements to generate jobs,
 * ensure billing periods, and fire invoice creation when trigger conditions are met.
 */

const pool   = require('../db/pool');
const notify = require('./notify');

const TAG = '[AgreementScheduler]';

// ---------------------------------------------------------------------------
// Cadence helpers
// ---------------------------------------------------------------------------

/**
 * Returns the fixed interval in days for a cadence, or null for monthly.
 */
function getIntervalDays(cadence, intervalDays) {
  switch (cadence) {
    case 'weekly':         return 7;
    case 'every_2_weeks':  return 14;
    case 'every_3_weeks':  return 21;
    case 'every_4_weeks':  return 28;
    case 'monthly':        return null;
    case 'quarterly':      return 91;
    case 'annual':         return 365;
    case 'custom':         return intervalDays || null;
    default:               return null;
  }
}

/**
 * Snap a date to the nearest occurrence of targetWeekday (0=Sun…6=Sat) that is >= baseDate.
 */
function snapToWeekday(baseDate, targetWeekday) {
  const d = new Date(baseDate);
  const cur = d.getDay();
  let diff = targetWeekday - cur;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Returns next service date (Date object) from anchorDate.
 *
 * For weekly/biweekly/triweekly/4-weekly the anchor is snapped to preferredWeekday first,
 * then the interval repeats from that snapped anchor.
 *
 * For monthly: uses serviceDayOfMonth if set, else the day-of-month of anchorDate.
 *   Handles short months by clamping to the last day of the month.
 *
 * For quarterly/annual: exact day arithmetic from anchor.
 * For custom: exact day arithmetic using intervalDays.
 */
function nextOccurrenceDate(cadence, anchorDate, preferredWeekday, serviceDayOfMonth, intervalDays) {
  const anchor = new Date(anchorDate);

  if (cadence === 'monthly') {
    const dayTarget = serviceDayOfMonth != null ? serviceDayOfMonth : anchor.getDate();
    // Try same month first, then next month
    let d = new Date(anchor.getFullYear(), anchor.getMonth(), dayTarget);
    // Clamp to last day of the month
    const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    if (dayTarget > lastDay) {
      d = new Date(anchor.getFullYear(), anchor.getMonth(), lastDay);
    }
    if (d <= anchor) {
      // Move to next month
      const nm = anchor.getMonth() + 1;
      const ny = anchor.getFullYear() + Math.floor(nm / 12);
      const m  = nm % 12;
      const nmLastDay = new Date(ny, m + 1, 0).getDate();
      const clampedDay = Math.min(dayTarget, nmLastDay);
      d = new Date(ny, m, clampedDay);
    }
    return d;
  }

  // Fixed-interval cadences
  const days = getIntervalDays(cadence, intervalDays);
  if (days == null) {
    // Fallback — treat as monthly
    return nextOccurrenceDate('monthly', anchorDate, preferredWeekday, serviceDayOfMonth, intervalDays);
  }

  // For weekly/biweekly cadences, snap anchor to preferredWeekday first
  let base = new Date(anchor);
  if (
    preferredWeekday != null &&
    (cadence === 'weekly' || cadence === 'every_2_weeks' || cadence === 'every_3_weeks' || cadence === 'every_4_weeks')
  ) {
    base = snapToWeekday(base, preferredWeekday);
  }

  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Formats a Date as 'YYYY-MM-DD' string.
 */
function toDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

/**
 * Parses a 'YYYY-MM-DD' string to a local-midnight Date.
 */
function fromDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Normalises an address string for same-day grouping comparison.
 * Lowercase + collapse whitespace so minor formatting differences don't split groups.
 */
function normalizeAddress(addr) {
  return (addr || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Returns an array of the next `count` service date strings ('YYYY-MM-DD')
 * starting from fromDate (or today, whichever is later).
 */
function getUpcomingServiceDates(agreement, count, fromDate) {
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = fromDate ? new Date(fromDate) : today;
  startDate.setHours(0, 0, 0, 0);
  const effectiveFrom = startDate > today ? startDate : today;

  const { cadence, started_at, preferred_weekday, service_day_of_month, service_interval_days } = agreement;

  // Build initial anchor from started_at
  let anchor = fromDateStr(typeof started_at === 'string' ? started_at : toDateStr(new Date(started_at)));

  // For weekly/biweekly cadences with a preferredWeekday, snap the anchor once
  if (
    preferred_weekday != null &&
    (cadence === 'weekly' || cadence === 'every_2_weeks' || cadence === 'every_3_weeks' || cadence === 'every_4_weeks')
  ) {
    anchor = snapToWeekday(anchor, preferred_weekday);
  }

  // Fast-forward anchor to find the first occurrence >= effectiveFrom
  // We iterate forward using interval arithmetic
  const dates = [];
  let current = new Date(anchor);

  // Advance current until we reach or pass effectiveFrom
  const MAX_ITERS = 10000;
  let iters = 0;
  while (current < effectiveFrom && iters < MAX_ITERS) {
    current = nextOccurrenceDate(cadence, current, preferred_weekday, service_day_of_month, service_interval_days);
    iters++;
  }

  // Collect `count` dates starting from current
  let prev = current;
  if (current >= effectiveFrom) {
    dates.push(toDateStr(current));
  }
  while (dates.length < count) {
    const next = nextOccurrenceDate(cadence, prev, preferred_weekday, service_day_of_month, service_interval_days);
    dates.push(toDateStr(next));
    prev = next;
  }

  return dates.slice(0, count);
}

// ---------------------------------------------------------------------------
// Billing period helpers
// ---------------------------------------------------------------------------

/**
 * Returns {period_start, period_end} strings for the billing period containing targetDate.
 * Returns null for every_service cadence (handled separately).
 *
 * @param {string} billingCadence
 * @param {Date|string} anchorDate  — agreement started_at, used for anchor-based windows
 * @param {Date|string} targetDate  — date to find the period for
 * @param {number|null} billingIntervalMonths — for custom cadence
 */
function getBillingPeriod(billingCadence, anchorDate, targetDate, billingIntervalMonths) {
  if (billingCadence === 'every_service') return null;

  const anchor = typeof anchorDate === 'string' ? fromDateStr(anchorDate.slice(0, 10)) : new Date(anchorDate);
  const target = typeof targetDate === 'string' ? fromDateStr(targetDate.slice(0, 10)) : new Date(targetDate);

  if (billingCadence === 'monthly') {
    const start = new Date(target.getFullYear(), target.getMonth(), 1);
    const end   = new Date(target.getFullYear(), target.getMonth() + 1, 0);
    return { period_start: toDateStr(start), period_end: toDateStr(end) };
  }

  if (billingCadence === 'quarterly') {
    const q     = Math.floor(target.getMonth() / 3);
    const start = new Date(target.getFullYear(), q * 3, 1);
    const end   = new Date(target.getFullYear(), q * 3 + 3, 0);
    return { period_start: toDateStr(start), period_end: toDateStr(end) };
  }

  if (billingCadence === 'annual') {
    const start = new Date(target.getFullYear(), 0, 1);
    const end   = new Date(target.getFullYear(), 11, 31);
    return { period_start: toDateStr(start), period_end: toDateStr(end) };
  }

  if (billingCadence === 'weekly') {
    // Anchor-based 7-day windows
    const diffMs   = target - anchor;
    const diffDays = Math.floor(diffMs / 86400000);
    const windowIdx = Math.floor(diffDays / 7);
    const start    = new Date(anchor);
    start.setDate(start.getDate() + windowIdx * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { period_start: toDateStr(start), period_end: toDateStr(end) };
  }

  if (billingCadence === 'every_2_weeks') {
    const diffMs   = target - anchor;
    const diffDays = Math.floor(diffMs / 86400000);
    const windowIdx = Math.floor(diffDays / 14);
    const start    = new Date(anchor);
    start.setDate(start.getDate() + windowIdx * 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 13);
    return { period_start: toDateStr(start), period_end: toDateStr(end) };
  }

  if (billingCadence === 'custom') {
    if (billingIntervalMonths) {
      // Month-based custom windows anchored from started_at
      // Find how many full billingIntervalMonths periods have elapsed since anchor
      const anchorYear  = anchor.getFullYear();
      const anchorMonth = anchor.getMonth();
      const targetYear  = target.getFullYear();
      const targetMonth = target.getMonth();
      const totalMonths = (targetYear - anchorYear) * 12 + (targetMonth - anchorMonth);
      const windowIdx   = Math.floor(totalMonths / billingIntervalMonths);

      const startMonth = anchorMonth + windowIdx * billingIntervalMonths;
      const start = new Date(anchorYear + Math.floor(startMonth / 12), startMonth % 12, anchor.getDate());
      const endMonthRaw = startMonth + billingIntervalMonths;
      const endBase = new Date(anchorYear + Math.floor(endMonthRaw / 12), endMonthRaw % 12, anchor.getDate());
      const end   = new Date(endBase);
      end.setDate(end.getDate() - 1);
      return { period_start: toDateStr(start), period_end: toDateStr(end) };
    } else {
      // Day-based: default 30-day windows from anchor
      const periodDays = 30;
      const diffMs    = target - anchor;
      const diffDays  = Math.floor(diffMs / 86400000);
      const windowIdx = Math.floor(diffDays / periodDays);
      const start     = new Date(anchor);
      start.setDate(start.getDate() + windowIdx * periodDays);
      const end = new Date(start);
      end.setDate(end.getDate() + periodDays - 1);
      return { period_start: toDateStr(start), period_end: toDateStr(end) };
    }
  }

  // Fallback: monthly
  const start = new Date(target.getFullYear(), target.getMonth(), 1);
  const end   = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  return { period_start: toDateStr(start), period_end: toDateStr(end) };
}

/**
 * Returns the next billing period immediately following the given period.
 */
function getNextBillingPeriod(billingCadence, anchorDate, currentPeriodEnd, billingIntervalMonths) {
  // Target one day after the current period end
  const nextDay = fromDateStr(currentPeriodEnd);
  nextDay.setDate(nextDay.getDate() + 1);
  return getBillingPeriod(billingCadence, anchorDate, nextDay, billingIntervalMonths);
}

// ---------------------------------------------------------------------------
// Billing amount
// ---------------------------------------------------------------------------

/**
 * Returns {billingAmount, discountAmount, netAmount} based on plan_price and discount config.
 */
function computeBillingAmount(agreement) {
  const billingAmount = parseFloat(agreement.plan_price) || 0;

  let discountAmount = 0;
  if (agreement.discount_type === 'percent' && agreement.discount_value != null) {
    discountAmount = billingAmount * parseFloat(agreement.discount_value) / 100;
  } else if (agreement.discount_type === 'fixed' && agreement.discount_value != null) {
    discountAmount = parseFloat(agreement.discount_value);
  }

  const netAmount = Math.max(0, billingAmount - discountAmount);
  return { billingAmount, discountAmount, netAmount };
}

// ---------------------------------------------------------------------------
// End condition check
// ---------------------------------------------------------------------------

/**
 * Checks if the agreement has hit its end condition and marks it 'completed' if so.
 * Uses end_condition_type to determine which check to run — only one check is canonical.
 * Historical jobs and invoices are preserved; only future generation stops.
 */
async function checkEndConditions(agreement, client) {
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  let shouldComplete = false;
  let reason         = '';

  const condType = agreement.end_condition_type || 'none';

  if (condType === 'date' && agreement.end_date) {
    const endDate = fromDateStr(
      typeof agreement.end_date === 'string'
        ? agreement.end_date.slice(0, 10)
        : toDateStr(new Date(agreement.end_date))
    );
    if (today > endDate) {
      shouldComplete = true;
      reason         = `end date ${toDateStr(endDate)} has passed`;
    }
  } else if (condType === 'service_count' && agreement.end_after_occurrences != null) {
    const res = await client.query(
      `SELECT COUNT(*) AS cnt FROM jobs
       WHERE agreement_id = $1 AND status = 'complete'`,
      [agreement.id]
    );
    const cnt = parseInt(res.rows[0].cnt, 10);
    if (cnt >= agreement.end_after_occurrences) {
      shouldComplete = true;
      reason         = `service count reached (${cnt} of ${agreement.end_after_occurrences})`;
    }
  } else if (condType === 'billing_period_count' && agreement.end_after_periods != null) {
    const res = await client.query(
      `SELECT COUNT(*) AS cnt FROM agreement_invoice_periods
       WHERE agreement_id = $1 AND invoice_id IS NOT NULL`,
      [agreement.id]
    );
    const cnt = parseInt(res.rows[0].cnt, 10);
    if (cnt >= agreement.end_after_periods) {
      shouldComplete = true;
      reason         = `billing period count reached (${cnt} of ${agreement.end_after_periods})`;
    }
  }
  // condType === 'none': no end condition — agreement runs until manually stopped

  if (shouldComplete) {
    console.log(`${TAG} Agreement ${agreement.id} (${agreement.name}) completing: ${reason}`);
    await client.query(
      `UPDATE recurring_agreements SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [agreement.id]
    );
    agreement.status = 'completed'; // mutate in-memory so callers skip further processing
  }
}

// ---------------------------------------------------------------------------
// Per-schedule end condition check
// ---------------------------------------------------------------------------

/**
 * Checks if an individual recurring_agreement_schedules row has hit its end
 * condition and marks it 'completed' if so.  Called before date generation for
 * each schedule so expired schedules stop producing new jobs immediately.
 */
async function checkScheduleEndConditions(schedule, client) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const condType = schedule.end_condition_type || 'none';
  let shouldComplete = false;

  if (condType === 'date' && schedule.end_date) {
    const endDate = fromDateStr(
      typeof schedule.end_date === 'string'
        ? schedule.end_date.slice(0, 10)
        : toDateStr(new Date(schedule.end_date))
    );
    if (today > endDate) shouldComplete = true;
  } else if (condType === 'service_count' && schedule.end_after_occurrences != null) {
    const res = await client.query(
      `SELECT COUNT(*) AS cnt FROM agreement_schedule_occurrences aso
       JOIN jobs j ON j.id = aso.job_id
       WHERE aso.schedule_id = $1 AND j.status = 'complete'`,
      [schedule.id]
    );
    if (parseInt(res.rows[0].cnt, 10) >= schedule.end_after_occurrences) shouldComplete = true;
  }

  if (shouldComplete) {
    await client.query(
      `UPDATE recurring_agreement_schedules SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [schedule.id]
    );
    schedule.status = 'completed';
  }
}

// ---------------------------------------------------------------------------
// Job generation
// ---------------------------------------------------------------------------

/**
 * Creates upcoming jobs for the agreement for the next 45 days.
 *
 * Multi-schedule mode (preferred): loads all active child schedules, generates
 * occurrence dates per schedule, groups by (date, normalized_address), and
 * creates ONE job per group.  Inserts agreement_schedule_occurrences rows for
 * idempotent traceability.
 *
 * Legacy fallback: when no child schedules exist the agreement's own cadence
 * fields drive a single job per date (backwards-compatible with pre-V4 data
 * that the backfill migration may not have reached yet).
 */
async function generateUpcomingJobs(agreement, client) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 45);
  const horizonStr = toDateStr(horizon);

  // Load active child schedules
  const schRes = await client.query(
    `SELECT * FROM recurring_agreement_schedules
     WHERE agreement_id = $1 AND status = 'active'
     ORDER BY sort_order`,
    [agreement.id]
  );
  const schedules = schRes.rows;

  if (schedules.length === 0) {
    return generateUpcomingJobsLegacy(agreement, client);
  }

  // Build (date, normalizedAddress) → group map
  const groupMap = new Map();

  for (const schedule of schedules) {
    await checkScheduleEndConditions(schedule, client);
    if (schedule.status !== 'active') continue;

    // Per-schedule horizon: respect schedule-level end_date
    let schedHorizon = horizonStr;
    if (schedule.end_condition_type === 'date' && schedule.end_date) {
      const endStr = typeof schedule.end_date === 'string'
        ? schedule.end_date.slice(0, 10)
        : toDateStr(new Date(schedule.end_date));
      if (endStr < schedHorizon) schedHorizon = endStr;
    }

    const estDays = getIntervalDays(schedule.cadence, schedule.service_interval_days) || 30;
    const approxCount = Math.ceil(45 / estDays) + 3;
    const dates = getUpcomingServiceDates(schedule, approxCount, toDateStr(today))
      .filter(d => d <= schedHorizon);

    const normalizedAddr = normalizeAddress(
      schedule.service_address || agreement.service_address || ''
    );

    for (const dateStr of dates) {
      const key = `${dateStr}:${normalizedAddr}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          dateStr,
          address: schedule.service_address || agreement.service_address || null,
          scheduleItems: [],
        });
      }
      groupMap.get(key).scheduleItems.push(schedule);
    }
  }

  let created = 0;

  for (const [, group] of groupMap) {
    const { dateStr, scheduleItems } = group;
    try {
      // Determine which schedules in this group still need an occurrence row.
      // Also discover any existing job_id already linked to this address group
      // (identified via occurrence rows — NOT by querying jobs directly, which
      // would find jobs from other address groups on the same date).
      const scheduleIds = scheduleItems.map(s => s.id);
      const existingOcc = await client.query(
        `SELECT schedule_id, job_id FROM agreement_schedule_occurrences
         WHERE schedule_id = ANY($1::uuid[]) AND occurrence_date = $2`,
        [scheduleIds, dateStr]
      );
      const alreadyLinked = new Set(existingOcc.rows.map(r => r.schedule_id));
      const newItems = scheduleItems.filter(s => !alreadyLinked.has(s.id));
      if (newItems.length === 0) continue;

      // Reuse the job already linked to THIS group (if any schedule in the group
      // already has an occurrence row pointing to a job).  Do NOT search by
      // agreement_id+date alone — that would accidentally reuse jobs that belong
      // to a different address group on the same day.
      const existingJobRow = existingOcc.rows.find(r => r.job_id != null);
      let jobId = existingJobRow ? existingJobRow.job_id : null;

      if (!jobId) {
        // Multi-schedule label: "Service A · Service B"; solo: schedule's service_type
        const serviceLabel = scheduleItems.length === 1
          ? (scheduleItems[0].service_type || agreement.service_type || 'Service')
          : scheduleItems.map(s => s.service_type || s.asset_label || 'Service').join(' · ');

        const startTime = scheduleItems[0].preferred_start_time || '09:00';
        const scheduledAt = `${dateStr}T${startTime}:00`;

        const jobRes = await client.query(
          `INSERT INTO jobs
             (account_id, client_id, service_type, scheduled_at, status, agreement_id, agreement_schedule_id)
           VALUES ($1, $2, $3, $4::timestamp, 'scheduled', $5, $6)
           RETURNING id`,
          [
            agreement.account_id,
            agreement.client_id,
            serviceLabel,
            scheduledAt,
            agreement.id,
            scheduleItems.length === 1 ? scheduleItems[0].id : null,
          ]
        );
        jobId = jobRes.rows[0].id;
        created++;
        console.log(
          `${TAG} Created job ${jobId} for agreement ${agreement.id} on ${dateStr}` +
          ` (${scheduleItems.length} schedule(s))`
        );
      }

      // Upsert occurrence rows for each newly-linked schedule
      for (const schedule of newItems) {
        await client.query(
          `INSERT INTO agreement_schedule_occurrences
             (account_id, agreement_id, schedule_id, job_id, occurrence_date)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (schedule_id, occurrence_date) DO UPDATE SET job_id = EXCLUDED.job_id`,
          [agreement.account_id, agreement.id, schedule.id, jobId, dateStr]
        );
      }
    } catch (err) {
      console.error(
        `${TAG} Error generating job for agreement ${agreement.id} on ${dateStr}:`,
        err.message
      );
    }
  }

  if (created > 0) {
    console.log(`${TAG} Agreement ${agreement.id}: generated ${created} new job(s)`);
  }
}

/**
 * Legacy single-schedule job generation — used when an agreement has no child
 * schedule rows (pre-migration data or edge cases).
 */
async function generateUpcomingJobsLegacy(agreement, client) {
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 45);
  const horizonStr = toDateStr(horizon);

  // Count how many dates we need — estimate generously based on cadence
  const estDays = getIntervalDays(agreement.cadence, agreement.service_interval_days) || 30;
  const approxCount = Math.ceil(45 / estDays) + 3;

  const upcomingDates = getUpcomingServiceDates(agreement, approxCount, toDateStr(today));

  // Filter to only dates within the 45-day horizon, respecting end conditions
  let datesToProcess = upcomingDates.filter(d => d <= horizonStr);

  // Cutoff: do not schedule jobs beyond the specific end date
  if (agreement.end_condition_type === 'date' && agreement.end_date) {
    const endStr = typeof agreement.end_date === 'string'
      ? agreement.end_date.slice(0, 10)
      : toDateStr(new Date(agreement.end_date));
    datesToProcess = datesToProcess.filter(d => d <= endStr);
  }

  let created = 0;
  for (const dateStr of datesToProcess) {
    try {
      // Check if a job already exists for this date
      const existing = await client.query(
        `SELECT id FROM jobs
         WHERE agreement_id = $1 AND scheduled_at::date = $2 AND status != 'cancelled'`,
        [agreement.id, dateStr]
      );
      if (existing.rows.length > 0) continue;

      const scheduledAt = `${dateStr}T09:00:00`;
      const res = await client.query(
        `INSERT INTO jobs (account_id, client_id, service_type, scheduled_at, status, agreement_id)
         VALUES ($1, $2, $3, $4::timestamp, 'scheduled', $5)
         RETURNING id`,
        [agreement.account_id, agreement.client_id, agreement.service_type, scheduledAt, agreement.id]
      );
      console.log(
        `${TAG} Created job ${res.rows[0].id} for agreement ${agreement.id} on ${dateStr}`
      );
      created++;
    } catch (err) {
      console.error(
        `${TAG} Error creating job for agreement ${agreement.id} on ${dateStr}:`,
        err.message
      );
    }
  }

  if (created > 0) {
    console.log(`${TAG} Agreement ${agreement.id}: generated ${created} new job(s)`);
  }
}

// ---------------------------------------------------------------------------
// Billing period creation
// ---------------------------------------------------------------------------

/**
 * Ensures the current and next billing periods exist in agreement_invoice_periods.
 * Uses ON CONFLICT DO NOTHING for idempotency.
 * After inserting, refreshes used_occurrence_count for un-invoiced periods.
 */
async function ensureBillingPeriods(agreement, client) {
  if (agreement.billing_cadence === 'every_service') {
    // Per-service billing — no period rows needed here
    return;
  }

  const today    = toDateStr(new Date());
  const anchor   = typeof agreement.started_at === 'string'
    ? agreement.started_at.slice(0, 10)
    : toDateStr(new Date(agreement.started_at));

  const currentPeriod = getBillingPeriod(
    agreement.billing_cadence, anchor, today, agreement.billing_interval_months
  );
  if (!currentPeriod) return;

  const nextPeriod = getNextBillingPeriod(
    agreement.billing_cadence, anchor, currentPeriod.period_end, agreement.billing_interval_months
  );

  const { billingAmount, discountAmount } = computeBillingAmount(agreement);
  const periods = nextPeriod ? [currentPeriod, nextPeriod] : [currentPeriod];

  for (const period of periods) {
    try {
      await client.query(
        `INSERT INTO agreement_invoice_periods
           (account_id, agreement_id, period_start, period_end,
            billing_amount_snapshot, discount_amount_snapshot,
            payment_status, coverage_status, included_occurrence_count, plan_amount)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'open', $7, $8)
         ON CONFLICT (agreement_id, period_start, period_end) DO NOTHING`,
        [
          agreement.account_id,
          agreement.id,
          period.period_start,
          period.period_end,
          billingAmount,
          discountAmount,
          agreement.included_services_per_period || 0,
          billingAmount,
        ]
      );
    } catch (err) {
      console.error(
        `${TAG} Error ensuring period ${period.period_start}–${period.period_end} for agreement ${agreement.id}:`,
        err.message
      );
    }
  }

  // Update used_occurrence_count for all un-invoiced periods
  try {
    await client.query(
      `UPDATE agreement_invoice_periods aip
       SET used_occurrence_count = (
         SELECT COUNT(*) FROM jobs j
         WHERE j.agreement_id = aip.agreement_id
           AND j.scheduled_at::date BETWEEN aip.period_start AND aip.period_end
           AND j.status != 'cancelled'
       )
       WHERE aip.agreement_id = $1 AND aip.invoice_id IS NULL`,
      [agreement.id]
    );
  } catch (err) {
    console.error(
      `${TAG} Error updating used_occurrence_count for agreement ${agreement.id}:`,
      err.message
    );
  }
}

// ---------------------------------------------------------------------------
// Invoice creation
// ---------------------------------------------------------------------------

/**
 * Builds a human-readable period label, e.g. "Aug 2026" or "Aug 1 – Aug 31, 2026".
 */
function buildPeriodLabel(periodStart, periodEnd) {
  const start = fromDateStr(periodStart);
  const end   = fromDateStr(periodEnd);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${months[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${months[start.getMonth()]} ${start.getDate()} – ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

/**
 * Creates an invoice for a billing period. Idempotent — exits early if invoice_id already set.
 */
async function createPeriodInvoice(agreement, period, client) {
  // 1. Re-check with lock to prevent duplicate creation
  const lockRes = await client.query(
    `SELECT invoice_id FROM agreement_invoice_periods WHERE id = $1 FOR UPDATE`,
    [period.id]
  );
  if (!lockRes.rows.length || lockRes.rows[0].invoice_id != null) {
    console.log(`${TAG} Period ${period.id} already invoiced — skipping`);
    return;
  }

  // 2. Assign invoice number atomically
  let invoiceNumber;
  try {
    const seqRes = await client.query(
      `WITH seed AS (
         SELECT COALESCE(
           (SELECT next_val FROM invoice_number_sequences WHERE account_id = $1),
           (SELECT MAX(invoice_number) + 1 FROM invoices
            WHERE account_id = $1 AND invoice_number IS NOT NULL),
           (SELECT invoice_starting_number FROM booking_settings WHERE account_id = $1),
           0
         ) AS first_val
       )
       INSERT INTO invoice_number_sequences (account_id, next_val, starting_number)
       SELECT $1, (SELECT first_val FROM seed) + 1, (SELECT first_val FROM seed)
       ON CONFLICT (account_id) DO UPDATE
         SET next_val = invoice_number_sequences.next_val + 1
       RETURNING next_val - 1 AS invoice_number`,
      [agreement.account_id]
    );
    invoiceNumber = seqRes.rows[0].invoice_number;
  } catch (err) {
    console.error(`${TAG} Failed to assign invoice number for agreement ${agreement.id}:`, err.message);
    throw err;
  }

  // 3. Compute amounts
  const { billingAmount, discountAmount, netAmount } = computeBillingAmount(agreement);

  // 4. Build line items
  let lineItems;
  if (Array.isArray(agreement.line_items) && agreement.line_items.length > 0) {
    lineItems = agreement.line_items;
  } else {
    lineItems = [
      {
        name:   agreement.service_type || agreement.name,
        amount: billingAmount,
      },
    ];
  }

  // 5. Subject and status
  const periodLabel = buildPeriodLabel(period.period_start, period.period_end);
  const subject     = `${agreement.name} — ${periodLabel}`;
  const status      = agreement.payment_behavior === 'create_only' ? 'draft' : 'pending';

  // 6. Create invoice
  let invoiceId;
  try {
    const invRes = await client.query(
      `INSERT INTO invoices
         (account_id, client_id, source_type, source_agreement_id, agreement_period_id,
          status, amount, subtotal, discount_amount, line_items, invoice_number, subject)
       VALUES ($1, $2, 'RECURRING_AGREEMENT', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        agreement.account_id,
        agreement.client_id,
        agreement.id,
        period.id,
        status,
        netAmount,
        billingAmount,
        discountAmount,
        JSON.stringify(lineItems),
        invoiceNumber,
        subject,
      ]
    );
    invoiceId = invRes.rows[0].id;
  } catch (err) {
    console.error(`${TAG} Failed to create invoice for period ${period.id}:`, err.message);
    throw err;
  }

  // 7. Update period with invoice_id
  await client.query(
    `UPDATE agreement_invoice_periods
     SET invoice_id = $1, payment_status = 'invoiced', coverage_status = 'paid_in_advance'
     WHERE id = $2`,
    [invoiceId, period.id]
  );

  // 8. Mark covered jobs (up to included_services_per_period)
  const included = agreement.included_services_per_period || 0;
  if (included > 0) {
    await client.query(
      `UPDATE jobs SET agreement_period_id = $1, agreement_coverage_status = 'covered'
       WHERE id IN (
         SELECT id FROM jobs
         WHERE agreement_id = $2
           AND scheduled_at::date BETWEEN $3 AND $4
           AND status != 'cancelled'
           AND agreement_period_id IS NULL
         ORDER BY scheduled_at
         LIMIT $5
       )`,
      [invoiceId, agreement.id, period.period_start, period.period_end, included]
    );

    // Mark extra jobs beyond the included count
    await client.query(
      `UPDATE jobs SET agreement_period_id = $1, agreement_coverage_status = 'extra'
       WHERE agreement_id = $2
         AND scheduled_at::date BETWEEN $3 AND $4
         AND status != 'cancelled'
         AND agreement_period_id IS NULL`,
      [invoiceId, agreement.id, period.period_start, period.period_end]
    );
  } else {
    // No included count — mark all as covered
    await client.query(
      `UPDATE jobs SET agreement_period_id = $1, agreement_coverage_status = 'covered'
       WHERE agreement_id = $2
         AND scheduled_at::date BETWEEN $3 AND $4
         AND status != 'cancelled'
         AND agreement_period_id IS NULL`,
      [invoiceId, agreement.id, period.period_start, period.period_end]
    );
  }

  console.log(
    `${TAG} Invoice #${invoiceNumber} (${invoiceId}) created for agreement ${agreement.id} — ${subject}`
  );

  // 9. Notify the account
  notify.create(
    agreement.account_id,
    'agreement_invoice',
    'Agreement invoice created',
    `${agreement.name} — ${period.period_start}`,
    '/invoices'
  );
}

// ---------------------------------------------------------------------------
// Billing trigger evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates billing triggers for all open (uninvoiced, pending) periods on the agreement.
 */
async function evaluateBillingTriggers(agreement, client) {
  // Handle every_service cadence separately — one invoice per completed job not yet invoiced
  if (agreement.billing_trigger === 'every_service') {
    await handleEveryServiceTrigger(agreement, client);
    return;
  }

  // Query all open periods
  const periodsRes = await client.query(
    `SELECT * FROM agreement_invoice_periods
     WHERE agreement_id = $1 AND invoice_id IS NULL AND payment_status = 'pending'
     ORDER BY period_start`,
    [agreement.id]
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const period of periodsRes.rows) {
    try {
      const triggered = await checkTriggerCondition(agreement, period, today, client);
      if (triggered) {
        await createPeriodInvoice(agreement, period, client);
      }
    } catch (err) {
      console.error(
        `${TAG} Error processing trigger for period ${period.id} (agreement ${agreement.id}):`,
        err.message
      );
    }
  }
}

/**
 * Returns true if the billing trigger condition is met for the given period.
 */
async function checkTriggerCondition(agreement, period, today, client) {
  const periodStart = fromDateStr(period.period_start);

  switch (agreement.billing_trigger) {
    case 'first_day': {
      return today >= periodStart;
    }

    case 'specific_day': {
      const billingDay = Math.min(
        agreement.billing_day || 1,
        new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      );
      return today.getDate() >= billingDay && today >= periodStart;
    }

    case 'first_scheduled': {
      const res = await client.query(
        `SELECT COUNT(*) AS cnt FROM jobs
         WHERE agreement_id = $1
           AND scheduled_at::date BETWEEN $2 AND $3
           AND status != 'cancelled'`,
        [agreement.id, period.period_start, period.period_end]
      );
      return parseInt(res.rows[0].cnt, 10) >= 1;
    }

    case 'first_completed': {
      const res = await client.query(
        `SELECT COUNT(*) AS cnt FROM jobs
         WHERE agreement_id = $1
           AND scheduled_at::date BETWEEN $2 AND $3
           AND status = 'complete'`,
        [agreement.id, period.period_start, period.period_end]
      );
      return parseInt(res.rows[0].cnt, 10) >= 1;
    }

    case 'days_before_first_service': {
      const res = await client.query(
        `SELECT MIN(scheduled_at::date)::text AS first_date FROM jobs
         WHERE agreement_id = $1
           AND scheduled_at::date BETWEEN $2 AND $3
           AND status != 'cancelled'`,
        [agreement.id, period.period_start, period.period_end]
      );
      if (!res.rows[0].first_date) return false;
      const firstService  = fromDateStr(res.rows[0].first_date);
      const daysBefore    = agreement.days_before_service || 0;
      const triggerDate   = new Date(firstService);
      triggerDate.setDate(triggerDate.getDate() - daysBefore);
      return today >= triggerDate;
    }

    default:
      return false;
  }
}

/**
 * Handles every_service billing — creates one invoice per completed job that is not
 * yet linked to an invoice through its period.
 */
async function handleEveryServiceTrigger(agreement, client) {
  // Find completed jobs for this agreement that have no agreement_period_id
  const jobsRes = await client.query(
    `SELECT * FROM jobs
     WHERE agreement_id = $1
       AND status = 'complete'
       AND agreement_period_id IS NULL
     ORDER BY scheduled_at`,
    [agreement.id]
  );

  for (const job of jobsRes.rows) {
    try {
      const dateStr = toDateStr(new Date(job.scheduled_at));

      // Ensure a period row exists for this single job date
      const { billingAmount, discountAmount } = computeBillingAmount(agreement);
      await client.query(
        `INSERT INTO agreement_invoice_periods
           (account_id, agreement_id, period_start, period_end,
            billing_amount_snapshot, discount_amount_snapshot,
            payment_status, coverage_status, included_occurrence_count, plan_amount)
         VALUES ($1, $2, $3, $3, $4, $5, 'pending', 'open', 1, $4)
         ON CONFLICT (agreement_id, period_start, period_end) DO NOTHING`,
        [agreement.account_id, agreement.id, dateStr, billingAmount, discountAmount]
      );

      // Fetch the period row
      const periodRes = await client.query(
        `SELECT * FROM agreement_invoice_periods
         WHERE agreement_id = $1 AND period_start = $2 AND period_end = $2`,
        [agreement.id, dateStr]
      );
      if (!periodRes.rows.length) continue;
      const period = periodRes.rows[0];
      if (period.invoice_id != null) continue; // already invoiced

      await createPeriodInvoice(agreement, period, client);
    } catch (err) {
      console.error(
        `${TAG} Error processing every_service invoice for job ${job.id}:`,
        err.message
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Core entry points
// ---------------------------------------------------------------------------

/**
 * Processes a single agreement — runs all scheduler steps in order.
 * Uses a dedicated pool client for the duration of processing.
 */
async function processAgreement(agreement) {
  const client = await pool.connect();
  try {
    console.log(`${TAG} Processing agreement ${agreement.id} (${agreement.name})`);

    // Step 1: check end conditions (may mark expired)
    await checkEndConditions(agreement, client);

    if (agreement.status !== 'active') {
      console.log(`${TAG} Agreement ${agreement.id} is no longer active (status: ${agreement.status}) — skipping remaining steps`);
      return;
    }

    // Step 2: generate upcoming jobs (45-day horizon)
    await generateUpcomingJobs(agreement, client);

    // Step 3: ensure current + next billing periods exist
    await ensureBillingPeriods(agreement, client);

    // Step 4: evaluate billing triggers and create invoices where conditions are met
    await evaluateBillingTriggers(agreement, client);

    console.log(`${TAG} Done processing agreement ${agreement.id}`);
  } catch (err) {
    console.error(`${TAG} Unhandled error processing agreement ${agreement.id}:`, err.message, err.stack);
  } finally {
    client.release();
  }
}

/**
 * Processes all active recurring agreements.
 * Errors per agreement are caught so a single failure does not block others.
 */
async function processAllAgreements() {
  console.log(`${TAG} Starting nightly agreement run…`);

  let agreements;
  try {
    const res = await pool.query(
      `SELECT * FROM recurring_agreements WHERE status = 'active'`
    );
    agreements = res.rows;
  } catch (err) {
    console.error(`${TAG} Failed to fetch active agreements:`, err.message);
    return;
  }

  console.log(`${TAG} Found ${agreements.length} active agreement(s)`);

  for (const agreement of agreements) {
    try {
      await processAgreement(agreement);
    } catch (err) {
      // processAgreement already catches and logs internally, but this is a safety net
      console.error(`${TAG} Fatal error for agreement ${agreement.id}:`, err.message);
    }
  }

  console.log(`${TAG} Nightly agreement run complete — processed ${agreements.length} agreement(s)`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { processAllAgreements, processAgreement };
