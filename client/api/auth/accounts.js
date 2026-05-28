import { getPool, verifyAuth } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const payload = verifyAuth(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name,
              CASE WHEN u.account_id = a.id THEN u.role ELSE am.role END AS role,
              (u.account_id = a.id) AS is_home
       FROM accounts a
       JOIN users u ON u.id = $1
       LEFT JOIN account_memberships am ON am.account_id = a.id AND am.user_id = $1
       WHERE a.id = u.account_id OR am.user_id = $1
       ORDER BY is_home DESC, a.name`,
      [payload.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[auth/accounts]', err.message);
    res.status(500).json({ error: 'Failed to load accounts.' });
  }
}
