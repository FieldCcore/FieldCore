'use strict';

// calculationState values:
// complete | partial | policy_required | provider_required | insufficient_data | stale | unavailable | failed

/**
 * Build a structured provenance object describing how a metric was (or cannot be) calculated.
 */
function buildProvenance({
  metricKey = '',
  formula = '',
  formulaVersion = 'v1',
  sources = [],
  exclusions = [],
  assumptions = [],
  requiredPolicies = [],
  missingPolicies = [],
  requiredProviders = [],
  missingProviders = [],
  calculationState = 'complete',
  actualVsEstimated = 'actual',
  lastCalculatedAt = null,
  limitations = [],
} = {}) {
  return {
    metricKey,
    formula,
    formulaVersion,
    sources,
    exclusions,
    assumptions,
    requiredPolicies,
    missingPolicies,
    requiredProviders,
    missingProviders,
    calculationState,
    actualVsEstimated,
    lastCalculatedAt: lastCalculatedAt || new Date().toISOString(),
    limitations,
  };
}

/**
 * Map a simple status string to a calculationState value.
 */
function calculationStateFromStatus(status) {
  const map = {
    ok: 'complete',
    unavailable: 'unavailable',
    insufficient_data: 'insufficient_data',
    policy_required: 'policy_required',
    provider_required: 'provider_required',
    partial: 'partial',
    stale: 'stale',
    failed: 'failed',
  };
  return map[status] || 'complete';
}

module.exports = { buildProvenance, calculationStateFromStatus };
