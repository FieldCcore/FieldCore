const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkSmsAccess } = require('../middleware/planLimits');
const smsService = require('../services/sms');

// GET /api/sms/messages — list all SMS history for account
router.get('/messages', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { client_id } = req.query;
  const conditions = ['m.account_id = $1'];
  const values = [req.accountId];
  if (client_id) {
    conditions.push(`m.client_id = $2`);
    values.push(client_id);
  }
  try {
    const { rows } = await pool.query(
      `SELECT m.*, c.name AS client_name
       FROM messages m
       LEFT JOIN clients c ON c.id = m.client_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC
       LIMIT 200`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/send — send custom SMS
router.post('/send', requireAuth, requireRole('owner', 'manager'), checkSmsAccess, async (req, res) => {
  const { client_id, body } = req.body;
  if (!client_id || !body) {
    return res.status(400).json({ error: 'client_id and body are required' });
  }
  try {
    const clientResult = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, req.accountId]
    );
    const client = clientResult.rows[0];
    if (!client)       return res.status(404).json({ error: 'Client not found' });
    if (!client.phone) return res.status(400).json({ error: 'Client has no phone number' });

    const message = await smsService.send(req.accountId, client_id, client.phone, body);
    if (!message) {
      return res.status(202).json({ warning: 'Twilio not configured — message logged only' });
    }
    res.json({ sid: message.sid, status: message.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/send-template — send a named template SMS
router.post('/send-template', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { client_id, template, job_id } = req.body;
  if (!client_id || !template) {
    return res.status(400).json({ error: 'client_id and template are required' });
  }

  try {
    const clientResult = await pool.query(
      `SELECT * FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, req.accountId]
    );
    const client = clientResult.rows[0];
    if (!client)       return res.status(404).json({ error: 'Client not found' });
    if (!client.phone) return res.status(400).json({ error: 'Client has no phone number' });

    let body;
    if (template === 'confirmation' || template === 'reminder') {
      if (!job_id) return res.status(400).json({ error: 'job_id required for this template' });
      const jobResult = await pool.query(
        `SELECT * FROM jobs WHERE id = $1 AND account_id = $2`, [job_id, req.accountId]
      );
      const job = jobResult.rows[0];
      if (!job) return res.status(404).json({ error: 'Job not found' });
      body = template === 'confirmation'
        ? smsService.confirmationBody(client.name, job.service_type, job.scheduled_at)
        : smsService.reminderBody(client.name, job.service_type, job.scheduled_at);
    } else {
      return res.status(400).json({ error: 'Unknown template. Use: confirmation, reminder' });
    }

    const message = await smsService.send(req.accountId, client_id, client.phone, body);
    if (!message) {
      return res.status(202).json({ warning: 'Twilio not configured — message logged only', body });
    }
    res.json({ sid: message.sid, status: message.status, body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
