import { getPool, verifyAuth, jwtSign } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = verifyAuth(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const { account_id } = req.body || {};
  if (!account_id) return res.status(400).json({ error: 'account_id is required.' });

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.plan, a.plan_status, a.onboarded,
              CASE WHEN u.account_id = a.id THEN u.role ELSE am.role END AS role
       FROM accounts a
       JOIN users u ON u.id = $1
       LEFT JOIN account_memberships am ON am.account_id = a.id AND am.user_id = $1
       WHERE a.id = $2 AND (u.account_id = a.id OR am.user_id = $1)`,
      [payload.userId, account_id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Access denied to this account.' });

    const account = rows[0];
    const token = jwtSign({ userId: payload.userId, accountId: account.id, role: account.role });

    res.json({
      token,
      user: {
        accountId:   account.id,
        accountName: account.name,
        role:        account.role,
        plan:        account.plan,
        planStatus:  account.plan_status,
        onboarded:   account.onboarded,
      },
    });
  } catch (err) {
    console.error('[auth/switch]', err.message);
    res.status(500).json({ error: 'Failed to switch account.' });
  }
}
