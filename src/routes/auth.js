const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../db/pool');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const { rows } = await pool.query(
      `SELECT u.*, a.name AS account_name
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

    const token = jwt.sign(
      { userId: user.id, accountId: user.account_id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      user: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        role:         user.role,
        accountId:    user.account_id,
        accountName:  user.account_name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/me — verify token and return user (used on app load)
router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token.' });

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.account_id,
              a.name AS account_name
       FROM users u JOIN accounts a ON a.id = u.account_id
       WHERE u.id = $1`,
      [payload.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found.' });
    res.json({ user: { ...rows[0], accountId: rows[0].account_id } });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

// POST /api/auth/seed-owner — dev-only: create an owner account + user with password
// Remove or gate behind NODE_ENV check before production
router.post('/seed-owner', async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ error: 'Not available in production.' });

  const { accountName, name, email, password } = req.body;
  if (!accountName || !name || !email || !password)
    return res.status(400).json({ error: 'accountName, name, email, and password are required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: acctRows } = await client.query(
      `INSERT INTO accounts (name) VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [accountName]
    );

    let accountId;
    if (acctRows.length) {
      accountId = acctRows[0].id;
    } else {
      const { rows } = await client.query(
        `SELECT id FROM accounts WHERE name = $1`, [accountName]
      );
      accountId = rows[0].id;
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (account_id, role, name, email, password_hash)
       VALUES ($1, 'owner', $2, $3, $4)
       ON CONFLICT (account_id, email) DO UPDATE SET password_hash = $4
       RETURNING id`,
      [accountId, name, email, hash]
    );

    await client.query('COMMIT');
    res.json({ accountId, userId: userRows[0].id, message: 'Owner created.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
