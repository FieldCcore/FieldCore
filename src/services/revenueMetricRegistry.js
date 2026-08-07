'use strict';

// Revenue Metric Registry
// Defines what each metric needs to be computed. No policy decisions or calculations here.

const METRIC_REGISTRY = [
  {
    metricKey: 'collected_revenue',
    label: 'Collected Revenue',
    description: 'Total cash received from clients via payments and deposits in the period.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['deposits', 'invoices'],
    requiredPolicies: [],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_collected'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'available',
  },
  {
    metricKey: 'earned_revenue',
    label: 'Earned Revenue',
    description: 'Revenue recognized based on completed jobs or the configured recognition policy.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['jobs', 'invoices'],
    requiredPolicies: ['revenueRecognitionPolicy'],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_earned'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'policy_required',
  },
  {
    metricKey: 'gross_profit',
    label: 'Gross Profit',
    description: 'Earned revenue minus direct costs; requires cost tracking integration to compute.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['jobs', 'invoices', 'costs'],
    requiredPolicies: ['costInclusionPolicy'],
    requiredProviders: ['cost_tracking'],
    requiredPermissions: ['revenue.view_profit'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'provider_required',
  },
  {
    metricKey: 'outstanding_ar',
    label: 'Outstanding AR',
    description: 'Total value of issued invoices that have not yet been paid.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['invoices'],
    requiredPolicies: [],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_ar'],
    metricPolarity: 'lower_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'available',
  },
  {
    metricKey: 'projected_month_end',
    label: 'Projected Month-End Revenue',
    description: 'Estimated total revenue by end of current month based on the configured forecasting policy.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['jobs', 'invoices'],
    requiredPolicies: ['forecastingPolicy'],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_forecast'],
    metricPolarity: 'higher_is_better',
    supportsComparison: false,
    supportsDrilldown: false,
    calculationStatus: 'policy_required',
  },
  {
    metricKey: 'average_ticket',
    label: 'Average Ticket',
    description: 'Average revenue per completed job in the period.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['jobs'],
    requiredPolicies: [],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_earned'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'available',
  },
  {
    metricKey: 'revenue_per_labor_hour',
    label: 'Revenue per Labor Hour',
    description: 'Earned revenue divided by total scheduled job duration hours for completed jobs.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['jobs'],
    requiredPolicies: [],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_earned'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'available',
  },
  {
    metricKey: 'completion_rate',
    label: 'Job Completion Rate',
    description: 'Percentage of eligible jobs that were completed versus cancelled or lost.',
    format: 'percentage',
    formulaVersion: 'v1',
    dataSources: ['jobs'],
    requiredPolicies: [],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_earned'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'available',
  },
  {
    metricKey: 'technician_utilization',
    label: 'Technician Utilization',
    description: 'Ratio of billable hours worked to available workforce hours; requires workforce availability data.',
    format: 'percentage',
    formulaVersion: 'v1',
    dataSources: ['jobs', 'workforce_availability'],
    requiredPolicies: [],
    requiredProviders: ['workforce_availability'],
    requiredPermissions: ['revenue.view_operations'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'provider_required',
  },
  {
    metricKey: 'repeat_revenue',
    label: 'Repeat Client Revenue',
    description: 'Revenue earned from clients who had at least one prior completed job before the current period.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['jobs', 'clients'],
    requiredPolicies: [],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_customers'],
    metricPolarity: 'higher_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'available',
  },
  {
    metricKey: 'revenue_at_risk',
    label: 'Revenue at Risk',
    description: 'Combined value of overdue invoices, cancelled jobs, and failed payment attempts.',
    format: 'currency',
    formulaVersion: 'v1',
    dataSources: ['jobs', 'invoices', 'deposits'],
    requiredPolicies: [],
    requiredProviders: [],
    requiredPermissions: ['revenue.view_ar'],
    metricPolarity: 'lower_is_better',
    supportsComparison: true,
    supportsDrilldown: true,
    calculationStatus: 'available',
  },
];

// Build a lookup map keyed by metricKey for O(1) access
const METRIC_MAP = Object.fromEntries(METRIC_REGISTRY.map(m => [m.metricKey, m]));

/**
 * Get a single metric definition by key.
 * Returns undefined if not found.
 */
function getMetric(metricKey) {
  return METRIC_MAP[metricKey];
}

/**
 * Return all metrics as an array (safe copy).
 */
function listMetrics() {
  return METRIC_REGISTRY.slice();
}

/**
 * Return only metrics with calculationStatus === 'available'.
 */
function listAvailable() {
  return METRIC_REGISTRY.filter(m => m.calculationStatus === 'available');
}

/**
 * Return only metrics with calculationStatus === 'policy_required'.
 */
function listPolicyRequired() {
  return METRIC_REGISTRY.filter(m => m.calculationStatus === 'policy_required');
}

module.exports = { METRIC_REGISTRY, getMetric, listMetrics, listAvailable, listPolicyRequired };
