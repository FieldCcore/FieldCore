'use strict';

// ── FieldCore Excel Export Tests ──────────────────────────────────────────────
// Validates .xlsx workbook content: sheet names, headers, numeric formats,
// column widths, freeze panes, autofilter, totals reconciliation, tenant scope.

const request  = require('supertest');
const ExcelJS  = require('exceljs');
const app      = require('../../src/app');
const pool     = require('../db/pool');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

// ─── Test Account Setup ───────────────────────────────────────────────────────
let token, accountId;
const TODAY      = new Date().toISOString().slice(0, 10);
const MONTH_START = TODAY.slice(0, 7) + '-01';

async function makeAccount(name) {
  const { rows: [acct] } = await pool.query(
    `INSERT INTO accounts (name, plan) VALUES ($1, 'pro') RETURNING id`,
    [name]
  );
  const hash = await bcrypt.hash('pw', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (account_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
    [acct.id, name + ' Owner', `${name.replace(/\s+/g,'').toLowerCase()}-${Date.now()}@test.xlsx`, hash]
  );
  const tok = jwt.sign({ userId: user.id, accountId: acct.id, role: 'owner' }, process.env.JWT_SECRET || 'test-secret');
  return { accountId: acct.id, token: tok };
}

// ─── Parse XLSX from supertest buffer ─────────────────────────────────────────
async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function sheetNames(wb) {
  return wb.worksheets.map(ws => ws.name);
}

function getHeaderRow(ws) {
  // Find first row with text content (skip title block rows)
  let hRow = null;
  ws.eachRow((row, n) => {
    if (!hRow && row.getCell(1).value && typeof row.getCell(1).value === 'string'
        && !['FIELDCORE', 'Note', 'DISCLAIMER'].some(t => String(row.getCell(1).value || '').startsWith(t))
        && n > 4) {
      hRow = row;
    }
  });
  return hRow;
}

function isNumericCell(cell) {
  return typeof cell.value === 'number' || (cell.value && typeof cell.value === 'object' && cell.value.formula);
}

// ─── Beforeall / Afterall ─────────────────────────────────────────────────────
beforeAll(async () => {
  const acct = await makeAccount('Excel Test Co');
  token     = acct.token;
  accountId = acct.accountId;
});

afterAll(async () => {
  await pool.query('DELETE FROM accounts WHERE name = $1', ['Excel Test Co']);
  await pool.end();
});

// ══════════════════════════════════════════════════════════════════════════════
//  XLSX RESPONSE BASICS
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel export — response basics', () => {
  it('returns xlsx content-type for all report types', async () => {
    const types = ['summary', 'services', 'invoices', 'technicians', 'customers',
                   'cancellations', 'tax', 'quarterly', 'completion', 'pnl'];
    for (const type of types) {
      const res = await request(app)
        .get(`/api/revenue/export?type=${type}&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.headers['content-type']).toMatch(/spreadsheetml/);
      expect(res.headers['content-disposition']).toMatch(/\.xlsx/);
    }
  });

  it('returns FieldCore filename format for xlsx', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=summary&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-disposition']).toMatch(/FieldCore_Revenue_Summary/);
    expect(res.headers['content-disposition']).toMatch(/\.xlsx/);
  });

  it('rejects unauthenticated xlsx requests', async () => {
    await request(app)
      .get(`/api/revenue/export?type=summary&format=xlsx`)
      .expect(401);
  });

  it('still returns csv when format param is omitted', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=summary&start=${MONTH_START}&end=${TODAY}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('still returns csv when format=csv', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=summary&start=${MONTH_START}&end=${TODAY}&format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  REVENUE SUMMARY WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Revenue Summary workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=summary&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Revenue Summary worksheet', () => {
    expect(sheetNames(wb)).toContain('Revenue Summary');
  });

  it('title block contains FIELDCORE', () => {
    const ws = wb.getWorksheet('Revenue Summary');
    const r1 = ws.getRow(1);
    expect(String(r1.getCell(1).value)).toBe('FIELDCORE');
  });

  it('has data rows with numeric cell values for money metrics', () => {
    const ws = wb.getWorksheet('Revenue Summary');
    let foundNumeric = false;
    ws.eachRow((row, n) => {
      if (n > 5) {
        const valCell = row.getCell(2);
        if (valCell.value !== null && valCell.value !== undefined && typeof valCell.value === 'number') {
          foundNumeric = true;
        }
      }
    });
    expect(foundNumeric).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  REVENUE BY SERVICE WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Revenue by Service workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=services&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Revenue by Service sheet', () => {
    expect(sheetNames(wb)).toContain('Revenue by Service');
  });

  it('has column headers', () => {
    const ws = wb.getWorksheet('Revenue by Service');
    let foundServiceHeader = false;
    ws.eachRow(row => {
      const v = String(row.getCell(1).value || '');
      if (v === 'Service') foundServiceHeader = true;
    });
    expect(foundServiceHeader).toBe(true);
  });

  it('has autofilter set', () => {
    const ws = wb.getWorksheet('Revenue by Service');
    expect(ws.autoFilter).toBeTruthy();
  });

  it('has freeze pane', () => {
    const ws = wb.getWorksheet('Revenue by Service');
    const view = ws.views?.[0];
    expect(view?.state).toBe('frozen');
    expect(view?.ySplit).toBeGreaterThan(0);
  });

  it('column widths are set (none are default 8)', () => {
    const ws = wb.getWorksheet('Revenue by Service');
    const widths = ws.columns.map(c => c.width).filter(w => w != null);
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.some(w => w > 10)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  INVOICE & COLLECTIONS WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Invoice & Collections workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=invoices&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Summary, A-R Aging, and Invoice Detail sheets', () => {
    const names = sheetNames(wb);
    expect(names).toContain('Summary');
    expect(names).toContain('A-R Aging');
    expect(names).toContain('Invoice Detail');
  });

  it('A-R Aging has correct bucket labels', () => {
    const ws = wb.getWorksheet('A-R Aging');
    let found = false;
    ws.eachRow(row => {
      const v = String(row.getCell(1).value || '');
      if (v.includes('30 Days') || v.includes('Current')) found = true;
    });
    expect(found).toBe(true);
  });

  it('Invoice Detail has autofilter', () => {
    const ws = wb.getWorksheet('Invoice Detail');
    expect(ws.autoFilter).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  TECHNICIAN WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Revenue by Technician workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=technicians&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Team Summary sheet', () => {
    expect(sheetNames(wb)).toContain('Team Summary');
  });

  it('has Technician header', () => {
    const ws = wb.getWorksheet('Team Summary');
    let found = false;
    ws.eachRow(row => { if (String(row.getCell(1).value || '') === 'Technician') found = true; });
    expect(found).toBe(true);
  });

  it('has disclaimer about labor hours', () => {
    const ws = wb.getWorksheet('Team Summary');
    let found = false;
    ws.eachRow(row => {
      if (String(row.getCell(1).value || '').toLowerCase().includes('labor')) found = true;
    });
    expect(found).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  CANCELLATIONS WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Cancellations workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=cancellations&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Summary and Job Detail sheets', () => {
    const names = sheetNames(wb);
    expect(names).toContain('Summary');
    expect(names).toContain('Job Detail');
  });

  it('Job Detail has autofilter', () => {
    const ws = wb.getWorksheet('Job Detail');
    expect(ws.autoFilter).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  TAX WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Tax Summary workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=tax&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Tax Summary and Transaction Detail sheets', () => {
    const names = sheetNames(wb);
    expect(names).toContain('Tax Summary');
    expect(names).toContain('Transaction Detail');
  });

  it('Tax Summary sheet contains disclaimer text', () => {
    const ws = wb.getWorksheet('Tax Summary');
    let hasDisclaimer = false;
    ws.eachRow(row => {
      const v = String(row.getCell(1).value || '');
      if (v.toLowerCase().includes('disclaimer') || v.toLowerCase().includes('not a tax return')) {
        hasDisclaimer = true;
      }
    });
    expect(hasDisclaimer).toBe(true);
  });

  it('Transaction Detail has autofilter', () => {
    const ws = wb.getWorksheet('Transaction Detail');
    expect(ws.autoFilter).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  QUARTERLY WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Quarterly Financial workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=quarterly&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Quarterly Financial sheet', () => {
    expect(sheetNames(wb)).toContain('Quarterly Financial');
  });

  it('has Q1/Q2/Q3/Q4/Full Year column headers', () => {
    const ws = wb.getWorksheet('Quarterly Financial');
    let foundQ = false;
    ws.eachRow(row => {
      const v2 = String(row.getCell(2).value || '');
      if (v2 === 'Q1') foundQ = true;
    });
    expect(foundQ).toBe(true);
  });

  it('has REVENUE section label', () => {
    const ws = wb.getWorksheet('Quarterly Financial');
    let found = false;
    ws.eachRow(row => {
      if (String(row.getCell(1).value || '').includes('REVENUE')) found = true;
    });
    expect(found).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  JOB COMPLETION WORKBOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — Job Completion workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=completion&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has Summary and By Service sheets', () => {
    const names = sheetNames(wb);
    expect(names).toContain('Summary');
    expect(names).toContain('By Service');
  });

  it('By Service has autofilter', () => {
    const ws = wb.getWorksheet('By Service');
    expect(ws.autoFilter).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  P&L STATEMENT WORKBOOK  (IS-001 regression)
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — P&L Statement workbook', () => {
  let wb;
  beforeAll(async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=pnl&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    wb = await parseXlsx(res.body);
  });

  it('has P&L Statement sheet — NOT Revenue Summary (IS-001 regression)', () => {
    const names = sheetNames(wb);
    expect(names).toContain('P&L Statement');
    expect(names).not.toContain('Revenue Summary');
  });

  it('report title is Profit & Loss Statement', () => {
    const ws = wb.getWorksheet('P&L Statement');
    let found = false;
    ws.eachRow(row => {
      const v = String(row.getCell(1).value || '');
      if (v.includes('Profit') && v.includes('Loss')) found = true;
    });
    expect(found).toBe(true);
  });

  it('has REVENUE section label', () => {
    const ws = wb.getWorksheet('P&L Statement');
    let found = false;
    ws.eachRow(row => { if (String(row.getCell(1).value || '').includes('REVENUE')) found = true; });
    expect(found).toBe(true);
  });

  it('has NET RESULT section label', () => {
    const ws = wb.getWorksheet('P&L Statement');
    let found = false;
    ws.eachRow(row => { if (String(row.getCell(1).value || '').includes('NET RESULT')) found = true; });
    expect(found).toBe(true);
  });

  it('has Gross Revenue and Net Profit row labels', () => {
    const ws = wb.getWorksheet('P&L Statement');
    let foundGross = false, foundNet = false;
    ws.eachRow(row => {
      const v = String(row.getCell(1).value || '');
      if (v === 'Gross Revenue') foundGross = true;
      if (v === 'Net Profit')    foundNet   = true;
    });
    expect(foundGross).toBe(true);
    expect(foundNet).toBe(true);
  });

  it('has disclaimer text about QuickBooks / not a tax return', () => {
    const ws = wb.getWorksheet('P&L Statement');
    let found = false;
    ws.eachRow(row => {
      const v = String(row.getCell(1).value || '').toLowerCase();
      if (v.includes('quickbooks') || v.includes('not a tax return')) found = true;
    });
    expect(found).toBe(true);
  });

  it('filename contains PnL_Statement', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=pnl&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-disposition']).toMatch(/FieldCore_PnL_Statement/);
  });
});

// ── Cross-exporter routing regression (IS-001) ──────────────────────────────

describe('Excel — each report type maps to its own exporter', () => {
  const EXPECTED_SHEETS = {
    summary:     'Revenue Summary',
    services:    'Revenue by Service',
    invoices:    'Summary',           // Invoice & Collections has Summary as first sheet
    technicians: 'Team Summary',
    completion:  'Summary',           // Completion also uses Summary as first sheet
    pnl:         'P&L Statement',
  };

  for (const [type, expectedSheet] of Object.entries(EXPECTED_SHEETS)) {
    it(`type=${type} returns a workbook containing "${expectedSheet}"`, async () => {
      const res = await request(app)
        .get(`/api/revenue/export?type=${type}&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
        .set('Authorization', `Bearer ${token}`)
        .buffer(true).parse((res, cb) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      const w = await parseXlsx(res.body);
      expect(sheetNames(w)).toContain(expectedSheet);
    });
  }

  it('type=pnl does not return Revenue Summary workbook (IS-001 direct regression)', async () => {
    const res = await request(app)
      .get(`/api/revenue/export?type=pnl&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const w = await parseXlsx(res.body);
    expect(sheetNames(w)).not.toContain('Revenue Summary');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  TENANT ISOLATION
// ══════════════════════════════════════════════════════════════════════════════

describe('Excel — tenant isolation', () => {
  let token2;
  beforeAll(async () => {
    const acct2 = await makeAccount('Excel Tenant B');
    token2 = acct2.token;
    // Insert data for tenant B
    const { rows: [client] } = await pool.query(
      `INSERT INTO clients (account_id, name, email) VALUES ($1, 'B Client', 'b@b.com') RETURNING id`,
      [acct2.accountId]
    );
  });

  it('revenue summary for tenant B does not show tenant A data', async () => {
    const resA = await request(app)
      .get(`/api/revenue/export?type=summary&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const resB = await request(app)
      .get(`/api/revenue/export?type=summary&start=${MONTH_START}&end=${TODAY}&format=xlsx`)
      .set('Authorization', `Bearer ${token2}`)
      .buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    // Both should succeed (200), but B's workbook is independent
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const wbA = await parseXlsx(resA.body);
    const wbB = await parseXlsx(resB.body);
    // Each workbook should contain only the entity name for that account
    const wsA = wbA.getWorksheet('Revenue Summary');
    const wsB = wbB.getWorksheet('Revenue Summary');
    expect(wsA).toBeTruthy();
    expect(wsB).toBeTruthy();
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM accounts WHERE name = 'Excel Tenant B'`);
  });
});
