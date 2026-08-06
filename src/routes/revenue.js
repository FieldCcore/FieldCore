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

module.exports = router;
