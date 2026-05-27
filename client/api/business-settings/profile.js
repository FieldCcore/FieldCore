import { getPool, verifyAuth } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  const { accountId } = user;
  const { business_name, phone, address, city, state, zip, website, description, timezone, vertical, ein } = req.body || {};

  try {
    await pool.query(`
      INSERT INTO business_profiles (account_id, business_name, phone, address, city, state, zip, website, description, timezone, vertical, ein, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      ON CONFLICT (account_id) DO UPDATE SET
        business_name=$2, phone=$3, address=$4, city=$5, state=$6, zip=$7,
        website=$8, description=$9, timezone=$10, vertical=$11, ein=$12, updated_at=NOW()
    `, [accountId, business_name, phone, address, city, state, zip, website, description, timezone || 'America/New_York', vertical, ein || null]);

    if (business_name) {
      await pool.query('UPDATE accounts SET name=$1 WHERE id=$2', [business_name, accountId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[business-settings/profile PUT]', err.message);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
}
