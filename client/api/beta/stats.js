import { getPool, verifyAuth } from '../_lib.js';

const BETA_CAP = parseInt(process.env.BETA_CAP || '100');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')   AS active_count,
        COUNT(*) FILTER (WHERE status = 'waitlist') AS waitlist_count,
        $1::int                                      AS cap
      FROM beta_signups
    `, [BETA_CAP]);
    const { active_count, waitlist_count, cap } = r.rows[0];
    res.json({
      active_count:   parseInt(active_count),
      waitlist_count: parseInt(waitlist_count),
      cap:            parseInt(cap),
      spots_left:     Math.max(0, parseInt(cap) - parseInt(active_count)),
    });
  } catch (err) {
    console.error('[beta/stats]', err);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
}
