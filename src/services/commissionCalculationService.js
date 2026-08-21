'use strict';
const pool = require('../db/pool');

function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }

function defaultRange() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

const VALID_TYPES    = ['percentage', 'flat_amount'];
const VALID_BASES    = ['booked_revenue','completed_revenue','invoiced_revenue','collected_revenue','upsell_revenue','flat_per_job'];
const VALID_TRIGGERS = ['job_booked','job_completed','invoice_issued','payment_collected','upsell_completed','manual_approval'];
const VALID_STATUSES = ['pending','approved','payable','paid','voided'];

function badRequest(msg) { return Object.assign(new Error(msg), { status: 400 }); }
function notFound(msg)   { return Object.assign(new Error(msg), { status: 404 }); }

// ── Rules ─────────────────────────────────────────────────────────────────────

async function getRules(accountId) {
  const { rows } = await pool.query(
    `SELECT cr.*, u.name AS applies_to_user_name
     FROM commission_rules cr
     LEFT JOIN users u ON u.id = cr.applies_to_user_id AND u.account_id = $1
     WHERE cr.account_id = $1
     ORDER BY cr.active DESC, cr.created_at DESC`,
    [accountId]
  );
  return rows.map(r => ({
    id:                  r.id,
    name:                r.name,
    commissionType:      r.commission_type,
    ratePercent:         r.rate_percent != null ? parseFloat(r.rate_percent) : null,
    flatAmount:          r.flat_amount  != null ? pf(r.flat_amount)  : null,
    basis:               r.basis,
    trigger:             r.trigger,
    appliesToUserId:     r.applies_to_user_id,
    appliesToUserName:   r.applies_to_user_name,
    appliesToRole:       r.applies_to_role,
    appliesToService:    r.applies_to_service,
    active:              r.active,
    createdAt:           r.created_at,
    updatedAt:           r.updated_at,
  }));
}

async function createRule(accountId, createdBy, data) {
  const { name, commission_type, rate_percent, flat_amount, basis, trigger,
          applies_to_user_id, applies_to_role, applies_to_service, active = true } = data;

  if (!name?.trim())                       throw badRequest('name is required');
  if (!VALID_TYPES.includes(commission_type)) throw badRequest('commission_type must be percentage or flat_amount');
  if (!VALID_BASES.includes(basis))           throw badRequest(`basis must be one of: ${VALID_BASES.join(', ')}`);
  if (!VALID_TRIGGERS.includes(trigger))      throw badRequest(`trigger must be one of: ${VALID_TRIGGERS.join(', ')}`);

  if (commission_type === 'percentage') {
    const r = parseFloat(rate_percent);
    if (isNaN(r) || r < 0 || r > 1) throw badRequest('rate_percent must be between 0 and 1 (e.g. 0.40 for 40%)');
  }
  if (commission_type === 'flat_amount') {
    const f = parseFloat(flat_amount);
    if (isNaN(f) || f < 0) throw badRequest('flat_amount must be a non-negative number');
  }

  const { rows: [r] } = await pool.query(
    `INSERT INTO commission_rules
       (account_id, name, commission_type, rate_percent, flat_amount, basis, trigger,
        applies_to_user_id, applies_to_role, applies_to_service, active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [accountId, name.trim(), commission_type,
     commission_type === 'percentage' ? parseFloat(rate_percent) : null,
     commission_type === 'flat_amount' ? pf(flat_amount) : null,
     basis, trigger,
     applies_to_user_id || null, applies_to_role || null, applies_to_service || null,
     !!active, createdBy]
  );
  return r;
}

async function updateRule(accountId, ruleId, data) {
  const { rows: [existing] } = await pool.query(
    `SELECT id FROM commission_rules WHERE id = $1 AND account_id = $2`, [ruleId, accountId]
  );
  if (!existing) throw notFound('Commission rule not found');

  const ALLOWED = ['name','commission_type','rate_percent','flat_amount','basis','trigger',
                   'applies_to_user_id','applies_to_role','applies_to_service','active'];
  const sets = [], params = [ruleId, accountId];

  for (const [k, v] of Object.entries(data)) {
    if (!ALLOWED.includes(k)) continue;
    params.push(v === '' ? null : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (sets.length === 0) throw badRequest('No valid fields to update');

  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);

  const { rows: [r] } = await pool.query(
    `UPDATE commission_rules SET ${sets.join(', ')}
     WHERE id = $1 AND account_id = $2 RETURNING *`,
    params
  );
  return r;
}

async function deleteRule(accountId, ruleId) {
  const { rowCount } = await pool.query(
    `UPDATE commission_rules SET active = false, updated_at = NOW()
     WHERE id = $1 AND account_id = $2`,
    [ruleId, accountId]
  );
  if (rowCount === 0) throw notFound('Commission rule not found');
  return { deleted: true };
}

// ── Commission entries summary ────────────────────────────────────────────────

async function getCommissionSummary(accountId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;

  const [summaryRes, memberRes, entryRes, ruleCountRes] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(commission_amount), 0) AS total
       FROM commission_entries
       WHERE account_id = $1
         AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')
       GROUP BY status`,
      [accountId, s, e]
    ),
    pool.query(
      `SELECT ce.user_id, u.name AS member_name, ce.status,
              COUNT(*)::int AS entries, COALESCE(SUM(ce.commission_amount), 0) AS total
       FROM commission_entries ce
       JOIN users u ON u.id = ce.user_id AND u.account_id = $1
       WHERE ce.account_id = $1
         AND ce.created_at >= $2::date AND ce.created_at < ($3::date + INTERVAL '1 day')
       GROUP BY ce.user_id, u.name, ce.status
       ORDER BY total DESC`,
      [accountId, s, e]
    ),
    pool.query(
      `SELECT ce.id, ce.user_id, u.name AS member_name, ce.job_id, ce.status,
              ce.source_amount, ce.commission_amount, ce.earned_at, ce.approved_at, ce.paid_at,
              j.service_type, j.amount AS job_amount, j.scheduled_at,
              cr.name AS rule_name, cr.commission_type, cr.rate_percent, cr.flat_amount
       FROM commission_entries ce
       JOIN users u ON u.id = ce.user_id AND u.account_id = $1
       JOIN jobs  j ON j.id = ce.job_id  AND j.account_id = $1
       LEFT JOIN commission_rules cr ON cr.id = ce.rule_id
       WHERE ce.account_id = $1
         AND ce.created_at >= $2::date AND ce.created_at < ($3::date + INTERVAL '1 day')
       ORDER BY ce.created_at DESC
       LIMIT 100`,
      [accountId, s, e]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS cnt FROM commission_rules WHERE account_id = $1 AND active = true`,
      [accountId]
    ),
  ]);

  const byStatus = {};
  for (const r of summaryRes.rows) byStatus[r.status] = { count: r.cnt, amount: pf(r.total) };

  return {
    period:  { start: s, end: e },
    summary: {
      pending:  byStatus.pending  || { count: 0, amount: 0 },
      approved: byStatus.approved || { count: 0, amount: 0 },
      payable:  byStatus.payable  || { count: 0, amount: 0 },
      paid:     byStatus.paid     || { count: 0, amount: 0 },
      owed: pf(
        (byStatus.pending?.amount  || 0) +
        (byStatus.approved?.amount || 0) +
        (byStatus.payable?.amount  || 0)
      ),
    },
    byMember: memberRes.rows.map(r => ({
      userId:     r.user_id,
      memberName: r.member_name,
      status:     r.status,
      entries:    r.entries,
      total:      pf(r.total),
    })),
    entries: entryRes.rows.map(r => ({
      id:               r.id,
      userId:           r.user_id,
      memberName:       r.member_name,
      jobId:            r.job_id,
      serviceType:      r.service_type,
      jobAmount:        pf(r.job_amount),
      scheduledAt:      r.scheduled_at,
      sourceAmount:     pf(r.source_amount),
      commissionAmount: pf(r.commission_amount),
      status:           r.status,
      ruleName:         r.rule_name,
      commissionType:   r.commission_type,
      ratePercent:      r.rate_percent != null ? parseFloat(r.rate_percent) : null,
      earnedAt:         r.earned_at,
      approvedAt:       r.approved_at,
      paidAt:           r.paid_at,
    })),
    hasRules: ruleCountRes.rows[0].cnt > 0,
    rulesCount: ruleCountRes.rows[0].cnt,
  };
}

// ── Calculate commissions for a specific job ──────────────────────────────────

async function calculateForJob(accountId, jobId) {
  const { rows: [job] } = await pool.query(
    `SELECT * FROM jobs WHERE id = $1 AND account_id = $2`, [jobId, accountId]
  );
  if (!job) throw notFound('Job not found');
  if (job.status !== 'complete') return { entries: [], skipped: 'Job is not complete' };

  const [{ rows: rules }, { rows: assignments }] = await Promise.all([
    pool.query(
      `SELECT * FROM commission_rules WHERE account_id = $1 AND active = true AND trigger = 'job_completed'`,
      [accountId]
    ),
    pool.query(
      `SELECT ja.*, u.role AS user_role
       FROM job_assignments ja
       JOIN users u ON u.id = ja.user_id AND u.account_id = $1
       WHERE ja.job_id = $1 AND ja.account_id = $1 AND ja.removed_at IS NULL`,
      // BUG-GUARD: fix param binding
      [accountId]
    ),
  ]);

  // Re-query assignments correctly
  const { rows: asgnRows } = await pool.query(
    `SELECT ja.*, u.role AS user_role
     FROM job_assignments ja
     JOIN users u ON u.id = ja.user_id AND u.account_id = $1
     WHERE ja.job_id = $2 AND ja.account_id = $1 AND ja.removed_at IS NULL`,
    [accountId, jobId]
  );

  if (rules.length === 0) return { entries: [], skipped: 'No active commission rules for job_completed trigger' };

  const created = [];
  for (const asgn of asgnRows) {
    for (const rule of rules) {
      const userMatch = (!rule.applies_to_user_id && !rule.applies_to_role) ||
        rule.applies_to_user_id === asgn.user_id ||
        rule.applies_to_role === asgn.user_role;
      const serviceMatch = !rule.applies_to_service || rule.applies_to_service === job.service_type;
      if (!userMatch || !serviceMatch) continue;

      let sourceAmount = pf(job.amount);
      let commissionAmount = 0;

      if (rule.commission_type === 'percentage') {
        commissionAmount = pf(sourceAmount * parseFloat(rule.rate_percent));
      } else if (rule.commission_type === 'flat_amount') {
        commissionAmount = pf(rule.flat_amount);
        sourceAmount = 1; // flat: source_amount means "1 job"
      }

      try {
        const { rows: [entry] } = await pool.query(
          `INSERT INTO commission_entries
             (account_id, rule_id, user_id, job_id, source_amount, commission_amount, status, earned_at)
           VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW())
           ON CONFLICT (rule_id, job_id, user_id) DO NOTHING
           RETURNING *`,
          [accountId, rule.id, asgn.user_id, jobId, sourceAmount, commissionAmount]
        );
        if (entry) created.push(entry);
      } catch { /* idempotent — ignore duplicate */ }
    }
  }

  return { entries: created };
}

// ── Update commission entry status ────────────────────────────────────────────

async function updateEntryStatus(accountId, entryId, status, updatedBy) {
  if (!VALID_STATUSES.includes(status)) throw badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);

  const tsCol = {
    approved: 'approved_at', payable: 'payable_at', paid: 'paid_at', voided: 'voided_at',
  }[status];

  const sets = ['status = $3', 'updated_at = NOW()'];
  if (tsCol) sets.push(`${tsCol} = NOW()`);

  const { rowCount, rows: [r] } = await pool.query(
    `UPDATE commission_entries SET ${sets.join(', ')}
     WHERE id = $1 AND account_id = $2
     RETURNING *`,
    [entryId, accountId, status]
  );
  if (rowCount === 0) throw notFound('Commission entry not found');
  return r;
}

module.exports = {
  getRules, createRule, updateRule, deleteRule,
  getCommissionSummary, calculateForJob, updateEntryStatus,
};
