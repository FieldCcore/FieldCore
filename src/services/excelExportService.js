'use strict';

// ── FieldCore Excel Export Engine ─────────────────────────────────────────────
// Professional .xlsx workbooks: styling, formulas, multiple sheets, print setup.
// Uses ExcelJS — do not hand-build XLSX XML.

const ExcelJS = require('exceljs');

// ─── Brand Palette ────────────────────────────────────────────────────────────
const C = {
  NAVY:       '1C2333',
  NAVY2:      '2A3752',  // sub-header row in title block
  SAND:       'D6B58A',
  WHITE:      'FFFFFF',
  SEC_BG:     'E8EAED',  // section header fill
  TOTAL_BG:   'DDE1E8',  // total / grand total row fill
  ALT_BG:     'F6F7F9',  // alternating data row fill
  TEXT:       '1C2333',
  TEXT2:      '4B5563',
  BORDER:     'B8BEC9',
  BORDER2:    'D1D5DB',
  DISCLAIMER: 'FFFFE0',  // soft yellow for disclaimer rows
};

// ─── Number Formats ───────────────────────────────────────────────────────────
const FMT = {
  USD:      '"$"#,##0.00;("$"#,##0.00);"-"',
  USD0:     '"$"#,##0;("$"#,##0);"-"',
  PCT1:     '0.0%',
  INT:      '#,##0',
  DATE:     'mm/dd/yyyy',
  DT:       'mm/dd/yyyy hh:mm',
  TEXT:     '@',
};

const FONT = 'Calibri';

// ─── Status Labels ────────────────────────────────────────────────────────────
const STATUS_MAP = {
  complete:'Completed', completed:'Completed', scheduled:'Scheduled',
  in_progress:'In Progress', cancelled:'Cancelled', canceled:'Cancelled',
  no_show:'No-Show', draft:'Draft', pending:'Pending', paid:'Paid',
  partial:'Partial', unpaid:'Unpaid', overdue:'Overdue', void:'Void',
  refunded:'Refunded', active:'Active', inactive:'Inactive', at_risk:'At Risk',
  tech:'Technician', manager:'Manager', owner:'Owner',
};

function statusLabel(s) {
  if (!s) return '';
  return STATUS_MAP[String(s).toLowerCase()] || String(s);
}

// ─── Injection-Safe Text ───────────────────────────────────────────────────────
function safe(v) {
  const s = String(v ?? '');
  return (s.length > 0 && '=+@-'.includes(s[0])) ? "'" + s : s;
}

// ─── Excel Date ───────────────────────────────────────────────────────────────
function xDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

// ─── Filename ─────────────────────────────────────────────────────────────────
function makeXlsxFilename(slug, accountName, start, end) {
  const entity = (accountName || 'FieldCore')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, '_')
    .slice(0, 35);
  const s = (start || '').slice(0, 10) || 'all';
  const e = (end   || '').slice(0, 10) || 'all';
  return `FieldCore_${slug}_${entity}_${s}_to_${e}.xlsx`;
}

// ─── Workbook Factory ─────────────────────────────────────────────────────────
function createWorkbook(accountName) {
  const wb      = new ExcelJS.Workbook();
  wb.creator    = 'FieldCore';
  wb.company    = accountName || 'FieldCore';
  wb.created    = new Date();
  wb.modified   = new Date();
  return wb;
}

// ─── Low-Level Cell Styler ────────────────────────────────────────────────────
function sc(cell, o = {}) {
  const { bold=false, sz=11, color=C.TEXT, bg=null, italic=false,
    align='left', numFmt=null, borderTop=null, borderBot=null, wrap=false } = o;
  cell.font = { name: FONT, bold, italic, size: sz, color: { argb: 'FF'+color } };
  if (bg) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+bg } };
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: wrap };
  if (numFmt) cell.numFmt = numFmt;
  if (borderTop || borderBot) {
    cell.border = {
      top:    borderTop ? { style: borderTop,  color:{ argb:'FF'+C.BORDER } } : undefined,
      bottom: borderBot ? { style: borderBot,  color:{ argb:'FF'+C.BORDER } } : undefined,
    };
  }
}

// ─── Title Block ─────────────────────────────────────────────────────────────
// Returns the row number of the FIRST DATA row (just after the block).
function addTitleBlock(ws, meta, colCount) {
  const { reportName, entity, periodStart, periodEnd, generatedAt, timezone } = meta;
  const period = (periodStart && periodEnd) ? `${periodStart} — ${periodEnd}` : (periodStart || periodEnd || 'All Dates');

  const fillFull = (row, argb) => {
    for (let c = 1; c <= colCount; c++)
      row.getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb } };
  };

  // Row 1 — Brand
  const r1 = ws.addRow(Array(colCount).fill(null));
  ws.mergeCells(r1.number, 1, r1.number, colCount);
  r1.height = 34;
  r1.getCell(1).value = 'FIELDCORE';
  sc(r1.getCell(1), { bold:true, sz:20, color:C.WHITE, bg:C.NAVY, align:'left' });
  fillFull(r1, 'FF'+C.NAVY);

  // Row 2 — Report name
  const r2 = ws.addRow(Array(colCount).fill(null));
  ws.mergeCells(r2.number, 1, r2.number, colCount);
  r2.height = 22;
  r2.getCell(1).value = reportName;
  sc(r2.getCell(1), { bold:true, sz:13, color:C.SAND, bg:C.NAVY, align:'left' });
  fillFull(r2, 'FF'+C.NAVY);

  // Row 3 — Meta line
  const metaLine = [
    entity        ? `Entity: ${entity}`         : null,
    period        ? `Period: ${period}`          : null,
    timezone      ? `TZ: ${timezone}`            : null,
    generatedAt   ? `Generated: ${generatedAt}` : null,
  ].filter(Boolean).join('    ');
  const r3 = ws.addRow(Array(colCount).fill(null));
  ws.mergeCells(r3.number, 1, r3.number, colCount);
  r3.height = 16;
  r3.getCell(1).value = metaLine;
  sc(r3.getCell(1), { sz:9, color:C.WHITE, bg:C.NAVY2, align:'left' });
  fillFull(r3, 'FF'+C.NAVY2);

  // Row 4 — spacer
  const r4 = ws.addRow(Array(colCount).fill(null));
  r4.height = 5;

  return ws.rowCount + 1;
}

// ─── Section Header ───────────────────────────────────────────────────────────
function addSectionHeader(ws, label, colCount) {
  const row = ws.addRow(Array(colCount).fill(null));
  ws.mergeCells(row.number, 1, row.number, colCount);
  row.height = 18;
  row.getCell(1).value = label.toUpperCase();
  sc(row.getCell(1), { bold:true, sz:9, color:C.TEXT, bg:C.SEC_BG, align:'left' });
  for (let c = 2; c <= colCount; c++)
    row.getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+C.SEC_BG } };
  return row.number;
}

// ─── Column Header Row ────────────────────────────────────────────────────────
function addHeaderRow(ws, headers, colCount) {
  const row = ws.addRow(headers);
  row.height = 20;
  const nc = colCount || headers.length;
  for (let i = 1; i <= nc; i++) {
    sc(row.getCell(i), {
      bold:true, sz:10, color:C.WHITE, bg:'374151',
      align: i === 1 ? 'left' : 'right',
      borderBot: 'medium',
    });
  }
  return row.number;
}

// ─── Data Row ─────────────────────────────────────────────────────────────────
function addDataRow(ws, values, opts = {}) {
  const { alt=false, fmts=[], aligns=[] } = opts;
  const row = ws.addRow(values);
  row.height = 16;
  values.forEach((_, idx) => {
    const cell = row.getCell(idx + 1);
    const nf = fmts[idx] || null;
    const al = aligns[idx] || (nf && nf !== '@' && nf !== FMT.DATE && nf !== FMT.DT && nf !== FMT.TEXT ? 'right' : 'left');
    sc(cell, { sz:10, color:C.TEXT, bg: alt ? C.ALT_BG : null, align:al, numFmt:nf });
    if (alt && !nf)
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+C.ALT_BG } };
  });
  return row;
}

// ─── Total Row ────────────────────────────────────────────────────────────────
function addTotalRow(ws, values, opts = {}) {
  const { fmts=[], grand=false } = opts;
  const row = ws.addRow(values);
  row.height = 19;
  values.forEach((_, idx) => {
    const cell = row.getCell(idx + 1);
    const nf = fmts[idx] || null;
    const al = nf && nf !== '@' && nf !== FMT.DATE ? 'right' : (idx === 0 ? 'left' : 'right');
    sc(cell, {
      bold:true, sz:10, color:C.TEXT, bg:C.TOTAL_BG, align:al, numFmt:nf,
      borderTop: grand ? 'medium' : 'thin',
      borderBot: grand ? 'double' : 'thin',
    });
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+C.TOTAL_BG } };
  });
  return row;
}

// ─── Disclaimer Row ───────────────────────────────────────────────────────────
function addDisclaimerRow(ws, text, colCount) {
  const row = ws.addRow(Array(colCount).fill(null));
  ws.mergeCells(row.number, 1, row.number, colCount);
  row.height = 28;
  row.getCell(1).value = text;
  sc(row.getCell(1), { sz:9, italic:true, color:C.TEXT2, bg:'FFFFF0', align:'left', wrap:true });
  for (let c = 2; c <= colCount; c++)
    row.getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFFFF00' } };
  return row.number;
}

// ─── Print Settings ───────────────────────────────────────────────────────────
function applyPrint(ws, { landscape=false } = {}) {
  ws.pageSetup = {
    paperSize: 9, orientation: landscape ? 'landscape' : 'portrait',
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left:0.5, right:0.5, top:0.75, bottom:0.75, header:0.3, footer:0.3 },
    printTitlesRow: '1:1',
  };
  ws.headerFooter = {
    oddFooter: '&CConfidential — Prepared from FieldCore operational records&R&P of &N',
  };
}

// ─── Freeze + Filter ─────────────────────────────────────────────────────────
function freeze(ws, rowNum) {
  ws.views = [{ state:'frozen', xSplit:0, ySplit:rowNum - 1, activeCell:`A${rowNum}` }];
}

function autoFilter(ws, hRow, colCount) {
  ws.autoFilter = { from:{ row:hRow, column:1 }, to:{ row:hRow, column:colCount } };
}

// ─── Column Widths ────────────────────────────────────────────────────────────
function colWidths(ws, widths) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ─── Send Workbook ─────────────────────────────────────────────────────────────
async function sendWorkbook(res, wb, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

// ══════════════════════════════════════════════════════════════════════════════
//  REPORT BUILDERS
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Revenue Summary ────────────────────────────────────────────────────────
function buildRevenueSummary(overview, meta) {
  const wb = createWorkbook(meta.entity);
  const ws = wb.addWorksheet('Revenue Summary');
  const pk = overview.primaryKpis || {};
  const nc = 3;

  colWidths(ws, [32, 18, 20]);
  addTitleBlock(ws, { ...meta, reportName: 'Revenue Summary' }, nc);
  addSectionHeader(ws, 'Key Performance Metrics', nc);
  const hRow = addHeaderRow(ws, ['Metric', 'Value', 'Notes'], nc);

  const rows = [
    ['Collected Revenue',   parseFloat(pk.collectedRevenue?.value   || 0), '',            FMT.USD],
    ['Earned Revenue',      parseFloat(pk.earnedRevenue?.value      || 0), '',            FMT.USD],
    ['Outstanding A/R',     parseFloat(pk.outstandingAr?.value      || 0), '',            FMT.USD],
    ['Open Invoices',       pk.outstandingAr?.invoiceCount || 0,           '',            FMT.INT],
    ['Overdue Invoices',    pk.outstandingAr?.overdueCount || 0,           'Requires action', FMT.INT],
  ];
  if (pk.projectedMonthEnd?.status === 'ok') {
    rows.push(['Projected Month-End', parseFloat(pk.projectedMonthEnd.value || 0), 'Estimate', FMT.USD]);
  }
  rows.forEach(([label, val, note, nf], i) => {
    addDataRow(ws, [label, val, note], { alt: i%2===1, fmts:[null, nf, null], aligns:['left','right','left'] });
  });

  applyPrint(ws);
  return wb;
}

// ── 2. Revenue by Service ─────────────────────────────────────────────────────
function buildRevenueByService(services, meta) {
  const wb = createWorkbook(meta.entity);

  // Sheet 1: Service Summary
  const ws = wb.addWorksheet('Revenue by Service');
  const nc = 9;
  colWidths(ws, [26, 9, 16, 16, 14, 12, 16, 15, 13]);
  addTitleBlock(ws, { ...meta, reportName: 'Revenue by Service' }, nc);

  const headers = ['Service','Jobs','Earned Revenue','Collected Revenue','Avg Ticket','Labor Hrs','Rev / Labor Hr','Completion Rate','Revenue Share'];
  const hRow = addHeaderRow(ws, headers, nc);
  const fmts = [null, FMT.INT, FMT.USD, FMT.USD, FMT.USD, '0.0', FMT.USD, FMT.PCT1, FMT.PCT1];

  let totEarned = 0, totCollected = 0, totJobs = 0;
  const dStart = ws.rowCount + 1;
  services.forEach((sv, i) => {
    const earned    = parseFloat(sv.earnedRevenue)    || 0;
    const collected = parseFloat(sv.collectedRevenue) || 0;
    const jobs      = parseInt(sv.jobs)               || 0;
    const hrs       = sv.laborHours != null ? parseFloat(sv.laborHours) : null;
    const cr        = sv.completionRate != null ? parseFloat(sv.completionRate) : null;       // 0-1
    const rs        = sv.revenueShare  != null ? parseFloat(sv.revenueShare) / 100 : null;   // convert 0-100 → 0-1
    totEarned    += earned;
    totCollected += collected;
    totJobs      += jobs;
    addDataRow(ws, [safe(sv.service), jobs, earned, collected,
      sv.avgTicket != null ? parseFloat(sv.avgTicket) : null,
      hrs,
      hrs != null && hrs > 0 ? earned / hrs : null,
      cr, rs], { alt: i%2===1, fmts });
  });
  const dEnd = ws.rowCount;
  addTotalRow(ws, ['TOTAL', totJobs, totEarned, totCollected, null, null, null, null, null],
    { fmts, grand:true });

  autoFilter(ws, hRow, nc);
  freeze(ws, hRow + 1);
  applyPrint(ws, { landscape: true });
  return wb;
}

// ── 3. Invoice & Collections ──────────────────────────────────────────────────
function buildInvoices(invoiceRows, meta) {
  const wb = createWorkbook(meta.entity);

  // ─ Sheet 1: Summary ─
  const wss = wb.addWorksheet('Summary');
  colWidths(wss, [30, 18]);
  addTitleBlock(wss, { ...meta, reportName: 'Invoice & Collections — Summary' }, 2);
  addSectionHeader(wss, 'Collections Overview', 2);
  addHeaderRow(wss, ['Metric', 'Amount'], 2);

  const totalInvoiced   = invoiceRows.reduce((s, r) => s + (parseFloat(r.amount)     || 0), 0);
  const totalCollected  = invoiceRows.filter(r => r.status === 'paid').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalOutstanding= invoiceRows.filter(r => ['pending','partial','unpaid'].includes(String(r.status))).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalOverdue    = invoiceRows.filter(r => r.status === 'overdue').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalTax        = invoiceRows.reduce((s, r) => s + (parseFloat(r.tax_amount) || 0), 0);

  [['Total Invoiced', totalInvoiced], ['Total Collected', totalCollected],
   ['Outstanding A/R', totalOutstanding], ['Overdue', totalOverdue], ['Total Tax', totalTax],
  ].forEach(([label, val], i) => {
    addDataRow(wss, [label, val], { alt: i%2===1, fmts:[null, FMT.USD], aligns:['left','right'] });
  });
  applyPrint(wss);

  // ─ Sheet 2: A/R Aging ─
  const wsa = wb.addWorksheet('A-R Aging');
  colWidths(wsa, [28, 12, 18]);
  addTitleBlock(wsa, { ...meta, reportName: 'A/R Aging — Outstanding Invoices' }, 3);
  addHeaderRow(wsa, ['Aging Bucket', 'Invoice Count', 'Outstanding Balance'], 3);

  const today = new Date();
  const buckets = { current:{n:0,amt:0}, d30:{n:0,amt:0}, d60:{n:0,amt:0}, d90:{n:0,amt:0}, d90p:{n:0,amt:0} };
  invoiceRows.filter(r => ['pending','partial','unpaid','overdue'].includes(String(r.status))).forEach(r => {
    const amt  = parseFloat(r.amount) || 0;
    const due  = r.due_date ? new Date(r.due_date) : null;
    const days = due ? Math.floor((today - due) / 86400000) : 0;
    if (days <= 0)       { buckets.current.n++; buckets.current.amt += amt; }
    else if (days <= 30) { buckets.d30.n++;     buckets.d30.amt     += amt; }
    else if (days <= 60) { buckets.d60.n++;     buckets.d60.amt     += amt; }
    else if (days <= 90) { buckets.d90.n++;     buckets.d90.amt     += amt; }
    else                 { buckets.d90p.n++;    buckets.d90p.amt    += amt; }
  });
  [['Current (not yet due)', buckets.current], ['1–30 Days Overdue', buckets.d30],
   ['31–60 Days Overdue', buckets.d60], ['61–90 Days Overdue', buckets.d90],
   ['90+ Days Overdue', buckets.d90p],
  ].forEach(([label, b], i) => {
    addDataRow(wsa, [label, b.n, b.amt], { alt: i%2===1, fmts:[null, FMT.INT, FMT.USD], aligns:['left','right','right'] });
  });
  const agingTotalN   = Object.values(buckets).reduce((s, b) => s + b.n, 0);
  const agingTotalAmt = Object.values(buckets).reduce((s, b) => s + b.amt, 0);
  addTotalRow(wsa, ['TOTAL A/R OUTSTANDING', agingTotalN, agingTotalAmt],
    { fmts:[null, FMT.INT, FMT.USD], grand:true });
  applyPrint(wsa);

  // ─ Sheet 3: Invoice Detail ─
  const wsd = wb.addWorksheet('Invoice Detail');
  const nc  = 8;
  colWidths(wsd, [14, 26, 22, 12, 12, 13, 14, 12]);
  addTitleBlock(wsd, { ...meta, reportName: 'Invoice Detail' }, nc);
  const hRow = addHeaderRow(wsd, ['Invoice ID','Client','Service','Invoice Date','Due Date','Status','Amount','Tax'], nc);
  const fmts = [FMT.TEXT, null, null, FMT.DATE, FMT.DATE, null, FMT.USD, FMT.USD];
  const aligns = ['left','left','left','left','left','left','right','right'];
  invoiceRows.forEach((r, i) => {
    addDataRow(wsd, [
      r.id, safe(r.client), safe(r.service),
      xDate(r.created_at), xDate(r.due_date),
      statusLabel(r.status),
      parseFloat(r.amount) || 0,
      parseFloat(r.tax_amount) || 0,
    ], { alt: i%2===1, fmts, aligns });
  });
  autoFilter(wsd, hRow, nc);
  freeze(wsd, hRow + 1);
  applyPrint(wsd, { landscape: true });

  return wb;
}

// ── 4. Revenue by Technician ─────────────────────────────────────────────────
function buildTechnicians(techRows, meta) {
  const wb = createWorkbook(meta.entity);

  // ─ Sheet 1: Team Summary ─
  const ws = wb.addWorksheet('Team Summary');
  const nc = 8;
  colWidths(ws, [26, 14, 13, 12, 16, 14, 12, 16]);
  addTitleBlock(ws, { ...meta, reportName: 'Revenue by Technician' }, nc);
  addDisclaimerRow(ws, 'Note: Labor hours are based on scheduled job duration. Primary tech assignment only.', nc);

  const headers = ['Technician','Role','Jobs Completed','Lost Jobs','Production Value','Avg Ticket','Labor Hrs','Rev / Labor Hr'];
  const hRow = addHeaderRow(ws, headers, nc);
  const fmts = [null, null, FMT.INT, FMT.INT, FMT.USD, FMT.USD, '0.0', FMT.USD];

  let totJobs=0, totLost=0, totEarned=0, totHrs=0;
  techRows.forEach((r, i) => {
    const earned = parseFloat(r.earned_revenue) || 0;
    const jobs   = r.completed_jobs || 0;
    const hrs    = r.total_minutes > 0 ? r.total_minutes / 60 : null;
    totJobs  += jobs;
    totLost  += r.lost_jobs || 0;
    totEarned+= earned;
    if (hrs != null) totHrs += hrs;
    addDataRow(ws, [
      safe(r.technician_name),
      statusLabel(r.tech_role) || r.tech_role || '',
      jobs, r.lost_jobs || 0, earned,
      jobs > 0 ? earned / jobs : null,
      hrs,
      hrs != null && hrs > 0 ? earned / hrs : null,
    ], { alt: i%2===1, fmts });
  });
  addTotalRow(ws, ['TOTAL', '', totJobs, totLost, totEarned,
    totJobs > 0 ? totEarned / totJobs : null,
    totHrs > 0 ? totHrs : null,
    totHrs > 0 ? totEarned / totHrs : null],
    { fmts, grand:true });

  autoFilter(ws, hRow, nc);
  freeze(ws, hRow + 1);
  applyPrint(ws, { landscape: true });
  return wb;
}

// ── 5. Customer Value ─────────────────────────────────────────────────────────
function buildCustomers(topRows, ltvData, meta) {
  const wb = createWorkbook(meta.entity);

  // ─ Sheet 1: Customer Summary ─
  const ws = wb.addWorksheet('Customer Summary');
  const nc = 4;
  colWidths(ws, [30, 13, 18, 14]);
  addTitleBlock(ws, { ...meta, reportName: 'Customer Value Report' }, nc);

  // LTV summary block if available
  if (ltvData?.eligible && ltvData?.data) {
    const d = ltvData.data;
    addSectionHeader(ws, 'Lifetime Value Summary (All-Time)', nc);
    [
      ['Avg Revenue / Customer',    parseFloat(d.avgRevenuePerCustomer    || 0)],
      ['Median Revenue / Customer', parseFloat(d.medianRevenuePerCustomer || 0)],
      ['Avg Jobs / Customer',       parseFloat(d.avgJobsPerCustomer       || 0)],
      ['Avg Ticket',                parseFloat(d.avgTicket                || 0)],
    ].forEach(([label, val], i) => {
      const nf = i < 2 || i === 3 ? FMT.USD : '0.0';
      addDataRow(ws, [label, null, val, null], { alt: i%2===1, fmts:[null, null, nf, null], aligns:['left','left','right','left'] });
    });
    ws.addRow(Array(nc).fill(null)).height = 6;
  }

  addSectionHeader(ws, 'Top Clients by Revenue — Period', nc);
  const hRow = addHeaderRow(ws, ['Client', 'Jobs Completed', 'Earned Revenue', 'Last Service'], nc);
  const fmts = [null, FMT.INT, FMT.USD, FMT.DATE];
  const aligns = ['left','right','right','left'];
  let totJobs=0, totEarned=0;
  topRows.forEach((r, i) => {
    const jobs   = r.job_count || 0;
    const earned = parseFloat(r.earned_revenue) || 0;
    totJobs   += jobs;
    totEarned += earned;
    addDataRow(ws, [safe(r.name), jobs, earned, xDate(r.last_job_at)], { alt: i%2===1, fmts, aligns });
  });
  addTotalRow(ws, ['TOTAL', totJobs, totEarned, null], { fmts, grand:true });

  autoFilter(ws, hRow, nc);
  freeze(ws, hRow + 1);
  applyPrint(ws);
  return wb;
}

// ── 6. Forecasting ────────────────────────────────────────────────────────────
function buildForecasting(fc, meta) {
  const wb = createWorkbook(meta.entity);

  // ─ Sheet 1: Forecast Summary ─
  const ws1 = wb.addWorksheet('Forecast Summary');
  colWidths(ws1, [28, 18, 20]);
  addTitleBlock(ws1, { ...meta, reportName: 'Forecast Pipeline Report', periodStart: fc.period?.start, periodEnd: fc.period?.end }, 3);
  addSectionHeader(ws1, 'Forecast Summary', 3);
  addHeaderRow(ws1, ['Metric', 'Value', 'Notes'], 3);
  const fmts2 = [null, FMT.USD, null];
  const a2    = ['left','right','left'];
  [
    ['Earned Revenue (Actual)',       parseFloat(fc.actual?.earnedRevenue   || 0), 'Completed jobs in period'],
    ['Booked Revenue (Scheduled)',    parseFloat(fc.booked?.revenue         || 0), 'Jobs not yet complete'],
    ['Projected Period Revenue',      parseFloat(fc.forecast?.projectedRevenue || 0), 'Earned + Booked + Run-rate'],
    ['Forecast Gap',                  parseFloat(fc.forecast?.forecastGap   || 0), fc.forecast?.forecastGap >= 0 ? 'Ahead of pace' : 'Behind pace'],
  ].forEach(([label, val, note], i) => {
    addDataRow(ws1, [label, val, note], { alt: i%2===1, fmts: fmts2, aligns: a2 });
  });
  ws1.addRow([]).height = 4;
  addSectionHeader(ws1, 'Forecast Confidence', 3);
  addHeaderRow(ws1, ['Attribute', 'Value', ''], 3);
  [
    ['Readiness',   fc.forecast?.readiness   || 'N/A'],
    ['Confidence',  fc.forecast?.confidence  || 'N/A'],
    ['Horizon (days)', fc.forecast?.horizonDays || 'N/A'],
  ].forEach(([label, val], i) => {
    addDataRow(ws1, [label, val, ''], { alt: i%2===1, fmts:[null,null,null], aligns:['left','left','left'] });
  });
  applyPrint(ws1);

  // ─ Sheet 2: Booked Pipeline ─
  const ws2 = wb.addWorksheet('Booked Pipeline');
  const nc  = 5;
  colWidths(ws2, [13, 26, 24, 14, 16]);
  addTitleBlock(ws2, { ...meta, reportName: 'Booked Pipeline Detail' }, nc);
  const hRow = addHeaderRow(ws2, ['Scheduled Date','Client','Service','Status','Booked Value'], nc);
  const fmts = [FMT.DATE, null, null, null, FMT.USD];
  const aligns = ['left','left','left','left','right'];
  const sorted = [...(fc.drivers || [])].sort((a, b) => (a.scheduledAt || '') < (b.scheduledAt || '') ? -1 : 1);
  let totBooked = 0;
  sorted.forEach((d, i) => {
    const val = parseFloat(d.amount) || 0;
    totBooked += val;
    addDataRow(ws2, [xDate(d.scheduledAt), safe(d.clientName), safe(d.serviceType || ''), statusLabel(d.status), val],
      { alt: i%2===1, fmts, aligns });
  });
  addTotalRow(ws2, ['', '', '', 'TOTAL BOOKED', totBooked], { fmts:[null,null,null,null,FMT.USD], grand:true });
  autoFilter(ws2, hRow, nc);
  freeze(ws2, hRow + 1);
  applyPrint(ws2, { landscape: true });
  return wb;
}

// ── 7. Cancellations & No-Shows ───────────────────────────────────────────────
function buildCancellations(cancelRows, reasonMap, meta) {
  const wb = createWorkbook(meta.entity);
  const REASONS = {
    customer_cancelled:'Customer Cancelled', customer_unavailable:'Customer Unavailable',
    weather:'Weather', tech_unavailable:'Technician Unavailable',
    scheduling_conflict:'Scheduling Conflict', duplicate_booking:'Duplicate Booking',
    payment_issue:'Payment Issue', other:'Other',
  };

  // ─ Sheet 1: Summary ─
  const ws1 = wb.addWorksheet('Summary');
  colWidths(ws1, [28, 14]);
  addTitleBlock(ws1, { ...meta, reportName: 'Cancellation & No-Show Report' }, 2);
  addSectionHeader(ws1, 'Summary', 2);
  addHeaderRow(ws1, ['Metric', 'Value'], 2);

  const cancelled = cancelRows.filter(r => r.status === 'cancelled');
  const noShows   = cancelRows.filter(r => r.status === 'no_show');
  const totalImpact = cancelRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  [
    ['Cancellations',         cancelled.length, FMT.INT],
    ['No-Shows',              noShows.length,   FMT.INT],
    ['Total Lost Jobs',       cancelRows.length, FMT.INT],
    ['Total Revenue Impact',  totalImpact,       FMT.USD],
  ].forEach(([label, val, nf], i) => {
    addDataRow(ws1, [label, val], { alt: i%2===1, fmts:[null, nf], aligns:['left','right'] });
  });
  applyPrint(ws1);

  // ─ Sheet 2: Job Detail ─
  const ws2 = wb.addWorksheet('Job Detail');
  const nc  = 7;
  colWidths(ws2, [13, 26, 24, 13, 22, 16, 22]);
  addTitleBlock(ws2, { ...meta, reportName: 'Cancellation Detail' }, nc);
  const hRow = addHeaderRow(ws2, ['Scheduled Date','Client','Service','Status','Reason','Revenue Impact','Assigned Tech'], nc);
  const fmts = [FMT.DATE, null, null, null, null, FMT.USD, null];
  const aligns = ['left','left','left','left','left','right','left'];

  let totImpact = 0;
  cancelRows.forEach((r, i) => {
    const raw  = reasonMap[r.id] || '';
    const impact = parseFloat(r.amount) || 0;
    totImpact += impact;
    addDataRow(ws2, [
      xDate(r.scheduled_at), safe(r.client_name), safe(r.service_type || 'Unspecified'),
      statusLabel(r.status), raw ? (REASONS[raw] || raw) : 'Not captured',
      impact, safe(r.tech_name),
    ], { alt: i%2===1, fmts, aligns });
  });
  addTotalRow(ws2, ['', '', '', '', 'TOTAL IMPACT', totImpact, ''], { fmts, grand:true });
  autoFilter(ws2, hRow, nc);
  freeze(ws2, hRow + 1);
  applyPrint(ws2, { landscape: true });
  return wb;
}

// ── 8. Tax Summary ────────────────────────────────────────────────────────────
function buildTax(taxRows, meta) {
  const wb = createWorkbook(meta.entity);

  // ─ Sheet 1: Tax Summary ─
  const ws1 = wb.addWorksheet('Tax Summary');
  colWidths(ws1, [30, 18]);
  addTitleBlock(ws1, { ...meta, reportName: 'Tax Summary' }, 2);
  addDisclaimerRow(ws1,
    'DISCLAIMER: This report reflects recorded tax data in FieldCore. It is NOT a tax return and should not be filed as such. Consult a tax professional.', 2);
  addSectionHeader(ws1, 'Tax Totals', 2);
  addHeaderRow(ws1, ['Metric', 'Amount'], 2);

  const totalInvoiceAmt = taxRows.reduce((s, r) => s + (parseFloat(r.amount)     || 0), 0);
  const totalTax        = taxRows.reduce((s, r) => s + (parseFloat(r.tax_amount) || 0), 0);
  const paid = taxRows.filter(r => r.status === 'paid');
  const collectedTax    = paid.reduce((s, r) => s + (parseFloat(r.tax_amount) || 0), 0);

  [
    ['Total Invoice Amount',  totalInvoiceAmt],
    ['Total Tax Recorded',    totalTax],
    ['Tax Collected (Paid)',  collectedTax],
  ].forEach(([label, val], i) => {
    addDataRow(ws1, [label, val], { alt: i%2===1, fmts:[null, FMT.USD], aligns:['left','right'] });
  });
  applyPrint(ws1);

  // ─ Sheet 2: Transaction Detail ─
  const ws2 = wb.addWorksheet('Transaction Detail');
  const nc  = 6;
  colWidths(ws2, [13, 26, 24, 14, 14, 13]);
  addTitleBlock(ws2, { ...meta, reportName: 'Tax Transaction Detail' }, nc);
  addDisclaimerRow(ws2, 'FieldCore tax data only. Not a tax filing. Verify with your accountant.', nc);
  const hRow = addHeaderRow(ws2, ['Invoice Date','Client','Service','Invoice Amount','Tax Amount','Status'], nc);
  const fmts = [FMT.DATE, null, null, FMT.USD, FMT.USD, null];
  const aligns = ['left','left','left','right','right','left'];
  taxRows.forEach((r, i) => {
    addDataRow(ws2, [
      xDate(r.created_at), safe(r.client_name), safe(r.service),
      parseFloat(r.amount) || 0, parseFloat(r.tax_amount) || 0, statusLabel(r.status),
    ], { alt: i%2===1, fmts, aligns });
  });
  addTotalRow(ws2, ['', '', 'TOTAL', totalInvoiceAmt, totalTax, ''], { fmts, grand:true });
  autoFilter(ws2, hRow, nc);
  freeze(ws2, hRow + 1);
  applyPrint(ws2, { landscape: true });
  return wb;
}

// ── 9. Quarterly Financial ────────────────────────────────────────────────────
function buildQuarterly(qData, year, meta) {
  const wb = createWorkbook(meta.entity);
  const ws = wb.addWorksheet('Quarterly Financial');
  const nc = 6;
  colWidths(ws, [30, 16, 16, 16, 16, 16]);

  addTitleBlock(ws, { ...meta, reportName: `Quarterly Financial — ${year}`, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` }, nc);
  addDisclaimerRow(ws, 'COGS, Gross Profit, and Operating Expenses require accounting integration (QuickBooks). Revenue data sourced from FieldCore jobs.', nc);

  const qs = qData.quarters || {};
  const Q = (k) => qs[k] || {};

  const hRow = addHeaderRow(ws, ['', 'Q1', 'Q2', 'Q3', 'Q4', 'Full Year'], nc);
  const fmts  = [null, FMT.USD, FMT.USD, FMT.USD, FMT.USD, FMT.USD];
  const aligns = ['left', 'right', 'right', 'right', 'right', 'right'];

  const addFinRow = (label, vals, opts = {}) => {
    const row = ws.addRow([label, ...vals]);
    row.height = opts.total ? 19 : 16;
    const nc2 = nc;
    for (let i = 1; i <= nc2; i++) {
      const cell = row.getCell(i);
      const nf = fmts[i - 1] || null;
      const al = aligns[i - 1] || 'left';
      const bg = opts.section ? C.SEC_BG : opts.total ? C.TOTAL_BG : (opts.alt ? C.ALT_BG : null);
      sc(cell, {
        bold: opts.bold || opts.total || opts.section,
        sz: opts.section ? 9 : 10,
        color: opts.section ? C.TEXT : C.TEXT,
        bg, align: al, numFmt: nf,
        borderTop: opts.total ? (opts.grand ? 'medium' : 'thin') : null,
        borderBot: opts.total ? (opts.grand ? 'double' : 'thin') : null,
      });
      if (bg) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+bg } };
    }
    return row;
  };

  const v = (k, field) => parseFloat(Q(k)[field] || 0);
  const yr = (field) => ['Q1','Q2','Q3','Q4'].reduce((s, k) => s + v(k, field), 0);

  // REVENUE section
  addSectionHeader(ws, 'REVENUE', nc);
  addFinRow('Service Revenue', ['Q1','Q2','Q3','Q4'].map(k => v(k,'earnedRevenue')).concat(yr('earnedRevenue')), { alt:false });
  addFinRow('TOTAL REVENUE',   ['Q1','Q2','Q3','Q4'].map(k => v(k,'earnedRevenue')).concat(yr('earnedRevenue')), { total:true, grand:true, bold:true });

  ws.addRow(Array(nc).fill(null)).height = 6;

  // COLLECTED section
  addSectionHeader(ws, 'COLLECTIONS', nc);
  addFinRow('Collected Revenue', ['Q1','Q2','Q3','Q4'].map(k => v(k,'collectedRevenue')).concat(yr('collectedRevenue')), { alt:false });

  ws.addRow(Array(nc).fill(null)).height = 6;

  // PERFORMANCE section
  addSectionHeader(ws, 'JOB PERFORMANCE', nc);
  addFinRow('Average Ticket', ['Q1','Q2','Q3','Q4'].map(k => Q(k).avgTicket != null ? parseFloat(Q(k).avgTicket) : null).concat(null), { alt:true });
  addFinRow('YoY Growth',
    ['Q1','Q2','Q3','Q4'].map(k => Q(k).yoyGrowth != null ? parseFloat(Q(k).yoyGrowth) / 100 : null).concat(null),
    { alt:false });

  // Update fmts for YoY row — last data row was added with fmts from array; override
  const yoyRow = ws.getRow(ws.rowCount);
  for (let i = 2; i <= 5; i++) {
    if (yoyRow.getCell(i).value != null) yoyRow.getCell(i).numFmt = FMT.PCT1;
  }

  ws.addRow(Array(nc).fill(null)).height = 6;
  addDisclaimerRow(ws, 'Gross Profit, COGS, and Operating Expenses available after QuickBooks integration.', nc);

  applyPrint(ws, { landscape: true });
  return wb;
}

// ── 10. Job Completion Analysis ───────────────────────────────────────────────
function buildCompletion(analysis, meta) {
  const wb = createWorkbook(meta.entity);
  const { summary, byService } = analysis;

  // ─ Sheet 1: Summary ─
  const ws1 = wb.addWorksheet('Summary');
  colWidths(ws1, [30, 18]);
  addTitleBlock(ws1, { ...meta, reportName: 'Job Completion Analysis' }, 2);
  addSectionHeader(ws1, 'Completion Summary', 2);
  addHeaderRow(ws1, ['Metric', 'Value'], 2);
  const cr = summary.completionRate != null ? parseFloat(summary.completionRate) : null;
  [
    ['Overall Completion Rate', cr, FMT.PCT1],
    ['Cancelled Revenue Impact', parseFloat(summary.cancelledRevenue || 0), FMT.USD],
    ['No-Show Revenue Impact',   parseFloat(summary.noShowRevenue    || 0), FMT.USD],
    ['Total Revenue Impact',     parseFloat(summary.revenueImpact    || 0), FMT.USD],
  ].forEach(([label, val, nf], i) => {
    addDataRow(ws1, [label, val], { alt: i%2===1, fmts:[null, nf], aligns:['left','right'] });
  });
  applyPrint(ws1);

  // ─ Sheet 2: By Service ─
  const ws2 = wb.addWorksheet('By Service');
  const nc  = 5;
  colWidths(ws2, [26, 13, 13, 13, 16]);
  addTitleBlock(ws2, { ...meta, reportName: 'Completion by Service' }, nc);
  const hRow = addHeaderRow(ws2, ['Service','Completed','Cancelled','No-Shows','Completion Rate'], nc);
  const fmts = [null, FMT.INT, FMT.INT, FMT.INT, FMT.PCT1];

  let totComp=0, totCanc=0, totNS=0;
  byService.forEach((r, i) => {
    const rCr = r.completionRate != null ? parseFloat(r.completionRate) : null;
    totComp += r.completed || 0;
    totCanc += r.cancelled || 0;
    totNS   += r.noShows   || 0;
    addDataRow(ws2, [safe(r.service), r.completed||0, r.cancelled||0, r.noShows||0, rCr],
      { alt: i%2===1, fmts });
  });
  const totAll = totComp + totCanc + totNS;
  const totCr  = totAll > 0 ? totComp / totAll : null;
  addTotalRow(ws2, ['TOTAL', totComp, totCanc, totNS, totCr], { fmts, grand:true });
  autoFilter(ws2, hRow, nc);
  freeze(ws2, hRow + 1);
  applyPrint(ws2, { landscape: true });
  return wb;
}

// ── 11. Profit & Loss Statement ───────────────────────────────────────────────
function buildPnl(financialsData, meta) {
  const wb = createWorkbook(meta.entity);
  const ws = wb.addWorksheet('P&L Statement');
  const nc = 3;
  colWidths(ws, [32, 18, 32]);

  addTitleBlock(ws, { ...meta, reportName: 'Profit & Loss Statement' }, nc);
  addDisclaimerRow(ws,
    'COGS, margins, and expenses require QuickBooks integration. ' +
    'Gross Revenue is sourced from FieldCore completed jobs. ' +
    'This report is NOT a tax return or audited financial statement.',
    nc);

  const pnlRows = financialsData?.pnl?.rows || [];
  const get = (key) => pnlRows.find(r => r.key === key) || { value: null, status: 'unavailable' };

  const fmts    = [null, FMT.USD,  null];
  const pctFmts = [null, FMT.PCT1, null];
  const aligns  = ['left', 'right', 'left'];

  const usdVal  = (r) => (r.status === 'unavailable' || r.value == null) ? null : parseFloat(r.value);
  const pctVal  = (r) => (r.status === 'unavailable' || r.value == null) ? null : parseFloat(r.value) / 100;
  const noteStr = (r) => r.status === 'unavailable' ? 'Requires accounting integration' : '';

  // ─ REVENUE ─
  addSectionHeader(ws, 'REVENUE', nc);
  const gr     = get('grossRevenue');
  const refund = get('refunds');
  const netRev = get('netRevenue');
  addDataRow(ws,  ['Gross Revenue',     usdVal(gr),     noteStr(gr)],     { alt: false, fmts, aligns });
  addDataRow(ws,  ['Refunds & Credits', usdVal(refund), noteStr(refund)], { alt: true,  fmts, aligns });
  addTotalRow(ws, ['Net Revenue',       usdVal(netRev), ''],              { fmts });

  ws.addRow(Array(nc).fill(null)).height = 6;

  // ─ COST OF GOODS SOLD ─
  addSectionHeader(ws, 'COST OF GOODS SOLD', nc);
  const cogs = get('cogs');
  const gp   = get('grossProfit');
  const gm   = get('grossMargin');
  addDataRow(ws,  ['COGS',          usdVal(cogs), noteStr(cogs)], { alt: false, fmts, aligns });
  addTotalRow(ws, ['Gross Profit',  usdVal(gp),   ''],             { fmts });
  addDataRow(ws,  ['Gross Margin %', pctVal(gm),  noteStr(gm)],   { alt: false, fmts: pctFmts, aligns });

  ws.addRow(Array(nc).fill(null)).height = 6;

  // ─ OPERATING EXPENSES ─
  addSectionHeader(ws, 'OPERATING EXPENSES', nc);
  const opex     = get('operatingExpenses');
  const mfees    = get('merchantFees');
  const opProfit = get('operatingProfit');
  addDataRow(ws,  ['Operating Expenses', usdVal(opex),     noteStr(opex)],     { alt: false, fmts, aligns });
  addDataRow(ws,  ['Merchant Fees',      usdVal(mfees),    noteStr(mfees)],    { alt: true,  fmts, aligns });
  addTotalRow(ws, ['Operating Profit',   usdVal(opProfit), ''],                { fmts });

  ws.addRow(Array(nc).fill(null)).height = 6;

  // ─ TAXES ─
  addSectionHeader(ws, 'TAXES', nc);
  const taxes = get('taxes');
  addDataRow(ws, ['Taxes', usdVal(taxes), noteStr(taxes)], { alt: false, fmts, aligns });

  ws.addRow(Array(nc).fill(null)).height = 6;

  // ─ NET RESULT ─
  addSectionHeader(ws, 'NET RESULT', nc);
  const netP = get('netProfit');
  const netM = get('netMargin');
  addTotalRow(ws, ['Net Profit',   usdVal(netP), ''],               { fmts, grand: true });
  addDataRow(ws,  ['Net Margin %', pctVal(netM), noteStr(netM)],    { alt: false, fmts: pctFmts, aligns });

  applyPrint(ws);
  return wb;
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  makeXlsxFilename,
  sendWorkbook,
  buildRevenueSummary,
  buildRevenueByService,
  buildInvoices,
  buildTechnicians,
  buildCustomers,
  buildForecasting,
  buildCancellations,
  buildTax,
  buildQuarterly,
  buildCompletion,
  buildPnl,
  // Expose for tests
  _C: C, _FMT: FMT,
};
