'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const CADENCE_VALUES = [
  'weekly','every_2_weeks','every_3_weeks','every_4_weeks',
  'monthly','quarterly','annual','custom',
  'biweekly', // legacy alias for every_2_weeks
];
const BILLING_CADENCE_VALUES = [
  'every_service','weekly','every_2_weeks','monthly','quarterly','annual','custom',
  'biweekly', // legacy alias
];
const BILLING_TRIGGER_VALUES = [
  'every_service','first_scheduled','first_completed',
  'first_day','specific_day','days_before_first_service',
];
const EXTRA_POLICY_VALUES = [
  'all_included','charge_per_additional','approval_required',
  'no_additional','rollover','manual_review',
  'max_n', // legacy alias
];
const MISSED_SERVICE_POLICY_VALUES = [
  'no_adjustment','reschedule','carry_forward','credit','forfeited','manual_review',
  'rollover', // legacy alias
];
const STATUS_VALUES        = ['draft','active','paused','cancelled','expired','completed'];
const PAYMENT_VALUES       = ['paid_in_advance','pending','failed','overdue'];
const PAYMENT_BEHAVIOR_VALUES = ['send_invoice','create_only','auto_charge_card','auto_charge_ach'];
const DISCOUNT_TYPE_VALUES = ['none','percent','fixed'];
const END_CONDITION_VALUES = ['none','date','service_count','billing_period_count'];

// Generates the next N future service occurrence dates from a cadence anchor.
// interval-based cadences (weekly, every_N_weeks, custom) use startedAt as the
// epoch so "every 2 weeks" means exactly 14 days, never month-boundary drift.
// preferred_weekday (0-6): snaps anchor to that weekday for weekly/biweekly cadences.
// service_day_of_month (1-31): overrides the day-of-month for monthly cadence.
function nextOccurrences(cadence, startedAt, intervalDays, count, preferredWeekday, serviceDayOfMonth) {
  const n   = Math.max(1, parseInt(count, 10) || 4);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startedAt ? new Date(startedAt + 'T00:00:00') : new Date(today);
  const c = cadence === 'biweekly' ? 'every_2_weeks' : (cadence || 'monthly');
  const results = [];

  if (c === 'monthly') {
    const dom = serviceDayOfMonth != null ? serviceDayOfMonth : start.getDate();
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dom, lastOfMonth));
    while (d < today) {
      const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const mx = new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate();
      nm.setDate(Math.min(dom, mx));
      d = nm;
    }
    while (results.length < n) {
      results.push(d.toISOString().slice(0, 10));
      const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const mx = new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate();
      nm.setDate(Math.min(dom, mx));
      d = nm;
    }
  } else if (c === 'quarterly') {
    let d = new Date(start);
    while (d < today) d.setDate(d.getDate() + 91);
    while (results.length < n) { results.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 91); }
  } else if (c === 'annual') {
    let d = new Date(start);
    while (d < today) d.setFullYear(d.getFullYear() + 1);
    while (results.length < n) { results.push(d.toISOString().slice(0, 10)); d.setFullYear(d.getFullYear() + 1); }
  } else {
    const days = c === 'weekly' ? 7 : c === 'every_2_weeks' ? 14 : c === 'every_3_weeks' ? 21
               : c === 'every_4_weeks' ? 28 : (parseInt(intervalDays, 10) || 7);
    // Snap anchor to preferred weekday for weekly/biweekly cadences
    let anchor = new Date(start);
    if (
      preferredWeekday != null &&
      (c === 'weekly' || c === 'every_2_weeks' || c === 'every_3_weeks' || c === 'every_4_weeks')
    ) {
      const cur = anchor.getDay();
      let diff = preferredWeekday - cur;
      if (diff < 0) diff += 7;
      anchor.setDate(anchor.getDate() + diff);
    }
    const diff = Math.floor((today - anchor) / 86400000);
    const wins = diff >= 0 ? Math.floor(diff / days) : 0;
    let d = new Date(anchor);
    d.setDate(d.getDate() + wins * days);
    if (d < today) d.setDate(d.getDate() + days);
    while (results.length < n) {
      results.push(d.toISOString().slice(0, 10));
      d = new Date(d); d.setDate(d.getDate() + days);
    }
  }
  return results;
}

// ─── GET /api/agreements ──────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { status = 'active', q = '' } = req.query;
    const params = [req.accountId];
    const conds  = [];

    if (status && status !== 'all') {
      params.push(status);
      conds.push(`a.status = $${params.length}`);
    }
    if (q.trim()) {
      params.push(`%${q.trim()}%`);
      const p = params.length;
      conds.push(`(c.name ILIKE $${p} OR a.name ILIKE $${p} OR a.service_type ILIKE $${p})`);
    }

    const where = conds.length ? ' AND ' + conds.join(' AND ') : '';
    const { rows } = await pool.query(
      `SELECT a.*,
              c.name AS client_name, c.email AS client_email,
              c.address AS client_address, c.phone AS client_phone
       FROM recurring_agreements a
       JOIN clients c ON c.id = a.client_id
       WHERE a.account_id = $1${where}
       ORDER BY a.created_at DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agreements/services — service catalog search ───────────────────
// Must be before /:id to avoid routing conflict
router.get('/services', requireAuth, async (req, res) => {
  try {
    const { q = '' } = req.query;
    const { rows } = await pool.query(
      `SELECT id, name, description, price, category, sku, duration_minutes
       FROM service_templates
       WHERE account_id = $1 AND is_active = true
         AND ($2 = '' OR name ILIKE $3 OR description ILIKE $3 OR category ILIKE $3 OR sku ILIKE $3)
       ORDER BY sort_order, name
       LIMIT 30`,
      [req.accountId, q.trim(), `%${q.trim()}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agreements ─────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    client_id, name, service_type, service_address, service_id = null,
    cadence = 'monthly', billing_cadence = 'monthly',
    billing_trigger = 'first_day', billing_day = null,
    billing_interval_months = null,
    preferred_weekday = null, service_day_of_month = null,
    included_services_per_period = 1,
    extra_occurrence_policy = 'all_included',
    service_interval_days = null,
    plan_price = 0, payment_status = 'pending',
    payment_behavior = 'send_invoice',
    missed_service_policy = 'no_adjustment',
    additional_service_price = null,
    discount_type = 'none', discount_value = null, discount_name = null,
    taxable = false,
    days_before_service = null,
    end_condition_type = 'none',
    end_after_occurrences = null, end_after_periods = null,
    notes, line_items = [], started_at, next_billing_date,
    end_date = null, status = 'active',
  } = req.body;

  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  if (!name)      return res.status(400).json({ error: 'name is required' });
  if (!CADENCE_VALUES.includes(cadence))
    return res.status(400).json({ error: 'invalid cadence' });
  if (!BILLING_CADENCE_VALUES.includes(billing_cadence))
    return res.status(400).json({ error: 'invalid billing_cadence' });
  if (!BILLING_TRIGGER_VALUES.includes(billing_trigger))
    return res.status(400).json({ error: 'invalid billing_trigger' });
  if (!EXTRA_POLICY_VALUES.includes(extra_occurrence_policy))
    return res.status(400).json({ error: 'invalid extra_occurrence_policy' });
  if (!MISSED_SERVICE_POLICY_VALUES.includes(missed_service_policy))
    return res.status(400).json({ error: 'invalid missed_service_policy' });
  if (!PAYMENT_VALUES.includes(payment_status))
    return res.status(400).json({ error: 'invalid payment_status' });
  if (!PAYMENT_BEHAVIOR_VALUES.includes(payment_behavior))
    return res.status(400).json({ error: 'invalid payment_behavior' });
  if (!DISCOUNT_TYPE_VALUES.includes(discount_type))
    return res.status(400).json({ error: 'invalid discount_type' });
  if (!END_CONDITION_VALUES.includes(end_condition_type))
    return res.status(400).json({ error: 'invalid end_condition_type' });
  if (!STATUS_VALUES.includes(status))
    return res.status(400).json({ error: 'invalid status' });

  if (billing_trigger === 'specific_day') {
    const day = parseInt(billing_day, 10);
    if (!day || day < 1 || day > 31)
      return res.status(400).json({ error: 'billing_day must be 1–31 when trigger is specific_day' });
  }
  if (billing_trigger === 'days_before_first_service') {
    const n = parseInt(days_before_service, 10);
    if (!n || n < 1)
      return res.status(400).json({ error: 'days_before_service must be >= 1 when trigger is days_before_first_service' });
  }
  if (extra_occurrence_policy === 'charge_per_additional') {
    if (additional_service_price == null || parseFloat(additional_service_price) < 0)
      return res.status(400).json({ error: 'additional_service_price is required for charge_per_additional policy' });
  }
  if (cadence === 'custom' && (!service_interval_days || parseInt(service_interval_days, 10) < 1))
    return res.status(400).json({ error: 'service_interval_days is required for custom cadence' });
  if (preferred_weekday != null) {
    const wd = parseInt(preferred_weekday, 10);
    if (isNaN(wd) || wd < 0 || wd > 6)
      return res.status(400).json({ error: 'preferred_weekday must be 0–6' });
  }
  if (service_day_of_month != null) {
    const d = parseInt(service_day_of_month, 10);
    if (isNaN(d) || d < 1 || d > 31)
      return res.status(400).json({ error: 'service_day_of_month must be 1–31' });
  }
  if (end_condition_type === 'date') {
    if (!end_date) return res.status(400).json({ error: 'end_date is required when end_condition_type is date' });
    if (started_at && end_date < started_at)
      return res.status(400).json({ error: 'end_date must be on or after started_at' });
  }
  if (end_condition_type === 'service_count') {
    const n = parseInt(end_after_occurrences, 10);
    if (!n || n < 1) return res.status(400).json({ error: 'end_after_occurrences must be >= 1 when end_condition_type is service_count' });
  }
  if (end_condition_type === 'billing_period_count') {
    const n = parseInt(end_after_periods, 10);
    if (!n || n < 1) return res.status(400).json({ error: 'end_after_periods must be >= 1 when end_condition_type is billing_period_count' });
  }
  if (parseFloat(plan_price) < 0)
    return res.status(400).json({ error: 'plan_price must be >= 0' });

  try {
    const clientRes = await pool.query(
      `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, req.accountId]
    );
    if (!clientRes.rows[0]) return res.status(404).json({ error: 'Client not found' });

    const { rows } = await pool.query(
      `INSERT INTO recurring_agreements
         (account_id, client_id, name, service_type, service_address, service_id,
          cadence, billing_cadence, billing_trigger, billing_day, billing_interval_months,
          preferred_weekday, service_day_of_month,
          included_services_per_period, extra_occurrence_policy, service_interval_days,
          missed_service_policy, plan_price, payment_status, payment_behavior, notes, line_items,
          additional_service_price, discount_type, discount_value, discount_name, taxable,
          days_before_service, end_condition_type, end_after_occurrences, end_after_periods,
          started_at, next_billing_date, end_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,COALESCE($32,CURRENT_DATE),$33,$34,$35,$36)
       RETURNING *`,
      [
        req.accountId, client_id, name.trim(), service_type || null, service_address || null,
        service_id || null,
        cadence, billing_cadence, billing_trigger,
        billing_trigger === 'specific_day' ? parseInt(billing_day, 10) : null,
        billing_interval_months ? parseInt(billing_interval_months, 10) : null,
        preferred_weekday != null ? parseInt(preferred_weekday, 10) : null,
        service_day_of_month != null ? parseInt(service_day_of_month, 10) : null,
        Math.max(1, parseInt(included_services_per_period, 10) || 1),
        extra_occurrence_policy,
        cadence === 'custom' ? parseInt(service_interval_days, 10) : null,
        missed_service_policy,
        parseFloat(plan_price) || 0, payment_status, payment_behavior,
        notes || null, JSON.stringify(Array.isArray(line_items) ? line_items : []),
        additional_service_price != null ? parseFloat(additional_service_price) : null,
        discount_type, discount_value != null ? parseFloat(discount_value) : null,
        discount_name || null, taxable === true || taxable === 'true',
        billing_trigger === 'days_before_first_service' ? parseInt(days_before_service, 10) : null,
        end_condition_type,
        end_condition_type === 'service_count' ? parseInt(end_after_occurrences, 10) : null,
        end_condition_type === 'billing_period_count' ? parseInt(end_after_periods, 10) : null,
        started_at || null, next_billing_date || null,
        end_condition_type === 'date' ? (end_date || null) : null,
        STATUS_VALUES.includes(status) ? status : 'active',
        req.userId,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agreements/:id ──────────────────────────────────────────────────
router.get('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
              c.name AS client_name, c.email AS client_email,
              c.address AS client_address, c.phone AS client_phone
       FROM recurring_agreements a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = $1 AND a.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agreements/preview ────────────────────────────────────────────
// Must be before /:id to prevent 'preview' being matched as a UUID param
router.post('/preview', requireAuth, async (req, res) => {
  const {
    cadence = 'monthly',
    started_at,
    service_interval_days,
    preferred_weekday = null,
    service_day_of_month = null,
    end_condition_type = 'none',
    end_date = null,
    end_after_occurrences = null,
    count = 4,
  } = req.body;
  try {
    const maxCount = Math.min(parseInt(count, 10) || 4, 8);
    let services = nextOccurrences(
      cadence, started_at, service_interval_days,
      maxCount,
      preferred_weekday != null ? parseInt(preferred_weekday, 10) : null,
      service_day_of_month != null ? parseInt(service_day_of_month, 10) : null,
    );

    // Apply end condition cutoffs to the preview
    if (end_condition_type === 'date' && end_date) {
      services = services.filter(d => d <= end_date);
    } else if (end_condition_type === 'service_count' && end_after_occurrences != null) {
      const limit = parseInt(end_after_occurrences, 10) || 0;
      if (limit > 0) services = services.slice(0, limit);
    }
    // 'billing_period_count' and 'none' show all preview dates untruncated

    res.json({ services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/agreements/:id ────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const allowed = [
    'name','service_type','service_address','service_id',
    'cadence','billing_cadence','billing_trigger','billing_day','billing_interval_months',
    'preferred_weekday','service_day_of_month',
    'included_services_per_period','extra_occurrence_policy','service_interval_days',
    'missed_service_policy','additional_service_price',
    'discount_type','discount_value','discount_name','taxable',
    'days_before_service','end_condition_type','end_after_occurrences','end_after_periods',
    'plan_price','status','payment_status','payment_behavior','notes','line_items',
    'started_at','next_billing_date','end_date',
  ];
  const updates = [];
  const params  = [req.params.id, req.accountId];

  const b = req.body;
  if (b.cadence            && !CADENCE_VALUES.includes(b.cadence))
    return res.status(400).json({ error: 'invalid cadence' });
  if (b.billing_cadence    && !BILLING_CADENCE_VALUES.includes(b.billing_cadence))
    return res.status(400).json({ error: 'invalid billing_cadence' });
  if (b.billing_trigger    && !BILLING_TRIGGER_VALUES.includes(b.billing_trigger))
    return res.status(400).json({ error: 'invalid billing_trigger' });
  if (b.extra_occurrence_policy && !EXTRA_POLICY_VALUES.includes(b.extra_occurrence_policy))
    return res.status(400).json({ error: 'invalid extra_occurrence_policy' });
  if (b.missed_service_policy && !MISSED_SERVICE_POLICY_VALUES.includes(b.missed_service_policy))
    return res.status(400).json({ error: 'invalid missed_service_policy' });
  if (b.payment_behavior   && !PAYMENT_BEHAVIOR_VALUES.includes(b.payment_behavior))
    return res.status(400).json({ error: 'invalid payment_behavior' });
  if (b.discount_type      && !DISCOUNT_TYPE_VALUES.includes(b.discount_type))
    return res.status(400).json({ error: 'invalid discount_type' });
  if (b.end_condition_type && !END_CONDITION_VALUES.includes(b.end_condition_type))
    return res.status(400).json({ error: 'invalid end_condition_type' });
  if (b.status             && !STATUS_VALUES.includes(b.status))
    return res.status(400).json({ error: 'invalid status' });

  for (const key of allowed) {
    if (key in req.body) {
      params.push(key === 'line_items' ? JSON.stringify(req.body[key]) : req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No updatable fields provided' });

  try {
    const { rows } = await pool.query(
      `UPDATE recurring_agreements
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND account_id = $2
       RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/agreements/:id ───────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE recurring_agreements
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND account_id = $2
       RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
