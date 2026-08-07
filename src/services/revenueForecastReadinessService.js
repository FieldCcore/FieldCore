'use strict';
const pool = require('../db/pool');

/**
 * Check readiness for forecasting WITHOUT generating any forecasts.
 * No AI is used. No forecasts are produced by this function.
 *
 * @param {string} accountId - The tenant account UUID
 * @param {object} options
 * @param {number} [options.year] - Calendar year to evaluate (defaults to current UTC year)
 * @param {object} [options.policies] - Policy settings from revenuePoliciesService.getPolicies()
 * @returns {object} Readiness report
 */
async function getForecastReadiness(accountId, { year, policies } = {}) {
  const targetYear = year || new Date().getUTCFullYear();

  // Count distinct months in targetYear that have at least one completed job
  const histResult = await pool.query(
    `SELECT COUNT(DISTINCT DATE_TRUNC('month', scheduled_at AT TIME ZONE 'UTC'))::int AS months
     FROM jobs WHERE account_id = $1 AND status = 'complete'
     AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'UTC') = $2`,
    [accountId, targetYear]
  );
  const monthsWithData = histResult.rows[0]?.months || 0;

  // Count completed jobs in targetYear for rate stability check
  const volumeResult = await pool.query(
    `SELECT COUNT(*)::int FILTER (WHERE status = 'complete') AS completed
     FROM jobs WHERE account_id = $1
     AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'UTC') = $2`,
    [accountId, targetYear]
  );
  const completedJobs = volumeResult.rows[0]?.completed || 0;

  const policyConfigured = !!policies?.forecasting_policy;
  const recognitionConfigured = !!policies?.revenue_recognition_policy;

  const items = [
    {
      key: 'history_sufficient',
      label: 'Historical data (3+ months with jobs)',
      met: monthsWithData >= 3,
      value: `${monthsWithData} month(s)`,
    },
    {
      key: 'revenue_recognition_policy',
      label: 'Revenue recognition policy configured',
      met: recognitionConfigured,
      value: policies?.revenue_recognition_policy || null,
    },
    {
      key: 'forecasting_policy',
      label: 'Forecasting method configured',
      met: policyConfigured,
      value: policies?.forecasting_policy || null,
    },
    {
      key: 'job_volume',
      label: 'Sufficient job volume (10+ completed this year)',
      met: completedJobs >= 10,
      value: `${completedJobs} completed`,
    },
  ];

  const missingPolicies = [];
  if (!recognitionConfigured) missingPolicies.push('revenueRecognitionPolicy');
  if (!policyConfigured) missingPolicies.push('forecastingPolicy');

  const metCount = items.filter(i => i.met).length;
  const score = Math.round((metCount / items.length) * 100);
  const ready = items.every(i => i.met);

  const needs = [];
  if (!recognitionConfigured) needs.push('revenue recognition policy');
  if (!policyConfigured) needs.push('forecasting method');
  if (monthsWithData < 3) needs.push(`${Math.max(0, 3 - monthsWithData)} more month(s) of job history`);
  if (completedJobs < 10) needs.push(`${Math.max(0, 10 - completedJobs)} more completed jobs`);

  return {
    ready,
    score,
    year: targetYear,
    items,
    missingPolicies,
    message: ready
      ? 'Forecasting is ready to be enabled.'
      : `To enable forecasting: ${needs.join('; ')}.`,
    disclaimer:
      'No forecasts are generated until readiness criteria are met and forecasting policy is configured. No AI is used.',
  };
}

module.exports = { getForecastReadiness };
