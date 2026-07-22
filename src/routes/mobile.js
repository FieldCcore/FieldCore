const express         = require('express');
const router          = express.Router();
const multer          = require('multer');
const pool            = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const smsService      = require('../services/sms');
const storageService  = require('../services/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Per-job ETA cooldown map — prevents rapid-fire SMS from the tech app.
// Keyed by jobId, value is the timestamp of the last successful ETA send.
// Per-process only (acceptable for single-instance Railway deployment).
const etaLastSent = new Map();
const ETA_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes between ETA messages per job

// GET /api/mobile/jobs — jobs for this account; if tech_id supplied, filter to that tech
// ?view=today|tomorrow|week controls date range (tech_id path only)
// ?limit=25&offset=0 for pagination (tech_id path only; default limit 25, max 100)
// Response for tech_id path: { jobs: [...], has_more: bool, limit, offset }
// Response for owner/manager path: bare array (unchanged)
router.get('/jobs', requireAuth, async (req, res) => {
  const { tech_id, view, limit: rawLimit, offset: rawOffset } = req.query;
  const safeView = ['today', 'tomorrow', 'week'].includes(view) ? view : 'today';
  const limit    = Math.min(Math.max(parseInt(rawLimit,  10) || 25, 1), 100);
  const offset   = Math.max(parseInt(rawOffset, 10) || 0, 0);
  try {
    let query, values;
    if (tech_id) {
      let startCond, endCond;
      if (safeView === 'tomorrow') {
        startCond = `j.scheduled_at >= CURRENT_DATE + INTERVAL '1 day'`;
        endCond   = `j.scheduled_at <  CURRENT_DATE + INTERVAL '2 days'`;
      } else if (safeView === 'week') {
        startCond = `j.scheduled_at >= CURRENT_DATE`;
        endCond   = `j.scheduled_at <  CURRENT_DATE + INTERVAL '7 days'`;
      } else {
        startCond = `j.scheduled_at >= NOW() - INTERVAL '2 hours'`;
        endCond   = `j.scheduled_at <  CURRENT_DATE + INTERVAL '1 day'`;
      }
      // Fetch limit+1 rows to detect has_more without a COUNT query
      query = `SELECT j.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address
               FROM jobs j
               JOIN clients c ON c.id = j.client_id
               WHERE j.account_id = $1
                 AND j.tech_id = $2
                 AND j.status NOT IN ('cancelled')
                 AND ${startCond}
                 AND ${endCond}
               ORDER BY j.scheduled_at
               LIMIT $3 OFFSET $4`;
      values = [req.accountId, tech_id, limit + 1, offset];
      const { rows } = await pool.query(query, values);
      const has_more = rows.length > limit;
      if (has_more) rows.pop();
      return res.json({ jobs: rows, has_more, limit, offset });
    } else {
      // owner/manager — all jobs today (bare array, unchanged)
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
      const { rows } = await pool.query(query, values);
      return res.json(rows);
    }
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

// POST /api/mobile/jobs/:id/complete — mark complete from mobile (single-day only)
router.post('/jobs/:id/complete', requireAuth, async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT id, is_multi_day, amount, client_id FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Job not found' });
    const job = existing[0];

    if (job.is_multi_day) {
      return res.status(400).json({
        error: 'Multi-day jobs cannot be completed from the mobile app. Use the session closeout flow instead.'
      });
    }

    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'complete', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    const updated = rows[0];

    if (updated.amount) {
      await pool.query(
        `INSERT INTO invoices (account_id, job_id, client_id, amount)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [req.accountId, updated.id, updated.client_id, updated.amount]
      ).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mobile/sessions/today — today's work sessions for this tech
router.get('/sessions/today', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*,
              j.service_type, j.title AS job_title, j.status AS job_status,
              j.service_address, j.service_city, j.service_state, j.service_zip,
              j.client_id, j.is_multi_day,
              c.name AS client_name, c.phone AS client_phone,
              (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id) AS total_sessions,
              (SELECT COUNT(*) FROM job_sessions s2
               WHERE s2.job_id = s.job_id AND s2.scheduled_date < s.scheduled_date) + 1 AS day_number,
              COALESCE(
                (SELECT json_agg(json_build_object('tech_id', jst.tech_id, 'tech_name', u2.name))
                 FROM job_session_techs jst
                 JOIN users u2 ON u2.id = jst.tech_id
                 WHERE jst.session_id = s.id), '[]'
              ) AS techs
       FROM job_sessions s
       JOIN jobs j    ON j.id = s.job_id
       JOIN clients c ON c.id = j.client_id
       WHERE s.account_id = $1
         AND s.scheduled_date = CURRENT_DATE
         AND s.status NOT IN ('cancelled','missed')
         AND (
           s.lead_tech_id = $2
           OR EXISTS (
             SELECT 1 FROM job_session_techs jst
             WHERE jst.session_id = s.id AND jst.tech_id = $2
           )
         )
       ORDER BY s.start_time NULLS LAST`,
      [req.accountId, req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/sessions/:sid/checkin — session GPS check-in
router.post('/sessions/:sid/checkin', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  try {
    const { rows: existing } = await pool.query(
      `SELECT s.*, j.id AS job_id FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });
    const session = existing[0];

    const { rows } = await pool.query(
      `UPDATE job_sessions SET
         status = CASE WHEN status = 'scheduled' THEN 'checked_in' ELSE status END,
         checkin_at = COALESCE(checkin_at, NOW()),
         checkin_lat = $1, checkin_lng = $2,
         updated_at = NOW()
       WHERE id = $3 AND account_id = $4 RETURNING *`,
      [lat, lng, req.params.sid, req.accountId]
    );

    // Move parent job to in_progress if not already
    await pool.query(
      `UPDATE jobs SET
         status = CASE WHEN status IN ('scheduled','unscheduled','draft') THEN 'in_progress' ELSE status END,
         actual_start_date = COALESCE(actual_start_date, CURRENT_DATE),
         checkin_at = COALESCE(checkin_at, NOW()),
         checkin_lat = $1, checkin_lng = $2,
         updated_at = NOW()
       WHERE id = $3 AND account_id = $4`,
      [lat, lng, session.job_id, req.accountId]
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/sessions/:sid/complete — complete for the day from mobile
router.post('/sessions/:sid/complete', requireAuth, async (req, res) => {
  const { work_completed, work_remaining, completion_pct, blockers, internal_notes, actual_hours } = req.body;
  try {
    const { rows: existing } = await pool.query(
      `SELECT s.*, j.id AS job_id FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });
    const session = existing[0];

    if (session.status === 'completed_for_day') {
      return res.status(409).json({ error: 'Session is already completed for the day.' });
    }

    await pool.query(
      `UPDATE job_sessions SET
         status         = 'completed_for_day',
         checkout_at    = NOW(),
         work_completed = COALESCE($1, work_completed),
         work_remaining = COALESCE($2, work_remaining),
         completion_pct = COALESCE($3, completion_pct),
         blockers       = COALESCE($4, blockers),
         internal_notes = COALESCE($5, internal_notes),
         actual_hours   = COALESCE($6, actual_hours),
         updated_by     = $7,
         updated_at     = NOW()
       WHERE id = $8 AND account_id = $9`,
      [
        work_completed || null, work_remaining || null,
        completion_pct != null ? parseInt(completion_pct) : null,
        blockers || null, internal_notes || null,
        actual_hours ? parseFloat(actual_hours) : null,
        req.userId, req.params.sid, req.accountId,
      ]
    );

    // Update parent job status
    await pool.query(
      `UPDATE jobs SET
         status = CASE
           WHEN status IN ('in_progress','scheduled') THEN 'partially_completed'
           ELSE status
         END,
         overall_completion_pct = (
           SELECT COALESCE(AVG(completion_pct)::INT, 0)
           FROM job_sessions WHERE job_id = $1
         ),
         updated_at = NOW()
       WHERE id = $1 AND account_id = $2`,
      [session.job_id, req.accountId]
    );

    // Refetch updated session to return enriched data
    const { rows: updatedRows } = await pool.query(
      `SELECT s.*,
              j.service_type, j.title AS job_title,
              c.name AS client_name, c.phone AS client_phone,
              (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id) AS total_sessions,
              (SELECT COUNT(*) FROM job_sessions s2
               WHERE s2.job_id = s.job_id AND s2.scheduled_date < s.scheduled_date) + 1 AS day_number
       FROM job_sessions s
       JOIN jobs j    ON j.id = s.job_id
       JOIN clients c ON c.id = j.client_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );

    res.json({ session: updatedRows[0], message: 'Session completed for the day. The overall job remains open.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobile/jobs/:id/photos — upload photo to R2/S3
router.post('/jobs/:id/photos', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  if (!storageService.isConfigured()) {
    return res.status(503).json({ error: 'Photo storage not configured. Set R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_PUBLIC_URL in environment.' });
  }
  try {
    const url = await storageService.upload(req.file.buffer, {
      filename:    req.file.originalname || 'photo.jpg',
      contentType: req.file.mimetype     || 'image/jpeg',
      folder:      'job-photos',
    });
    if (!url) return res.status(503).json({ error: 'Photo upload failed.' });
    const { rows } = await pool.query(
      `INSERT INTO job_photos (job_id, account_id, url, filename) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.accountId, url, req.file.originalname || '']
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
  const mins = parseInt(minutes, 10);
  if (isNaN(mins) || mins < 1 || mins > 240) {
    return res.status(400).json({ error: 'minutes must be an integer between 1 and 240' });
  }

  const jobId = req.params.id;
  const lastSent = etaLastSent.get(jobId);
  if (lastSent && Date.now() - lastSent < ETA_COOLDOWN_MS) {
    const waitSec = Math.ceil((ETA_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ error: `ETA already sent. Wait ${waitSec}s before sending again.` });
  }

  try {
    const result = await pool.query(
      `SELECT j.*, c.name AS client_name, c.phone AS client_phone
       FROM jobs j JOIN clients c ON c.id = j.client_id
       WHERE j.id = $1 AND j.account_id = $2`,
      [jobId, req.accountId]
    );
    const job = result.rows[0];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!job.client_phone) return res.status(400).json({ error: 'Client has no phone number' });

    const body = smsService.etaBody(job.client_name, mins);
    const message = await smsService.send(req.accountId, job.client_id, job.client_phone, body);
    if (message?.blocked) {
      return res.status(409).json({ blocked: true, reason: 'recipient_opted_out' });
    }
    if (!message) {
      return res.status(202).json({ warning: 'Twilio not configured' });
    }
    etaLastSent.set(jobId, Date.now());
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

// POST /api/mobile/location — tech pushes live GPS position (~every 20 s while available)
router.post('/location', requireAuth, async (req, res) => {
  const { lat, lng, accuracy, heading, speed, battery_level } = req.body;
  const nlat = parseFloat(lat);
  const nlng = parseFloat(lng);
  if (!isFinite(nlat) || !isFinite(nlng)) {
    return res.status(400).json({ error: 'lat and lng must be valid numbers' });
  }
  try {
    await pool.query(
      `INSERT INTO tech_locations
         (account_id, user_id, lat, lng, accuracy, heading, speed, battery_level, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (account_id, user_id) DO UPDATE SET
         lat           = EXCLUDED.lat,
         lng           = EXCLUDED.lng,
         accuracy      = EXCLUDED.accuracy,
         heading       = EXCLUDED.heading,
         speed         = EXCLUDED.speed,
         battery_level = EXCLUDED.battery_level,
         updated_at    = NOW()`,
      [
        req.accountId, req.userId, nlat, nlng,
        accuracy      != null ? parseFloat(accuracy)         : null,
        heading       != null ? parseFloat(heading)          : null,
        speed         != null ? parseFloat(speed)            : null,
        battery_level != null ? parseInt(battery_level, 10)  : null,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mobile/locations — all tech live GPS for this account (owner/manager only)
router.get('/locations', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tl.user_id, tl.lat, tl.lng, tl.accuracy, tl.heading,
              tl.speed, tl.battery_level, tl.updated_at,
              u.name, u.is_available
       FROM tech_locations tl
       JOIN users u ON u.id = tl.user_id
       WHERE tl.account_id = $1
       ORDER BY u.name`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
