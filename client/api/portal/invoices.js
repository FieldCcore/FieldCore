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
      SELECT i.id, i.amount, i.status, i.payment_link, i.paid_at, i.created_at,
             j.service_type, j.scheduled_at, j.notes,
             COALESCE(i.tax_amount, 0) AS tax_amount
      FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      WHERE i.client_id = $1 AND i.account_id = $2
      ORDER BY i.created_at DESC
      LIMIT 50
    `, [clientId, accountId]);
    res.json(r.rows);
  } catch (err) {
    console.error('[portal/invoices]', err);
    res.status(500).json({ error: 'Failed to load invoices.' });
  }
}
