const pool             = require('../../db/pool');
const { encrypt, decrypt } = require('../crypto');
const ReviewProvider   = require('./base');

const SCOPES = ['https://www.googleapis.com/auth/business.manage'];

const GBP_ACCOUNTS_URL  = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const GBP_REVIEWS_BASE  = 'https://mybusiness.googleapis.com/v4';
const TOKEN_URL         = 'https://oauth2.googleapis.com/token';
const REVOKE_URL        = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL      = 'https://www.googleapis.com/oauth2/v2/userinfo';

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
function starToInt(star) { return STAR_MAP[star] || 0; }

class GoogleReviewProvider extends ReviewProvider {
  get key() { return 'google'; }

  async getAuthorizationUrl(context) {
    const state = Buffer.from(JSON.stringify(context)).toString('base64url');
    const params = new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPES.join(' '),
      access_type:   'offline',
      prompt:        'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeAuthorizationCode(code, context) {
    const resp = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
        code,
        grant_type:    'authorization_code',
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Google token exchange failed ${resp.status}: ${body}`);
    }
    const tokens = await resp.json();

    // Fetch Google account identity
    const infoResp = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = infoResp.ok ? await infoResp.json() : {};

    // Fetch first GBP account name
    let externalAccountId   = info.id || null;
    let externalAccountName = info.email || null;
    try {
      const acctResp = await fetch(GBP_ACCOUNTS_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (acctResp.ok) {
        const acctData = await acctResp.json();
        const acct = (acctData.accounts || [])[0];
        if (acct) {
          externalAccountId   = acct.name;   // e.g. "accounts/1234567890"
          externalAccountName = acct.accountName || acct.name;
        }
      }
    } catch { /* non-fatal */ }

    return {
      accessToken:         tokens.access_token,
      refreshToken:        tokens.refresh_token || null,
      expiresAt:           new Date(Date.now() + tokens.expires_in * 1000),
      grantedScopes:       (tokens.scope || SCOPES.join(' ')).split(' '),
      externalAccountId,
      externalAccountName,
    };
  }

  async refreshAccessToken(connection) {
    const refreshToken = decrypt(connection.refresh_token_enc);
    const resp = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Google token refresh failed ${resp.status}: ${body}`);
    }
    const data = await resp.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await pool.query(
      `UPDATE connected_review_accounts
       SET access_token_enc = $1, token_expires_at = $2,
           connection_status = 'connected', updated_at = NOW()
       WHERE id = $3`,
      [encrypt(data.access_token), expiresAt, connection.id]
    );
    return data.access_token;
  }

  async getValidToken(connection) {
    if (connection.token_expires_at &&
        new Date(connection.token_expires_at) > new Date(Date.now() + 60_000)) {
      return decrypt(connection.access_token_enc);
    }
    return this.refreshAccessToken(connection);
  }

  async listAccounts(connection) {
    const token = await this.getValidToken(connection);
    const resp  = await fetch(GBP_ACCOUNTS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`GBP accounts fetch failed: ${resp.status}`);
    const data = await resp.json();
    return (data.accounts || []).map(a => ({
      id:   a.name,
      name: a.accountName || a.name,
    }));
  }

  async listLocations(connection, externalAccountId) {
    const token = await this.getValidToken(connection);
    const url   = `${GBP_ACCOUNTS_URL}/${externalAccountId.replace(/^accounts\//, '')}/locations`;
    const resp  = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      // Try accounts listing API with readMask
      const resp2 = await fetch(
        `https://mybusinessaccountmanagement.googleapis.com/v1/${externalAccountId}/locations?readMask=name,title,storefrontAddress`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp2.ok) throw new Error(`GBP locations fetch failed: ${resp.status}`);
      const data2 = await resp2.json();
      return (data2.locations || []).map(l => ({
        id:      l.name,
        name:    l.title || l.name,
        address: l.storefrontAddress
          ? [l.storefrontAddress.addressLines?.[0], l.storefrontAddress.locality, l.storefrontAddress.administrativeArea].filter(Boolean).join(', ')
          : null,
      }));
    }
    const data = await resp.json();
    return (data.locations || []).map(l => ({
      id:      l.name,
      name:    l.locationName || l.title || l.name,
      address: l.address
        ? [l.address.addressLines?.[0], l.address.locality, l.address.administrativeArea].filter(Boolean).join(', ')
        : null,
    }));
  }

  async syncReviews(connection, location) {
    const token = await this.getValidToken(connection);
    const url   = `${GBP_REVIEWS_BASE}/${location.external_location_id}/reviews?pageSize=50`;

    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!resp.ok) {
      const msg = `GBP reviews API error ${resp.status}`;
      await pool.query(
        `UPDATE connected_review_accounts
         SET last_sync_error = $1, last_sync_attempt_at = NOW(), last_sync_status = 'error', updated_at = NOW()
         WHERE id = $2`,
        [msg, connection.id]
      );
      throw new Error(msg);
    }

    const data    = await resp.json();
    const reviews = data.reviews || [];
    let created   = 0;
    let updated   = 0;

    for (const r of reviews) {
      const result = await this._upsertReview(connection, location, r);
      created += result.created;
      updated += result.updated;
    }

    const totalCount  = data.totalReviewCount || reviews.length;
    const avgRating   = reviews.length
      ? reviews.reduce((s, r) => s + starToInt(r.starRating), 0) / reviews.length
      : null;

    await pool.query(
      `UPDATE connected_review_accounts
       SET last_sync_at = NOW(), last_sync_attempt_at = NOW(),
           last_sync_status = 'ok', last_sync_error = NULL,
           connection_status = 'connected', updated_at = NOW()
       WHERE id = $1`,
      [connection.id]
    );

    await pool.query(
      `UPDATE review_locations SET last_sync_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [location.id]
    );

    return { fetched: reviews.length, created, updated, totalCount, averageRating: avgRating };
  }

  async _upsertReview(connection, location, r) {
    const externalId   = r.reviewId;
    const reviewerName = r.reviewer?.displayName || 'Anonymous';
    const reviewerPhoto = r.reviewer?.profilePhotoUrl || null;
    const rating       = starToInt(r.starRating);
    const body         = r.comment || null;
    const ownerResp    = r.reviewReply?.comment || null;
    const ownerRespAt  = r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null;
    const reviewAt     = r.createTime ? new Date(r.createTime) : null;
    const reviewUrl    = r.reviewId
      ? `https://search.google.com/local/reviews?placeid=${location.external_location_id}`
      : null;

    const { rowCount } = await pool.query(
      `INSERT INTO external_reviews
         (account_id, provider, external_review_id, location_id,
          connected_account_id, location_row_id,
          reviewer_name, reviewer_photo_url, rating, body,
          owner_response, owner_response_at, review_url, review_at)
       VALUES ($1, 'google', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (account_id, provider, external_review_id) DO UPDATE
         SET owner_response    = EXCLUDED.owner_response,
             owner_response_at = EXCLUDED.owner_response_at,
             reviewer_name     = EXCLUDED.reviewer_name,
             reviewer_photo_url = EXCLUDED.reviewer_photo_url,
             updated_at        = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        connection.account_id, externalId,
        location.external_location_id,
        connection.id, location.id,
        reviewerName, reviewerPhoto, rating, body,
        ownerResp, ownerRespAt, reviewUrl, reviewAt,
      ]
    );

    const row = (await pool.query(
      `SELECT (xmax = 0) AS inserted FROM external_reviews
       WHERE account_id = $1 AND provider = 'google' AND external_review_id = $2`,
      [connection.account_id, externalId]
    )).rows[0];

    return { created: rowCount > 0 && row?.inserted ? 1 : 0, updated: rowCount > 0 && !row?.inserted ? 1 : 0 };
  }

  async replyToReview(connection, review, reply) {
    const token    = await this.getValidToken(connection);
    const replyUrl = `${GBP_REVIEWS_BASE}/${review.location_id}/reviews/${review.external_review_id}/reply`;
    const resp     = await fetch(replyUrl, {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ comment: reply }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`GBP reply failed ${resp.status}: ${body}`);
    }

    await pool.query(
      `UPDATE external_reviews
       SET owner_response = $1, owner_response_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [reply, review.id]
    );
  }

  async disconnect(connection) {
    // Revoke access token — best-effort, don't fail if already expired
    if (connection.access_token_enc) {
      try {
        const token = decrypt(connection.access_token_enc);
        await fetch(`${REVOKE_URL}?token=${token}`, { method: 'POST' });
      } catch { /* non-fatal */ }
    }

    await pool.query(
      `UPDATE connected_review_accounts
       SET connection_status  = 'disconnected',
           access_token_enc   = NULL,
           refresh_token_enc  = NULL,
           token_expires_at   = NULL,
           updated_at         = NOW()
       WHERE id = $1`,
      [connection.id]
    );
  }
}

module.exports = GoogleReviewProvider;
