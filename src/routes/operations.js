'use strict';
const express  = require('express');
const router   = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const commSvc  = require('../services/commissionCalculationService');

// ── Compensation Rules CRUD ───────────────────────────────────────────────────
// All routes require owner or manager role.

router.get('/compensation-rules', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    res.json({ rules: await commSvc.getRules(req.accountId) });
  } catch (err) {
    console.error('[operations] compensation-rules GET error', err.message);
    res.status(500).json({ error: 'Could not load compensation rules.' });
  }
});

router.post('/compensation-rules', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const rule = await commSvc.createRule(req.accountId, req.userId, req.body);
    res.status(201).json(rule);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[operations] compensation-rules POST error', err.message);
    res.status(500).json({ error: 'Could not create compensation rule.' });
  }
});

router.patch('/compensation-rules/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    res.json(await commSvc.updateRule(req.accountId, req.params.id, req.body));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error('[operations] compensation-rules PATCH error', err.message);
    res.status(500).json({ error: 'Could not update compensation rule.' });
  }
});

router.delete('/compensation-rules/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    res.json(await commSvc.deleteRule(req.accountId, req.params.id));
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error('[operations] compensation-rules DELETE error', err.message);
    res.status(500).json({ error: 'Could not deactivate compensation rule.' });
  }
});

// ── Commission entry status updates ──────────────────────────────────────────

router.patch('/commission-entries/:id/status', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  try {
    res.json(await commSvc.updateEntryStatus(req.accountId, req.params.id, status, req.userId));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error('[operations] commission-entries PATCH error', err.message);
    res.status(500).json({ error: 'Could not update commission entry status.' });
  }
});

module.exports = router;
