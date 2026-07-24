const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getProvider }   = require('../services/reviewProviders');
const { encrypt }       = require('../services/crypto');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the tenant's connected Google account row (from connected_review_accounts).
 * Returns null if no connection exists.
 */
async function getGoogleConnection(accountId) {
  const { rows } = await pool.query(
    `SELECT cra.*
     FROM connected_review_accounts cra
     JOIN review_providers rp ON rp.id = cra.provider_id AND rp.provider_key = 'google'
     WHERE cra.account_id = $1`,
    [accountId]
  );
  return rows[0] || null;
}

/**
 * Return the primary active review location for a connected account.
 */
async function getPrimaryLocation(connectedAccountId) {
  const { rows } = await pool.query(
    `SELECT * FROM review_locations
     WHERE connected_account_id = $1 AND is_active = TRUE AND is_primary = TRUE
     LIMIT 1`,
    [connectedAccountId]
  );
  return rows[0] || null;
}

/**
 * Build the safe connection status object returned to the frontend.
 * Computes average_rating and total_reviews live from external_reviews.
 */
async function buildConnectionStatus(conn, accountId) {
  if (!conn) return { status: 'disconnected' };

  const loc = await getPrimaryLocation(conn.id);
  const { rows: stats } = await pool.query(
    `SELECT ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*) AS total_reviews
     FROM external_reviews
     WHERE connected_account_id = $1`,
    [conn.id]
  );

  return {
    status:          conn.connection_status,
    location_id:     loc?.external_location_id   || null,
    location_name:   loc?.location_name           || null,
    last_sync_at:    conn.last_sync_at            || null,
    last_sync_error: conn.last_sync_error         || null,
    average_rating:  stats[0]?.average_rating     ? parseFloat(stats[0].average_rating) : null,
    total_reviews:   parseInt(stats[0]?.total_reviews || 0),
    connected_at:    conn.connected_at            || null,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/google-reviews/auth — start OAuth flow
router.get('/auth', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const provider = getProvider('google');
    const url      = await provider.getAuthorizationUrl({
      accountId: req.accountId,
      userId:    req.userId,
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-reviews/callback — OAuth callback (no auth — redirected from Google)
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendBase = `${process.env.FRONTEND_URL}/business-settings?tab=integrations`;

  if (error) return res.redirect(`${frontendBase}&error=access_denied`);

  let accountId, userId;
  try {
    ({ accountId, userId } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')));
    if (!accountId) throw new Error('missing accountId');
  } catch {
    return res.redirect(`${frontendBase}&error=invalid_state`);
  }

  try {
    const provider = getProvider('google');
    const tokens   = await provider.exchangeAuthorizationCode(code, { accountId, userId });

    // Look up the Google provider row
    const { rows: rpRows } = await pool.query(
      `SELECT id FROM review_providers WHERE provider_key = 'google'`
    );
    const providerId = rpRows[0]?.id;
    if (!providerId) throw new Error('Google provider not found in review_providers');

    // Upsert connected account
    const { rows: connRows } = await pool.query(
      `INSERT INTO connected_review_accounts
         (account_id, provider_id, external_account_id, external_account_name,
          connection_status, access_token_enc, refresh_token_enc, token_expires_at,
          granted_scopes, connected_by_user_id, connected_at)
       VALUES ($1,$2,$3,$4,'connected',$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (account_id, provider_id) DO UPDATE
         SET external_account_id   = EXCLUDED.external_account_id,
             external_account_name = EXCLUDED.external_account_name,
             connection_status     = 'connected',
             access_token_enc      = EXCLUDED.access_token_enc,
             refresh_token_enc     = COALESCE(EXCLUDED.refresh_token_enc, connected_review_accounts.refresh_token_enc),
             token_expires_at      = EXCLUDED.token_expires_at,
             granted_scopes        = EXCLUDED.granted_scopes,
             connected_by_user_id  = EXCLUDED.connected_by_user_id,
             connected_at          = NOW(),
             last_sync_error       = NULL,
             updated_at            = NOW()
       RETURNING id`,
      [
        accountId, providerId,
        tokens.externalAccountId, tokens.externalAccountName,
        encrypt(tokens.accessToken),
        tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        tokens.expiresAt,
        tokens.grantedScopes || null,
        userId || null,
      ]
    );
    const connectedAccountId = connRows[0].id;

    // If Google returned an account ID, auto-detect locations
    // If exactly one location exists, auto-select it as primary
    if (tokens.externalAccountId) {
      try {
        const conn   = await getGoogleConnection(accountId);
        const locs   = await provider.listLocations(conn, tokens.externalAccountId);
        if (locs.length === 1) {
          await pool.query(
            `INSERT INTO review_locations
               (connected_account_id, account_id, external_location_id, location_name, display_address, is_primary, is_active)
             VALUES ($1,$2,$3,$4,$5,TRUE,TRUE)
             ON CONFLICT (connected_account_id, external_location_id) DO UPDATE
               SET location_name = EXCLUDED.location_name, display_address = EXCLUDED.display_address,
                   is_primary = TRUE, is_active = TRUE, updated_at = NOW()`,
            [connectedAccountId, accountId, locs[0].id, locs[0].name, locs[0].address || null]
          );
        }
      } catch { /* auto-detect is best-effort */ }
    }

    res.redirect(`${frontendBase}&connected=1`);
  } catch (err) {
    console.error('[google-reviews] callback error:', err.message);
    res.redirect(`${frontendBase}&error=token_failed`);
  }
});

// GET /api/google-reviews/connection — connection status + stats
router.get('/connection', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const conn   = await getGoogleConnection(req.accountId);
    const status = await buildConnectionStatus(conn, req.accountId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/google-reviews/connection — disconnect and revoke tokens
router.delete('/connection', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const conn = await getGoogleConnection(req.accountId);
    if (!conn) return res.json({ success: true });

    const provider = getProvider('google');
    await provider.disconnect(conn);

    // Deactivate all locations for this connection
    await pool.query(
      `UPDATE review_locations SET is_active = FALSE, updated_at = NOW()
       WHERE connected_account_id = $1`,
      [conn.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-reviews/locations/available — list GBP locations from API
router.get('/locations/available', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const conn = await getGoogleConnection(req.accountId);
    if (!conn || conn.connection_status !== 'connected') {
      return res.status(400).json({ error: 'Google Business Profile is not connected.' });
    }

    const provider = getProvider('google');

    // Get GBP account(s)
    const accounts = await provider.listAccounts(conn);
    if (!accounts.length) return res.json({ locations: [] });

    // Fetch locations for each account (usually just one)
    const locations = [];
    for (const acct of accounts) {
      try {
        const locs = await provider.listLocations(conn, acct.id);
        locations.push(...locs.map(l => ({ ...l, accountId: acct.id, accountName: acct.name })));
      } catch (err) {
        console.warn(`[google-reviews] listLocations failed for account ${acct.id}:`, err.message);
      }
    }

    // Mark which locations are already selected
    const { rows: active } = await pool.query(
      `SELECT external_location_id FROM review_locations
       WHERE connected_account_id = $1 AND is_active = TRUE`,
      [conn.id]
    );
    const activeSet = new Set(active.map(r => r.external_location_id));

    res.json({
      locations: locations.map(l => ({ ...l, is_active: activeSet.has(l.id) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-reviews/locations — select active location
router.post('/locations', requireAuth, requireRole('owner'), async (req, res) => {
  const { location_id, location_name, display_address } = req.body;
  if (!location_id) return res.status(400).json({ error: 'location_id is required.' });

  try {
    const conn = await getGoogleConnection(req.accountId);
    if (!conn) return res.status(400).json({ error: 'Google Business Profile is not connected.' });

    // Clear primary flag on existing locations
    await pool.query(
      `UPDATE review_locations SET is_primary = FALSE, updated_at = NOW()
       WHERE connected_account_id = $1`,
      [conn.id]
    );

    // Upsert selected location as primary
    await pool.query(
      `INSERT INTO review_locations
         (connected_account_id, account_id, external_location_id, location_name, display_address, is_primary, is_active)
       VALUES ($1,$2,$3,$4,$5,TRUE,TRUE)
       ON CONFLICT (connected_account_id, external_location_id) DO UPDATE
         SET location_name   = EXCLUDED.location_name,
             display_address = EXCLUDED.display_address,
             is_primary      = TRUE,
             is_active       = TRUE,
             updated_at      = NOW()`,
      [conn.id, req.accountId, location_id, location_name || null, display_address || null]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-reviews/sync — manual sync
router.post('/sync', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const conn = await getGoogleConnection(req.accountId);
    if (!conn || conn.connection_status === 'disconnected') {
      return res.status(400).json({ error: 'Google Business Profile is not connected.' });
    }

    const location = await getPrimaryLocation(conn.id);
    if (!location) {
      return res.status(400).json({ error: 'No active location selected. Go to Integrations settings to choose a location.' });
    }

    // Log sync job start
    const { rows: jobRows } = await pool.query(
      `INSERT INTO review_sync_jobs (connected_account_id, location_row_id, account_id, trigger, status)
       VALUES ($1,$2,$3,'manual','running') RETURNING id`,
      [conn.id, location.id, req.accountId]
    );
    const syncJobId = jobRows[0].id;

    try {
      const provider = getProvider('google');
      const result   = await provider.syncReviews(conn, location);

      await pool.query(
        `UPDATE review_sync_jobs
         SET status = 'completed', reviews_fetched = $1, reviews_new = $2,
             reviews_updated = $3, completed_at = NOW()
         WHERE id = $4`,
        [result.fetched, result.created, result.updated, syncJobId]
      );

      res.json({ synced: result.created, updated: result.updated, fetched: result.fetched });
    } catch (err) {
      await pool.query(
        `UPDATE review_sync_jobs
         SET status = 'failed', error_message = $1, completed_at = NOW()
         WHERE id = $2`,
        [err.message, syncJobId]
      );
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-reviews/:id/reply — post owner reply to a review
router.post('/:id/reply', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { reply } = req.body;
  if (!reply?.trim()) return res.status(400).json({ error: 'Reply text is required.' });

  try {
    const { rows } = await pool.query(
      `SELECT er.*, cra.id AS cra_id
       FROM external_reviews er
       JOIN connected_review_accounts cra ON cra.id = er.connected_account_id
       WHERE er.id = $1 AND er.account_id = $2 AND er.provider = 'google'`,
      [req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Review not found.' });

    const review   = rows[0];
    const conn     = await getGoogleConnection(req.accountId);
    const provider = getProvider('google');
    await provider.replyToReview(conn, review, reply.trim());

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-reviews — list synced reviews (paginated)
router.get('/', requireAuth, requireRole('owner', 'manager', 'staff'), async (req, res) => {
  const { limit = 50, offset = 0, min_rating } = req.query;
  try {
    const conditions = ["er.account_id = $1", "er.provider = 'google'"];
    const params     = [req.accountId];

    if (min_rating) {
      conditions.push(`er.rating >= $${params.length + 1}`);
      params.push(parseInt(min_rating));
    }

    params.push(Math.min(parseInt(limit), 100), parseInt(offset));
    const { rows } = await pool.query(
      `SELECT er.*, rl.location_name
       FROM external_reviews er
       LEFT JOIN review_locations rl ON rl.id = er.location_row_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY er.review_at DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
