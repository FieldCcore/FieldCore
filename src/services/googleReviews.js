const pool   = require('../db/pool');
const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex');

function encrypt(text) {
  const iv  = crypto.randomBytes(12);
  const c   = crypto.createCipheriv(ALG, KEY, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return [iv.toString('hex'), enc.toString('hex'), tag.toString('hex')].join('.');
}

function decrypt(stored) {
  const [ivHex, encHex, tagHex] = stored.split('.');
  const d = crypto.createDecipheriv(ALG, KEY, Buffer.from(ivHex, 'hex'));
  d.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
}

async function getConnection(accountId) {
  const { rows } = await pool.query(
    `SELECT * FROM google_business_connections WHERE account_id = $1`,
    [accountId]
  );
  return rows[0] || null;
}

async function refreshAccessToken(conn) {
  const refreshToken = decrypt(conn.refresh_token_enc);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`);
  const data = await resp.json();

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await pool.query(
    `UPDATE google_business_connections
     SET access_token_enc = $1, token_expires_at = $2, status = 'connected', updated_at = NOW()
     WHERE account_id = $3`,
    [encrypt(data.access_token), expiresAt, conn.account_id]
  );
  return data.access_token;
}

async function getValidToken(conn) {
  if (conn.token_expires_at && new Date(conn.token_expires_at) > new Date(Date.now() + 60000)) {
    return decrypt(conn.access_token_enc);
  }
  return refreshAccessToken(conn);
}

async function syncReviews(accountId) {
  const conn = await getConnection(accountId);
  if (!conn || conn.status === 'disconnected') return { synced: 0 };

  let token;
  try {
    token = await getValidToken(conn);
  } catch (err) {
    await pool.query(
      `UPDATE google_business_connections SET status = 'expired', last_sync_error = $1, updated_at = NOW()
       WHERE account_id = $2`,
      [err.message, accountId]
    );
    return { synced: 0, error: err.message };
  }

  const locationId = conn.location_id;
  const url = `https://mybusiness.googleapis.com/v4/${locationId}/reviews?pageSize=50`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const msg = `GBP API error: ${resp.status}`;
    await pool.query(
      `UPDATE google_business_connections SET last_sync_error = $1, updated_at = NOW()
       WHERE account_id = $2`,
      [msg, accountId]
    );
    return { synced: 0, error: msg };
  }

  const data = await resp.json();
  const reviews = data.reviews || [];
  let synced = 0;

  for (const r of reviews) {
    const { insertedCount } = await upsertReview(accountId, r);
    synced += insertedCount;
  }

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + (r.starRating ? starToInt(r.starRating) : 0), 0) / reviews.length
    : conn.average_rating;

  await pool.query(
    `UPDATE google_business_connections
     SET last_sync_at = NOW(), last_sync_error = NULL, status = 'connected',
         average_rating = $1, total_reviews = $2, updated_at = NOW()
     WHERE account_id = $3`,
    [avgRating, data.totalReviewCount || reviews.length, accountId]
  );

  return { synced };
}

function starToInt(star) {
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return map[star] || 0;
}

async function upsertReview(accountId, r) {
  const externalId   = r.reviewId;
  const reviewerName = r.reviewer?.displayName || 'Anonymous';
  const rating       = starToInt(r.starRating);
  const body         = r.comment || null;
  const ownerResp    = r.reviewReply?.comment || null;
  const reviewAt     = r.createTime ? new Date(r.createTime) : null;

  const { rowCount } = await pool.query(
    `INSERT INTO external_reviews
       (account_id, provider, external_review_id, reviewer_name, rating, body, owner_response, review_at)
     VALUES ($1, 'google', $2, $3, $4, $5, $6, $7)
     ON CONFLICT (account_id, provider, external_review_id) DO UPDATE
       SET owner_response = EXCLUDED.owner_response,
           synced_at = NOW()
     WHERE external_reviews.owner_response IS DISTINCT FROM EXCLUDED.owner_response`,
    [accountId, externalId, reviewerName, rating, body, ownerResp, reviewAt]
  );

  return { insertedCount: rowCount > 0 ? 1 : 0 };
}

module.exports = { encrypt, decrypt, getConnection, syncReviews, getValidToken };
