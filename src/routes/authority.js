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
  const status = err.status || err.statusCode || 500;
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

// GET /api/authority/parties — list parties for this institution account
router.get('/parties', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const parties = await authorityService.listParties(req.accountId, { limit, offset });
    res.json(parties);
  } catch (err) {
    handleError(res, err);
  }
});

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
// Current-user Authority Capabilities
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/authority/capabilities — returns caller's authority-relevant capabilities
router.get('/capabilities', async (req, res) => {
  try {
    const { rows } = await require('../db/pool').query(
      `SELECT capability, granted_at
       FROM platform_user_capabilities
       WHERE user_id = $1 AND capability LIKE 'AUTHORITY_%'
       ORDER BY granted_at ASC`,
      [req.userId]
    );
    res.json({ capabilities: rows.map(r => r.capability) });
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Authority Cases
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/authority/cases — list cases for this institution account (all statuses)
router.get('/cases', async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const cases = await authorityService.listCases(req.accountId, { status, limit, offset });
    res.json(cases);
  } catch (err) {
    handleError(res, err);
  }
});

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

// GET /api/authority/instruments — list instruments for this institution account
router.get('/instruments', async (req, res) => {
  try {
    const { limit, offset, status } = req.query;
    const instrs = await authorityService.listInstruments(req.accountId, { limit, offset, status });
    res.json(instrs);
  } catch (err) {
    handleError(res, err);
  }
});

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
    const { status, revocationReason, rejectionReason, supersededByInstrumentId } = req.body || {};
    // actorType is NEVER read from req.body — hardcoded to prevent spoofing.
    // Only a human reviewer authenticated via JWT may trigger instrument transitions.
    const result = await authorityService.transitionInstrument(
      req.accountId, req.userId, req.params.instrumentId, status,
      { actorType: 'human', revocationReason, rejectionReason, supersededByInstrumentId }
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

// ═══════════════════════════════════════════════════════════════════════════════
// Human Review Queue & Assignments
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/authority/queue
router.get('/queue', async (req, res) => {
  try {
    const queue = await authorityService.getReviewQueue(req.accountId, req.userId);
    res.json(queue);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/cases/:caseId/claim
router.post('/cases/:caseId/claim', async (req, res) => {
  try {
    const assignment = await authorityService.claimCase(req.accountId, req.userId, req.params.caseId);
    res.status(201).json(assignment);
  } catch (err) {
    handleError(res, err);
  }
});

// PUT /api/authority/cases/:caseId/reviewer
router.put('/cases/:caseId/reviewer', async (req, res) => {
  try {
    const result = await authorityService.assignReviewer(
      req.accountId, req.userId, req.params.caseId, req.body?.targetUserId
    );
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/cases/:caseId/workspace
router.get('/cases/:caseId/workspace', async (req, res) => {
  try {
    const workspace = await authorityService.getReviewWorkspace(
      req.accountId, req.userId, req.params.caseId
    );
    res.json(workspace);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/cases/:caseId/notes
router.post('/cases/:caseId/notes', async (req, res) => {
  try {
    const note = await authorityService.addReviewNote(
      req.accountId, req.userId, req.params.caseId,
      req.body?.body, req.body?.instrumentId || null
    );
    res.status(201).json(note);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/cases/:caseId/notes
router.get('/cases/:caseId/notes', async (req, res) => {
  try {
    const notes = await authorityService.getReviewNotes(
      req.accountId, req.params.caseId,
      { instrumentId: req.query.instrumentId || null }
    );
    res.json(notes);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/cases/:caseId/activity
router.get('/cases/:caseId/activity', async (req, res) => {
  try {
    const events = await authorityService.getAuditActivity(
      req.accountId, 'case', req.params.caseId
    );
    res.json(events);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/instruments/:instrumentId/activity
router.get('/instruments/:instrumentId/activity', async (req, res) => {
  try {
    const events = await authorityService.getAuditActivity(
      req.accountId, 'instrument', req.params.instrumentId
    );
    res.json(events);
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Participant / Permission / Restriction mutation (with lifecycle lock)
// ═══════════════════════════════════════════════════════════════════════════════

// PATCH /api/authority/instruments/:instrumentId/parties/:participantId
router.patch('/instruments/:instrumentId/parties/:participantId', async (req, res) => {
  try {
    const p = await authorityService.updateParticipantStatus(
      req.accountId, req.userId,
      req.params.instrumentId, req.params.participantId,
      req.body?.status
    );
    res.json(p);
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /api/authority/instruments/:instrumentId/parties/:participantId
router.delete('/instruments/:instrumentId/parties/:participantId', async (req, res) => {
  try {
    await authorityService.removeParticipant(
      req.accountId, req.userId,
      req.params.instrumentId, req.params.participantId
    );
    res.json({ removed: true });
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /api/authority/instruments/:instrumentId/permissions/:permissionId
router.delete('/instruments/:instrumentId/permissions/:permissionId', async (req, res) => {
  try {
    await authorityService.removePermissionById(
      req.accountId, req.userId,
      req.params.instrumentId, req.params.permissionId
    );
    res.json({ removed: true });
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /api/authority/instruments/:instrumentId/restrictions/:restrictionId
router.delete('/instruments/:instrumentId/restrictions/:restrictionId', async (req, res) => {
  try {
    await authorityService.removeRestriction(
      req.accountId, req.userId,
      req.params.instrumentId, req.params.restrictionId
    );
    res.json({ removed: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Party mutations (display name update with Invariant B protection)
// ═══════════════════════════════════════════════════════════════════════════════

// PATCH /api/authority/parties/:partyId/display-name
router.patch('/parties/:partyId/display-name', async (req, res) => {
  try {
    const result = await authorityService.updatePartyDisplayName(
      req.accountId, req.userId, req.params.partyId, req.body?.displayName
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 3: AI-Assisted Extraction
// ═══════════════════════════════════════════════════════════════════════════════

const extractionService = require('../services/authorityExtractionService');

async function _hasCapability(userId, capability) {
  const pool = require('../db/pool');
  const { rows } = await pool.query(
    `SELECT 1 FROM platform_user_capabilities WHERE user_id = $1 AND capability = $2`,
    [userId, capability]
  );
  return rows.length > 0;
}

// GET /api/authority/cases/:caseId/extraction/runs
router.get('/cases/:caseId/extraction/runs', async (req, res) => {
  try {
    const runs = await extractionService.listRunsForCase(req.accountId, req.params.caseId);
    res.json(runs);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/cases/:caseId/extraction/retry
// Requires AUTHORITY_EXTRACTION_MANAGE capability
router.post('/cases/:caseId/extraction/retry', async (req, res) => {
  try {
    const allowed = await _hasCapability(req.userId, 'AUTHORITY_EXTRACTION_MANAGE');
    if (!allowed) {
      return res.status(403).json({ error: 'AUTHORITY_EXTRACTION_MANAGE capability required.' });
    }
    const { documentId } = req.body || {};
    if (!documentId) return res.status(400).json({ error: 'documentId is required.' });

    const run = await extractionService.createExplicitRetry(
      req.accountId, req.userId, req.params.caseId, documentId
    );
    res.status(201).json(run);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/cases/:caseId/candidates
router.get('/cases/:caseId/candidates', async (req, res) => {
  try {
    const candidates = await extractionService.listCandidatesForCase(req.accountId, req.params.caseId);
    res.json(candidates);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/candidates/:candidateId/accept
// No special capability required — active case assignment enforced in service.
router.post('/candidates/:candidateId/accept', async (req, res) => {
  try {
    const { rowVersion, partyAction, partyId } = req.body || {};
    const result = await extractionService.acceptCandidate(
      req.accountId, req.userId, req.params.candidateId,
      { rowVersion, partyAction, partyId }
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/authority/candidates/:candidateId/reject
// No special capability required — active case assignment enforced in service.
router.post('/candidates/:candidateId/reject', async (req, res) => {
  try {
    const result = await extractionService.rejectCandidate(
      req.accountId, req.userId, req.params.candidateId,
      req.body?.rejectionReason || null
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 4: Deterministic Authority Engine
// ═══════════════════════════════════════════════════════════════════════════════

const evaluationService = require('../services/authorityEvaluationService');

// Part 4 closure: AUTHORITY_EVALUATE capability gate.
async function _requireAuthorityEvaluateCap(req, res, next) {
  try {
    const allowed = await _hasCapability(req.userId, 'AUTHORITY_EVALUATE');
    if (!allowed) {
      return res.status(403).json({ error: 'AUTHORITY_EVALUATE capability required.' });
    }
    next();
  } catch (err) {
    handleError(res, err);
  }
}

// POST /api/authority/evaluate
// Body: { instrumentId, delegatePartyId, principalPartyId, actionKey, amount?,
//         currency?, requestedAt, idempotencyKey }
// Part 1 closure: `actionTime` is NOT accepted — the action time is derived
// from `requestedAt`.
router.post('/evaluate', _requireAuthorityEvaluateCap, async (req, res) => {
  try {
    const {
      instrumentId, delegatePartyId, principalPartyId, actionKey,
      amount, currency, requestedAt, idempotencyKey,
    } = req.body || {};

    const result = await evaluationService.evaluateAuthority(
      { instrumentId, delegatePartyId, principalPartyId, actionKey, amount, currency, requestedAt, idempotencyKey },
      { accountId: req.accountId, userId: req.userId, ipAddress: req.ip || null }
    );
    res.status(result.isReplay ? 200 : 201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/evaluations — list evaluations for this account
// Query: ?instrumentId=<uuid>&limit=<n>&offset=<n>
router.get('/evaluations', _requireAuthorityEvaluateCap, async (req, res) => {
  try {
    const { instrumentId, limit, offset } = req.query;
    const rows = await evaluationService.listEvaluations(
      req.accountId, { instrumentId, limit, offset }
    );
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/authority/evaluations/:evaluationId
router.get('/evaluations/:evaluationId', _requireAuthorityEvaluateCap, async (req, res) => {
  try {
    const row = await evaluationService.getEvaluation(req.accountId, req.params.evaluationId);
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
