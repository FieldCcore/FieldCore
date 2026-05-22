const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const sms     = require('../services/sms');

// GET /api/jobs?date=&tech_id=&status=
router.get('/', requireAuth, async (req, res) => {
  const { date, date_from, date_to, tech_id, status } = req.query;
  const conditions = ['j.account_id = $1'];
  const values = [req.accountId];
  let i = 2;

  if (date) {
    conditions.push(`j.scheduled_at::date = $${i++}`);
    values.push(date);
  }
  if (date_from) {
    conditions.push(`j.scheduled_at >= $${i++}`);
    values.push(date_from);
  }
  if (date_to) {
    conditions.push(`j.scheduled_at <= $${i++}`);
    values.push(date_to);
  }
  if (tech_id) {
    conditions.push(`j.tech_id = $${i++}`);
    values.push(tech_id);
  }
  if (status) {
    conditions.push(`j.status = $${i++}`);
    values.push(status);
  }

  try {
    const { rows } = await pool.query(
      `SELECT j.*, c.name AS client_name, u.name AS tech_name
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN users u ON u.id = j.tech_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY j.scheduled_at`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs
router.post('/', requireAuth, async (req, res) => {
  const { client_id, tech_id, service_type, scheduled_at, amount, notes, recurring } = req.body;
  if (!client_id || !service_type) {
    return res.status(400).json({ error: 'client_id and service_type are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO jobs (account_id, client_id, tech_id, service_type, scheduled_at, amount, notes, recurring)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.accountId, client_id, tech_id || null, service_type, scheduled_at, amount || null, notes, recurring || 'none']
    );
    const job = rows[0];

    // Auto-send confirmation SMS if client has phone and job has a time
    if (scheduled_at) {
      const clientResult = await pool.query(
        `SELECT name, phone FROM clients WHERE id = $1`, [client_id]
      );
      const client = clientResult.rows[0];
      if (client?.phone) {
        sms.send(
          req.accountId, client_id, client.phone,
          sms.confirmationBody(client.name, service_type, scheduled_at)
        ).then(() =>
          pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [job.id])
        ).catch(err => console.error('[SMS] Confirmation failed:', err.message));
      }
    }

    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:id — full edit
router.patch('/:id', requireAuth, async (req, res) => {
  const fields = ['client_id','tech_id','service_type','scheduled_at','amount','notes','recurring'];
  const updates = [];
  const values  = [];
  let i = 1;

  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] || null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id, req.accountId);
  try {
    const { rows } = await pool.query(
      `WITH updated AS (
         UPDATE jobs SET ${updates.join(', ')}
         WHERE id = $${i} AND account_id = $${i + 1} RETURNING *
       )
       SELECT u.*, c.name AS client_name, usr.name AS tech_name
       FROM updated u
       JOIN clients c ON c.id = u.client_id
       LEFT JOIN users usr ON usr.id = u.tech_id`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:id/status
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const valid = ['scheduled', 'in_progress', 'complete', 'cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  const completedAt = status === 'complete' ? 'NOW()' : 'NULL';
  try {
    const { rows } = await pool.query(
      `UPDATE jobs SET status = $1, completed_at = ${completedAt}
       WHERE id = $2 AND account_id = $3 RETURNING *`,
      [status, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];

    // Auto-generate invoice when job is marked complete
    if (status === 'complete' && job.amount) {
      await pool.query(
        `INSERT INTO invoices (account_id, job_id, client_id, amount)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [req.accountId, job.id, job.client_id, job.amount]
      ).catch(() => {}); // non-fatal if invoice already exists
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:id/noshow — declare no-show, auto-retain deposit
router.patch('/:id/noshow', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'cancelled', noshow_declared_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];

    // Auto-retain any pending deposit for this job
    await pool.query(
      `UPDATE deposits SET status = 'collected'
       WHERE job_id = $1 AND status = 'pending'`,
      [job.id]
    );

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
