const pool         = require('../db/pool');
const entitlements = require('../services/entitlements');

// POST /api/users — enforce team member cap
async function checkUserLimit(req, res, next) {
  try {
    const ent   = await entitlements.getEntitlements(req.accountId);
    const limit = ent.capabilities.max_users;
    if (limit === null) return next();

    const { rows } = await pool.query(
      `SELECT count(*) FROM users WHERE account_id = $1`, [req.accountId]
    );
    if (parseInt(rows[0].count) >= limit) {
      return res.status(403).json({
        error: `Your ${entitlements.PLAN_NAMES[ent.plan]} plan allows up to ${limit} team members. Upgrade to add more.`,
        code:  'PLAN_LIMIT_USERS',
        plan:  ent.plan,
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
    const ent   = await entitlements.getEntitlements(req.accountId);
    const limit = ent.capabilities.max_jobs_per_month;
    if (limit === null) return next();

    const { rows } = await pool.query(
      `SELECT count(*) FROM jobs
       WHERE account_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [req.accountId]
    );
    if (parseInt(rows[0].count) >= limit) {
      return res.status(403).json({
        error: `Your ${entitlements.PLAN_NAMES[ent.plan]} plan allows up to ${limit} jobs per month. Upgrade to continue.`,
        code:  'PLAN_LIMIT_JOBS',
        plan:  ent.plan,
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
    const ent = await entitlements.getEntitlements(req.accountId);
    if (!ent.capabilities.can_use_sms) {
      return res.status(403).json({
        error: `SMS is not available on the ${entitlements.PLAN_NAMES[ent.plan]} plan. Upgrade to Pro or Scale.`,
        code:  'PLAN_LIMIT_SMS',
        plan:  ent.plan,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkUserLimit, checkJobLimit, checkSmsAccess };
