const pool = require('../db/pool');

const LIMITS = {
  starter: { users: 2,  jobsPerMonth: 50,  sms: false },
  growth:  { users: 10, jobsPerMonth: null, sms: true  },
  scale:   { users: null, jobsPerMonth: null, sms: true },
};

async function accountPlan(accountId) {
  const { rows } = await pool.query(
    `SELECT plan FROM accounts WHERE id = $1`, [accountId]
  );
  return rows[0]?.plan || 'starter';
}

// POST /api/users — enforce team member cap
async function checkUserLimit(req, res, next) {
  try {
    const plan   = await accountPlan(req.accountId);
    const limits = LIMITS[plan] || LIMITS.starter;
    if (limits.users === null) return next();

    const { rows } = await pool.query(
      `SELECT count(*) FROM users WHERE account_id = $1`, [req.accountId]
    );
    if (parseInt(rows[0].count) >= limits.users) {
      return res.status(403).json({
        error:  `Your ${plan} plan allows up to ${limits.users} team members. Upgrade to add more.`,
        code:   'PLAN_LIMIT_USERS',
        plan,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// POST /api/jobs — enforce monthly job cap
async function checkJobLimit(req, res, next) {
  try {
    const plan   = await accountPlan(req.accountId);
    const limits = LIMITS[plan] || LIMITS.starter;
    if (limits.jobsPerMonth === null) return next();

    const { rows } = await pool.query(
      `SELECT count(*) FROM jobs
       WHERE account_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [req.accountId]
    );
    if (parseInt(rows[0].count) >= limits.jobsPerMonth) {
      return res.status(403).json({
        error:  `Your ${plan} plan allows up to ${limits.jobsPerMonth} jobs per month. Upgrade to continue.`,
        code:   'PLAN_LIMIT_JOBS',
        plan,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// POST /api/sms/send — enforce SMS access
async function checkSmsAccess(req, res, next) {
  try {
    const plan   = await accountPlan(req.accountId);
    const limits = LIMITS[plan] || LIMITS.starter;
    if (!limits.sms) {
      return res.status(403).json({
        error: `SMS is not available on the ${plan} plan. Upgrade to Growth or Scale.`,
        code:  'PLAN_LIMIT_SMS',
        plan,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkUserLimit, checkJobLimit, checkSmsAccess, LIMITS };
