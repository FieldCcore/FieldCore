'use strict';
const express  = require('express');
const router   = express.Router();
const pool     = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc      = require('../services/revenueAnalyticsService');

// ── GET /api/revenue/overview ─────────────────────────────────────────────────
// Primary + secondary KPIs, insights, services, risk, opportunities
// Query params: start, end, comparison (none|previous_period|previous_month|previous_year)

router.get('/overview', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end, comparison = 'none' } = req.query;
  try {
    const result = await svc.getOverview(req.accountId, { start, end, comparison });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Revenue overview could not be loaded.' });
  }
});

// ── GET /api/revenue/trend ────────────────────────────────────────────────────
// Time-series data for the Revenue Trend chart
// Query params: start, end, interval (daily|weekly|monthly), comparison

router.get('/trend', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end, interval = 'daily', comparison = 'none' } = req.query;
  try {
    const result = await svc.getTrend(req.accountId, { start, end, interval, comparison });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Revenue trend data could not be loaded.' });
  }
});

// ── GET /api/revenue/services ─────────────────────────────────────────────────
// Revenue by service type table
// Query params: start, end

router.get('/services', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const rows = await svc.getServices(req.accountId, { start, end });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Revenue by service data could not be loaded.' });
  }
});

// ── GET /api/revenue/risk ─────────────────────────────────────────────────────
// Risk categories and opportunities
// Query params: start, end

router.get('/risk', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const result = await svc.getRisk(req.accountId, { start, end });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Revenue risk data could not be loaded.' });
  }
});

// ── GET /api/revenue/quarterly ───────────────────────────────────────────────
// Q1–Q4 + full-year revenue aggregates for Financials comparison table
// Query params: year (defaults to current calendar year)

router.get('/quarterly', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { year } = req.query;
  try {
    const result = await svc.getQuarterly(req.accountId, { year });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Quarterly data could not be loaded.' });
  }
});

// ── GET /api/revenue/export ───────────────────────────────────────────────────
// CSV export of revenue data
// Query params: start, end, type (summary|services|invoices)

router.get('/export', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end, type = 'summary' } = req.query;
  const accountId = req.accountId;

  const s = start || svc.defaultPeriod().start;
  const e = end   || svc.defaultPeriod().end;

  try {
    let rows, filename, header;

    if (type === 'services') {
      const services = await svc.getServices(accountId, { start: s, end: e });
      filename = 'revenue-by-service.csv';
      header   = ['Service', 'Jobs', 'Earned Revenue', 'Collected Revenue', 'Avg Ticket', 'Labor Hours', 'Rev per Labor Hr', 'Completion Rate %', 'Revenue Share %'];
      rows     = services.map(sv => [
        sv.service,
        sv.jobs,
        sv.earnedRevenue.toFixed(2),
        sv.collectedRevenue.toFixed(2),
        sv.avgTicket != null ? sv.avgTicket.toFixed(2) : '',
        sv.laborHours,
        sv.revenuePerLaborHour != null ? sv.revenuePerLaborHour.toFixed(2) : '',
        sv.completionRate != null ? (sv.completionRate * 100).toFixed(1) : '',
        sv.revenueShare.toFixed(1),
      ]);
    } else if (type === 'invoices') {
      const result = await pool.query(
        `SELECT i.id, c.name AS client, j.service_type AS service,
                i.amount, i.tax_amount, i.status, i.created_at, i.paid_at, i.due_date
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         JOIN jobs j     ON j.id = i.job_id
         WHERE i.account_id = $1
           AND i.created_at >= $2::date
           AND i.created_at <  ($3::date + INTERVAL '1 day')
         ORDER BY i.created_at DESC`,
        [accountId, s, e]
      );
      filename = 'revenue-invoices.csv';
      header   = ['Invoice ID', 'Client', 'Service', 'Amount', 'Tax', 'Status', 'Created', 'Paid At', 'Due Date'];
      rows     = result.rows.map(r => [
        r.id, r.client, r.service,
        r.amount, r.tax_amount || 0, r.status,
        r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
        r.paid_at    ? new Date(r.paid_at).toLocaleDateString()    : '',
        r.due_date   ? new Date(r.due_date).toLocaleDateString()   : '',
      ]);
    } else {
      // Default: overview summary
      const overview = await svc.getOverview(accountId, { start: s, end: e });
      const pk = overview.primaryKpis;
      filename = 'revenue-summary.csv';
      header   = ['Metric', 'Value', 'Status', 'Note'];
      rows     = [
        ['Period', `${s} to ${e}`, '', ''],
        ['Collected Revenue', pk.collectedRevenue.value.toFixed(2), pk.collectedRevenue.status, ''],
        ['Earned Revenue',    pk.earnedRevenue.value.toFixed(2),    pk.earnedRevenue.status, ''],
        ['Gross Profit',      '', pk.grossProfit.status, pk.grossProfit.missingSources?.join('; ') || ''],
        ['Outstanding AR',    pk.outstandingAr.value.toFixed(2),   pk.outstandingAr.status, `${pk.outstandingAr.invoiceCount} invoice(s); ${pk.outstandingAr.overdueCount} overdue`],
        ['Projected Month-End', pk.projectedMonthEnd.value.toFixed(2), pk.projectedMonthEnd.status, pk.projectedMonthEnd.method],
      ];
    }

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv    = [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ── GET /api/revenue/financials ───────────────────────────────────────────────
// Complete financial analytics: P&L structure, AR aging, cash flow, quarterly
// Query params: start, end, comparison

const finSvc      = require('../services/financialAnalyticsService');
const coverageSvc = require('../services/financialCoverageService');

// GET /api/revenue/financials/sources — source status + coverage (lightweight)
// Must be declared BEFORE /financials to avoid route shadowing.
router.get('/financials/sources', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const coverage = await coverageSvc.getFinancialCoverage(req.accountId);
    const { activeSources, optionalSources, notEnabledSources } = coverage;
    const allSources = [...activeSources, ...notEnabledSources, ...optionalSources];
    const sources = {};
    for (const src of allSources) {
      sources[src.sourceKey] = src;
    }
    res.json({ sources, coverage });
  } catch (err) {
    console.error('[revenue] financials/sources error', err.message);
    res.status(500).json({ error: 'Financial source status could not be loaded.' });
  }
});

router.get('/financials', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end, comparison = 'none' } = req.query;
  try {
    const result = await finSvc.getFinancials(req.accountId, { start, end, comparison });
    res.json(result);
  } catch (err) {
    console.error('[revenue] financials error', err.message);
    res.status(500).json({ error: 'Financial analytics could not be loaded.' });
  }
});

// ── Revenue Policies ──────────────────────────────────────────────────────────
const policiesSvc = require('../services/revenuePoliciesService');

router.get('/policies', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    res.json(await policiesSvc.getPolicies(req.accountId));
  } catch (err) {
    res.status(500).json({ error: 'Could not load revenue policies.' });
  }
});

router.patch('/policies', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    res.json(await policiesSvc.updatePolicies(req.accountId, req.body, req.userId));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Could not update revenue policies.' });
  }
});

// ── Forecast Readiness ────────────────────────────────────────────────────────
const forecastReadinessSvc = require('../services/revenueForecastReadinessService');

router.get('/forecast/readiness', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const policies = await policiesSvc.getPolicies(req.accountId);
    const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
    res.json(await forecastReadinessSvc.getForecastReadiness(req.accountId, { year, policies }));
  } catch (err) {
    res.status(500).json({ error: 'Could not assess forecast readiness.' });
  }
});

// ── Metric Registry ───────────────────────────────────────────────────────────
const { listMetrics } = require('../services/revenueMetricRegistry');

router.get('/metrics', requireAuth, requireRole('owner', 'manager'), (_req, res) => {
  res.json({ metrics: listMetrics() });
});

// ── Customers Overview ────────────────────────────────────────────────────────
router.get('/customers/overview', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  const accountId = req.accountId;
  try {
    const params = [accountId];
    let dateFilter = '';
    if (start) { params.push(start); dateFilter += ` AND j.scheduled_at >= $${params.length}::date`; }
    if (end)   { params.push(end);   dateFilter += ` AND j.scheduled_at <  ($${params.length}::date + INTERVAL '1 day')`; }

    const result = await pool.query(
      `SELECT c.id, c.name,
              COUNT(j.id)::int AS job_count,
              COALESCE(SUM(j.amount), 0) AS earned_revenue,
              MAX(j.scheduled_at) AS last_job_at
       FROM clients c
       JOIN jobs j ON j.client_id = c.id AND j.account_id = $1 AND j.status = 'complete'
       WHERE c.account_id = $1 ${dateFilter}
       GROUP BY c.id, c.name
       ORDER BY earned_revenue DESC
       LIMIT 15`,
      params
    );

    // Total unique active clients in period
    const activeResult = await pool.query(
      `SELECT COUNT(DISTINCT client_id)::int AS active
       FROM jobs WHERE account_id = $1 AND status = 'complete' ${
         start || end
           ? `AND scheduled_at >= ${start ? '$2::date' : "'1970-01-01'"}${end ? ` AND scheduled_at < ($${start ? 3 : 2}::date + INTERVAL '1 day')` : ''}`
           : ''
       }`,
      params
    );

    res.json({
      topClients: result.rows,
      summary: { activeClientCount: activeResult.rows[0]?.active || 0 },
      limitations: [
        'Customer Lifetime Value calculation requires multi-period history.',
        'Churn threshold not configured — inactive client analysis requires customer_inactivity_policy.',
        'Client segment analysis requires segment tags to be configured.',
      ],
      provenance: {
        formula: 'SUM(jobs.amount WHERE status=complete) grouped by client',
        sources: ['jobs', 'clients'],
        calculationState: 'complete',
        missingPolicies: ['customerInactivityPolicy'],
      },
    });
  } catch (err) {
    console.error('[revenue] customers/overview error', err.message);
    res.status(500).json({ error: 'Could not load customers overview.' });
  }
});

// ── Operations Analytics ──────────────────────────────────────────────────────
const opsSvc        = require('../services/operationsAnalyticsService');
const teamSvc       = require('../services/teamPerformanceService');
const completionSvc = require('../services/jobCompletionAnalyticsService');
const commSvc       = require('../services/commissionCalculationService');
const opsDqSvc      = require('../services/operationsDataQualityService');
const upsellSvc     = require('../services/upsellAttributionService');

router.get('/operations', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const [kpis, dq] = await Promise.all([
      opsSvc.getOperationsKpis(req.accountId, { start, end }),
      opsDqSvc.getOperationsDataQuality(req.accountId, { start, end }),
    ]);
    res.json({ ...kpis, dataQuality: dq });
  } catch (err) {
    console.error('[revenue] operations error', err.message);
    res.status(500).json({ error: 'Operations analytics could not be loaded.' });
  }
});

router.get('/operations/team', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    res.json(await teamSvc.getTeamPerformance(req.accountId, { start, end }));
  } catch (err) {
    console.error('[revenue] operations/team error', err.message);
    res.status(500).json({ error: 'Team performance data could not be loaded.' });
  }
});

router.get('/operations/team/:userId', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const detail = await teamSvc.getMemberDetail(req.accountId, req.params.userId, { start, end });
    if (!detail) return res.status(404).json({ error: 'Team member not found.' });
    res.json(detail);
  } catch (err) {
    console.error('[revenue] operations/team/:id error', err.message);
    res.status(500).json({ error: 'Member detail could not be loaded.' });
  }
});

router.get('/operations/completion', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    res.json(await completionSvc.getCompletionAnalysis(req.accountId, { start, end }));
  } catch (err) {
    console.error('[revenue] operations/completion error', err.message);
    res.status(500).json({ error: 'Job completion analytics could not be loaded.' });
  }
});

router.get('/operations/commissions', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    res.json(await commSvc.getCommissionSummary(req.accountId, { start, end }));
  } catch (err) {
    console.error('[revenue] operations/commissions error', err.message);
    res.status(500).json({ error: 'Commission data could not be loaded.' });
  }
});

router.get('/operations/upsells', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    res.json(await upsellSvc.getUpsellSummary(req.accountId, { start, end }));
  } catch (err) {
    console.error('[revenue] operations/upsells error', err.message);
    res.status(500).json({ error: 'Upsell attribution data could not be loaded.' });
  }
});

router.get('/operations/jobs', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  const accountId = req.accountId;
  const params = [accountId];
  let dateFilter = '';
  if (start) { params.push(start); dateFilter += ` AND j.scheduled_at >= $${params.length}::date`; }
  if (end)   { params.push(end);   dateFilter += ` AND j.scheduled_at <  ($${params.length}::date + INTERVAL '1 day')`; }
  try {
    const { rows } = await pool.query(
      `SELECT j.id, j.service_type, j.amount, j.status, j.scheduled_at,
              COALESCE(u.name, 'Unassigned') AS tech_name
       FROM jobs j
       LEFT JOIN users u ON u.id = j.tech_id AND u.account_id = $1
       WHERE j.account_id = $1 AND j.status = 'complete'${dateFilter}
       ORDER BY j.scheduled_at DESC
       LIMIT 200`,
      params
    );
    res.json({ jobs: rows, count: rows.length });
  } catch (err) {
    console.error('[revenue] operations/jobs error', err.message);
    res.status(500).json({ error: 'Jobs data could not be loaded.' });
  }
});

// ── Technician Revenue ────────────────────────────────────────────────────────
router.get('/technicians', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  const accountId = req.accountId;
  try {
    const params = [accountId];
    let dateFilter = '';
    if (start) { params.push(start); dateFilter += ` AND j.scheduled_at >= $${params.length}::date`; }
    if (end)   { params.push(end);   dateFilter += ` AND j.scheduled_at <  ($${params.length}::date + INTERVAL '1 day')`; }

    const result = await pool.query(
      `SELECT
         j.tech_id,
         COALESCE(u.name, 'Unassigned') AS technician_name,
         COUNT(j.id)::int AS job_count,
         COUNT(j.id) FILTER (WHERE j.status = 'complete')::int AS completed_jobs,
         COUNT(j.id) FILTER (WHERE j.status IN ('cancelled','no_show'))::int AS lost_jobs,
         COALESCE(SUM(j.amount) FILTER (WHERE j.status = 'complete'), 0) AS earned_revenue,
         COALESCE(SUM(j.duration_minutes) FILTER (WHERE j.status = 'complete'), 0)::int AS total_minutes
       FROM jobs j
       LEFT JOIN users u ON u.id = j.tech_id AND u.account_id = $1
       WHERE j.account_id = $1 ${dateFilter}
       GROUP BY j.tech_id, u.name
       ORDER BY earned_revenue DESC`,
      params
    );

    res.json({
      technicians: result.rows,
      limitations: [
        'Shows primary tech assignment only. Revenue attribution across multi-tech jobs requires technician_attribution_policy.',
        'Labor hours are scheduled duration, not recorded time.',
      ],
      provenance: {
        formula: 'SUM(jobs.amount WHERE status=complete) per tech_id (primary assignment)',
        sources: ['jobs', 'users'],
        calculationState: 'partial',
        missingPolicies: ['technicianAttributionPolicy'],
      },
    });
  } catch (err) {
    console.error('[revenue] technicians error', err.message);
    res.status(500).json({ error: 'Could not load technician revenue.' });
  }
});

// ── Provider Status ───────────────────────────────────────────────────────────
router.get('/providers/status', requireAuth, requireRole('owner', 'manager'), (_req, res) => {
  res.json({
    providers: [
      { key: 'accounting', label: 'Accounting', status: 'not_configured', capabilities: ['invoices','payments','cogs','pl'] },
      { key: 'banking', label: 'Banking', status: 'not_configured', capabilities: ['transactions','balances','reconciliation'] },
      { key: 'payment_processor', label: 'Payment Processor', status: 'not_configured', capabilities: ['payments','refunds','fees','disputes'] },
    ],
    note: 'No integrations are active. Provider connections require configuration.',
  });
});

// ── Saved Views ───────────────────────────────────────────────────────────────
const VALID_WORKSPACES = ['overview','financials','operations','customers','forecasting','reports'];

router.get('/saved-views', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { workspace } = req.query;
  if (workspace && !VALID_WORKSPACES.includes(workspace)) {
    return res.status(400).json({ error: 'Invalid workspace.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, workspace, name, filters, columns, sort, grouping, is_shared, owner_user_id, created_at, updated_at
       FROM revenue_saved_views
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR workspace = $2)
         AND (is_shared = true OR owner_user_id = $3)
       ORDER BY updated_at DESC`,
      [req.accountId, workspace || null, req.userId]
    );
    res.json({ savedViews: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load saved views.' });
  }
});

router.post('/saved-views', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { workspace, name, filters = {}, columns, sort, grouping, is_shared = false } = req.body;
  if (!workspace || !VALID_WORKSPACES.includes(workspace)) return res.status(400).json({ error: 'Invalid workspace.' });
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO revenue_saved_views (tenant_id, owner_user_id, workspace, name, filters, columns, sort, grouping, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, workspace, created_at`,
      [req.accountId, req.userId, workspace, name.trim(), JSON.stringify(filters),
       columns ? JSON.stringify(columns) : null, sort ? JSON.stringify(sort) : null,
       grouping ? JSON.stringify(grouping) : null, !!is_shared]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not save view.' });
  }
});

router.delete('/saved-views/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM revenue_saved_views WHERE id = $1 AND tenant_id = $2 AND owner_user_id = $3`,
      [req.params.id, req.accountId, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'View not found or not yours.' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete view.' });
  }
});

module.exports = router;
