const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_AREA_TYPES = ['business_address', 'radius', 'postal_codes', 'custom_center'];

// GET /api/dispatch-settings
// Returns dispatch_settings for this tenant merged with account location for fallback.
router.get('/', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  try {
    const [settingsRes, accountRes] = await Promise.all([
      pool.query('SELECT * FROM dispatch_settings WHERE account_id = $1', [accountId]),
      pool.query(
        `SELECT a.lat, a.lng, a.address, a.city, a.state, a.zip,
                bp.timezone, bp.address AS bp_address, bp.city AS bp_city,
                bp.state AS bp_state, bp.zip AS bp_zip
         FROM accounts a
         LEFT JOIN business_profiles bp ON bp.account_id = a.id
         WHERE a.id = $1`,
        [accountId]
      ),
    ]);

    const account  = accountRes.rows[0] || {};
    const settings = settingsRes.rows[0] || {
      account_id:                     accountId,
      dispatch_service_area_type:     'business_address',
      dispatch_default_zoom:          11,
      dispatch_auto_fit_live_techs:   true,
      dispatch_auto_fit_today_jobs:   true,
      dispatch_include_scheduled:     true,
      dispatch_include_completed:     false,
      dispatch_include_cancelled:     false,
      dispatch_center_lat:            null,
      dispatch_center_lng:            null,
      dispatch_service_radius_miles:  null,
      dispatch_preferred_postal_codes: null,
    };

    res.json({ settings, account });
  } catch (err) {
    console.error('[dispatch-settings GET]', err.message);
    res.status(500).json({ error: 'Failed to load dispatch settings.' });
  }
});

const VALID_AREA_TYPES_SET = new Set(VALID_AREA_TYPES);
const VALID_KPI_EVENTS  = new Set(['scheduled_at', 'checkin_at', 'created_at']);
const VALID_KPI_FIFTH   = new Set(['average_response']);

// PUT /api/dispatch-settings — owner/manager only
router.put('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const accountId = req.accountId;
  const {
    dispatch_center_lat,
    dispatch_center_lng,
    dispatch_default_zoom,
    dispatch_service_area_type,
    dispatch_service_radius_miles,
    dispatch_preferred_postal_codes,
    dispatch_auto_fit_live_techs,
    dispatch_auto_fit_today_jobs,
    dispatch_include_scheduled,
    dispatch_include_completed,
    dispatch_include_cancelled,
    // KPI settings
    kpi_show_live_techs,
    kpi_show_active_jobs,
    kpi_show_todays_jobs,
    kpi_show_completed_today,
    kpi_show_avg_response,
    kpi_response_tracking_enabled,
    kpi_response_start_event,
    kpi_response_end_event,
    kpi_response_outlier_minutes,
    kpi_response_min_sample_size,
    kpi_adaptive_kpis_enabled,
    kpi_fixed_layout,
    kpi_fifth_preference,
  } = req.body;

  // Validate area type
  if (dispatch_service_area_type !== undefined &&
      !VALID_AREA_TYPES_SET.has(dispatch_service_area_type)) {
    return res.status(400).json({
      error: `dispatch_service_area_type must be one of: ${VALID_AREA_TYPES.join(', ')}`,
    });
  }

  // Validate KPI event names
  if (kpi_response_start_event !== undefined && !VALID_KPI_EVENTS.has(kpi_response_start_event)) {
    return res.status(400).json({ error: 'Invalid kpi_response_start_event.' });
  }
  if (kpi_response_end_event !== undefined && !VALID_KPI_EVENTS.has(kpi_response_end_event)) {
    return res.status(400).json({ error: 'Invalid kpi_response_end_event.' });
  }

  // Validate coordinates when provided
  if (dispatch_center_lat != null || dispatch_center_lng != null) {
    const nlat = parseFloat(dispatch_center_lat);
    const nlng = parseFloat(dispatch_center_lng);
    if (!isFinite(nlat) || nlat < -90  || nlat > 90  ||
        !isFinite(nlng) || nlng < -180 || nlng > 180) {
      return res.status(400).json({ error: 'Invalid dispatch center coordinates.' });
    }
  }

  // Validate zoom
  if (dispatch_default_zoom != null) {
    const z = parseInt(dispatch_default_zoom, 10);
    if (isNaN(z) || z < 1 || z > 22) {
      return res.status(400).json({ error: 'dispatch_default_zoom must be between 1 and 22.' });
    }
  }

  // Validate radius
  if (dispatch_service_radius_miles != null) {
    const r = parseFloat(dispatch_service_radius_miles);
    if (!isFinite(r) || r <= 0 || r > 5000) {
      return res.status(400).json({
        error: 'dispatch_service_radius_miles must be a positive number ≤ 5000.',
      });
    }
  }

  // Validate postal codes array
  if (dispatch_preferred_postal_codes != null) {
    if (!Array.isArray(dispatch_preferred_postal_codes)) {
      return res.status(400).json({ error: 'dispatch_preferred_postal_codes must be an array.' });
    }
    if (dispatch_preferred_postal_codes.length > 200) {
      return res.status(400).json({ error: 'Too many postal codes (max 200).' });
    }
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO dispatch_settings (
        account_id,
        dispatch_center_lat, dispatch_center_lng, dispatch_default_zoom,
        dispatch_service_area_type, dispatch_service_radius_miles,
        dispatch_preferred_postal_codes,
        dispatch_auto_fit_live_techs, dispatch_auto_fit_today_jobs,
        dispatch_include_scheduled, dispatch_include_completed, dispatch_include_cancelled,
        kpi_show_live_techs, kpi_show_active_jobs, kpi_show_todays_jobs,
        kpi_show_completed_today, kpi_show_avg_response,
        kpi_response_tracking_enabled, kpi_response_start_event, kpi_response_end_event,
        kpi_response_outlier_minutes, kpi_response_min_sample_size,
        kpi_adaptive_kpis_enabled, kpi_fixed_layout, kpi_fifth_preference,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW())
      ON CONFLICT (account_id) DO UPDATE SET
        dispatch_center_lat             = EXCLUDED.dispatch_center_lat,
        dispatch_center_lng             = EXCLUDED.dispatch_center_lng,
        dispatch_default_zoom           = EXCLUDED.dispatch_default_zoom,
        dispatch_service_area_type      = EXCLUDED.dispatch_service_area_type,
        dispatch_service_radius_miles   = EXCLUDED.dispatch_service_radius_miles,
        dispatch_preferred_postal_codes = EXCLUDED.dispatch_preferred_postal_codes,
        dispatch_auto_fit_live_techs    = EXCLUDED.dispatch_auto_fit_live_techs,
        dispatch_auto_fit_today_jobs    = EXCLUDED.dispatch_auto_fit_today_jobs,
        dispatch_include_scheduled      = EXCLUDED.dispatch_include_scheduled,
        dispatch_include_completed      = EXCLUDED.dispatch_include_completed,
        dispatch_include_cancelled      = EXCLUDED.dispatch_include_cancelled,
        kpi_show_live_techs             = EXCLUDED.kpi_show_live_techs,
        kpi_show_active_jobs            = EXCLUDED.kpi_show_active_jobs,
        kpi_show_todays_jobs            = EXCLUDED.kpi_show_todays_jobs,
        kpi_show_completed_today        = EXCLUDED.kpi_show_completed_today,
        kpi_show_avg_response           = EXCLUDED.kpi_show_avg_response,
        kpi_response_tracking_enabled   = EXCLUDED.kpi_response_tracking_enabled,
        kpi_response_start_event        = EXCLUDED.kpi_response_start_event,
        kpi_response_end_event          = EXCLUDED.kpi_response_end_event,
        kpi_response_outlier_minutes    = EXCLUDED.kpi_response_outlier_minutes,
        kpi_response_min_sample_size    = EXCLUDED.kpi_response_min_sample_size,
        kpi_adaptive_kpis_enabled       = EXCLUDED.kpi_adaptive_kpis_enabled,
        kpi_fixed_layout                = EXCLUDED.kpi_fixed_layout,
        kpi_fifth_preference            = EXCLUDED.kpi_fifth_preference,
        updated_at = NOW()
      RETURNING *
    `, [
      accountId,
      dispatch_center_lat   != null ? parseFloat(dispatch_center_lat)  : null,
      dispatch_center_lng   != null ? parseFloat(dispatch_center_lng)  : null,
      dispatch_default_zoom != null ? parseInt(dispatch_default_zoom, 10) : null,
      dispatch_service_area_type      ?? 'business_address',
      dispatch_service_radius_miles   != null ? parseFloat(dispatch_service_radius_miles) : null,
      dispatch_preferred_postal_codes != null ? dispatch_preferred_postal_codes : null,
      dispatch_auto_fit_live_techs  !== undefined ? !!dispatch_auto_fit_live_techs  : true,
      dispatch_auto_fit_today_jobs  !== undefined ? !!dispatch_auto_fit_today_jobs  : true,
      dispatch_include_scheduled    !== undefined ? !!dispatch_include_scheduled    : true,
      dispatch_include_completed    !== undefined ? !!dispatch_include_completed    : false,
      dispatch_include_cancelled    !== undefined ? !!dispatch_include_cancelled    : false,
      kpi_show_live_techs           !== undefined ? !!kpi_show_live_techs           : true,
      kpi_show_active_jobs          !== undefined ? !!kpi_show_active_jobs          : true,
      kpi_show_todays_jobs          !== undefined ? !!kpi_show_todays_jobs          : true,
      kpi_show_completed_today      !== undefined ? !!kpi_show_completed_today      : true,
      kpi_show_avg_response         !== undefined ? !!kpi_show_avg_response         : true,
      kpi_response_tracking_enabled !== undefined ? !!kpi_response_tracking_enabled : false,
      kpi_response_start_event      ?? 'scheduled_at',
      kpi_response_end_event        ?? 'checkin_at',
      kpi_response_outlier_minutes  != null ? parseInt(kpi_response_outlier_minutes, 10) : 1440,
      kpi_response_min_sample_size  != null ? parseInt(kpi_response_min_sample_size, 10) : 1,
      kpi_adaptive_kpis_enabled     !== undefined ? !!kpi_adaptive_kpis_enabled     : true,
      kpi_fixed_layout              !== undefined ? !!kpi_fixed_layout              : false,
      kpi_fifth_preference          ?? 'average_response',
    ]);
    res.json(rows[0]);
  } catch (err) {
    console.error('[dispatch-settings PUT]', err.message);
    res.status(500).json({ error: 'Failed to save dispatch settings.' });
  }
});

module.exports = router;
