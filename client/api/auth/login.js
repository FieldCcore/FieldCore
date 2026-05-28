import bcrypt from 'bcryptjs';
import { getPool, jwtSign } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT u.*, a.name AS account_name, a.plan, a.plan_status, a.onboarded
       FROM users u
       JOIN accounts a ON a.id = u.account_id
       WHERE lower(u.email) = lower($1)
       LIMIT 1`,
      [email.trim()]
    );

    const user = rows[0];
    if (!user || !user.password_hash)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwtSign({ userId: user.id, accountId: user.account_id, role: user.role });

    res.json({
      token,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        accountId:   user.account_id,
        accountName: user.account_name,
        plan:        user.plan,
        planStatus:  user.plan_status,
        onboarded:   user.onboarded,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}
