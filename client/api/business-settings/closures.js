import { getPool, verifyAuth } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  const { accountId } = user;
  const { closure_date, name, is_emergency } = req.body || {};
  if (!closure_date || !name) return res.status(400).json({ error: 'date and name required' });

  try {
    const r = await pool.query(
      'INSERT INTO holiday_closures (account_id, closure_date, name, is_emergency) VALUES ($1,$2,$3,$4) RETURNING *',
      [accountId, closure_date, name, !!is_emergency]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[closures POST]', err.message);
    res.status(500).json({ error: 'Failed to add closure.' });
  }
}
