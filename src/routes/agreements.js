'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const CADENCE_VALUES = [
  'weekly','every_2_weeks','every_3_weeks','every_4_weeks',
  'monthly','quarterly','annual','custom',
  'biweekly', // legacy alias for every_2_weeks — accepted for backward compat
];
const BILLING_CADENCE_VALUES = [
  'every_service','weekly','every_2_weeks','monthly','quarterly','annual','custom',
  'biweekly', // legacy alias
];
const BILLING_TRIGGER_VALUES = ['every_service','first_scheduled','first_completed','first_day','specific_day'];
const EXTRA_POLICY_VALUES    = ['all_included','max_n','rollover','manual_review'];
const STATUS_VALUES          = ['active','paused','cancelled','expired'];
const PAYMENT_VALUES         = ['paid_in_advance','pending','failed','overdue'];

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

// ─── POST /api/agreements ─────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    client_id, name, service_type, service_address,
    cadence = 'monthly', billing_cadence = 'monthly',
    billing_trigger = 'first_day', billing_day = null,
    included_services_per_period = 1,
    extra_occurrence_policy = 'all_included',
    service_interval_days = null,
    plan_price = 0, payment_status = 'pending',
    notes, line_items = [], started_at, next_billing_date,
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
  if (!PAYMENT_VALUES.includes(payment_status))
    return res.status(400).json({ error: 'invalid payment_status' });
  if (billing_trigger === 'specific_day') {
    const day = parseInt(billing_day, 10);
    if (!day || day < 1 || day > 28)
      return res.status(400).json({ error: 'billing_day must be 1–28 when trigger is specific_day' });
  }
  if (cadence === 'custom' && (!service_interval_days || parseInt(service_interval_days, 10) < 1))
    return res.status(400).json({ error: 'service_interval_days is required for custom cadence' });

  try {
    const clientRes = await pool.query(
      `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, req.accountId]
    );
    if (!clientRes.rows[0]) return res.status(404).json({ error: 'Client not found' });

    const { rows } = await pool.query(
      `INSERT INTO recurring_agreements
         (account_id, client_id, name, service_type, service_address,
          cadence, billing_cadence, billing_trigger, billing_day,
          included_services_per_period, extra_occurrence_policy, service_interval_days,
          plan_price, payment_status, notes, line_items,
          started_at, next_billing_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,COALESCE($17,CURRENT_DATE),$18,$19)
       RETURNING *`,
      [
        req.accountId, client_id, name.trim(), service_type || null, service_address || null,
        cadence, billing_cadence, billing_trigger,
        billing_trigger === 'specific_day' ? parseInt(billing_day, 10) : null,
        Math.max(1, parseInt(included_services_per_period, 10) || 1),
        extra_occurrence_policy,
        cadence === 'custom' ? parseInt(service_interval_days, 10) : null,
        parseFloat(plan_price) || 0, payment_status,
        notes || null, JSON.stringify(Array.isArray(line_items) ? line_items : []),
        started_at || null, next_billing_date || null, req.userId,
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

// ─── PATCH /api/agreements/:id ────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const allowed = [
    'name','service_type','service_address',
    'cadence','billing_cadence','billing_trigger','billing_day',
    'included_services_per_period','extra_occurrence_policy','service_interval_days',
    'plan_price','status','payment_status','notes','line_items',
    'started_at','next_billing_date',
  ];
  const updates = [];
  const params  = [req.params.id, req.accountId];

  // Validate enum fields if present
  if (req.body.cadence && !CADENCE_VALUES.includes(req.body.cadence))
    return res.status(400).json({ error: 'invalid cadence' });
  if (req.body.billing_cadence && !BILLING_CADENCE_VALUES.includes(req.body.billing_cadence))
    return res.status(400).json({ error: 'invalid billing_cadence' });
  if (req.body.billing_trigger && !BILLING_TRIGGER_VALUES.includes(req.body.billing_trigger))
    return res.status(400).json({ error: 'invalid billing_trigger' });
  if (req.body.extra_occurrence_policy && !EXTRA_POLICY_VALUES.includes(req.body.extra_occurrence_policy))
    return res.status(400).json({ error: 'invalid extra_occurrence_policy' });

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
