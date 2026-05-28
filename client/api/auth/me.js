import { getPool, verifyAuth } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const payload = verifyAuth(req);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token.' });

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.account_id,
              a.name AS account_name, a.plan, a.plan_status, a.onboarded
       FROM users u JOIN accounts a ON a.id = u.account_id
       WHERE u.id = $1`,
      [payload.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found.' });
    const r = rows[0];
    res.json({
      user: {
        id:          r.id,
        name:        r.name,
        email:       r.email,
        role:        r.role,
        accountId:   r.account_id,
        accountName: r.account_name,
        plan:        r.plan,
        planStatus:  r.plan_status,
        onboarded:   r.onboarded,
      },
    });
  } catch (err) {
    console.error('[auth/me]', err.message);
    res.status(500).json({ error: 'Failed to load user.' });
  }
}
