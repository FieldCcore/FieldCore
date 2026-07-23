const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { encrypt, decrypt, getConnection, syncReviews } = require('../services/googleReviews');

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
].join(' ');

// GET /api/google-reviews/auth — start OAuth flow
router.get('/auth', requireAuth, requireRole('owner'), (req, res) => {
  const state = Buffer.from(JSON.stringify({ accountId: req.accountId, userId: req.userId })).toString('base64url');
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

// GET /api/google-reviews/callback — OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${process.env.FRONTEND_URL}/business-settings?tab=integrations&error=access_denied`);

  let accountId;
  try {
    ({ accountId } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')));
  } catch {
    return res.redirect(`${process.env.FRONTEND_URL}/business-settings?tab=integrations&error=invalid_state`);
  }

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
        code,
        grant_type:    'authorization_code',
      }),
    });
    if (!tokenResp.ok) throw new Error(`Token exchange failed: ${tokenResp.status}`);
    const tokens = await tokenResp.json();

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Get the Google account info
    const infoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = infoResp.ok ? await infoResp.json() : {};

    await pool.query(
      `INSERT INTO google_business_connections
         (account_id, google_account_id, access_token_enc, refresh_token_enc, token_expires_at, status)
       VALUES ($1, $2, $3, $4, $5, 'connected')
       ON CONFLICT (account_id) DO UPDATE
         SET google_account_id  = EXCLUDED.google_account_id,
             access_token_enc   = EXCLUDED.access_token_enc,
             refresh_token_enc  = EXCLUDED.refresh_token_enc,
             token_expires_at   = EXCLUDED.token_expires_at,
             status             = 'connected',
             updated_at         = NOW()`,
      [accountId, info.id || null, encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt]
    );

    // Trigger initial location list fetch
    const locResp = await fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (locResp.ok) {
      const locData = await locResp.json();
      const account = (locData.accounts || [])[0];
      if (account) {
        await pool.query(
          `UPDATE google_business_connections SET google_account_id = $1, updated_at = NOW()
           WHERE account_id = $2`,
          [account.name, accountId]
        );
      }
    }

    res.redirect(`${process.env.FRONTEND_URL}/business-settings?tab=integrations&connected=1`);
  } catch (err) {
    res.redirect(`${process.env.FRONTEND_URL}/business-settings?tab=integrations&error=token_failed`);
  }
});

// GET /api/google-reviews/connection — connection status
router.get('/connection', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const conn = await getConnection(req.accountId);
    if (!conn) return res.json({ status: 'disconnected' });
    const { access_token_enc, refresh_token_enc, ...safe } = conn;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/google-reviews/connection — disconnect
router.delete('/connection', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE google_business_connections SET status = 'disconnected', access_token_enc = NULL, refresh_token_enc = NULL, updated_at = NOW()
       WHERE account_id = $1`,
      [req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-reviews/locations — set active location
router.post('/locations', requireAuth, requireRole('owner'), async (req, res) => {
  const { location_id, location_name } = req.body;
  if (!location_id) return res.status(400).json({ error: 'location_id is required.' });
  try {
    await pool.query(
      `UPDATE google_business_connections SET location_id = $1, location_name = $2, updated_at = NOW()
       WHERE account_id = $3`,
      [location_id, location_name || null, req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-reviews/sync — manual sync
router.post('/sync', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await syncReviews(req.accountId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-reviews — list synced reviews
router.get('/', requireAuth, requireRole('owner', 'manager', 'staff'), async (req, res) => {
  const { limit = 50, offset = 0, min_rating } = req.query;
  try {
    const conditions = ['account_id = $1', "provider = 'google'"];
    const params     = [req.accountId];

    if (min_rating) {
      conditions.push(`rating >= $${params.length + 1}`);
      params.push(parseInt(min_rating));
    }

    params.push(Math.min(parseInt(limit), 100), parseInt(offset));
    const { rows } = await pool.query(
      `SELECT * FROM external_reviews
       WHERE ${conditions.join(' AND ')}
       ORDER BY review_at DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
