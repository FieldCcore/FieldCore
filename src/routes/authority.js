/**
 * FieldCore Authority — HTTP Routes
 *
 * All routes are behind:
 *  - AUTHORITY_ENABLED feature flag (503 when off)
 *  - requireAuth (401 without valid JWT)
 *
 * Provisioning is further gated by INSTITUTION_PROVISION capability (checked in service).
 * All other routes require an institution account (checked in service).
 *
 * This is an INTERNAL/UNSTABLE API. It is NOT the external enterprise Authority API.
 * Business rules (tenant scoping, lifecycle guards, verification policy, encryption,
 * format validation) live in authorityService.js, not here.
 */

const express = require('express');
const multer  = require('multer');
const router  = express.Router();

const { requireAuth }    = require('../middleware/auth');
const authorityService   = require('../services/authorityService');
const { AUTHORITY_MAX_UPLOAD_BYTES } = require('../services/authorityFormatRegistry');

// ── Feature flag middleware ────────────────────────────────────────────────────
function requireAuthorityEnabled(req, res, next) {
  if (process.env.AUTHORITY_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Authority feature is not enabled.' });
  }
  next();
}

// Apply feature flag + auth to every Authority route
router.use(requireAuthorityEnabled, requireAuth);

// ── Multipart upload config ───────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: AUTHORITY_MAX_UPLOAD_BYTES },
});

// ── Error handler helper ──────────────────────────────────────────────────────
function handleError(res, err) {
  const status = err.statusCode || 500;
  // Never include internal stack traces or sensitive details in the response body
  res.status(status).json({ error: err.message || 'Internal server error.' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Institution Provisioning (internal — fc_internal + INSTITUTION_PROVISION cap)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/authority/internal/provision
router.post('/internal/provision', async (req, res) => {
  try {
    const { name } = req.body || {};
    const result = await authorityService.provisionInstitution(
      req.userId, req.accountId, { name }
    );
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Authority Parties
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/authority/parties
router.post('/parties', async (req, res) => {
  try {
    const { partyType, displayName, externalReference } = req.body || {};
    const party = await authorityService.createParty(
      req.accountId, req.userId, { partyType, displayName, externalReference }
    );
    res.status(201).json(party);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/parties/:partyId
router.get('/parties/:partyId', async (req, res) => {
  try {
    const party = await authorityService.getParty(req.accountId, req.params.partyId);
    res.json(party);
  } catch (err) {
    handleError(res, err);
  }
});

// PATCH /api/authority/parties/:partyId/status
router.patch('/parties/:partyId/status', async (req, res) => {
  try {
    const party = await authorityService.updatePartyStatus(
      req.accountId, req.userId, req.params.partyId, req.body.status
    );
    res.json(party);
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Authority Cases
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/authority/cases
router.post('/cases', async (req, res) => {
  try {
    const kase = await authorityService.createCase(
      req.accountId, req.userId, { externalCaseReference: req.body?.externalCaseReference }
    );
    res.status(201).json(kase);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/cases/:caseId
router.get('/cases/:caseId', async (req, res) => {
  try {
    const kase = await authorityService.getCase(req.accountId, req.params.caseId);
    res.json(kase);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/cases/:caseId/transition
router.post('/cases/:caseId/transition', async (req, res) => {
  try {
    const { status, cancellationReason } = req.body || {};
    // systemActor is intentionally NOT read from req.body.
    // EXTRACTION_COMPLETE is a system-only transition; end users cannot self-declare it.
    const result = await authorityService.transitionCase(
      req.accountId, req.userId, req.params.caseId, status,
      { cancellationReason, systemActor: false }
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/cases/:caseId/instruments (link instrument to case)
router.post('/cases/:caseId/instruments', async (req, res) => {
  try {
    await authorityService.linkInstrumentToCase(
      req.accountId, req.userId, req.params.caseId, req.body?.instrumentId
    );
    res.status(201).json({ linked: true });
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /api/authority/cases/:caseId/instruments/:instrumentId
router.delete('/cases/:caseId/instruments/:instrumentId', async (req, res) => {
  try {
    await authorityService.unlinkInstrumentFromCase(
      req.accountId, req.userId, req.params.caseId, req.params.instrumentId
    );
    res.json({ unlinked: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Authority Instruments
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/authority/instruments
router.post('/instruments', async (req, res) => {
  try {
    const { instrumentType, effectiveDate, expirationDate, jurisdiction } = req.body || {};
    const instr = await authorityService.createInstrument(
      req.accountId, req.userId, { instrumentType, effectiveDate, expirationDate, jurisdiction }
    );
    res.status(201).json(instr);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/instruments/:instrumentId
router.get('/instruments/:instrumentId', async (req, res) => {
  try {
    const instr = await authorityService.getInstrument(req.accountId, req.params.instrumentId);
    res.json(instr);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/instruments/:instrumentId/transition
router.post('/instruments/:instrumentId/transition', async (req, res) => {
  try {
    const { status, actorType, revocationReason, rejectionReason, supersededByInstrumentId } =
      req.body || {};
    const result = await authorityService.transitionInstrument(
      req.accountId, req.userId, req.params.instrumentId, status,
      { actorType: actorType || 'human', revocationReason, rejectionReason, supersededByInstrumentId }
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/instruments/:instrumentId/parties (add participant)
router.post('/instruments/:instrumentId/parties', async (req, res) => {
  try {
    const { partyId, role, sequence, conditions } = req.body || {};
    const participant = await authorityService.addParticipant(
      req.accountId, req.userId, req.params.instrumentId,
      { partyId, role, sequence, conditions }
    );
    res.status(201).json(participant);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/instruments/:instrumentId/permissions
router.post('/instruments/:instrumentId/permissions', async (req, res) => {
  try {
    const { actionKey, grantType, participantId } = req.body || {};
    const perm = await authorityService.addPermission(
      req.accountId, req.userId, req.params.instrumentId,
      { actionKey, grantType, participantId }
    );
    res.status(201).json(perm);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/instruments/:instrumentId/restrictions
router.post('/instruments/:instrumentId/restrictions', async (req, res) => {
  try {
    const { permissionId, participantId, restrictionType, parameters, effectiveFrom, effectiveTo } =
      req.body || {};
    const restr = await authorityService.addRestriction(
      req.accountId, req.userId, req.params.instrumentId,
      { permissionId, participantId, restrictionType, parameters, effectiveFrom, effectiveTo }
    );
    res.status(201).json(restr);
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Authority Documents
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/authority/documents — upload a document (multipart/form-data, field: "document")
// The multer error handler (4-arg) catches LIMIT_FILE_SIZE before the route handler runs.
router.post('/documents',
  upload.single('document'),
  (err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Maximum upload size is ${AUTHORITY_MAX_UPLOAD_BYTES} bytes.` });
    }
    next(err);
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Use multipart/form-data with field name "document".' });
      }
      const doc = await authorityService.uploadDocument(
        req.accountId, req.userId, req.file.buffer,
        {
          caseId:           req.body?.caseId       || null,
          instrumentId:     req.body?.instrumentId || null,
          originalFilename: req.file.originalname  || 'document.pdf',
        }
      );
      res.status(201).json(doc);
    } catch (err) {
      handleError(res, err);
    }
  }
);

// GET /api/authority/documents/:documentId — stream a document
router.get('/documents/:documentId', async (req, res) => {
  try {
    const { stream, doc } = await authorityService.streamDocument(
      req.accountId, req.userId, req.params.documentId
    );

    // Security headers: prevent caching of sensitive content
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', doc.content_type);
    // Safe Content-Disposition: uses the document ID, never the decrypted filename
    res.set('Content-Disposition', `inline; filename="authority-document-${doc.id}.pdf"`);
    res.set('Content-Length', String(doc.byte_size));

    stream.pipe(res);
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /api/authority/documents/:documentId
router.delete('/documents/:documentId', async (req, res) => {
  try {
    await authorityService.deleteDocument(req.accountId, req.userId, req.params.documentId);
    res.json({ deleted: true });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
