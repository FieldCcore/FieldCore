const { getEntitlements, REQUIRED_PLAN, PLAN_NAMES } = require('../services/entitlements');

/**
 * Middleware factory that enforces a plan capability on a route.
 *
 * Usage:
 *   router.post('/', requireAuth, requireEntitlement('can_create_projects'), handler)
 *
 * On denial returns:
 *   403 { error, code: 'ENTITLEMENT_REQUIRED', requiredPlan, currentPlan, capability }
 */
function requireEntitlement(capability) {
  return async (req, res, next) => {
    try {
      const ent = await getEntitlements(req.accountId);
      if (ent.capabilities[capability]) return next();

      const requiredPlan = REQUIRED_PLAN[capability] || 'pro';
      return res.status(403).json({
        error:       `This feature requires the ${PLAN_NAMES[requiredPlan] || requiredPlan} plan or higher.`,
        code:        'ENTITLEMENT_REQUIRED',
        capability,
        requiredPlan,
        currentPlan: ent.plan,
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireEntitlement;
