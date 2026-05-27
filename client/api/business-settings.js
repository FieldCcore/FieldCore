import { getPool, verifyAuth } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  const { accountId } = user;

  try {
    const [profileRes, hoursRes, closuresRes, servicesRes] = await Promise.all([
      pool.query('SELECT * FROM business_profiles WHERE account_id = $1', [accountId]),
      pool.query('SELECT * FROM business_hours WHERE account_id = $1 ORDER BY day_of_week', [accountId]),
      pool.query('SELECT * FROM holiday_closures WHERE account_id = $1 ORDER BY closure_date', [accountId]),
      pool.query('SELECT * FROM service_templates WHERE account_id = $1 ORDER BY sort_order, name', [accountId]),
    ]);

    let hours = hoursRes.rows;
    if (!hours.length) {
      hours = [0,1,2,3,4,5,6].map(d => ({
        day_of_week: d,
        open_time:   d === 0 || d === 6 ? null : '08:00',
        close_time:  d === 0 || d === 6 ? null : '17:00',
        is_closed:   d === 0 || d === 6,
      }));
    }

    res.json({ profile: profileRes.rows[0] || null, hours, closures: closuresRes.rows, services: servicesRes.rows });
  } catch (err) {
    console.error('[business-settings GET]', err.message);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
}
