'use strict';

/**
 * Stage 5 — Internal admin routes for Authority API credentials.
 *
 * These are HUMAN routes protected by the standard JWT auth model.
 * Machine callers (bearer credentials) are REJECTED here — this router
 * checks that req.user is set and req.machineActor is not.
 *
 * Capability gates:
 *   AUTHORITY_API_CREDENTIAL_READ    — GET
 *   AUTHORITY_API_CREDENTIAL_MANAGE  — POST/DELETE/POST-replace
 *   AUTHORITY_EVALUATE               — additional requirement when granting
 *                                       'authority:evaluate' scope to a new
 *                                       credential (escalation prevention).
 *
 * Feature-flag policy:
 *   Create + Replace       require AUTHORITY_EXTERNAL_API_ENABLED = true
 *   Revoke                 available EVEN WHEN the flag is off (safety op)
 *   List / Get             available even when the flag is off
 */

const express = require('express');
const router  = express.Router();

const { requireAuth }        = require('../middleware/auth');
const pool                   = require('../db/pool');
const audit                  = require('../services/audit');
const externalConfig         = require('../services/authorityExternalConfig');
const credentialService      = require('../services/authorityCredentialService');
const { VALID_SCOPES }       = credentialService;

// ── Middleware ────────────────────────────────────────────────────────────────

function requireAuthorityEnabled(req, res, next) {
  if (process.env.AUTHORITY_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Authority feature is not enabled.' });
  }
  next();
}

// Reject machine callers — this router is human-only.
function rejectMachineActor(req, res, next) {
  if (req.machineActor) {
    return res.status(403).json({ error: 'This endpoint is not accessible to API credentials.' });
  }
  next();
}

async function _hasCapability(userId, capability) {
  const { rows } = await pool.query(
    `SELECT 1 FROM platform_user_capabilities WHERE user_id = $1 AND capability = $2`,
    [userId, capability]
  );
  return rows.length > 0;
}

function requireCap(capability) {
  return async function _requireCap(req, res, next) {
    try {
      const ok = await _hasCapability(req.userId, capability);
      if (!ok) return res.status(403).json({ error: `${capability} capability required.` });
      next();
    } catch (err) {
      res.status(500).json({ error: 'Capability check failed.' });
    }
  };
}

function requireFlagOnForWrite(req, res, next) {
  if (!externalConfig.isFlagEnabled()) {
    return res.status(403).json({
      error: 'AUTHORITY_API_UNAVAILABLE',
      message: 'External Authority API is not enabled — creation and rotation are disabled. Revocation remains available.',
    });
  }
  next();
}

// Root middleware chain.
router.use(requireAuthorityEnabled, requireAuth, rejectMachineActor);

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/authority/credentials
 * Requires AUTHORITY_API_CREDENTIAL_READ or AUTHORITY_API_CREDENTIAL_MANAGE.
 */
router.get('/',
  async (req, res, next) => {
    try {
      const hasRead   = await _hasCapability(req.userId, 'AUTHORITY_API_CREDENTIAL_READ');
      const hasManage = await _hasCapability(req.userId, 'AUTHORITY_API_CREDENTIAL_MANAGE');
      if (!hasRead && !hasManage) {
        return res.status(403).json({ error: 'AUTHORITY_API_CREDENTIAL_READ capability required.' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'Capability check failed.' });
    }
  },
  async (req, res) => {
    try {
      const rows = await credentialService.listCredentials(req.accountId);
      // Never leak secret_verifier. listCredentials already omits it.
      res.json({
        credentials:            rows,
        external_api_enabled:   externalConfig.isExternalApiEnabled(),
        flag_enabled:           externalConfig.isFlagEnabled(),
        valid_scopes:           VALID_SCOPES,
      });
    } catch (err) {
      res.status(500).json({ error: err.message || 'List failed.' });
    }
  }
);

/**
 * POST /api/authority/credentials
 * Requires AUTHORITY_API_CREDENTIAL_MANAGE + flag ON.
 * Additionally: if scopes includes 'authority:evaluate', the issuer must have
 * AUTHORITY_EVALUATE (escalation prevention).
 */
router.post('/',
  requireFlagOnForWrite,
  requireCap('AUTHORITY_API_CREDENTIAL_MANAGE'),
  async (req, res) => {
    try {
      const { label, scopes } = req.body || {};
      if (!label || typeof label !== 'string') {
        return res.status(400).json({ error: 'label is required.' });
      }
      if (!Array.isArray(scopes) || scopes.length === 0) {
        return res.status(400).json({ error: 'scopes is required.' });
      }
      // Escalation prevention.
      if (scopes.includes('authority:evaluate')) {
        const canEvaluate = await _hasCapability(req.userId, 'AUTHORITY_EVALUATE');
        if (!canEvaluate) {
          return res.status(403).json({
            error: 'AUTHORITY_EVALUATE capability required to issue credentials with authority:evaluate scope.',
          });
        }
      }
      const result = await credentialService.generateCredential(
        req.accountId, label, scopes, req.userId
      );
      // Audit event does NOT include the raw credential.
      await audit.log(
        req.accountId, req.userId, 'authority.api_credential.created',
        'authority_api_credential', result.credentialId,
        { label: result.row.label, scopes: result.row.scopes, public_id: result.publicId },
        req.ip || null
      );
      // Return raw credential ONCE. Client is instructed to store it now.
      res.status(201).json({
        credential:    result.credential,     // shown once
        credential_id: result.credentialId,
        public_id:     result.publicId,
        label:         result.row.label,
        scopes:        result.row.scopes,
        status:        result.row.status,
        created_at:    result.row.created_at,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Create failed.' });
    }
  }
);

/**
 * DELETE /api/authority/credentials/:id
 * Requires AUTHORITY_API_CREDENTIAL_MANAGE. AVAILABLE even when flag is OFF.
 */
router.delete('/:id',
  requireCap('AUTHORITY_API_CREDENTIAL_MANAGE'),
  async (req, res) => {
    try {
      const existing = await credentialService.getCredential(req.params.id, req.accountId);
      if (!existing) return res.status(404).json({ error: 'Not found.' });
      const reason = (req.body && typeof req.body.reason === 'string') ? req.body.reason : null;
      const updated = await credentialService.revokeCredential(req.params.id, req.userId, reason);
      await audit.log(
        req.accountId, req.userId, 'authority.api_credential.revoked',
        'authority_api_credential', req.params.id,
        { reason: reason || null, public_id: existing.public_id, label: existing.label },
        req.ip || null
      );
      res.json({ credential: updated });
    } catch (err) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Revoke failed.' });
    }
  }
);

/**
 * POST /api/authority/credentials/:id/replace
 * Requires AUTHORITY_API_CREDENTIAL_MANAGE + flag ON.
 * Does NOT auto-revoke the old credential; caller must revoke separately.
 */
router.post('/:id/replace',
  requireFlagOnForWrite,
  requireCap('AUTHORITY_API_CREDENTIAL_MANAGE'),
  async (req, res) => {
    try {
      const existing = await credentialService.getCredential(req.params.id, req.accountId);
      if (!existing) return res.status(404).json({ error: 'Not found.' });

      const { label, scopes } = req.body || {};
      const effectiveScopes = Array.isArray(scopes) && scopes.length ? scopes : existing.scopes;
      const effectiveLabel  = (typeof label === 'string' && label.trim()) ? label.trim() : existing.label;

      if (effectiveScopes.includes('authority:evaluate')) {
        const canEvaluate = await _hasCapability(req.userId, 'AUTHORITY_EVALUATE');
        if (!canEvaluate) {
          return res.status(403).json({
            error: 'AUTHORITY_EVALUATE capability required to issue credentials with authority:evaluate scope.',
          });
        }
      }

      const result = await credentialService.replaceCredential(
        req.params.id, effectiveLabel, effectiveScopes, req.userId
      );
      await audit.log(
        req.accountId, req.userId, 'authority.api_credential.replaced',
        'authority_api_credential', result.credentialId,
        {
          replaces_credential_id: req.params.id,
          label:  result.row.label,
          scopes: result.row.scopes,
          public_id: result.publicId,
        },
        req.ip || null
      );
      res.status(201).json({
        credential:    result.credential,     // shown once
        credential_id: result.credentialId,
        public_id:     result.publicId,
        label:         result.row.label,
        scopes:        result.row.scopes,
        status:        result.row.status,
        created_at:    result.row.created_at,
        replaces_credential_id: req.params.id,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Replace failed.' });
    }
  }
);

module.exports = router;
