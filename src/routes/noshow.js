const express  = require('express');
const router   = express.Router();
const pool     = require('../db/pool');
const PDFDoc   = require('pdfkit');
const path     = require('path');
const fs       = require('fs');
const { requireAuth, requireRole } = require('../middleware/auth');
const sms      = require('../services/sms');
const email    = require('../services/email');

// ── GET /api/no-show/settings ──────────────────────────────────────────────────
router.get('/settings', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM no_show_settings WHERE account_id = $1`, [req.accountId]
    );
    if (!rows.length) {
      // Return defaults without inserting
      return res.json({
        grace_period_minutes:  15,
        require_arrival_photo: false,
        auto_declare:          true,
        client_sms_template:   null,
        tech_sms_template:     null,
      });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/no-show/settings ──────────────────────────────────────────────────
router.put('/settings', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { grace_period_minutes, require_arrival_photo, auto_declare,
          client_sms_template, tech_sms_template } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO no_show_settings
         (account_id, grace_period_minutes, require_arrival_photo, auto_declare,
          client_sms_template, tech_sms_template, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         grace_period_minutes  = EXCLUDED.grace_period_minutes,
         require_arrival_photo = EXCLUDED.require_arrival_photo,
         auto_declare          = EXCLUDED.auto_declare,
         client_sms_template   = EXCLUDED.client_sms_template,
         tech_sms_template     = EXCLUDED.tech_sms_template,
         updated_at            = NOW()
       RETURNING *`,
      [req.accountId, grace_period_minutes ?? 15, !!require_arrival_photo,
       auto_declare !== false, client_sms_template || null, tech_sms_template || null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/no-show/jobs/:jobId/start ───────────────────────────────────────
// Technician starts the grace period clock on arrival
router.post('/jobs/:jobId/start', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE jobs
       SET no_show_clock_started_at = NOW(),
           checkin_lat = $1, checkin_lng = $2, checkin_at = NOW()
       WHERE id = $3 AND account_id = $4 AND status = 'scheduled'
         AND no_show_clock_started_at IS NULL
       RETURNING *`,
      [lat || null, lng || null, req.params.jobId, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found or clock already started.' });
    res.json({ ok: true, clock_started_at: rows[0].no_show_clock_started_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/no-show/jobs/:jobId/declare ─────────────────────────────────────
// Manually or automatically declare a no-show
router.post('/jobs/:jobId/declare', requireAuth, async (req, res) => {
  const { tech_gps_lat, tech_gps_lng, notes } = req.body;
  try {
    // Load job + client + tech + settings + deposit
    const { rows: jobRows } = await pool.query(
      `SELECT j.*, c.name AS client_name, c.phone AS client_phone,
              c.email AS client_email, c.address AS client_address,
              u.name AS tech_name, u.phone AS tech_phone,
              d.amount AS deposit_amount
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN users u ON u.id = j.tech_id
       LEFT JOIN deposits d ON d.job_id = j.id AND d.status = 'collected'
       WHERE j.id = $1 AND j.account_id = $2
         AND j.status IN ('scheduled','in_progress')`,
      [req.params.jobId, req.accountId]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found or already resolved.' });
    const job = jobRows[0];

    const settings = await pool.query(
      `SELECT * FROM no_show_settings WHERE account_id = $1`, [req.accountId]
    ).then(r => r.rows[0] || { grace_period_minutes: 15, client_sms_template: null, tech_sms_template: null });

    const depositRetained = parseFloat(job.deposit_amount || 0);

    // Mark job as no-show
    await pool.query(
      `UPDATE jobs SET status = 'no_show', noshow_declared_at = NOW(),
          deposit_retained = $1
       WHERE id = $2`,
      [depositRetained, job.id]
    );

    // Build no-show record
    const { rows: [record] } = await pool.query(
      `INSERT INTO no_show_records
         (account_id, job_id, client_id, tech_id, client_name, tech_name,
          scheduled_at, clock_started_at, declared_at, grace_period_minutes,
          deposit_retained, tech_gps_lat, tech_gps_lng, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.accountId, job.id, job.client_id, job.tech_id,
        job.client_name, job.tech_name,
        job.scheduled_at, job.no_show_clock_started_at,
        settings.grace_period_minutes,
        depositRetained,
        tech_gps_lat || null, tech_gps_lng || null,
        notes || null,
      ]
    );

    const now = new Date();

    // SMS to client
    const clientSms = settings.client_sms_template
      ? settings.client_sms_template
          .replace('{minutes}', settings.grace_period_minutes)
          .replace('{amount}', depositRetained.toFixed(2))
      : `Your technician has waited ${settings.grace_period_minutes} minutes past your scheduled appointment time. Per our no-show policy, your deposit of $${depositRetained.toFixed(2)} has been retained. Please contact us to reschedule.`;

    if (job.client_phone) {
      await sms.send(req.accountId, job.client_id, job.client_phone, clientSms)
        .then(() => pool.query(
          `UPDATE no_show_records SET client_notified_at = NOW() WHERE id = $1`, [record.id]
        )).catch(err => console.error('[NoShow SMS client]', err.message));
    }

    // SMS to tech
    if (job.tech_phone) {
      const techSms = settings.tech_sms_template
        ? settings.tech_sms_template
            .replace('{client_name}', job.client_name)
            .replace('{address}', job.client_address || 'N/A')
            .replace('{amount}', depositRetained.toFixed(2))
        : `No-show confirmed for ${job.client_name}${job.client_address ? ' at ' + job.client_address : ''}. Deposit of $${depositRetained.toFixed(2)} has been retained. You are now released. Please proceed to your next job or stand by.`;

      await sms.send(req.accountId, null, job.tech_phone, techSms)
        .then(() => pool.query(
          `UPDATE no_show_records SET tech_released_at = NOW() WHERE id = $1`, [record.id]
        )).catch(err => console.error('[NoShow SMS tech]', err.message));
    }

    // Email to operator
    const { rows: [ownerRow] } = await pool.query(
      `SELECT u.email, u.name FROM users u WHERE u.account_id = $1 AND u.role = 'owner' LIMIT 1`,
      [req.accountId]
    );
    if (ownerRow?.email) {
      await email.send({
        to:      ownerRow.email,
        subject: `No-Show Declared — ${job.client_name} · ${job.service_type}`,
        html:    email.noShowOperatorHtml(job, record, depositRetained),
      }).catch(err => console.error('[NoShow email operator]', err.message));
    }

    // Generate PDF
    const pdfPath = await generateNoShowPdf(record, job);
    if (pdfPath) {
      await pool.query(`UPDATE no_show_records SET pdf_path = $1 WHERE id = $2`, [pdfPath, record.id]);
    }

    res.json({ ok: true, record_id: record.id, deposit_retained: depositRetained });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/no-show/records ───────────────────────────────────────────────────
router.get('/records', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { from, to, client_id } = req.query;
  const conds = ['n.account_id = $1'];
  const vals  = [req.accountId];
  let i = 2;
  if (from)      { conds.push(`n.declared_at >= $${i++}`); vals.push(from); }
  if (to)        { conds.push(`n.declared_at <= $${i++}`); vals.push(to); }
  if (client_id) { conds.push(`n.client_id = $${i++}`);   vals.push(client_id); }
  try {
    const { rows } = await pool.query(
      `SELECT n.*, j.service_type, j.address AS job_address
       FROM no_show_records n
       JOIN jobs j ON j.id = n.job_id
       WHERE ${conds.join(' AND ')}
       ORDER BY n.declared_at DESC`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/no-show/report ────────────────────────────────────────────────────
router.get('/report', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { from, to } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                    AS total_no_shows,
         COALESCE(SUM(deposit_retained), 0)         AS total_retained,
         COALESCE(AVG(deposit_retained), 0)         AS avg_retained,
         DATE_TRUNC('month', declared_at)           AS month
       FROM no_show_records
       WHERE account_id = $1
         ${from ? "AND declared_at >= $2" : ""}
         ${to   ? `AND declared_at <= $${from ? 3 : 2}` : ""}
       GROUP BY month
       ORDER BY month DESC`,
      from && to ? [req.accountId, from, to]
        : from   ? [req.accountId, from]
        : to     ? [req.accountId, to]
        :          [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/no-show/active ────────────────────────────────────────────────────
// Jobs currently in grace period (clock started, not yet declared)
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.id, j.service_type, j.scheduled_at,
              j.no_show_clock_started_at, j.client_id, j.tech_id,
              c.name AS client_name, c.address AS client_address,
              u.name AS tech_name,
              nss.grace_period_minutes,
              EXTRACT(EPOCH FROM (NOW() - j.no_show_clock_started_at)) / 60 AS elapsed_minutes
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN users u ON u.id = j.tech_id
       LEFT JOIN no_show_settings nss ON nss.account_id = j.account_id
       WHERE j.account_id = $1
         AND j.status = 'scheduled'
         AND j.no_show_clock_started_at IS NOT NULL
         AND j.noshow_declared_at IS NULL
       ORDER BY j.no_show_clock_started_at`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/no-show/jobs/:jobId/pdf ──────────────────────────────────────────
router.get('/jobs/:jobId/pdf', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*, j.service_type
       FROM no_show_records n
       JOIN jobs j ON j.id = n.job_id
       WHERE n.job_id = $1 AND n.account_id = $2`,
      [req.params.jobId, req.accountId]
    );
    const record = rows[0];
    if (!record) return res.status(404).json({ error: 'No-show record not found.' });

    const pdfPath = record.pdf_path;
    if (pdfPath && fs.existsSync(pdfPath)) {
      return res.download(pdfPath, `noshow-${record.id}.pdf`);
    }

    // Regenerate on the fly
    const { rows: jobRows } = await pool.query(
      `SELECT j.*, c.name AS client_name, u.name AS tech_name
       FROM jobs j JOIN clients c ON c.id = j.client_id LEFT JOIN users u ON u.id = j.tech_id
       WHERE j.id = $1`, [req.params.jobId]
    );
    const job = jobRows[0];
    const pdfBuf = await generateNoShowPdfBuffer(record, job);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="noshow-${record.id}.pdf"` });
    res.send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PDF helpers ────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function generateNoShowPdfBuffer(record, job) {
  return new Promise((resolve, reject) => {
    const doc  = new PDFDoc({ margin: 50, size: 'LETTER' });
    const bufs = [];
    doc.on('data', d => bufs.push(d));
    doc.on('end',  () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1C2333')
       .text('FIELDCORE — NO-SHOW DOCUMENTATION', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280')
       .text(`Record ID: ${record.id}`, { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(1);

    function row(label, value) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1C2333').text(`${label}:`, { continued: true, width: 160 });
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`  ${value || 'N/A'}`);
      doc.moveDown(0.4);
    }

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1C2333').text('JOB DETAILS');
    doc.moveDown(0.5);
    row('Service', job?.service_type);
    row('Client', record.client_name);
    row('Technician', record.tech_name || 'Unassigned');
    row('Scheduled At', fmt(record.scheduled_at));
    row('Job ID', record.job_id);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1C2333').text('NO-SHOW TIMELINE');
    doc.moveDown(0.5);
    row('Clock Started', fmt(record.clock_started_at));
    row('No-Show Declared', fmt(record.declared_at));
    row('Grace Period', `${record.grace_period_minutes} minutes`);
    row('Client Notified', fmt(record.client_notified_at));
    row('Technician Released', fmt(record.tech_released_at));
    if (record.tech_gps_lat && record.tech_gps_lng) {
      row('Tech GPS at Declaration', `${record.tech_gps_lat}, ${record.tech_gps_lng}`);
    }
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1C2333').text('DEPOSIT');
    doc.moveDown(0.5);
    row('Amount Retained', `$${parseFloat(record.deposit_retained || 0).toFixed(2)}`);
    doc.moveDown(0.5);

    if (record.notes) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1C2333').text('NOTES');
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text(record.notes);
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor('#e5e0d8').stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#9ca3af')
       .text(`Generated by FieldCore on ${new Date().toLocaleString()}. This document is a legal record of the no-show event.`, { align: 'center' });

    doc.end();
  });
}

async function generateNoShowPdf(record, job) {
  try {
    const dir = path.join(__dirname, '../../uploads/noshows');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `noshow-${record.id}.pdf`);
    const buf = await generateNoShowPdfBuffer(record, job);
    fs.writeFileSync(filePath, buf);
    return filePath;
  } catch (err) {
    console.error('[NoShow PDF generation]', err.message);
    return null;
  }
}

module.exports = router;
