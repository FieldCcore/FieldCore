import { getPool, verifyAuth } from '../../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  const { id } = req.query;

  try {
    await pool.query('DELETE FROM holiday_closures WHERE id=$1 AND account_id=$2', [id, user.accountId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[closures DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete closure.' });
  }
}
