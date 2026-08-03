'use strict';
const pool = require('../db/pool');

const EARTH_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Returns the technician's jobs for a given date in route_order sequence.
 * Falls back to scheduled_at ordering when route_order is null.
 * Includes straight-line distance between consecutive stops.
 */
async function getRouteForTech({ accountId, techId, dateLocal, timezone = 'UTC' }) {
  const safeDate = dateLocal && /^\d{4}-\d{2}-\d{2}$/.test(dateLocal)
    ? dateLocal
    : new Date().toISOString().split('T')[0];

  const { rows: jobs } = await pool.query(
    `SELECT j.id, j.tech_id, j.service_type, j.status,
            j.scheduled_at, j.duration_minutes, j.route_order,
            j.service_lat, j.service_lng, j.service_address, j.service_city,
            j.amount,
            c.name AS client_name
     FROM jobs j
     JOIN clients c ON c.id = j.client_id
     WHERE j.account_id = $1
       AND j.tech_id    = $2
       AND j.status NOT IN ('cancelled','no_show','draft')
       AND (j.scheduled_at AT TIME ZONE $3)::date = $4::date
     ORDER BY
       CASE WHEN j.route_order IS NOT NULL THEN j.route_order ELSE 999999 END,
       j.scheduled_at NULLS LAST`,
    [accountId, techId, timezone, safeDate]
  );

  let totalDistanceKm = 0;
  const jobsWithMeta = jobs.map((job, idx) => {
    let distanceFromPrevKm = null;
    if (idx > 0) {
      const prev = jobs[idx - 1];
      if (prev.service_lat && prev.service_lng && job.service_lat && job.service_lng) {
        const d = haversineKm(
          parseFloat(prev.service_lat), parseFloat(prev.service_lng),
          parseFloat(job.service_lat),  parseFloat(job.service_lng)
        );
        distanceFromPrevKm = +d.toFixed(2);
        totalDistanceKm   += d;
      }
    }
    return { ...job, routePosition: idx + 1, distanceFromPrevKm };
  });

  return {
    techId,
    dateLocal: safeDate,
    jobs:      jobsWithMeta,
    totalDistanceKm: +totalDistanceKm.toFixed(2),
    jobCount:  jobs.length,
  };
}

/**
 * Saves route_order for a technician's jobs by position in the provided jobIds array.
 * Only updates jobs that belong to the account + technician (safety check).
 * Returns the number of jobs updated.
 */
async function saveRoute({ accountId, techId, jobIds }) {
  if (!jobIds?.length) return 0;

  const { rows: valid } = await pool.query(
    `SELECT id FROM jobs
     WHERE account_id = $1 AND tech_id = $2 AND id = ANY($3::uuid[])`,
    [accountId, techId, jobIds]
  );
  const validSet = new Set(valid.map(r => r.id));

  let updated = 0;
  for (let i = 0; i < jobIds.length; i++) {
    const id = jobIds[i];
    if (!validSet.has(id)) continue;
    await pool.query(
      `UPDATE jobs SET route_order = $1 WHERE id = $2 AND account_id = $3`,
      [i + 1, id, accountId]
    );
    updated++;
  }
  return updated;
}

module.exports = { getRouteForTech, saveRoute };
