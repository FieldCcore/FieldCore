import { getPool, verifyAuth } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  const { accountId } = user;
  const { name, duration_minutes, buffer_minutes, price, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const r = await pool.query(
      'INSERT INTO service_templates (account_id, name, duration_minutes, buffer_minutes, price, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [accountId, name, duration_minutes || 60, buffer_minutes || 15, price || null, description || null]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[services POST]', err.message);
    res.status(500).json({ error: 'Failed to create service.' });
  }
}
