'use strict';
const pool = require('../db/pool');

const EARTH_KM      = 6371;
const AVG_SPEED_KMH = 56;   // ~35 mph — conservative city/suburban average
const AT_RISK_BUFFER_MIN = 15; // within 15 min of being late → at_risk

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Predicts delay status for all field-eligible, dispatch-visible technicians
 * who have a GPS fix and an upcoming unstarted job today.
 *
 * @param {{ accountId, dateLocal, timezone }} options
 * @returns {Promise<DelayPrediction[]>}
 */
async function predictDelays({ accountId, dateLocal, timezone = 'UTC' }) {
  const safeDate = dateLocal && /^\d{4}-\d{2}-\d{2}$/.test(dateLocal)
    ? dateLocal
    : new Date().toISOString().split('T')[0];

  // All field-eligible dispatch-visible techs with a current GPS fix
  const { rows: techsWithLoc } = await pool.query(
    `SELECT u.id, u.name, u.is_available, u.operational_status,
            tl.lat, tl.lng, tl.updated_at AS loc_updated_at
     FROM users u
     JOIN tech_locations tl ON tl.user_id = u.id AND tl.account_id = $1
     WHERE u.account_id         = $1
       AND u.field_work_eligible = TRUE
       AND u.dispatch_visible    = TRUE`,
    [accountId]
  );
  if (!techsWithLoc.length) return [];

  const techIds = techsWithLoc.map(t => t.id);

  // Their next unstarted scheduled job today (per tech)
  const { rows: nextJobs } = await pool.query(
    `SELECT DISTINCT ON (j.tech_id)
       j.id, j.tech_id, j.service_type, j.scheduled_at,
       j.service_lat, j.service_lng,
       c.name AS client_name
     FROM jobs j
     JOIN clients c ON c.id = j.client_id
     WHERE j.account_id = $1
       AND j.tech_id    = ANY($2::uuid[])
       AND j.status     = 'scheduled'
       AND j.scheduled_at IS NOT NULL
       AND j.scheduled_at >= NOW() - INTERVAL '30 minutes'
       AND (j.scheduled_at AT TIME ZONE $3)::date = $4::date
       AND j.service_lat IS NOT NULL
       AND j.service_lng IS NOT NULL
     ORDER BY j.tech_id, j.scheduled_at ASC`,
    [accountId, techIds, timezone, safeDate]
  );

  const nextJobByTech = Object.fromEntries(nextJobs.map(j => [j.tech_id, j]));
  const now           = Date.now();

  return techsWithLoc.map(tech => {
    const job = nextJobByTech[tech.id];

    if (!job) {
      return { techId: tech.id, techName: tech.name, status: 'no_upcoming_job', nextJobId: null };
    }
    if (!tech.lat || !tech.lng) {
      return { techId: tech.id, techName: tech.name, status: 'no_location', nextJobId: job.id };
    }

    const distanceKm           = haversineKm(
      parseFloat(tech.lat), parseFloat(tech.lng),
      parseFloat(job.service_lat), parseFloat(job.service_lng)
    );
    const estimatedTravelMin   = (distanceKm / AVG_SPEED_KMH) * 60;
    const scheduledAt          = new Date(job.scheduled_at).getTime();
    const minutesUntilScheduled = (scheduledAt - now) / 60000;

    let status;
    let delayMinutes = 0;

    if (minutesUntilScheduled < 0) {
      // Job start time already passed
      const lateBy = -minutesUntilScheduled + estimatedTravelMin;
      delayMinutes = Math.round(lateBy);
      status       = 'delayed';
    } else if (estimatedTravelMin > minutesUntilScheduled + AT_RISK_BUFFER_MIN) {
      delayMinutes = Math.round(estimatedTravelMin - minutesUntilScheduled);
      status       = 'delayed';
    } else if (estimatedTravelMin > minutesUntilScheduled) {
      delayMinutes = Math.round(estimatedTravelMin - minutesUntilScheduled);
      status       = 'at_risk';
    } else {
      status = 'on_time';
    }

    return {
      techId:                 tech.id,
      techName:               tech.name,
      status,
      nextJobId:              job.id,
      nextJobClientName:      job.client_name,
      nextJobServiceType:     job.service_type,
      nextJobScheduledAt:     job.scheduled_at,
      minutesUntilScheduled:  Math.round(minutesUntilScheduled),
      estimatedTravelMinutes: Math.round(estimatedTravelMin),
      distanceKm:             +distanceKm.toFixed(2),
      delayMinutes:           Math.max(0, delayMinutes),
      locUpdatedAt:           tech.loc_updated_at,
    };
  });
}

module.exports = { predictDelays };
