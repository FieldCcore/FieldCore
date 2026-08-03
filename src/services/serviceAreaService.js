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
 * Returns all active service areas for the account.
 */
async function getServiceAreas({ accountId }) {
  const { rows } = await pool.query(
    `SELECT * FROM service_areas
     WHERE account_id = $1 AND is_active = TRUE
     ORDER BY created_at`,
    [accountId]
  );
  return rows;
}

/**
 * Returns the active service area assigned to a specific technician (if any).
 */
async function getTechServiceArea({ accountId, techId }) {
  const { rows } = await pool.query(
    `SELECT * FROM service_areas
     WHERE account_id = $1 AND tech_id = $2 AND is_active = TRUE
     LIMIT 1`,
    [accountId, techId]
  );
  return rows[0] || null;
}

/**
 * Returns true if the job coordinates fall within the service area boundary.
 * Returns true when no area is configured (no constraint).
 */
function isJobInArea(area, jobLat, jobLng) {
  if (!area) return true;
  if (!jobLat || !jobLng) return true; // no coords = can't check, don't block
  if (area.type === 'radius') {
    if (!area.center_lat || !area.center_lng || !area.radius_km) return true;
    const dist = haversineKm(
      parseFloat(area.center_lat), parseFloat(area.center_lng),
      parseFloat(jobLat),          parseFloat(jobLng)
    );
    return dist <= parseFloat(area.radius_km);
  }
  return true; // polygon reserved for future phase
}

/**
 * Creates a new service area for the account.
 */
async function createServiceArea({ accountId, techId, name, type = 'radius', centerLat, centerLng, radiusKm }) {
  const { rows: [area] } = await pool.query(
    `INSERT INTO service_areas (account_id, tech_id, name, type, center_lat, center_lng, radius_km)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [accountId, techId || null, name || null, type, centerLat || null, centerLng || null, radiusKm || null]
  );
  return area;
}

/**
 * Updates a service area. Only updates provided fields.
 */
async function updateServiceArea({ accountId, areaId, name, centerLat, centerLng, radiusKm, isActive }) {
  const { rows: [area] } = await pool.query(
    `UPDATE service_areas
     SET name       = COALESCE($3, name),
         center_lat = COALESCE($4::numeric, center_lat),
         center_lng = COALESCE($5::numeric, center_lng),
         radius_km  = COALESCE($6::numeric, radius_km),
         is_active  = COALESCE($7, is_active)
     WHERE account_id = $1 AND id = $2
     RETURNING *`,
    [accountId, areaId,
     name     ?? null,
     centerLat  != null ? centerLat  : null,
     centerLng  != null ? centerLng  : null,
     radiusKm   != null ? radiusKm   : null,
     isActive   != null ? isActive   : null]
  );
  return area || null;
}

/**
 * Hard-deletes a service area record.
 */
async function deleteServiceArea({ accountId, areaId }) {
  const { rowCount } = await pool.query(
    `DELETE FROM service_areas WHERE account_id = $1 AND id = $2`,
    [accountId, areaId]
  );
  return rowCount > 0;
}

module.exports = {
  getServiceAreas,
  getTechServiceArea,
  isJobInArea,
  createServiceArea,
  updateServiceArea,
  deleteServiceArea,
};
