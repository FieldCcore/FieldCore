import { getPool, verifyAuth } from '../../_lib.js';

export default async function handler(req, res) {
  const user = verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const pool = getPool();
  const { id } = req.query;
  const { accountId } = user;

  if (req.method === 'DELETE') {
    try {
      await pool.query('DELETE FROM service_templates WHERE id=$1 AND account_id=$2', [id, accountId]);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete service.' });
    }
  }

  if (req.method === 'PUT') {
    const { name, duration_minutes, buffer_minutes, price, description, is_active } = req.body || {};
    try {
      const r = await pool.query(`
        UPDATE service_templates
        SET name=$1, duration_minutes=$2, buffer_minutes=$3, price=$4, description=$5, is_active=$6
        WHERE id=$7 AND account_id=$8 RETURNING *
      `, [name, duration_minutes, buffer_minutes, price, description, is_active !== false, id, accountId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
      return res.json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update service.' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
