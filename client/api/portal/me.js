import { getPool } from '../_lib.js';
import { requirePortalAuth } from '../_portal_lib.js';

export default async function handler(req, res) {
  const portalUser = requirePortalAuth(req, res);
  if (!portalUser) return;

  const { clientId, accountId } = portalUser;
  const pool = getPool();

  if (req.method === 'GET') {
    try {
      const r = await pool.query(
        'SELECT id, name, email, phone, address, ltv, tier, created_at FROM clients WHERE id=$1 AND account_id=$2',
        [clientId, accountId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
      return res.json(r.rows[0]);
    } catch {
      return res.status(500).json({ error: 'Failed to load profile.' });
    }
  }

  if (req.method === 'PUT') {
    const { phone, address, email } = req.body || {};
    try {
      const r = await pool.query(
        'UPDATE clients SET phone=COALESCE($1,phone), address=COALESCE($2,address), email=COALESCE($3,email) WHERE id=$4 AND account_id=$5 RETURNING id,name,email,phone,address',
        [phone || null, address || null, email || null, clientId, accountId]
      );
      return res.json(r.rows[0]);
    } catch {
      return res.status(500).json({ error: 'Failed to update profile.' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
