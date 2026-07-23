const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_DELAYS = [0, 1800, 3600, 7200, 14400, 43200, 86400, 172800, 259200, 604800];

// GET /api/review-settings
router.get('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM review_request_settings WHERE account_id = $1`,
      [req.accountId]
    );
    if (!rows.length) {
      return res.json({
        account_id:             req.accountId,
        enabled:                true,
        delay_seconds:          3600,
        require_invoice_paid:   false,
        require_signature:      false,
        exclude_cancelled:      true,
        notify_on_new_review:   true,
        notify_roles:           ['owner', 'manager'],
      });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/review-settings
router.put('/', requireAuth, requireRole('owner'), async (req, res) => {
  const {
    enabled,
    delay_seconds,
    require_invoice_paid,
    require_signature,
    exclude_cancelled,
    notify_on_new_review,
    notify_roles,
  } = req.body;

  if (delay_seconds !== undefined && !VALID_DELAYS.includes(parseInt(delay_seconds))) {
    return res.status(400).json({
      error: `delay_seconds must be one of: ${VALID_DELAYS.join(', ')}`,
    });
  }

  if (notify_roles !== undefined && (!Array.isArray(notify_roles) || notify_roles.some(r => !['owner','manager','staff'].includes(r)))) {
    return res.status(400).json({ error: 'notify_roles must be an array of owner, manager, or staff.' });
  }

  // Normalize incoming values; undefined → null (missing field — preserve existing)
  const p_enabled              = enabled              !== undefined ? enabled              : null;
  const p_delay                = delay_seconds        !== undefined ? parseInt(delay_seconds) : null;
  const p_require_invoice_paid = require_invoice_paid !== undefined ? require_invoice_paid : null;
  const p_require_signature    = require_signature    !== undefined ? require_signature    : null;
  const p_exclude_cancelled    = exclude_cancelled    !== undefined ? exclude_cancelled    : null;
  const p_notify_on_new_review = notify_on_new_review !== undefined ? notify_on_new_review : null;
  const p_notify_roles         = notify_roles         !== undefined ? notify_roles         : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO review_request_settings
         (account_id, enabled, delay_seconds, require_invoice_paid, require_signature,
          exclude_cancelled, notify_on_new_review, notify_roles, updated_at)
       VALUES (
         $1,
         COALESCE($2, TRUE),
         COALESCE($3, 3600),
         COALESCE($4, FALSE),
         COALESCE($5, FALSE),
         COALESCE($6, TRUE),
         COALESCE($7, TRUE),
         COALESCE($8, ARRAY['owner','manager']),
         NOW()
       )
       ON CONFLICT (account_id) DO UPDATE SET
         enabled              = COALESCE($2, review_request_settings.enabled),
         delay_seconds        = COALESCE($3, review_request_settings.delay_seconds),
         require_invoice_paid = COALESCE($4, review_request_settings.require_invoice_paid),
         require_signature    = COALESCE($5, review_request_settings.require_signature),
         exclude_cancelled    = COALESCE($6, review_request_settings.exclude_cancelled),
         notify_on_new_review = COALESCE($7, review_request_settings.notify_on_new_review),
         notify_roles         = COALESCE($8, review_request_settings.notify_roles),
         updated_at           = NOW()
       RETURNING *`,
      [req.accountId, p_enabled, p_delay, p_require_invoice_paid,
       p_require_signature, p_exclude_cancelled, p_notify_on_new_review, p_notify_roles]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
