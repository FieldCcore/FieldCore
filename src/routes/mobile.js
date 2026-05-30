const express = require('express');
const router  = express.Router();
const path    = require('path');
const multer  = require('multer');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const smsService = require('../services/sms');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// GET /api/mobile/jobs — jobs for this account; if tech_id supplied, filter to that tech
router.get('/jobs', requireAuth, async (req, res) => {
  const { tech_id } = req.query;
  try {
    let query, values;
    if (tech_id) {
      query = `SELECT j.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address
               FROM jobs j
               JOIN clients c ON c.id = j.client_id
               WHERE j.account_id = $1
                 AND j.tech_id = $2
                 AND j.status NOT IN ('cancelled')
                 AND j.scheduled_at >= NOW() - INTERVAL '2 hours'
               ORDER BY j.scheduled_at`;
      values = [req.accountId, tech_id];
    } else {
      // owner/manager — all jobs today
      query = `SELECT j.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address,
                      u.name AS tech_name
               FROM jobs j
               JOIN clients c ON c.id = j.client_id
               LEFT JOIN users u ON u.id = j.tech_id
               WHERE j.account_id = $1
                 AND j.status NOT IN ('cancelled')
                 AND j.scheduled_at >= CURRENT_DATE
                 AND j.scheduled_at < CURRENT_DATE + INTERVAL '1 day'
               ORDER BY j.scheduled_at`;
      values = [req.accountId];
    }
    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/jobs/:id/checkin — GPS check-in
router.post('/jobs/:id/checkin', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  try {
    const { rows } = await pool.query(
      `UPDATE jobs SET checkin_lat = $1, checkin_lng = $2, checkin_at = NOW(), status = 'in_progress'
       WHERE id = $3 AND account_id = $4 RETURNING *`,
      [lat, lng, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/jobs/:id/complete — mark complete from mobile
router.post('/jobs/:id/complete', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'complete', completed_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    const job = rows[0];

    // Auto-invoice if job has an amount
    if (job.amount) {
      await pool.query(
        `INSERT INTO invoices (account_id, job_id, client_id, amount)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [req.accountId, job.id, job.client_id, job.amount]
      ).catch(() => {});
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/jobs/:id/photos — upload photo
router.post('/jobs/:id/photos', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  try {
    const url = `/uploads/${req.file.filename}`;
    const { rows } = await pool.query(
      `INSERT INTO job_photos (job_id, account_id, url, filename) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.accountId, url, req.file.filename]
    );
    res.status(201).json({ ...rows[0], url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mobile/jobs/:id/photos — list photos for a job
router.get('/jobs/:id/photos', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, COALESCE(url, '/uploads/' || filename) AS url FROM job_photos WHERE job_id = $1 AND account_id = $2 ORDER BY created_at`,
      [req.params.id, req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/jobs/:id/eta — send ETA SMS to client
router.post('/jobs/:id/eta', requireAuth, async (req, res) => {
  const { minutes } = req.body;
  if (!minutes) return res.status(400).json({ error: 'minutes is required' });
  try {
    const result = await pool.query(
      `SELECT j.*, c.name AS client_name, c.phone AS client_phone
       FROM jobs j JOIN clients c ON c.id = j.client_id
       WHERE j.id = $1 AND j.account_id = $2`,
      [req.params.id, req.accountId]
    );
    const job = result.rows[0];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!job.client_phone) return res.status(400).json({ error: 'Client has no phone number' });

    const body = smsService.etaBody(job.client_name, minutes);
    const message = await smsService.send(req.accountId, job.client_id, job.client_phone, body);
    if (!message) {
      return res.status(202).json({ warning: 'Twilio not configured' });
    }
    res.json({ sid: message.sid, status: message.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/mobile/jobs/:id/tip — record tip amount before completing
router.patch('/jobs/:id/tip', requireAuth, async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount < 0) return res.status(400).json({ error: 'Valid amount required.' });
  try {
    const { rows } = await pool.query(
      `UPDATE jobs SET tip_amount = $1 WHERE id = $2 AND account_id = $3 RETURNING id, tip_amount`,
      [amount, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/jobs/:id/signature — save SVG client signature
router.post('/jobs/:id/signature', requireAuth, async (req, res) => {
  const { svg } = req.body;
  if (!svg) return res.status(400).json({ error: 'svg is required.' });
  try {
    await pool.query(
      `UPDATE jobs SET signature_svg = $1, signature_at = NOW() WHERE id = $2 AND account_id = $3`,
      [svg, req.params.id, req.accountId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
