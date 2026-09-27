const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const auditService    = require('../services/audit');

// Absolute path to the local uploads directory.
// In production, R2 is the canonical store — local files here are legacy-only.
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

// GET /api/uploads/* — authenticated proxy for locally-stored legacy files.
// Authority documents must NEVER use this path; they require the authenticated
// R2 streaming endpoint introduced in Phase 2.
//
// Security properties:
//   - Requires valid JWT Bearer token.
//   - Resolves the requested path inside UPLOADS_ROOT and rejects path traversal.
//   - Returns 404 for missing files rather than directory listings.
//   - Logs every access to audit_logs.
router.get('/*', requireAuth, (req, res) => {
  // req.params[0] is the wildcard segment after /api/uploads/
  const requestedPath = req.params[0] || '';

  // Sanitize: strip leading slashes, decode URI components safely
  let relativePath;
  try {
    relativePath = decodeURIComponent(requestedPath).replace(/^\/+/, '');
  } catch {
    return res.status(400).json({ error: 'Invalid file path.' });
  }

  // Resolve the full path and confirm it stays within UPLOADS_ROOT
  const fullPath = path.resolve(UPLOADS_ROOT, relativePath);
  if (!fullPath.startsWith(UPLOADS_ROOT + path.sep) && fullPath !== UPLOADS_ROOT) {
    auditService.log(
      req.accountId, req.userId, 'uploads.path_traversal_blocked',
      'upload_file', relativePath,
      { requestedPath, fullPath, ip: req.ip },
      req.ip
    );
    return res.status(403).json({ error: 'Access denied.' });
  }

  // Reject directory traversal sequences regardless of resolution result
  if (relativePath.includes('..') || relativePath.includes('\0')) {
    return res.status(400).json({ error: 'Invalid file path.' });
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return res.status(404).json({ error: 'File not found.' });
  }

  // Audit successful file access
  auditService.log(
    req.accountId, req.userId, 'uploads.file_accessed',
    'upload_file', relativePath,
    { ip: req.ip },
    req.ip
  );

  res.sendFile(fullPath);
});

module.exports = router;
