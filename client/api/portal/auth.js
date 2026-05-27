import crypto from 'crypto';
import { getPool } from '../_lib.js';
import { portalJwtSign } from '../_portal_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token, account } = req.query;
  if (!token || !account) return res.status(400).json({ error: 'token and account required.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const pool = getPool();

  try {
    const r = await pool.query(`
      SELECT t.*, c.name, c.email, c.phone
      FROM client_portal_tokens t
      JOIN clients c ON c.id = t.client_id
      WHERE t.token_hash = $1
        AND t.account_id = $2
        AND t.expires_at > NOW()
        AND t.used_at IS NULL
    `, [tokenHash, account]);

    if (!r.rows.length) return res.status(401).json({ error: 'Link expired or already used.' });

    const row = r.rows[0];
    await pool.query('UPDATE client_portal_tokens SET used_at = NOW() WHERE id = $1', [row.id]);

    const portalToken = portalJwtSign({
      clientId:  row.client_id,
      accountId: row.account_id,
      name:      row.name,
      email:     row.email,
    });

    res.json({ token: portalToken, name: row.name, email: row.email });
  } catch (err) {
    console.error('[portal/auth]', err);
    res.status(500).json({ error: 'Authentication failed.' });
  }
}
