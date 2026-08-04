'use strict';
/**
 * Predictive Operations Foundation Service
 *
 * Calculates data readiness for future predictive analytics features.
 * Reads from real FieldCore job/assignment data only — never invents events.
 *
 * Does NOT implement:
 *   - Best Tech recommendations
 *   - Technician ranking
 *   - Automated assignment
 *   - User-facing predictions
 */
const pool = require('../db/pool');

const MIN_JOBS_FOR_BASELINE     = 20;
const MIN_JOBS_FOR_PREDICTIONS  = 100;
const MIN_WEEKS_FOR_BASELINE    = 4;
const MIN_COMPLETENESS_BASELINE = 0.60; // 60% of completed jobs must have actual duration

const CAPABILITIES = [
  {
    key:          'service_duration_forecasting',
    label:        'Service Duration Forecasting',
    requires:     ['actual_duration_coverage', 'completed_job_count', 'service_type_coverage'],
    thresholds:   { actual_duration_coverage: 0.65, completed_job_count: MIN_JOBS_FOR_BASELINE },
  },
  {
    key:          'delay_risk',
    label:        'Delay Risk',
    requires:     ['location_coverage', 'completed_job_count'],
    thresholds:   { location_coverage: 0.70, completed_job_count: MIN_JOBS_FOR_BASELINE },
  },
  {
    key:          'workload_risk',
    label:        'Workload Risk',
    requires:     ['assignment_coverage', 'completed_job_count'],
    thresholds:   { assignment_coverage: 0.75, completed_job_count: MIN_JOBS_FOR_BASELINE },
  },
  {
    key:          'cancellation_trends',
    label:        'Cancellation Trends',
    requires:     ['completed_job_count', 'history_weeks'],
    thresholds:   { completed_job_count: MIN_JOBS_FOR_PREDICTIONS, history_weeks: 8 },
  },
  {
    key:          'service_area_efficiency',
    label:        'Service-Area Efficiency',
    requires:     ['location_coverage', 'completed_job_count'],
    thresholds:   { location_coverage: 0.80, completed_job_count: MIN_JOBS_FOR_BASELINE },
  },
  {
    key:          'revenue_efficiency',
    label:        'Revenue Efficiency',
    requires:     ['completed_job_count', 'assignment_coverage'],
    thresholds:   { completed_job_count: MIN_JOBS_FOR_BASELINE },
  },
];

async function getReadiness(accountId) {
  const [stats, historyRow] = await Promise.all([
    _getJobStats(accountId),
    _getHistoryWeeks(accountId),
  ]);

  const historyWeeks        = historyRow.weeks || 0;
  const completedCount      = parseInt(stats.completed_count || 0, 10);
  const totalCount          = parseInt(stats.total_count || 0, 10);
  const withLocation        = parseInt(stats.with_location || 0, 10);
  const withAssignment      = parseInt(stats.with_assignment || 0, 10);
  const withActualDuration  = parseInt(stats.with_actual_duration || 0, 10);
  const withServiceType     = parseInt(stats.with_service_type || 0, 10);
  const emergencyCount      = parseInt(stats.emergency_count || 0, 10);

  const locationCoverage       = totalCount ? withLocation / totalCount : 0;
  const assignmentCoverage     = totalCount ? withAssignment / totalCount : 0;
  const actualDurationCoverage = completedCount ? withActualDuration / completedCount : 0;
  const serviceTypeCoverage    = totalCount ? withServiceType / totalCount : 0;

  const dataCompleteness = {
    completed_job_count:      completedCount,
    total_job_count:          totalCount,
    history_weeks:            Math.round(historyWeeks * 10) / 10,
    location_coverage:        Math.round(locationCoverage * 100),
    assignment_coverage:      Math.round(assignmentCoverage * 100),
    actual_duration_coverage: Math.round(actualDurationCoverage * 100),
    service_type_coverage:    Math.round(serviceTypeCoverage * 100),
    emergency_count:          emergencyCount,
  };

  // Quality issues
  const qualityIssues = [];
  const missingActualDuration = completedCount - withActualDuration;
  if (missingActualDuration > 0) {
    qualityIssues.push({ issue: 'missing_actual_duration', affectedCount: missingActualDuration, label: 'Completed jobs missing actual duration' });
  }
  if (locationCoverage < 0.70) {
    qualityIssues.push({ issue: 'low_location_coverage', affectedCount: totalCount - withLocation, label: 'Jobs missing location data' });
  }
  if (assignmentCoverage < 0.50) {
    qualityIssues.push({ issue: 'low_assignment_coverage', affectedCount: totalCount - withAssignment, label: 'Jobs never assigned to a technician' });
  }

  // Readiness state
  let readinessState = 'insufficient_data';
  let readinessScore = 0;
  const explanation  = [];

  // Score components (max 100)
  const jobScore      = Math.min((completedCount / MIN_JOBS_FOR_BASELINE) * 30, 30);
  const weekScore     = Math.min((historyWeeks / MIN_WEEKS_FOR_BASELINE) * 20, 20);
  const durScore      = Math.round(actualDurationCoverage * 25);
  const locScore      = Math.round(locationCoverage * 15);
  const assignScore   = Math.round(assignmentCoverage * 10);
  readinessScore = Math.round(jobScore + weekScore + durScore + locScore + assignScore);

  if (completedCount < MIN_JOBS_FOR_BASELINE) {
    explanation.push(`${completedCount} of ${MIN_JOBS_FOR_BASELINE} minimum completed jobs collected`);
  }
  if (historyWeeks < MIN_WEEKS_FOR_BASELINE) {
    explanation.push(`${Math.round(historyWeeks)} of ${MIN_WEEKS_FOR_BASELINE} weeks of operational history`);
  }
  if (actualDurationCoverage < MIN_COMPLETENESS_BASELINE) {
    explanation.push(`Actual duration available for ${Math.round(actualDurationCoverage * 100)}% of completed jobs (need 60%+)`);
  }
  if (locationCoverage < 0.70) {
    explanation.push(`Location data available for ${Math.round(locationCoverage * 100)}% of jobs (need 70%+)`);
  }

  if (readinessScore >= 80) {
    readinessState = 'ready_for_advanced_predictions';
  } else if (readinessScore >= 60) {
    readinessState = 'ready_for_limited_predictions';
  } else if (readinessScore >= 40) {
    readinessState = 'ready_for_baseline_analytics';
  } else if (qualityIssues.length > 3) {
    readinessState = 'needs_data_cleanup';
  } else if (totalCount > 0) {
    readinessState = 'collecting';
  } else {
    readinessState = 'insufficient_data';
  }

  // Per-capability readiness
  const capabilityReadiness = {};
  const metricsMap = {
    actual_duration_coverage:  actualDurationCoverage,
    completed_job_count:       completedCount,
    location_coverage:         locationCoverage,
    assignment_coverage:       assignmentCoverage,
    service_type_coverage:     serviceTypeCoverage,
    history_weeks:             historyWeeks,
  };

  for (const cap of CAPABILITIES) {
    const met = cap.thresholds;
    let ready = true;
    const blockers = [];
    for (const [key, threshold] of Object.entries(met)) {
      const val = metricsMap[key] ?? 0;
      if (val < threshold) {
        ready = false;
        if (typeof threshold === 'number' && threshold >= 1) {
          blockers.push(`${key.replace(/_/g, ' ')}: ${Math.round(val)} / ${threshold}`);
        } else {
          blockers.push(`${key.replace(/_/g, ' ')}: ${Math.round(val * 100)}% / ${Math.round(threshold * 100)}%`);
        }
      }
    }
    capabilityReadiness[cap.key] = {
      label:   cap.label,
      ready,
      state:   ready ? 'ready' : 'insufficient_data',
      blockers,
    };
  }

  return {
    enabled:          true,
    frontendReady:    true,
    backendReady:     true,
    collectionActive: true,
    readinessState,
    readinessScore,
    usableJobCount:        completedCount,
    minimumRequiredJobs:   MIN_JOBS_FOR_BASELINE,
    dataCompleteness,
    qualityIssues,
    capabilityReadiness,
    explanation,
    generatedAt: new Date().toISOString(),
  };
}

async function _getJobStats(accountId) {
  const { rows: [stats] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('draft','cancelled'))                          AS total_count,
       COUNT(*) FILTER (WHERE status = 'complete')                                          AS completed_count,
       COUNT(*) FILTER (WHERE service_lat IS NOT NULL AND service_lng IS NOT NULL)          AS with_location,
       COUNT(*) FILTER (WHERE tech_id IS NOT NULL)                                          AS with_assignment,
       COUNT(*) FILTER (WHERE status = 'complete' AND duration_minutes IS NOT NULL
                              AND duration_minutes > 0)                                     AS with_actual_duration,
       COUNT(*) FILTER (WHERE service_type IS NOT NULL AND service_type != '')              AS with_service_type,
       COUNT(*) FILTER (WHERE is_emergency = TRUE)                                          AS emergency_count
     FROM jobs
     WHERE account_id = $1`,
    [accountId],
  );
  return stats || {};
}

async function _getHistoryWeeks(accountId) {
  const { rows: [row] } = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 604800 AS weeks
     FROM jobs
     WHERE account_id = $1 AND status NOT IN ('draft','cancelled')`,
    [accountId],
  );
  return row || { weeks: 0 };
}

async function getDataQuality(accountId) {
  const readiness = await getReadiness(accountId);
  return {
    qualityIssues: readiness.qualityIssues,
    dataCompleteness: readiness.dataCompleteness,
    generatedAt: readiness.generatedAt,
  };
}

async function getCapabilities(accountId) {
  const readiness = await getReadiness(accountId);
  return {
    capabilities: readiness.capabilityReadiness,
    readinessScore: readiness.readinessScore,
    generatedAt: readiness.generatedAt,
  };
}

async function recalculate(accountId) {
  const readiness = await getReadiness(accountId);
  // Upsert the cache
  await pool.query(
    `INSERT INTO predictive_readiness_cache
       (account_id, readiness_state, readiness_score, collection_active, usable_job_count,
        data_completeness, quality_issues, capability_readiness, explanation, calculated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       readiness_state      = EXCLUDED.readiness_state,
       readiness_score      = EXCLUDED.readiness_score,
       collection_active    = EXCLUDED.collection_active,
       usable_job_count     = EXCLUDED.usable_job_count,
       data_completeness    = EXCLUDED.data_completeness,
       quality_issues       = EXCLUDED.quality_issues,
       capability_readiness = EXCLUDED.capability_readiness,
       explanation          = EXCLUDED.explanation,
       calculated_at        = NOW()`,
    [
      accountId,
      readiness.readinessState, readiness.readinessScore, readiness.collectionActive,
      readiness.usableJobCount,
      JSON.stringify(readiness.dataCompleteness),
      JSON.stringify(readiness.qualityIssues),
      JSON.stringify(readiness.capabilityReadiness),
      JSON.stringify(readiness.explanation),
    ],
  );
  return readiness;
}

module.exports = { getReadiness, getDataQuality, getCapabilities, recalculate };
