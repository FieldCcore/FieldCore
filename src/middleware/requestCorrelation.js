'use strict';

/**
 * Stage 5 — Request correlation middleware.
 *
 * Accepts X-Request-Id if it matches ^[A-Za-z0-9_-]{1,64}$ and echoes it on
 * the response; otherwise generates a UUID. Sets req.requestId so downstream
 * handlers and audit records can tag events with a stable identifier.
 *
 * Header spelling: X-Request-Id (canonical). Accepts case-insensitively on
 * input per Node's lower-cased req.headers, echoes with the canonical spelling
 * on output.
 */

const crypto = require('crypto');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function middleware() {
  return function _requestCorrelation(req, res, next) {
    const raw = req.headers['x-request-id'];
    const id = (typeof raw === 'string' && REQUEST_ID_RE.test(raw)) ? raw : crypto.randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}

module.exports = { middleware, REQUEST_ID_RE };
