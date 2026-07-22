const express    = require('express');
const router     = express.Router();
const pool       = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkJobLimit } = require('../middleware/planLimits');
const { getEntitlements } = require('../services/entitlements');
const sms        = require('../services/sms');
const notify     = require('../services/notify');
const audit      = require('../services/audit');
const { geocodeAddress } = require('../services/geocode');

// Valid status values — single-day and multi-day parent job statuses
const VALID_STATUSES = [
  'draft','unscheduled','scheduled','in_progress','paused',
  'awaiting_client','awaiting_parts','partially_completed',
  'ready_for_inspection','complete','cancelled','no_show',
];

// Session status values
const VALID_SESSION_STATUSES = [
  'scheduled','en_route','checked_in','in_progress','paused',
  'completed_for_day','rescheduled','cancelled','missed',
];

// Fields that may be updated via PATCH /api/jobs/:id
const PATCHABLE_JOB_FIELDS = [
  'client_id','tech_id','service_type','scheduled_at','amount','travel_fee','notes','recurring',
  'service_address','service_city','service_state','service_zip','service_lat','service_lng',
  // Multi-day fields
  'title','scope_of_work','estimated_start_date','estimated_end_date','end_date_unknown',
  'job_manager_id','estimated_labor_hours','overall_completion_pct','billing_method','priority',
  'is_multi_day',
];

// ── Helper: fetch sessions + techs for a job ─────────────────────────────────
async function getSessionsForJob(jobId, accountId) {
  const { rows: sessions } = await pool.query(
    `SELECT s.*,
            u.name AS lead_tech_name,
            COALESCE(
              json_agg(
                json_build_object('id', t.id, 'tech_id', t.tech_id, 'tech_name', u2.name, 'is_lead', t.is_lead)
                ORDER BY t.is_lead DESC, u2.name
              ) FILTER (WHERE t.id IS NOT NULL), '[]'
            ) AS techs
     FROM job_sessions s
     LEFT JOIN users u  ON u.id  = s.lead_tech_id
     LEFT JOIN job_session_techs t ON t.session_id = s.id
     LEFT JOIN users u2 ON u2.id = t.tech_id
     WHERE s.job_id = $1 AND s.account_id = $2
     GROUP BY s.id, u.name
     ORDER BY s.scheduled_date, s.start_time NULLS LAST, s.session_number`,
    [jobId, accountId]
  );
  return sessions;
}

// ── GET /api/jobs ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { date, date_from, date_to, tech_id, status, client_id } = req.query;
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
  if (client_id) {
    conditions.push(`j.client_id = $${i++}`);
    values.push(client_id);
  }

  try {
    const { rows } = await pool.query(
      `SELECT j.*, c.name AS client_name, u.name AS tech_name,
              um.name AS job_manager_name
       FROM jobs j
       JOIN clients c   ON c.id = j.client_id
       LEFT JOIN users u  ON u.id = j.tech_id
       LEFT JOIN users um ON um.id = j.job_manager_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY j.scheduled_at`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/sessions — all sessions for calendar (MUST precede /:id) ───
router.get('/sessions', requireAuth, async (req, res) => {
  const { date_from, date_to, tech_id } = req.query;
  const conditions = ['s.account_id = $1'];
  const values = [req.accountId];
  let i = 2;

  if (date_from) {
    conditions.push(`s.scheduled_date >= $${i++}`);
    values.push(date_from);
  }
  if (date_to) {
    conditions.push(`s.scheduled_date <= $${i++}`);
    values.push(date_to);
  }
  if (tech_id) {
    conditions.push(`(s.lead_tech_id = $${i} OR EXISTS (
      SELECT 1 FROM job_session_techs jst WHERE jst.session_id = s.id AND jst.tech_id = $${i}
    ))`);
    values.push(tech_id);
    i++;
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.*,
              j.service_type, j.status AS job_status, j.is_multi_day,
              j.client_id, c.name AS client_name,
              u.name AS lead_tech_name,
              (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id) AS total_sessions,
              (SELECT COUNT(*) FROM job_sessions s2 WHERE s2.job_id = s.job_id AND s2.scheduled_date < s.scheduled_date) + 1 AS day_number
       FROM job_sessions s
       JOIN jobs j    ON j.id = s.job_id
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN users u ON u.id = s.lead_tech_id
       WHERE ${conditions.join(' AND ')}
         AND s.status NOT IN ('cancelled')
       ORDER BY s.scheduled_date, s.start_time NULLS LAST`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id — single job with sessions ──────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.*, c.name AS client_name, u.name AS tech_name,
              um.name AS job_manager_name
       FROM jobs j
       JOIN clients c   ON c.id = j.client_id
       LEFT JOIN users u  ON u.id = j.tech_id
       LEFT JOIN users um ON um.id = j.job_manager_id
       WHERE j.id = $1 AND j.account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];

    if (job.is_multi_day) {
      job.sessions = await getSessionsForJob(job.id, req.accountId);

      // Fetch assets
      const { rows: assets } = await pool.query(
        `SELECT a.*, u.name AS assigned_tech_name
         FROM job_assets a
         LEFT JOIN users u ON u.id = a.assigned_tech_id
         WHERE a.job_id = $1 AND a.account_id = $2
         ORDER BY a.created_at`,
        [job.id, req.accountId]
      );
      job.assets = assets;
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs ────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), checkJobLimit, async (req, res) => {
  const {
    client_id, tech_id, service_type, scheduled_at, amount, notes, recurring, travel_fee,
    service_address, service_location, address,
    service_city, service_state, service_zip, service_lat, service_lng,
    // Multi-day fields
    is_multi_day, title, scope_of_work, estimated_start_date, estimated_end_date,
    end_date_unknown, job_manager_id, estimated_labor_hours, billing_method, priority,
    sessions = [],  // array of { scheduled_date, start_time, end_time, tech_ids, title, description }
  } = req.body;

  if (!client_id || !service_type) {
    return res.status(400).json({ error: 'client_id and service_type are required' });
  }

  // Enforce multi-day entitlement before touching the DB
  if (is_multi_day) {
    const ent = await getEntitlements(req.accountId);
    if (!ent.capabilities.can_create_multi_day_jobs) {
      return res.status(403).json({
        error:       'Multi-Day Jobs require the Solo plan or higher.',
        code:        'ENTITLEMENT_REQUIRED',
        capability:  'can_create_multi_day_jobs',
        requiredPlan: 'solo',
        currentPlan: ent.plan,
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const addressToGeocode  = service_address || service_location || address || null;
    let finalServiceAddress = addressToGeocode;
    let finalServiceLat     = service_lat  || null;
    let finalServiceLng     = service_lng  || null;
    let mappingWarning      = null;

    if (addressToGeocode && (!finalServiceLat || !finalServiceLng)) {
      const geo = await geocodeAddress(addressToGeocode);
      if (geo) {
        finalServiceAddress = geo.formatted_address || finalServiceAddress;
        finalServiceLat     = geo.lat;
        finalServiceLng     = geo.lng;
      } else {
        mappingWarning = 'Job saved, but address could not be mapped.';
      }
    }

    let travelFee = travel_fee !== undefined ? parseFloat(travel_fee) || 0 : null;
    if (travelFee === null) {
      const settingsRes = await client.query(
        `SELECT travel_fee FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      travelFee = parseFloat(settingsRes.rows[0]?.travel_fee || 0);
    }

    const { rows } = await client.query(
      `INSERT INTO jobs
         (account_id, client_id, tech_id, service_type, scheduled_at, amount, notes, recurring,
          travel_fee, service_address, service_city, service_state, service_zip, service_lat, service_lng,
          is_multi_day, title, scope_of_work, estimated_start_date, estimated_end_date, end_date_unknown,
          job_manager_id, estimated_labor_hours, billing_method, priority, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW())
       RETURNING *`,
      [
        req.accountId, client_id, tech_id || null, service_type,
        scheduled_at || null, amount || null, notes, recurring || 'none',
        travelFee, finalServiceAddress || null, service_city || null,
        service_state || null, service_zip || null, finalServiceLat, finalServiceLng,
        !!is_multi_day, title || null, scope_of_work || null,
        estimated_start_date || null, estimated_end_date || null, !!end_date_unknown,
        job_manager_id || null, estimated_labor_hours || null,
        billing_method || 'fixed', priority || 'normal',
      ]
    );
    const job = rows[0];

    // Create sessions for multi-day job
    const createdSessions = [];
    if (is_multi_day && sessions.length > 0) {
      for (let idx = 0; idx < sessions.length; idx++) {
        const sess = sessions[idx];
        const { rows: sRows } = await client.query(
          `INSERT INTO job_sessions
             (job_id, account_id, session_number, title, description, scheduled_date,
              start_time, end_time, lead_tech_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            job.id, req.accountId, idx + 1,
            sess.title || null, sess.description || null, sess.scheduled_date,
            sess.start_time || null, sess.end_time || null,
            sess.lead_tech_id || tech_id || null, req.userId,
          ]
        );
        const session = sRows[0];

        // Assign technicians to session
        const techIds = sess.tech_ids && sess.tech_ids.length > 0
          ? sess.tech_ids
          : (tech_id ? [tech_id] : []);

        for (const tid of techIds) {
          await client.query(
            `INSERT INTO job_session_techs (session_id, job_id, account_id, tech_id, is_lead)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (session_id, tech_id) DO NOTHING`,
            [session.id, job.id, req.accountId, tid, tid === (sess.lead_tech_id || tech_id)]
          );
        }
        session.techs = techIds.map(tid => ({ tech_id: tid }));
        createdSessions.push(session);
      }
    }

    // Auto-create deposit
    const depSettingsRes = await client.query(
      `SELECT deposit_amount FROM booking_settings WHERE account_id = $1`, [req.accountId]
    );
    const depositAmount = parseFloat(depSettingsRes.rows[0]?.deposit_amount || 0);
    if (depositAmount > 0) {
      await client.query(
        `INSERT INTO deposits (account_id, job_id, client_id, amount) VALUES ($1,$2,$3,$4)`,
        [req.accountId, job.id, client_id, depositAmount]
      ).catch(() => {});
    }

    await client.query('COMMIT');

    // Auto-send confirmation SMS (non-fatal)
    if (scheduled_at && !is_multi_day) {
      const clientResult = await pool.query(`SELECT name, phone FROM clients WHERE id = $1`, [client_id]);
      const cl = clientResult.rows[0];
      if (cl?.phone) {
        sms.send(req.accountId, client_id, cl.phone,
          sms.confirmationBody(cl.name, service_type, scheduled_at)
        ).then(result => {
          if (!result?.blocked) return pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [job.id]);
        }).catch(() => {});
      }
    }

    audit.log(req.accountId, req.userId, 'job.created', 'job', job.id, {
      is_multi_day: !!is_multi_day, session_count: createdSessions.length,
    }, req.ip);

    const response = { ...job, sessions: createdSessions };
    if (mappingWarning) response.geocode_warning = mappingWarning;
    res.status(201).json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── PATCH /api/jobs/:id — full edit ──────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const updates = [];
  const values  = [];
  let i = 1;

  PATCHABLE_JOB_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] !== '' ? req.body[f] : null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  updates.push(`updated_at = NOW()`);
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
    let job = rows[0];

    // Geocode when address present but coordinates missing
    if (job.service_address && (!job.service_lat || !job.service_lng)) {
      const addrParts = [job.service_address, job.service_city, job.service_state, job.service_zip].filter(Boolean);
      const geo = await geocodeAddress(addrParts.join(', '));
      if (geo) {
        await pool.query(
          `UPDATE jobs SET service_lat = $1, service_lng = $2, service_address = COALESCE($3, service_address) WHERE id = $4`,
          [geo.lat, geo.lng, geo.formatted_address || null, job.id]
        );
        job = { ...job, service_lat: geo.lat, service_lng: geo.lng, service_address: geo.formatted_address || job.service_address };
      }
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/status ────────────────────────────────────────────────
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    // Fetch job to check is_multi_day
    const { rows: existing } = await pool.query(
      `SELECT id, is_multi_day, amount, client_id, service_type, travel_fee FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const job = existing[0];

    // Multi-day jobs must use POST /:id/complete to complete — prevents accidental completion
    if (job.is_multi_day && status === 'complete') {
      return res.status(400).json({
        error: 'Multi-day jobs must be completed via POST /api/jobs/:id/complete to ensure all sessions are reviewed.'
      });
    }

    const completedAt = status === 'complete' ? 'NOW()' : 'NULL';
    const { rows } = await pool.query(
      `UPDATE jobs SET status = $1, completed_at = ${completedAt}, updated_at = NOW()
       WHERE id = $2 AND account_id = $3 RETURNING *`,
      [status, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const updated = rows[0];

    // Auto-generate invoice when single-day job is marked complete
    if (status === 'complete' && !updated.is_multi_day && updated.amount) {
      const settingsRes = await pool.query(
        `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      const taxRate    = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
      const serviceAmt = parseFloat(updated.amount);
      const travelAmt  = parseFloat(updated.travel_fee || 0);
      const lineItems  = [{ description: updated.service_type || 'Service', amount: serviceAmt }];
      if (travelAmt > 0) lineItems.push({ description: 'Travel Fee', amount: travelAmt });
      const subtotal   = lineItems.reduce((s, l) => s + l.amount, 0);
      const taxAmount  = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
      const total      = subtotal + taxAmount;
      await pool.query(
        `INSERT INTO invoices (account_id, job_id, client_id, amount, tax_amount, line_items)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [req.accountId, updated.id, updated.client_id, total, taxAmount, JSON.stringify(lineItems)]
      ).catch(() => {});
    }

    audit.log(req.accountId, req.userId, 'job.status_changed', 'job', updated.id,
      { from: job.status, to: status }, req.ip);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/complete — deliberately complete a multi-day job ───────
router.post('/:id/complete', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { notes } = req.body;
  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const job = existing[0];

    if (job.status === 'complete') {
      return res.status(409).json({ error: 'Job is already complete.' });
    }

    const { rows } = await pool.query(
      `UPDATE jobs SET
         status = 'complete',
         completed_at = NOW(),
         actual_completion_date = CURRENT_DATE,
         overall_completion_pct = 100,
         updated_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    const updated = rows[0];

    // Auto-generate invoice
    if (updated.amount) {
      const settingsRes = await pool.query(
        `SELECT tax_rate FROM booking_settings WHERE account_id = $1`, [req.accountId]
      );
      const taxRate    = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
      const serviceAmt = parseFloat(updated.amount);
      const travelAmt  = parseFloat(updated.travel_fee || 0);
      const lineItems  = [{ description: updated.service_type || updated.title || 'Service', amount: serviceAmt }];
      if (travelAmt > 0) lineItems.push({ description: 'Travel Fee', amount: travelAmt });
      const subtotal   = lineItems.reduce((s, l) => s + l.amount, 0);
      const taxAmount  = subtotal > 0 ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
      const total      = subtotal + taxAmount;
      await pool.query(
        `INSERT INTO invoices (account_id, job_id, client_id, amount, tax_amount, line_items)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [req.accountId, updated.id, updated.client_id, total, taxAmount, JSON.stringify(lineItems)]
      ).catch(() => {});
    }

    await notify.create(req.accountId, 'job_completed',
      `Job completed: ${updated.title || updated.service_type}`);
    audit.log(req.accountId, req.userId, 'job.completed', 'job', updated.id,
      { is_multi_day: true, notes: notes || null }, req.ip);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/noshow — declare no-show ─────────────────────────────
router.patch('/:id/noshow', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'no_show', noshow_declared_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND account_id = $2 RETURNING *`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];

    await pool.query(
      `UPDATE deposits SET status = 'collected'
       WHERE job_id = $1 AND status = 'pending' AND account_id = $2`,
      [job.id, req.accountId]
    );

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id/sessions — list sessions for a job ─────────────────────
router.get('/:id/sessions', requireAuth, async (req, res) => {
  try {
    // Verify job belongs to account
    const { rows: jobRows } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/sessions — add work session ───────────────────────────
router.post('/:id/sessions', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const {
    scheduled_date, start_time, end_time, title, description,
    lead_tech_id, tech_ids = [], estimated_hours,
  } = req.body;

  if (!scheduled_date) {
    return res.status(400).json({ error: 'scheduled_date is required' });
  }

  try {
    // Verify job ownership and multi-day flag
    const { rows: jobRows } = await pool.query(
      `SELECT id, is_multi_day FROM jobs WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    // Auto-enable is_multi_day if adding sessions to a non-multi-day job
    if (!jobRows[0].is_multi_day) {
      await pool.query(
        `UPDATE jobs SET is_multi_day = TRUE, updated_at = NOW() WHERE id = $1`, [req.params.id]
      );
    }

    // Get next session number
    const { rows: cntRows } = await pool.query(
      `SELECT COALESCE(MAX(session_number), 0) + 1 AS next_num FROM job_sessions WHERE job_id = $1`,
      [req.params.id]
    );
    const sessionNumber = cntRows[0].next_num;

    const { rows: sRows } = await pool.query(
      `INSERT INTO job_sessions
         (job_id, account_id, session_number, title, description, scheduled_date,
          start_time, end_time, lead_tech_id, estimated_hours, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        req.params.id, req.accountId, sessionNumber,
        title || null, description || null, scheduled_date,
        start_time || null, end_time || null,
        lead_tech_id || null, estimated_hours || null, req.userId,
      ]
    );
    const session = sRows[0];

    // Assign technicians
    const allTechIds = [...new Set([...(lead_tech_id ? [lead_tech_id] : []), ...tech_ids])];
    for (const tid of allTechIds) {
      await pool.query(
        `INSERT INTO job_session_techs (session_id, job_id, account_id, tech_id, is_lead)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (session_id, tech_id) DO NOTHING`,
        [session.id, req.params.id, req.accountId, tid, tid === lead_tech_id]
      );
    }

    // Fetch with techs
    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const created  = sessions.find(s => s.id === session.id) || session;

    audit.log(req.accountId, req.userId, 'session.added', 'job_session', session.id,
      { job_id: req.params.id, scheduled_date }, req.ip);

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/sessions/:sid ─────────────────────────────────────────
router.patch('/:id/sessions/:sid', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const SESSION_FIELDS = [
    'title','description','scheduled_date','start_time','end_time',
    'lead_tech_id','estimated_hours','actual_hours','internal_notes','client_notes',
    'work_completed','work_remaining','blockers','completion_pct',
  ];

  const updates = [];
  const values  = [];
  let i = 1;

  SESSION_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] !== '' ? req.body[f] : null);
    }
  });

  if (!updates.length && !req.body.tech_ids) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    // Verify ownership
    const { rows: existing } = await pool.query(
      `SELECT s.* FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });

    if (updates.length) {
      updates.push(`updated_by = $${i++}`, `updated_at = NOW()`);
      values.push(req.userId, req.params.sid, req.accountId);
      await pool.query(
        `UPDATE job_sessions SET ${updates.join(', ')}
         WHERE id = $${i} AND account_id = $${i + 1}`,
        values
      );
    }

    // Sync technicians if provided
    if (req.body.tech_ids !== undefined) {
      const newTechIds = req.body.tech_ids || [];
      const lead = req.body.lead_tech_id || existing[0].lead_tech_id;

      await pool.query(`DELETE FROM job_session_techs WHERE session_id = $1`, [req.params.sid]);
      for (const tid of [...new Set([...(lead ? [lead] : []), ...newTechIds])]) {
        await pool.query(
          `INSERT INTO job_session_techs (session_id, job_id, account_id, tech_id, is_lead)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (session_id, tech_id) DO NOTHING`,
          [req.params.sid, req.params.id, req.accountId, tid, tid === lead]
        );
      }
    }

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const updated  = sessions.find(s => String(s.id) === String(req.params.sid));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/sessions/:sid/status ──────────────────────────────────
router.patch('/:id/sessions/:sid/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!VALID_SESSION_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_SESSION_STATUSES.join(', ')}` });
  }

  try {
    const { rows: existing } = await pool.query(
      `SELECT s.*, j.status AS job_status FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });
    const session = existing[0];

    // Protect completed sessions from accidental status rollback (require owner/manager)
    if (session.status === 'completed_for_day' && req.userRole === 'tech') {
      return res.status(403).json({ error: 'Technicians cannot reopen completed sessions.' });
    }

    const checkinAt  = status === 'checked_in' ? 'NOW()' : `'${session.checkin_at || null}'`;
    const checkoutAt = status === 'completed_for_day' ? 'NOW()' : `NULL`;

    await pool.query(
      `UPDATE job_sessions SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3 AND account_id = $4`,
      [status, req.userId, req.params.sid, req.accountId]
    );

    // When first session checks in, move parent job to in_progress
    if (status === 'checked_in' || status === 'in_progress') {
      await pool.query(
        `UPDATE jobs SET
           status = CASE WHEN status IN ('scheduled','unscheduled','draft') THEN 'in_progress' ELSE status END,
           actual_start_date = COALESCE(actual_start_date, CURRENT_DATE),
           updated_at = NOW()
         WHERE id = $1 AND account_id = $2`,
        [req.params.id, req.accountId]
      );
    }

    // When a session completes for the day, update parent to partially_completed if not already in_progress
    if (status === 'completed_for_day') {
      await pool.query(
        `UPDATE jobs SET
           status = CASE
             WHEN status = 'in_progress' THEN 'partially_completed'
             WHEN status = 'scheduled' THEN 'partially_completed'
             ELSE status
           END,
           updated_at = NOW()
         WHERE id = $1 AND account_id = $2 AND is_multi_day = TRUE`,
        [req.params.id, req.accountId]
      );

      audit.log(req.accountId, req.userId, 'session.completed_for_day', 'job_session', req.params.sid,
        { job_id: req.params.id, session_date: session.scheduled_date }, req.ip);
    }

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const updated  = sessions.find(s => String(s.id) === String(req.params.sid));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/sessions/:sid/complete — daily closeout ────────────────
router.post('/:id/sessions/:sid/complete', requireAuth, async (req, res) => {
  const {
    work_completed, work_remaining, completion_pct, blockers,
    internal_notes, client_notes, actual_hours,
  } = req.body;

  try {
    const { rows: existing } = await pool.query(
      `SELECT s.*, j.is_multi_day FROM job_sessions s
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
         status          = 'completed_for_day',
         checkout_at     = NOW(),
         work_completed  = COALESCE($1, work_completed),
         work_remaining  = COALESCE($2, work_remaining),
         completion_pct  = COALESCE($3, completion_pct),
         blockers        = COALESCE($4, blockers),
         internal_notes  = COALESCE($5, internal_notes),
         client_notes    = COALESCE($6, client_notes),
         actual_hours    = COALESCE($7, actual_hours),
         updated_by      = $8,
         updated_at      = NOW()
       WHERE id = $9 AND account_id = $10`,
      [
        work_completed || null, work_remaining || null,
        completion_pct != null ? parseInt(completion_pct) : null,
        blockers || null, internal_notes || null, client_notes || null,
        actual_hours ? parseFloat(actual_hours) : null,
        req.userId, req.params.sid, req.accountId,
      ]
    );

    // Update parent job status to partially_completed; keep open
    await pool.query(
      `UPDATE jobs SET
         status = CASE
           WHEN status IN ('in_progress','scheduled','unscheduled') THEN 'partially_completed'
           ELSE status
         END,
         actual_start_date = COALESCE(actual_start_date, CURRENT_DATE),
         updated_at = NOW()
       WHERE id = $1 AND account_id = $2`,
      [req.params.id, req.accountId]
    );

    // Update parent overall_completion_pct as average of all session completion_pcts
    await pool.query(
      `UPDATE jobs SET
         overall_completion_pct = (
           SELECT COALESCE(AVG(completion_pct)::INT, 0)
           FROM job_sessions WHERE job_id = $1
         )
       WHERE id = $1`,
      [req.params.id]
    );

    await notify.create(req.accountId, 'session_completed',
      `Session completed for ${session.scheduled_date}`);
    audit.log(req.accountId, req.userId, 'session.completed_for_day', 'job_session', req.params.sid,
      { job_id: req.params.id, work_completed, completion_pct }, req.ip);

    const sessions = await getSessionsForJob(req.params.id, req.accountId);
    const updated  = sessions.find(s => String(s.id) === String(req.params.sid));
    res.json({ session: updated, message: 'Session completed for the day. Parent job remains open.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/jobs/:id/sessions/:sid ────────────────────────────────────────
router.delete('/:id/sessions/:sid', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT s.* FROM job_sessions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.id = $1 AND s.account_id = $2`,
      [req.params.sid, req.accountId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Session not found' });
    const session = existing[0];

    if (session.status === 'completed_for_day') {
      return res.status(409).json({
        error: 'Cannot delete a completed session. Use a cancellation status instead.'
      });
    }

    await pool.query(
      `DELETE FROM job_sessions WHERE id = $1 AND account_id = $2`,
      [req.params.sid, req.accountId]
    );

    audit.log(req.accountId, req.userId, 'session.deleted', 'job_session', req.params.sid,
      { job_id: req.params.id, scheduled_date: session.scheduled_date }, req.ip);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id/assets ──────────────────────────────────────────────────
router.get('/:id/assets', requireAuth, async (req, res) => {
  try {
    const { rows: jobRows } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    const { rows } = await pool.query(
      `SELECT a.*, u.name AS assigned_tech_name
       FROM job_assets a
       LEFT JOIN users u ON u.id = a.assigned_tech_id
       WHERE a.job_id = $1 AND a.account_id = $2
       ORDER BY a.created_at`,
      [req.params.id, req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:id/assets ─────────────────────────────────────────────────
router.post('/:id/assets', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { name, description, asset_type, identifier, assigned_tech_id, assigned_session_id, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows: jobRows } = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [req.params.id, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });

    const { rows } = await pool.query(
      `INSERT INTO job_assets
         (job_id, account_id, name, description, asset_type, identifier,
          assigned_tech_id, assigned_session_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, req.accountId, name, description || null, asset_type || null,
       identifier || null, assigned_tech_id || null, assigned_session_id || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/jobs/:id/assets/:aid ──────────────────────────────────────────
router.patch('/:id/assets/:aid', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const ASSET_FIELDS = ['name','description','asset_type','identifier','status',
    'assigned_tech_id','assigned_session_id','completion_pct','notes'];
  const updates = [];
  const values  = [];
  let i = 1;

  ASSET_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f] !== '' ? req.body[f] : null);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  if (req.body.status === 'completed') {
    updates.push(`completed_at = $${i++}`);
    values.push(new Date().toISOString());
  }

  updates.push(`updated_at = NOW()`);
  values.push(req.params.aid, req.params.id, req.accountId);

  try {
    const { rows } = await pool.query(
      `UPDATE job_assets SET ${updates.join(', ')}
       WHERE id = $${i} AND job_id = $${i + 1} AND account_id = $${i + 2} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
