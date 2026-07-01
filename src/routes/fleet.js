const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

// ── GET /api/fleet/cameras/:vehicleId ────────────────────────────────────────
// Returns camera records for a vehicle from fleet_vehicle_cameras.
// If the table does not yet exist (pg error 42P01) returns empty provider_connected: false.
//
// fleet_vehicle_cameras schema (run this migration when a camera provider is connected):
//
//   CREATE TABLE fleet_vehicle_cameras (
//     id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     entity_id          UUID NOT NULL REFERENCES accounts(id),
//     vehicle_id         UUID NOT NULL REFERENCES fleet_vehicles(id),
//     integration_id     UUID,                   -- FK to future integrations table
//     provider           TEXT,                   -- 'samsara' | 'motive' | 'geotab' | 'verizon_connect' | 'azuga' | 'fleetio' | 'generic'
//     camera_position    TEXT NOT NULL,          -- 'front' | 'cab' | 'rear'
//     external_camera_id TEXT,                   -- provider's camera ID (used to fetch fresh stream tokens)
//     external_vehicle_id TEXT,                  -- provider's vehicle ID
//     -- NOTE: Do NOT store raw stream_url long-term; many providers issue short-lived signed URLs.
//     -- Instead, store external_camera_id and fetch a fresh URL from the provider API on each request.
//     -- snapshot_url is acceptable if it is a stable provider-hosted thumbnail URL.
//     snapshot_url       TEXT,
//     stream_url         TEXT,                   -- short-lived; regenerate via provider API before use
//     status             TEXT DEFAULT 'unknown', -- 'online' | 'offline' | 'error' | 'unknown'
//     last_online_at     TIMESTAMPTZ,
//     created_at         TIMESTAMPTZ DEFAULT NOW(),
//     updated_at         TIMESTAMPTZ DEFAULT NOW(),
//     UNIQUE (vehicle_id, camera_position)
//   );
//
// Permission: fleet.camera.view — owner, manager only (admin when role is formalized).
router.get('/cameras/:vehicleId', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { vehicleId } = req.params;
  try {
    // Verify vehicle belongs to this account
    const { rows: vRows } = await pool.query(
      `SELECT id FROM fleet_vehicles WHERE id = $1 AND account_id = $2`,
      [vehicleId, req.accountId]
    );
    if (!vRows.length) return res.status(404).json({ error: 'Vehicle not found.' });

    let cameras = [];
    let providerConnected = false;
    let lastUpdatedAt = null;

    try {
      const { rows } = await pool.query(
        `SELECT id, vehicle_id, provider, camera_position, external_camera_id,
                snapshot_url, stream_url, status, last_online_at, updated_at
         FROM fleet_vehicle_cameras
         WHERE vehicle_id = $1 AND entity_id = $2
         ORDER BY CASE camera_position WHEN 'front' THEN 1 WHEN 'cab' THEN 2 WHEN 'rear' THEN 3 ELSE 4 END`,
        [vehicleId, req.accountId]
      );
      cameras = rows;
      providerConnected = rows.some(c => c.provider != null);
      lastUpdatedAt = rows.length ? rows[0].updated_at : null;
    } catch (tableErr) {
      if (tableErr.code !== '42P01') throw tableErr; // 42P01 = table does not exist
    }

    res.json({ vehicle_id: vehicleId, cameras, provider_connected: providerConnected, last_updated_at: lastUpdatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fleet/tech-locations — last GPS check-in per tech for today
router.get('/tech-locations', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (j.tech_id)
         j.tech_id,
         u.name  AS tech_name,
         j.checkin_lat,
         j.checkin_lng,
         j.checkin_at,
         j.service_type,
         j.id AS job_id
       FROM jobs j
       JOIN users u ON u.id = j.tech_id
       WHERE j.account_id = $1
         AND j.checkin_lat IS NOT NULL
         AND j.checkin_at::date = CURRENT_DATE
       ORDER BY j.tech_id, j.checkin_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fleet
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.name AS tech_name
       FROM fleet_vehicles f
       LEFT JOIN users u ON u.id = f.tech_id
       WHERE f.account_id = $1
       ORDER BY f.created_at DESC`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fleet
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { make, model, plate, year, tech_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO fleet_vehicles (account_id, make, model, plate, year, tech_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.accountId, make || null, model || null, plate || null, year || null, tech_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fleet/:id
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { make, model, plate, year, tech_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE fleet_vehicles SET make=$1, model=$2, plate=$3, year=$4, tech_id=$5
       WHERE id=$6 AND account_id=$7 RETURNING *`,
      [make || null, model || null, plate || null, year || null, tech_id || null, req.params.id, req.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fleet/:id
router.delete('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM fleet_vehicles WHERE id=$1 AND account_id=$2`,
      [req.params.id, req.accountId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
