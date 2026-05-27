import { getPool, verifyAuth } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  const { accountId } = user;
  const { hours } = req.body || {};
  if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours must be an array' });

  try {
    for (const h of hours) {
      await pool.query(`
        INSERT INTO business_hours (account_id, day_of_week, open_time, close_time, is_closed)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (account_id, day_of_week) DO UPDATE SET
          open_time=$3, close_time=$4, is_closed=$5
      `, [accountId, h.day_of_week, h.is_closed ? null : h.open_time, h.is_closed ? null : h.close_time, !!h.is_closed]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[business-settings/hours PUT]', err.message);
    res.status(500).json({ error: 'Failed to save hours.' });
  }
}
