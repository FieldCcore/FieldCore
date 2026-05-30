const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/reviews[?client_id=] — list account reviews, most recent first
router.get('/', requireAuth, async (req, res) => {
  const { client_id } = req.query;
  try {
    const conditions = ['r.account_id = $1'];
    const values     = [req.accountId];
    if (client_id) { conditions.push(`r.client_id = $2`); values.push(client_id); }

    const { rows } = await pool.query(
      `SELECT r.*, c.name AS client_name, j.service_type, j.scheduled_at
       FROM reviews r
       JOIN clients c ON c.id = r.client_id
       JOIN jobs j ON j.id = r.job_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT 100`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reviews/public/:token — job info for the review form (no auth)
router.get('/public/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.id AS job_id, j.service_type, j.scheduled_at, j.account_id,
              c.name AS client_name,
              a.name AS business_name,
              EXISTS(SELECT 1 FROM reviews WHERE job_id = j.id) AS already_submitted
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       JOIN accounts a ON a.id = j.account_id
       WHERE j.review_token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid or expired review link.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reviews/submit/:token — submit review (no auth)
router.post('/submit/:token', async (req, res) => {
  const { rating, body } = req.body;
  const r = parseInt(rating);
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be 1–5.' });

  try {
    const { rows } = await pool.query(
      `SELECT j.id AS job_id, j.account_id, j.client_id
       FROM jobs j WHERE j.review_token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid or expired review link.' });
    const { job_id, account_id, client_id } = rows[0];

    await pool.query(
      `INSERT INTO reviews (account_id, job_id, client_id, rating, body)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (job_id) DO NOTHING`,
      [account_id, job_id, client_id, r, body?.trim() || null]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
