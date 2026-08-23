'use strict';
const pool = require('../db/pool');

function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }
function pi(v) { return parseInt(v, 10) || 0; }

// ── Documented readiness thresholds ──────────────────────────────────────────
// INSUFFICIENT_DATA: < 5 completed jobs OR < 14 days of history
//   → not enough signal for a daily run-rate; show earned+booked only
// LIMITED:           ≥ 5 jobs AND ≥ 14 days AND < 30 days
//   → some signal; projections carry LOW confidence
// READY:             ≥ 5 jobs AND ≥ 30 days
//   → enough history for stable daily run-rate; MEDIUM+ confidence possible
const MIN_JOBS         = 5;
const MIN_DAYS         = 14;
const READY_DAYS       = 30;
const RATE_WINDOW_DAYS = 90;   // historical window for daily run-rate

// ── Confidence thresholds ─────────────────────────────────────────────────────
// HIGH:   ≥ 60 days history AND ≥ 20 completed jobs AND ≥ 50% of projected already booked
// MEDIUM: ≥ 30 days history AND ≥ 10 completed jobs
// LOW:    everything else (including INSUFFICIENT_DATA and LIMITED)
const HIGH_DAYS     = 60;
const HIGH_JOBS     = 20;
const HIGH_COVERAGE = 0.50;
const MED_DAYS      = 30;
const MED_JOBS      = 10;

async function getOverview(accountId, { start, end } = {}) {
  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const periodStart = start || todayStr;
  const periodEnd   = end   || todayStr;
  const asOf        = todayStr;
  const isPast      = periodEnd < todayStr;

  // ── 1. Historical baseline (all-time) ─────────────────────────────────────
  const [histRes, futureRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int                                  AS completed_jobs,
         (CURRENT_DATE - MIN(scheduled_at)::date)::int AS history_days
       FROM jobs
       WHERE account_id = $1 AND status = 'complete'`,
      [accountId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS future_jobs
       FROM jobs
       WHERE account_id = $1
         AND status NOT IN ('complete','cancelled','no_show')
         AND scheduled_at > NOW()`,
      [accountId]
    ),
  ]);

  const completedJobs       = pi(histRes.rows[0]?.completed_jobs);
  const historyDays         = pi(histRes.rows[0]?.history_days);
  const scheduledFutureJobs = pi(futureRes.rows[0]?.future_jobs);

  // ── Readiness classification ──────────────────────────────────────────────
  let readinessStatus;
  const limitations = [];

  if (completedJobs < MIN_JOBS || historyDays < MIN_DAYS) {
    readinessStatus = 'INSUFFICIENT_DATA';
    if (completedJobs < MIN_JOBS)
      limitations.push(`${completedJobs} completed job${completedJobs !== 1 ? 's' : ''} — ${MIN_JOBS} needed for a reliable baseline`);
    if (historyDays < MIN_DAYS)
      limitations.push(`${historyDays} day${historyDays !== 1 ? 's' : ''} of job history — ${MIN_DAYS} needed for a reliable baseline`);
  } else if (historyDays < READY_DAYS) {
    readinessStatus = 'LIMITED';
    limitations.push(`${historyDays} days of history — projections improve after ${READY_DAYS} days`);
  } else {
    readinessStatus = 'READY';
  }

  // ── 2. Earned revenue in period ───────────────────────────────────────────
  // For a current/future period: earned up to today only (not projecting past)
  // For a past period: earned through period end
  const earnedCutoff = isPast ? periodEnd : asOf;
  const earnedRes = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS earned
     FROM jobs
     WHERE account_id = $1
       AND status = 'complete'
       AND scheduled_at >= $2::date
       AND scheduled_at < ($3::date + INTERVAL '1 day')`,
    [accountId, periodStart, earnedCutoff]
  );
  const earnedRevenue = pf(earnedRes.rows[0]?.earned);

  // ── 3. Booked future revenue within period horizon ────────────────────────
  // Booked = scheduled eligible jobs AFTER now AND before/on period end.
  // Excluded: complete, cancelled, no_show.
  const bookedRes = await pool.query(
    `SELECT
       COUNT(*)::int            AS job_count,
       COALESCE(SUM(amount), 0) AS revenue
     FROM jobs
     WHERE account_id = $1
       AND status NOT IN ('complete','cancelled','no_show')
       AND scheduled_at > NOW()
       AND scheduled_at < ($2::date + INTERVAL '1 day')`,
    [accountId, periodEnd]
  );
  const bookedJobCount = isPast ? 0 : pi(bookedRes.rows[0]?.job_count);
  const bookedRevenue  = isPast ? 0 : pf(bookedRes.rows[0]?.revenue);

  // ── 4. Historical daily run-rate (READY + LIMITED only) ───────────────────
  // Formula: SUM(completed job revenue in last RATE_WINDOW_DAYS days) / RATE_WINDOW_DAYS
  // This is a conservative backward-looking average — no growth assumptions.
  let dailyRate = 0;
  if (readinessStatus !== 'INSUFFICIENT_DATA') {
    const rateRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM jobs
       WHERE account_id = $1
         AND status = 'complete'
         AND scheduled_at >= CURRENT_DATE - INTERVAL '${RATE_WINDOW_DAYS} days'
         AND scheduled_at < NOW()`,
      [accountId]
    );
    dailyRate = pf(rateRes.rows[0]?.total) / RATE_WINDOW_DAYS;
  }

  // ── 5. Expected unbooked revenue ──────────────────────────────────────────
  // Only computed when readiness ≥ LIMITED and period is not entirely in the past.
  //
  // Remaining days = tomorrow through period end (inclusive), capped at 365.
  // Expected gross = dailyRate × remaining days
  // Expected unbooked = max(0, expectedGross − bookedRevenue)
  //   (if booked already exceeds historical run-rate, unbooked = 0)
  let expectedUnbookedRevenue = 0;
  let remainingDays = 0;

  if (!isPast && readinessStatus !== 'INSUFFICIENT_DATA') {
    const tomorrow     = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const periodEndDate = new Date(periodEnd + 'T00:00:00Z');
    remainingDays = Math.max(0, Math.min(365,
      Math.ceil((periodEndDate.getTime() - tomorrow.getTime()) / 86400000) + 1
    ));
    const expectedGross = dailyRate * remainingDays;
    expectedUnbookedRevenue = pf(Math.max(0, expectedGross - bookedRevenue));
  }

  // ── 6. Projections ────────────────────────────────────────────────────────
  const projectedRevenue = isPast
    ? earnedRevenue   // past period: actual only
    : pf(earnedRevenue + bookedRevenue + expectedUnbookedRevenue);
  const forecastGap = pf(projectedRevenue - earnedRevenue);

  // ── 7. Confidence ─────────────────────────────────────────────────────────
  let confidence = null;
  const confidenceReasons = [];

  if (!isPast) {
    const bookedCoverage = projectedRevenue > 0 ? bookedRevenue / projectedRevenue : 0;

    if (readinessStatus !== 'INSUFFICIENT_DATA') {
      if (historyDays >= HIGH_DAYS && completedJobs >= HIGH_JOBS && bookedCoverage >= HIGH_COVERAGE) {
        confidence = 'HIGH';
      } else if (historyDays >= MED_DAYS && completedJobs >= MED_JOBS) {
        confidence = 'MEDIUM';
      } else {
        confidence = 'LOW';
      }
    }

    if (historyDays < READY_DAYS)
      confidenceReasons.push(`Only ${historyDays} days of usable history`);
    if (bookedCoverage >= 0.01)
      confidenceReasons.push(`${Math.round(bookedCoverage * 100)}% of projected revenue is already booked`);
    else
      confidenceReasons.push('No future bookings in this period');
    if (completedJobs < MED_JOBS)
      confidenceReasons.push(`Low job volume (${completedJobs} completed job${completedJobs !== 1 ? 's' : ''} total)`);
    if (readinessStatus === 'INSUFFICIENT_DATA')
      confidenceReasons.push('Insufficient history — projection shows earned + booked only');
  }

  // ── 8. Trend data (daily) ─────────────────────────────────────────────────
  const [trendActualRes, trendBookedRes] = await Promise.all([
    pool.query(
      `SELECT
         (scheduled_at AT TIME ZONE 'UTC')::date AS day,
         COALESCE(SUM(amount), 0)                AS earned,
         COUNT(*)::int                           AS jobs
       FROM jobs
       WHERE account_id = $1
         AND status = 'complete'
         AND scheduled_at >= $2::date
         AND scheduled_at < ($3::date + INTERVAL '1 day')
       GROUP BY day
       ORDER BY day`,
      [accountId, periodStart, earnedCutoff]
    ),
    pool.query(
      `SELECT
         (scheduled_at AT TIME ZONE 'UTC')::date AS day,
         COALESCE(SUM(amount), 0)                AS booked,
         COUNT(*)::int                           AS jobs
       FROM jobs
       WHERE account_id = $1
         AND status NOT IN ('complete','cancelled','no_show')
         AND scheduled_at > NOW()
         AND scheduled_at < ($2::date + INTERVAL '1 day')
       GROUP BY day
       ORDER BY day`,
      [accountId, periodEnd]
    ),
  ]);

  const trendMap = {};
  for (const r of trendActualRes.rows) {
    const d = String(r.day).slice(0, 10);
    trendMap[d] = { date: d, earned: pf(r.earned), booked: 0, projected: 0, jobs: pi(r.jobs), type: 'actual' };
  }
  if (!isPast) {
    for (const r of trendBookedRes.rows) {
      const d = String(r.day).slice(0, 10);
      if (trendMap[d]) {
        trendMap[d].booked = pf(r.booked);
        trendMap[d].type   = 'mixed';
      } else {
        trendMap[d] = { date: d, earned: 0, booked: pf(r.booked), projected: 0, jobs: pi(r.jobs), type: 'booked' };
      }
    }

    // Projected daily entries: future days with no booked jobs, using historical daily rate
    if (expectedUnbookedRevenue > 0 && dailyRate > 0) {
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const periodEndDate = new Date(periodEnd + 'T00:00:00Z');
      for (let d = new Date(tomorrow); d <= periodEndDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const dStr = d.toISOString().slice(0, 10);
        if (!trendMap[dStr]) {
          trendMap[dStr] = { date: dStr, earned: 0, booked: 0, projected: pf(dailyRate), jobs: 0, type: 'projected' };
        }
      }
    }
  }

  const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  // ── 9. Drivers (upcoming scheduled pipeline) ──────────────────────────────
  const driversRes = await pool.query(
    `SELECT
       j.scheduled_at,
       c.name  AS client_name,
       j.service_type,
       j.status,
       j.amount,
       j.id
     FROM jobs j
     LEFT JOIN clients c ON c.id = j.client_id AND c.account_id = $1
     WHERE j.account_id = $1
       AND j.status NOT IN ('complete','cancelled','no_show')
       AND j.scheduled_at > NOW()
       AND j.scheduled_at < ($2::date + INTERVAL '1 day')
     ORDER BY j.scheduled_at ASC
     LIMIT 20`,
    [accountId, periodEnd]
  );

  const drivers = driversRes.rows.map(r => ({
    scheduledAt: r.scheduled_at,
    clientName:  r.client_name || 'Unknown',
    serviceType: r.service_type,
    status:      r.status,
    amount:      pf(r.amount),
    id:          r.id,
  }));

  return {
    readiness: { status: readinessStatus, historyDays, completedJobs, scheduledFutureJobs, limitations },
    period:    { start: periodStart, end: periodEnd, asOf, isPast },
    actual:    { earnedRevenue },
    booked:    { revenue: bookedRevenue, jobCount: bookedJobCount },
    forecast:  { projectedRevenue, forecastGap, expectedUnbookedRevenue, confidence, confidenceReasons },
    trend,
    drivers,
  };
}

module.exports = { getOverview, RATE_WINDOW_DAYS };
