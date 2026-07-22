const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getEntitlements } = require('../services/entitlements');

// GET /api/entitlements — returns effective entitlements for the authenticated account
router.get('/', requireAuth, async (req, res) => {
  try {
    const ent = await getEntitlements(req.accountId);
    res.json(ent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
