/**
 * Shared semantic chart color tokens for the Revenue module.
 * All Revenue workspaces (Overview, Financials, Operations, Customers,
 * Forecasting, Reports) must import colors from here — never hardcode.
 *
 * Page-shell colors remain FieldCore-branded (navy, sand).
 * Data-series colors follow financial visualization conventions.
 */

export const CHART = {
  // ── Revenue ────────────────────────────────────────────────────────────────
  earnedRevenue:     '#2563EB',   // blue
  collectedRevenue:  '#0F9D8A',   // teal
  grossRevenue:      '#3B82F6',   // medium blue
  netRevenue:        '#1D4ED8',   // dark blue

  // ── Profit ─────────────────────────────────────────────────────────────────
  grossProfit:       '#16A34A',   // green
  operatingProfit:   '#22C55E',   // medium green
  netProfit:         '#15803D',   // dark green

  // ── Loss (negative profit) ─────────────────────────────────────────────────
  grossLoss:         '#B91C1C',   // dark red
  netLoss:           '#991B1B',   // darker red
  losses:            '#B91C1C',

  // ── Forecast & projection ──────────────────────────────────────────────────
  projectedRevenue:  '#7C3AED',   // purple
  forecastBand:      'rgba(124, 58, 237, 0.14)',
  bestCase:          '#16A34A',   // green line
  worstCase:         '#DC2626',   // red line
  target:            '#374151',   // charcoal dashed

  // ── Receivables ────────────────────────────────────────────────────────────
  outstandingAR:     '#D97706',   // amber
  overdueAR:         '#EA580C',   // orange
  severelyOverdueAR: '#DC2626',   // red

  // ── Costs & expenses ───────────────────────────────────────────────────────
  operatingExpenses: '#F59E0B',   // amber
  directCosts:       '#C2410C',   // burnt orange
  laborCost:         '#4F46E5',   // indigo
  materialCost:      '#CA8A04',   // gold
  travelCost:        '#B45309',   // brown-orange
  merchantFees:      '#6B7280',   // gray
  taxes:             '#6D28D9',   // violet

  // ── Negative adjustments ───────────────────────────────────────────────────
  refunds:           '#DC2626',   // red
  discounts:         '#E11D48',   // rose
  credits:           '#DB2777',   // magenta

  // ── Customer states ────────────────────────────────────────────────────────
  recurringRevenue:  '#0891B2',   // cyan
  oneTimeRevenue:    '#64748B',   // blue-gray
  newCustomers:      '#2563EB',   // blue
  returningCustomers:'#0F9D8A',   // teal
  atRiskCustomers:   '#D97706',   // amber
  churnedCustomers:  '#DC2626',   // red

  // ── Comparison & previous period ───────────────────────────────────────────
  previousPeriod:    '#9CA3AF',   // neutral gray
  previousYear:      '#CBD5E1',   // light gray
  comparisonNeutral: '#6B7280',

  // ── Variance ───────────────────────────────────────────────────────────────
  positiveVariance:  '#16A34A',
  negativeVariance:  '#DC2626',
  neutralVariance:   '#6B7280',

  // ── Operational states ─────────────────────────────────────────────────────
  healthy:           '#16A34A',   // green
  nearCapacity:      '#D97706',   // amber
  overloaded:        '#DC2626',   // red
  unavailable:       '#9CA3AF',   // gray

  // ── Completion ─────────────────────────────────────────────────────────────
  completed:         '#16A34A',
  incomplete:        '#D97706',
  cancelled:         '#DC2626',
  noShow:            '#EA580C',
};

/**
 * Colorblind-safe categorical palette for service, technician,
 * crew, and segment charts. Assign by stable index; do not reassign
 * on re-render.
 */
export const CATEGORICAL = [
  '#2563EB',  // blue
  '#0F9D8A',  // teal
  '#7C3AED',  // purple
  '#D97706',  // amber
  '#0891B2',  // cyan
  '#DB2777',  // pink
  '#64748B',  // slate
  '#16A34A',  // green
];

/**
 * Metric polarity — whether a higher or lower value represents a
 * positive outcome. Used to choose variance arrow color correctly.
 * Do not assume every increase is positive (e.g., expenses).
 */
export const POLARITY = {
  earnedRevenue:     'higher_is_better',
  collectedRevenue:  'higher_is_better',
  grossProfit:       'higher_is_better',
  operatingProfit:   'higher_is_better',
  netProfit:         'higher_is_better',
  completionRate:    'higher_is_better',
  recurringRevenue:  'higher_is_better',
  outstandingAR:     'lower_is_better',
  refunds:           'lower_is_better',
  discounts:         'lower_is_better',
  operatingExpenses: 'lower_is_better',
  directCosts:       'lower_is_better',
  laborCost:         'neutral',
  merchantFees:      'lower_is_better',
};

/**
 * Return the correct variance color for a metric and direction.
 * pctChange > 0 means the value went up; the polarity decides if that is good.
 */
export function varianceColor(metricKey, pctChange) {
  if (pctChange === 0 || pctChange == null) return CHART.neutralVariance;
  const pol = POLARITY[metricKey] ?? 'higher_is_better';
  if (pol === 'neutral') return CHART.neutralVariance;
  const isGood = pol === 'higher_is_better' ? pctChange > 0 : pctChange < 0;
  return isGood ? CHART.positiveVariance : CHART.negativeVariance;
}

/**
 * Return a categorical color by stable index.
 * Cycle the palette only if there are more categories than colors.
 */
export function categoricalColor(index) {
  return CATEGORICAL[index % CATEGORICAL.length];
}
