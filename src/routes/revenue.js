'use strict';
const express  = require('express');
const router   = express.Router();
const pool     = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc      = require('../services/revenueAnalyticsService');
const csvSvc   = require('../services/csvExportService');
const xlsSvc   = require('../services/excelExportService');

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
  const { start, end, type = 'summary', format = 'csv' } = req.query;
  const accountId = req.accountId;

  const s = start || svc.defaultPeriod().start;
  const e = end   || svc.defaultPeriod().end;
  const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  try {
    const { accountName, timezone } = await csvSvc.getAccountMeta(pool, accountId);

    // ── Excel (.xlsx) export path ─────────────────────────────────────────────
    if (format === 'xlsx') {
      const xMeta = { entity: accountName, periodStart: s, periodEnd: e, generatedAt, timezone };
      let wb, xlsFilename;

      if (type === 'services') {
        const services = await svc.getServices(accountId, { start: s, end: e });
        wb = xlsSvc.buildRevenueByService(services, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Revenue_by_Service', accountName, s, e);

      } else if (type === 'invoices') {
        const { rows } = await pool.query(
          `SELECT i.id, COALESCE(c.name, 'Unknown') AS client,
                  COALESCE(j.service_type, 'Unspecified') AS service,
                  i.amount, COALESCE(i.tax_amount, 0) AS tax_amount,
                  i.status, i.created_at, i.paid_at, i.due_date
           FROM invoices i
           LEFT JOIN clients c ON c.id = i.client_id AND c.account_id = $1
           LEFT JOIN jobs    j ON j.id = i.job_id
           WHERE i.account_id = $1
             AND i.created_at >= $2::date
             AND i.created_at <  ($3::date + INTERVAL '1 day')
           ORDER BY i.created_at DESC`,
          [accountId, s, e]
        );
        wb = xlsSvc.buildInvoices(rows, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Invoice_Collections', accountName, s, e);

      } else if (type === 'customers') {
        const [topResult, ltv] = await Promise.all([
          pool.query(
            `SELECT c.name,
                    COUNT(j.id)::int AS job_count,
                    COALESCE(SUM(j.amount), 0) AS earned_revenue,
                    MAX(j.scheduled_at) AS last_job_at
             FROM clients c
             JOIN jobs j ON j.client_id = c.id AND j.account_id = $1 AND j.status = 'complete'
             WHERE c.account_id = $1
               AND j.scheduled_at >= $2::date
               AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
             GROUP BY c.name ORDER BY earned_revenue DESC`,
            [accountId, s, e]
          ),
          custSvc.getLtv(accountId),
        ]);
        wb = xlsSvc.buildCustomers(topResult.rows, ltv, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Customer_Value', accountName, s, e);

      } else if (type === 'forecasting') {
        const fc = await forecastingSvc.getOverview(accountId, { start: s, end: e });
        wb = xlsSvc.buildForecasting(fc, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Forecast_Pipeline', accountName, s, e);

      } else if (type === 'technicians') {
        const tParams = [accountId];
        let tFilter = '';
        if (s) { tParams.push(s); tFilter += ` AND j.scheduled_at >= $${tParams.length}::date`; }
        if (e) { tParams.push(e); tFilter += ` AND j.scheduled_at <  ($${tParams.length}::date + INTERVAL '1 day')`; }
        const { rows: techRows } = await pool.query(
          `SELECT COALESCE(u.name, 'Unassigned') AS technician_name,
                  COALESCE(u.role, '') AS tech_role,
                  COUNT(j.id) FILTER (WHERE j.status = 'complete')::int AS completed_jobs,
                  COUNT(j.id) FILTER (WHERE j.status IN ('cancelled','no_show'))::int AS lost_jobs,
                  COALESCE(SUM(j.amount) FILTER (WHERE j.status = 'complete'), 0) AS earned_revenue,
                  COALESCE(SUM(j.duration_minutes) FILTER (WHERE j.status = 'complete'), 0)::int AS total_minutes
           FROM jobs j
           LEFT JOIN users u ON u.id = j.tech_id AND u.account_id = $1
           WHERE j.account_id = $1${tFilter}
           GROUP BY j.tech_id, u.name, u.role
           ORDER BY earned_revenue DESC`,
          tParams
        );
        wb = xlsSvc.buildTechnicians(techRows, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Revenue_by_Technician', accountName, s, e);

      } else if (type === 'cancellations') {
        const { rows: cancelRows } = await pool.query(
          `SELECT j.id, j.scheduled_at, j.service_type, j.status, j.amount,
                  COALESCE(c.name, 'Unknown') AS client_name,
                  COALESCE(u.name, 'Unassigned') AS tech_name
           FROM jobs j
           LEFT JOIN clients c ON c.id = j.client_id AND c.account_id = $1
           LEFT JOIN users   u ON u.id = j.tech_id   AND u.account_id = $1
           WHERE j.account_id = $1
             AND j.status IN ('cancelled', 'no_show')
             AND j.scheduled_at >= $2::date
             AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
           ORDER BY j.scheduled_at DESC`,
          [accountId, s, e]
        );
        let xReasonMap = {};
        try {
          const { rows: rRows } = await pool.query(
            `SELECT job_id, reason_code FROM job_status_history
             WHERE account_id = $1 AND to_status IN ('cancelled','no_show')
               AND changed_at >= $2::date AND changed_at < ($3::date + INTERVAL '1 day')`,
            [accountId, s, e]
          );
          rRows.forEach(r => { xReasonMap[r.job_id] = r.reason_code || ''; });
        } catch { /* table absent */ }
        wb = xlsSvc.buildCancellations(cancelRows, xReasonMap, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Cancellations_NoShows', accountName, s, e);

      } else if (type === 'tax') {
        const { rows: taxRows } = await pool.query(
          `SELECT COALESCE(c.name, 'Unknown') AS client_name,
                  COALESCE(j.service_type, 'Unspecified') AS service,
                  i.amount, COALESCE(i.tax_amount, 0) AS tax_amount,
                  i.status, i.created_at
           FROM invoices i
           LEFT JOIN clients c ON c.id = i.client_id AND c.account_id = $1
           LEFT JOIN jobs    j ON j.id = i.job_id
           WHERE i.account_id = $1
             AND i.created_at >= $2::date
             AND i.created_at <  ($3::date + INTERVAL '1 day')
           ORDER BY i.created_at DESC`,
          [accountId, s, e]
        );
        wb = xlsSvc.buildTax(taxRows, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Tax_Summary', accountName, s, e);

      } else if (type === 'quarterly') {
        const xYear = new Date().getUTCFullYear();
        const qData = await svc.getQuarterly(accountId, { year: xYear });
        wb = xlsSvc.buildQuarterly(qData, xYear, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename(`Quarterly_Financial_${xYear}`, accountName, `${xYear}-01-01`, `${xYear}-12-31`);

      } else if (type === 'completion') {
        const analysis = await completionSvc.getCompletionAnalysis(accountId, { start: s, end: e });
        wb = xlsSvc.buildCompletion(analysis, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Job_Completion_Analysis', accountName, s, e);

      } else {
        // Default: Revenue Summary
        const overview = await svc.getOverview(accountId, { start: s, end: e });
        wb = xlsSvc.buildRevenueSummary(overview, xMeta);
        xlsFilename = xlsSvc.makeXlsxFilename('Revenue_Summary', accountName, s, e);
      }

      return xlsSvc.sendWorkbook(res, wb, xlsFilename);
    }
    // ── End Excel export path ─────────────────────────────────────────────────

    let allRows, filename;

    const { fmtDate, fmtMoney, fmtPct, statusLabel, makeFilename, metaSection, buildCSV } = csvSvc;

    if (type === 'services') {
      const services = await svc.getServices(accountId, { start: s, end: e });
      filename = makeFilename('revenue-by-service', accountName, s, e);
      const header = ['Service', 'Jobs', 'Earned Revenue', 'Collected Revenue', 'Average Ticket', 'Labor Hours', 'Revenue / Labor Hour', 'Completion Rate', 'Revenue Share'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',        'Revenue by Service'],
        ['Entity',        accountName],
        ['Period Start',  s],
        ['Period End',    e],
        ['Generated At',  generatedAt],
      ], cols);
      const dataRows = services.map(sv => [
        sv.service,
        sv.jobs,
        fmtMoney(sv.earnedRevenue),
        fmtMoney(sv.collectedRevenue),
        sv.avgTicket        != null ? fmtMoney(sv.avgTicket)          : '',
        sv.laborHours       != null ? sv.laborHours                   : '',
        sv.revenuePerLaborHour != null ? fmtMoney(sv.revenuePerLaborHour) : '',
        sv.completionRate   != null ? fmtPct(sv.completionRate * 100) : '',
        fmtPct(sv.revenueShare),
      ]);
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'invoices') {
      const result = await pool.query(
        `SELECT i.id, COALESCE(c.name, 'Unknown') AS client,
                COALESCE(j.service_type, 'Unspecified') AS service,
                i.amount, COALESCE(i.tax_amount, 0) AS tax_amount,
                i.status, i.created_at, i.paid_at, i.due_date
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id AND c.account_id = $1
         LEFT JOIN jobs    j ON j.id = i.job_id
         WHERE i.account_id = $1
           AND i.created_at >= $2::date
           AND i.created_at <  ($3::date + INTERVAL '1 day')
         ORDER BY i.created_at DESC`,
        [accountId, s, e]
      );
      filename = makeFilename('invoice-collections', accountName, s, e);
      const header = ['Invoice ID', 'Client', 'Service', 'Invoice Date', 'Due Date', 'Status', 'Invoice Amount', 'Tax Amount'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',        'Invoice & Collections'],
        ['Entity',        accountName],
        ['Period Start',  s],
        ['Period End',    e],
        ['Generated At',  generatedAt],
      ], cols);
      const dataRows = result.rows.map(r => [
        r.id,
        r.client,
        r.service,
        fmtDate(r.created_at),
        fmtDate(r.due_date),
        statusLabel(r.status),
        fmtMoney(r.amount),
        fmtMoney(r.tax_amount),
      ]);
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'customers') {
      const [topResult, ltv] = await Promise.all([
        pool.query(
          `SELECT c.name,
                  COUNT(j.id)::int AS job_count,
                  COALESCE(SUM(j.amount), 0) AS earned_revenue,
                  MAX(j.scheduled_at) AS last_job_at
           FROM clients c
           JOIN jobs j ON j.client_id = c.id AND j.account_id = $1 AND j.status = 'complete'
           WHERE c.account_id = $1
             AND j.scheduled_at >= $2::date
             AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
           GROUP BY c.name ORDER BY earned_revenue DESC`,
          [accountId, s, e]
        ),
        custSvc.getLtv(accountId),
      ]);
      filename = makeFilename('customer-value', accountName, s, e);
      const ltvMeta = ltv.eligible && ltv.data ? [
        ['Avg Revenue / Customer',    fmtMoney(ltv.data.avgRevenuePerCustomer)],
        ['Median Revenue / Customer', fmtMoney(ltv.data.medianRevenuePerCustomer)],
        ['Avg Jobs / Customer',       ltv.data.avgJobsPerCustomer],
        ['Avg Ticket',                fmtMoney(ltv.data.avgTicket)],
      ] : [];
      const header = ['Client Name', 'Jobs Completed', 'Earned Revenue', 'Last Completed Job'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',        'Customer Value Report'],
        ['Entity',        accountName],
        ['Period Start',  s],
        ['Period End',    e],
        ['Generated At',  generatedAt],
        ...(ltvMeta.length ? [['--- Lifetime Value (All-Time) ---', '']] : []),
        ...ltvMeta,
      ], cols);
      const dataRows = topResult.rows.map(r => [
        r.name,
        r.job_count,
        fmtMoney(r.earned_revenue),
        fmtDate(r.last_job_at),
      ]);
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'forecasting') {
      const fc = await forecastingSvc.getOverview(accountId, { start: s, end: e });
      filename = makeFilename('forecast-pipeline', accountName, s, e);
      const header = ['Scheduled Date', 'Client', 'Service', 'Status', 'Booked Value'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',            'Forecast Pipeline Report'],
        ['Entity',            accountName],
        ['Period Start',      fc.period.start],
        ['Period End',        fc.period.end],
        ['Generated At',      generatedAt],
        ['Confidence',        fc.forecast.confidence || 'N/A'],
        ['Earned Revenue',    fmtMoney(fc.actual.earnedRevenue)],
        ['Booked Revenue',    fmtMoney(fc.booked.revenue)],
        ['Projected Revenue', fmtMoney(fc.forecast.projectedRevenue)],
      ], cols);
      const dataRows = [...fc.drivers]
        .sort((a, b) => (a.scheduledAt || '') < (b.scheduledAt || '') ? -1 : 1)
        .map(d => [
          fmtDate(d.scheduledAt),
          d.clientName,
          d.serviceType || '',
          statusLabel(d.status),
          fmtMoney(d.amount),
        ]);
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'technicians') {
      const params = [accountId];
      let dateFilter = '';
      if (s) { params.push(s); dateFilter += ` AND j.scheduled_at >= $${params.length}::date`; }
      if (e) { params.push(e); dateFilter += ` AND j.scheduled_at <  ($${params.length}::date + INTERVAL '1 day')`; }
      const { rows: techRows } = await pool.query(
        `SELECT
           COALESCE(u.name, 'Unassigned') AS technician_name,
           COALESCE(u.role, '') AS tech_role,
           COUNT(j.id) FILTER (WHERE j.status = 'complete')::int AS completed_jobs,
           COUNT(j.id) FILTER (WHERE j.status IN ('cancelled','no_show'))::int AS lost_jobs,
           COALESCE(SUM(j.amount) FILTER (WHERE j.status = 'complete'), 0) AS earned_revenue,
           COALESCE(SUM(j.duration_minutes) FILTER (WHERE j.status = 'complete'), 0)::int AS total_minutes
         FROM jobs j
         LEFT JOIN users u ON u.id = j.tech_id AND u.account_id = $1
         WHERE j.account_id = $1${dateFilter}
         GROUP BY j.tech_id, u.name, u.role
         ORDER BY earned_revenue DESC`,
        params
      );
      filename = makeFilename('revenue-by-technician', accountName, s, e);
      const header = ['Technician', 'Role', 'Jobs Completed', 'Lost Jobs', 'Production Value', 'Average Ticket', 'Labor Hours', 'Revenue / Labor Hour'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',        'Revenue by Technician'],
        ['Entity',        accountName],
        ['Period Start',  s],
        ['Period End',    e],
        ['Generated At',  generatedAt],
        ['Note',          'Primary tech assignment only. Labor hours are scheduled duration.'],
      ], cols);
      const dataRows = techRows.map(r => {
        const earned    = parseFloat(r.earned_revenue) || 0;
        const completed = r.completed_jobs || 0;
        const hrs       = r.total_minutes > 0 ? r.total_minutes / 60 : null;
        return [
          r.technician_name,
          statusLabel(r.tech_role) || r.tech_role,
          completed,
          r.lost_jobs,
          fmtMoney(earned),
          completed > 0 ? fmtMoney(earned / completed) : '',
          hrs != null ? hrs.toFixed(1) : '',
          hrs != null && hrs > 0 ? fmtMoney(earned / hrs) : '',
        ];
      });
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'cancellations') {
      const { rows: cancelRows } = await pool.query(
        `SELECT j.id, j.scheduled_at, j.service_type, j.status, j.amount,
                COALESCE(c.name, 'Unknown') AS client_name,
                COALESCE(u.name, 'Unassigned') AS tech_name
         FROM jobs j
         LEFT JOIN clients c ON c.id = j.client_id AND c.account_id = $1
         LEFT JOIN users   u ON u.id = j.tech_id   AND u.account_id = $1
         WHERE j.account_id = $1
           AND j.status IN ('cancelled', 'no_show')
           AND j.scheduled_at >= $2::date
           AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
         ORDER BY j.scheduled_at DESC`,
        [accountId, s, e]
      );
      let reasonMap = {};
      try {
        const { rows: rRows } = await pool.query(
          `SELECT job_id, reason_code
           FROM job_status_history
           WHERE account_id = $1
             AND to_status IN ('cancelled','no_show')
             AND changed_at >= $2::date
             AND changed_at <  ($3::date + INTERVAL '1 day')`,
          [accountId, s, e]
        );
        rRows.forEach(r => { reasonMap[r.job_id] = r.reason_code || ''; });
      } catch { /* table absent */ }
      const reasonLabels = {
        customer_cancelled: 'Customer Cancelled', customer_unavailable: 'Customer Unavailable',
        weather: 'Weather', tech_unavailable: 'Technician Unavailable',
        scheduling_conflict: 'Scheduling Conflict', duplicate_booking: 'Duplicate Booking',
        payment_issue: 'Payment Issue', other: 'Other',
      };
      const totalImpact = cancelRows.reduce((t, r) => t + (parseFloat(r.amount) || 0), 0);
      filename = makeFilename('cancellations-noshows', accountName, s, e);
      const header = ['Scheduled Date', 'Client', 'Service', 'Status', 'Reason', 'Revenue Impact', 'Assigned Tech'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',              'Cancellation & No-Show Report'],
        ['Entity',              accountName],
        ['Period Start',        s],
        ['Period End',          e],
        ['Generated At',        generatedAt],
        ['Total Revenue Impact', fmtMoney(totalImpact)],
      ], cols);
      const dataRows = cancelRows.map(r => {
        const raw = reasonMap[r.id] || '';
        return [
          fmtDate(r.scheduled_at),
          r.client_name,
          r.service_type || 'Unspecified',
          statusLabel(r.status),
          raw ? (reasonLabels[raw] || raw) : 'Not captured',
          fmtMoney(r.amount),
          r.tech_name,
        ];
      });
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'tax') {
      const { rows: taxRows } = await pool.query(
        `SELECT COALESCE(c.name, 'Unknown') AS client_name,
                COALESCE(j.service_type, 'Unspecified') AS service,
                i.amount, COALESCE(i.tax_amount, 0) AS tax_amount,
                i.status, i.created_at
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id AND c.account_id = $1
         LEFT JOIN jobs    j ON j.id = i.job_id
         WHERE i.account_id = $1
           AND i.created_at >= $2::date
           AND i.created_at <  ($3::date + INTERVAL '1 day')
         ORDER BY i.created_at DESC`,
        [accountId, s, e]
      );
      const totalTaxable = taxRows.reduce((t, r) => t + (parseFloat(r.amount)     || 0), 0);
      const totalTax     = taxRows.reduce((t, r) => t + (parseFloat(r.tax_amount) || 0), 0);
      filename = makeFilename('tax-summary', accountName, s, e);
      const header = ['Invoice Date', 'Client', 'Service', 'Invoice Amount', 'Tax Amount', 'Status'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',            'Tax Summary'],
        ['Entity',            accountName],
        ['Period Start',      s],
        ['Period End',        e],
        ['Generated At',      generatedAt],
        ['Total Taxable Sales', fmtMoney(totalTaxable)],
        ['Total Tax Collected', fmtMoney(totalTax)],
      ], cols);
      const dataRows = taxRows.map(r => [
        fmtDate(r.created_at),
        r.client_name,
        r.service,
        fmtMoney(r.amount),
        fmtMoney(r.tax_amount),
        statusLabel(r.status),
      ]);
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'quarterly') {
      const yr    = new Date().getUTCFullYear();
      const qData = await svc.getQuarterly(accountId, { year: yr });
      filename = makeFilename(`quarterly-financial-${yr}`, accountName, `${yr}-01-01`, `${yr}-12-31`);
      const header = ['Quarter', 'Earned Revenue', 'Collected Revenue', 'Average Ticket', 'YoY Growth'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',        'Quarterly Financial'],
        ['Entity',        accountName],
        ['Year',          yr],
        ['Generated At',  generatedAt],
        ['Note',          'COGS, Gross Profit, Operating Expenses require accounting integration.'],
      ], cols);
      const quarterLabels = { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4', year: 'Full Year' };
      const dataRows = ['Q1', 'Q2', 'Q3', 'Q4', 'year'].map(k => {
        const q = qData.quarters[k] || {};
        return [
          quarterLabels[k],
          fmtMoney(q.earnedRevenue   || 0),
          fmtMoney(q.collectedRevenue || 0),
          q.avgTicket != null ? fmtMoney(q.avgTicket) : '',
          q.yoyGrowth != null ? fmtPct(q.yoyGrowth)  : '',
        ];
      });
      allRows = [...meta, header, ...dataRows];

    } else if (type === 'completion') {
      const analysis      = await completionSvc.getCompletionAnalysis(accountId, { start: s, end: e });
      const { summary, byService } = analysis;
      filename = makeFilename('job-completion-analysis', accountName, s, e);
      const header = ['Service', 'Completed', 'Cancelled', 'No-Shows', 'Completion Rate', 'Revenue Impact'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',                    'Job Completion Analysis'],
        ['Entity',                    accountName],
        ['Period Start',              s],
        ['Period End',                e],
        ['Generated At',              generatedAt],
        ['Overall Completion Rate',   summary.completionRate != null ? fmtPct(summary.completionRate * 100) : ''],
        ['Cancelled Revenue Impact',  fmtMoney(summary.cancelledRevenue)],
        ['No-Show Revenue Impact',    fmtMoney(summary.noShowRevenue)],
        ['Total Revenue Impact',      fmtMoney(summary.revenueImpact)],
      ], cols);
      const dataRows = byService.map(r => [
        r.service,
        r.completed,
        r.cancelled,
        r.noShows,
        r.completionRate != null ? fmtPct(r.completionRate * 100) : '',
        '',
      ]);
      allRows = [...meta, header, ...dataRows];

    } else {
      // Default: Revenue Summary
      const overview = await svc.getOverview(accountId, { start: s, end: e });
      const pk = overview.primaryKpis;
      filename = makeFilename('revenue-summary', accountName, s, e);
      const header = ['Metric', 'Value'];
      const cols = header.length;
      const meta = metaSection([
        ['Report',        'Revenue Summary'],
        ['Entity',        accountName],
        ['Period Start',  s],
        ['Period End',    e],
        ['Generated At',  generatedAt],
      ], cols);
      const dataRows = [
        ['Collected Revenue',    fmtMoney(pk.collectedRevenue.value)],
        ['Earned Revenue',       fmtMoney(pk.earnedRevenue.value)],
        ['Outstanding AR',       fmtMoney(pk.outstandingAr.value)],
        ['Open Invoices',        pk.outstandingAr.invoiceCount],
        ['Overdue Invoices',     pk.outstandingAr.overdueCount],
        ['Projected Month-End',  pk.projectedMonthEnd.status === 'ok' ? fmtMoney(pk.projectedMonthEnd.value) : ''],
      ];
      allRows = [...meta, header, ...dataRows];
    }

    const csv = buildCSV(allRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
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

// ── Forecast Readiness (legacy — kept for backwards compatibility) ─────────────
const forecastReadinessSvc = require('../services/revenueForecastReadinessService');

router.get('/forecast/readiness', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    let policies = {};
    try { policies = await policiesSvc.getPolicies(req.accountId); } catch (_) { /* table may not exist */ }
    const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
    res.json(await forecastReadinessSvc.getForecastReadiness(req.accountId, { year, policies }));
  } catch (err) {
    res.status(500).json({ error: 'Could not assess forecast readiness.' });
  }
});

// ── Forecasting Overview (V1) ─────────────────────────────────────────────────
const forecastingSvc = require('../services/forecastingService');

router.get('/forecasting/overview', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const result = await forecastingSvc.getOverview(req.accountId, { start, end });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Forecasting overview could not be loaded.' });
  }
});

// ── Metric Registry ───────────────────────────────────────────────────────────
const { listMetrics } = require('../services/revenueMetricRegistry');

router.get('/metrics', requireAuth, requireRole('owner', 'manager'), (_req, res) => {
  res.json({ metrics: listMetrics() });
});

// ── Customers Overview ────────────────────────────────────────────────────────
const custSvc = require('../services/customerAnalyticsService');

router.get('/customers/overview', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { start, end } = req.query;
  const accountId = req.accountId;
  try {
    const params = [accountId];
    let dateFilter = '';
    if (start) { params.push(start); dateFilter += ` AND j.scheduled_at >= $${params.length}::date`; }
    if (end)   { params.push(end);   dateFilter += ` AND j.scheduled_at <  ($${params.length}::date + INTERVAL '1 day')`; }

    const [topResult, activeResult, ltv, churn, segments] = await Promise.all([
      pool.query(
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
      ),
      pool.query(
        `SELECT COUNT(DISTINCT client_id)::int AS active
         FROM jobs j WHERE j.account_id = $1 AND j.status = 'complete'${dateFilter}`,
        params
      ),
      custSvc.getLtv(accountId),
      custSvc.getChurnAnalysis(accountId),
      custSvc.getSegmentAnalysis(accountId, { start, end }),
    ]);

    res.json({
      topClients: topResult.rows,
      summary: { activeClientCount: activeResult.rows[0]?.active || 0 },
      lifetimeValue: ltv,
      churn,
      segments,
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

// ── Report Readiness ─────────────────────────────────────────────────────────
// Returns per-report status based on actual backend data availability.
// P&L status is driven by accounting coverage; all others are always AVAILABLE.
router.get('/reports/readiness', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    // resolveSourceStatuses returns { fieldcore_core, fieldcore_payments, accounting, banking }
    // each with a .status string.  getFinancialCoverage() wraps that in evaluateCoverage()
    // which flattens sources into arrays — it has no .accounting key, so we go one level lower.
    const statuses   = await coverageSvc.resolveSourceStatuses(req.accountId);
    const acct       = statuses.accounting;
    const acctStatus = acct?.status; // 'active' | 'degraded' | 'not_connected' | 'not_configured'
    const unmapped   = acct?.connectionInfo?.unmappedAccountCount ?? 0;

    let pnlReadiness;
    if (acctStatus === 'active' && unmapped === 0) {
      pnlReadiness = { status: 'AVAILABLE', exportType: 'pnl' };
    } else if (acctStatus === 'active' && unmapped > 0) {
      pnlReadiness = {
        status:     'INCOMPLETE_FINANCIAL_COVERAGE',
        exportType: null,
        reason:     `${unmapped} account${unmapped === 1 ? '' : 's'} need mapping`,
      };
    } else if (acctStatus === 'degraded') {
      pnlReadiness = {
        status:     'INCOMPLETE_FINANCIAL_COVERAGE',
        exportType: null,
        reason:     'QuickBooks reconnect required',
      };
    } else {
      pnlReadiness = {
        status:     'INCOMPLETE_FINANCIAL_COVERAGE',
        exportType: null,
        reason:     'Connect QuickBooks Online',
      };
    }

    res.json({
      reports: {
        summary:       { status: 'AVAILABLE', exportType: 'summary' },
        services:      { status: 'AVAILABLE', exportType: 'services' },
        invoices:      { status: 'AVAILABLE', exportType: 'invoices' },
        technicians:   { status: 'AVAILABLE', exportType: 'technicians' },
        customers:     { status: 'AVAILABLE', exportType: 'customers' },
        forecasting:   { status: 'AVAILABLE', exportType: 'forecasting' },
        cancellations: { status: 'AVAILABLE', exportType: 'cancellations' },
        tax:           { status: 'AVAILABLE', exportType: 'tax' },
        quarterly:     { status: 'AVAILABLE', exportType: 'quarterly' },
        completion:    { status: 'AVAILABLE', exportType: 'completion' },
        pnl:           pnlReadiness,
      },
    });
  } catch (err) {
    console.error('[revenue] reports/readiness error', err.message);
    res.status(500).json({ error: 'Report readiness could not be loaded.' });
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
