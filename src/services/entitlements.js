/**
 * Central entitlement engine for FieldCore subscription plan access.
 *
 * Single source of truth for what each plan can do. All backend routes and
 * frontend UI should derive access from getEntitlements() — never from a raw
 * plan-name comparison scattered through the codebase.
 *
 * Effective entitlement resolution order (later entries win):
 *   1. Base plan capabilities
 *   2. Trial plan capabilities (if trial_plan is set and trial_ends_at > NOW())
 *   3. Per-tenant feature_overrides JSONB column (grandfathering, beta, enterprise)
 *
 * Active-work protection: past_due accounts keep full entitlements so technicians
 * are never stranded at a job site because of a payment hiccup.
 */

const pool = require('../db/pool');

// ── Plan capability definitions ───────────────────────────────────────────────

const PLAN_CAPABILITIES = {
  starter: {
    // Multi-day jobs
    can_create_multi_day_jobs:          false,
    can_manage_work_sessions:           false,
    // Projects (stubs for future enforcement — routes not yet implemented)
    can_create_projects:                false,
    can_manage_project_teams:           false,
    can_use_project_financials:         false,
    can_view_project_profitability:     false,
    can_use_project_change_orders:      false,
    can_use_project_progress_billing:   false,
    can_use_project_milestones:         false,
    can_use_project_templates:          false,
    can_use_multi_location_projects:    false,
    can_use_advanced_project_reporting: false,
    can_use_division_project_controls:  false,
    // Entities (multi-LLC / multi-brand management)
    can_create_entities:                false,
    can_use_consolidated_reporting:     false,
    // Communications
    can_use_sms:                        false,
    // null = unlimited, integer = hard cap
    max_users:                          2,
    max_jobs_per_month:                 50,
    max_phone_numbers:                  0,
    max_active_projects:                0,
    max_jobs_per_project:               0,
    max_project_team_members:           0,
    max_project_locations:              0,
  },
  solo: {
    can_create_multi_day_jobs:          true,
    can_manage_work_sessions:           true,
    can_create_projects:                false,
    can_manage_project_teams:           false,
    can_use_project_financials:         false,
    can_view_project_profitability:     false,
    can_use_project_change_orders:      false,
    can_use_project_progress_billing:   false,
    can_use_project_milestones:         false,
    can_use_project_templates:          false,
    can_use_multi_location_projects:    false,
    can_use_advanced_project_reporting: false,
    can_use_division_project_controls:  false,
    can_create_entities:                false,
    can_use_consolidated_reporting:     false,
    can_use_sms:                        false,
    max_users:                          null,
    max_jobs_per_month:                 null,
    max_phone_numbers:                  1,
    max_active_projects:                0,
    max_jobs_per_project:               0,
    max_project_team_members:           0,
    max_project_locations:              0,
  },
  pro: {
    can_create_multi_day_jobs:          true,
    can_manage_work_sessions:           true,
    can_create_projects:                true,
    can_manage_project_teams:           true,
    can_use_project_financials:         true,
    can_view_project_profitability:     false,
    can_use_project_change_orders:      true,
    can_use_project_progress_billing:   false,
    can_use_project_milestones:         false,
    can_use_project_templates:          false,
    can_use_multi_location_projects:    true,
    can_use_advanced_project_reporting: false,
    can_use_division_project_controls:  false,
    can_create_entities:                false,
    can_use_consolidated_reporting:     false,
    can_use_sms:                        true,
    max_users:                          null,
    max_jobs_per_month:                 null,
    max_phone_numbers:                  2,
    max_active_projects:                null,
    max_jobs_per_project:               null,
    max_project_team_members:           null,
    max_project_locations:              3,
  },
  scale: {
    can_create_multi_day_jobs:          true,
    can_manage_work_sessions:           true,
    can_create_projects:                true,
    can_manage_project_teams:           true,
    can_use_project_financials:         true,
    can_view_project_profitability:     true,
    can_use_project_change_orders:      true,
    can_use_project_progress_billing:   true,
    can_use_project_milestones:         true,
    can_use_project_templates:          true,
    can_use_multi_location_projects:    true,
    can_use_advanced_project_reporting: true,
    can_use_division_project_controls:  true,
    can_create_entities:                true,
    can_use_consolidated_reporting:     true,
    can_use_sms:                        true,
    max_users:                          null,
    max_jobs_per_month:                 null,
    max_phone_numbers:                  3,
    max_active_projects:                null,
    max_jobs_per_project:               null,
    max_project_team_members:           null,
    max_project_locations:              null,
  },
};

// Which plan unlocks each capability — used for upgrade messaging
const REQUIRED_PLAN = {
  can_create_multi_day_jobs:          'solo',
  can_manage_work_sessions:           'solo',
  can_create_projects:                'pro',
  can_manage_project_teams:           'pro',
  can_use_project_financials:         'pro',
  can_view_project_profitability:     'scale',
  can_use_project_change_orders:      'pro',
  can_use_project_progress_billing:   'scale',
  can_use_project_milestones:         'scale',
  can_use_project_templates:          'scale',
  can_use_multi_location_projects:    'pro',
  can_use_advanced_project_reporting: 'scale',
  can_use_division_project_controls:  'scale',
  can_create_entities:                'scale',
  can_use_consolidated_reporting:     'scale',
  can_use_sms:                        'pro',
};

const PLAN_NAMES = { starter: 'Starter', solo: 'Solo', pro: 'Pro', scale: 'Scale' };
const PLAN_ORDER = ['starter', 'solo', 'pro', 'scale'];

// ── In-memory cache ───────────────────────────────────────────────────────────
// Keyed by accountId. Entries expire after 5 minutes.
const _cache   = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function _cached(accountId) {
  const entry = _cache.get(accountId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(accountId); return null; }
  return entry.data;
}

function _store(accountId, data) {
  _cache.set(accountId, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

/** Invalidate the cache for one account — call after any plan/override change. */
function invalidate(accountId) {
  _cache.delete(accountId);
}

/** Invalidate all cached entitlements (e.g. after bulk plan migration). */
function invalidateAll() {
  _cache.clear();
}

// ── Core resolver ─────────────────────────────────────────────────────────────

/**
 * Compute the effective entitlements for an account.
 *
 * @param {string} accountId
 * @param {object} [opts]
 * @param {boolean} [opts.skipCache=false]   Force DB re-fetch
 * @returns {Promise<EntitlementResult>}
 */
async function getEntitlements(accountId, { skipCache = false } = {}) {
  if (!skipCache) {
    const hit = _cached(accountId);
    if (hit) return hit;
  }

  const { rows } = await pool.query(
    `SELECT plan, plan_status, trial_plan, trial_ends_at, feature_overrides
     FROM accounts WHERE id = $1`,
    [accountId]
  );
  if (!rows.length) throw new Error(`Account ${accountId} not found`);

  const row = rows[0];
  const basePlan = PLAN_ORDER.includes(row.plan) ? row.plan : 'starter';

  // Determine effective plan — trial wins if still active
  let effectivePlan = basePlan;
  if (
    row.trial_plan &&
    PLAN_ORDER.includes(row.trial_plan) &&
    row.trial_ends_at &&
    new Date(row.trial_ends_at) > new Date()
  ) {
    // Trial gives the higher of base plan or trial plan
    const trialIdx = PLAN_ORDER.indexOf(row.trial_plan);
    const baseIdx  = PLAN_ORDER.indexOf(basePlan);
    if (trialIdx > baseIdx) effectivePlan = row.trial_plan;
  }

  // Start from the effective plan's base capabilities
  const capabilities = { ...PLAN_CAPABILITIES[effectivePlan] };

  // Apply per-tenant overrides (grandfathering, beta, enterprise contracts)
  const overrides = row.feature_overrides || {};
  for (const [key, val] of Object.entries(overrides)) {
    if (key in capabilities) capabilities[key] = val;
  }

  // Active-work protection: past_due keeps full access so techs aren't stranded
  // (Stripe retries handle payment recovery; we don't punish field workers)
  const planStatus = row.plan_status || 'active';

  const result = {
    plan:          basePlan,
    effectivePlan,
    planStatus,
    trialPlan:     row.trial_plan || null,
    trialEndsAt:   row.trial_ends_at || null,
    hasOverrides:  Object.keys(overrides).length > 0,
    capabilities,
  };

  return _store(accountId, result);
}

/**
 * Check a single capability. Throws a structured 403-ready error if denied.
 *
 * @param {string} accountId
 * @param {string} capability  e.g. 'can_create_multi_day_jobs'
 */
async function requireCapability(accountId, capability) {
  const ent = await getEntitlements(accountId);
  if (ent.capabilities[capability]) return ent;

  const requiredPlan = REQUIRED_PLAN[capability] || 'pro';
  const err = new Error(`${PLAN_NAMES[requiredPlan] || requiredPlan} plan required for ${capability}`);
  err.statusCode   = 403;
  err.code         = 'ENTITLEMENT_REQUIRED';
  err.capability   = capability;
  err.requiredPlan = requiredPlan;
  err.currentPlan  = ent.plan;
  throw err;
}

module.exports = {
  PLAN_CAPABILITIES,
  REQUIRED_PLAN,
  PLAN_NAMES,
  PLAN_ORDER,
  getEntitlements,
  requireCapability,
  invalidate,
  invalidateAll,
};
