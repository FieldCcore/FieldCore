import { getPool } from '../_lib.js';
import { requirePortalAuth } from '../_portal_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const portalUser = requirePortalAuth(req, res);
  if (!portalUser) return;

  const { clientId, accountId } = portalUser;
  const pool = getPool();

  try {
    const r = await pool.query(`
      SELECT j.id, j.service_type, j.status, j.scheduled_at, j.amount, j.notes,
             u.name AS tech_name
      FROM jobs j
      LEFT JOIN users u ON u.id = j.tech_id
      WHERE j.client_id = $1 AND j.account_id = $2
      ORDER BY j.scheduled_at DESC
      LIMIT 30
    `, [clientId, accountId]);
    res.json(r.rows);
  } catch (err) {
    console.error('[portal/appointments]', err);
    res.status(500).json({ error: 'Failed to load appointments.' });
  }
}
