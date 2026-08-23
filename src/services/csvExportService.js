'use strict';

// ── FieldCore CSV Export Utility ──────────────────────────────────────────────
// Centralises filename generation, escaping, date/money/percentage formatting,
// UTF-8 BOM, and human-readable status labels for all CSV exports.

const UTF8_BOM = '﻿';

// ── Status label map ──────────────────────────────────────────────────────────
const STATUS_LABELS = {
  // Job statuses
  complete:    'Completed',
  completed:   'Completed',
  scheduled:   'Scheduled',
  in_progress: 'In Progress',
  cancelled:   'Cancelled',
  canceled:    'Cancelled',
  no_show:     'No-Show',
  draft:       'Draft',
  // Invoice/payment statuses
  pending:     'Pending',
  paid:        'Paid',
  partial:     'Partial',
  unpaid:      'Unpaid',
  overdue:     'Overdue',
  void:        'Void',
  refunded:    'Refunded',
  // Client statuses
  active:      'Active',
  inactive:    'Inactive',
  at_risk:     'At Risk',
};

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10); // YYYY-MM-DD
}

function fmtDateTime(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 16).replace('T', ' '); // YYYY-MM-DD HH:mm
}

function fmtMoney(v) {
  const n = parseFloat(v);
  return isNaN(n) ? '' : n.toFixed(2);
}

// v should be in 0-100 scale (e.g. 92.5 for 92.5%).
// Pass null/undefined to get blank.
function fmtPct(v) {
  if (v == null || v === '') return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : n.toFixed(1) + '%';
}

function statusLabel(s) {
  if (s == null || s === '') return '';
  return STATUS_LABELS[String(s).toLowerCase()] || String(s);
}

// ── Filename generation ───────────────────────────────────────────────────────

function _sanitize(s) {
  return (s || 'fieldcore')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function makeFilename(reportSlug, accountName, start, end) {
  const entity = _sanitize(accountName);
  const s = (start || '').slice(0, 10) || 'all';
  const e = (end   || '').slice(0, 10) || 'all';
  return `fieldcore_${reportSlug}_${entity}_${s}_to_${e}.csv`;
}

// ── CSV injection guard + quoting ─────────────────────────────────────────────
// All values are wrapped in double-quotes with internal quotes doubled.
// Formula-starting characters (=, +, @, -) are prefixed with a tab to
// prevent spreadsheet execution while keeping values readable.

function escape(v) {
  let s = String(v ?? '');
  if (s.length > 0 && '=+@-'.includes(s[0])) s = '\t' + s;
  return `"${s.replace(/"/g, '""')}"`;
}

// ── CSV assembly ──────────────────────────────────────────────────────────────
// Accepts an array of rows (each row is an array of values).
// Prepends UTF-8 BOM for Excel compatibility.
// Uses CRLF line endings per RFC 4180.

function buildCSV(rows) {
  return UTF8_BOM + rows.map(row => row.map(escape).join(',')).join('\r\n');
}

// ── Metadata section builder ──────────────────────────────────────────────────
// Returns metadata rows padded to colCount, followed by one blank separator row.
// Pairs: [['Label', 'Value'], ...]

function metaSection(pairs, colCount) {
  const blank = Array(colCount).fill('');
  const metaRows = pairs.map(([label, val]) => {
    const row = [label, String(val ?? '')];
    while (row.length < colCount) row.push('');
    return row;
  });
  return [...metaRows, blank];
}

// ── Account name lookup ───────────────────────────────────────────────────────
// Returns { accountName, timezone } for the given accountId.
// Fails gracefully — never throws.

async function getAccountMeta(pool, accountId) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(name, 'FieldCore') AS account_name,
              COALESCE(timezone, 'UTC')   AS tz
       FROM business_profiles
       WHERE account_id = $1
       LIMIT 1`,
      [accountId]
    );
    return {
      accountName: rows[0]?.account_name || 'FieldCore',
      timezone:    rows[0]?.tz           || 'UTC',
    };
  } catch {
    return { accountName: 'FieldCore', timezone: 'UTC' };
  }
}

module.exports = {
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtPct,
  statusLabel,
  makeFilename,
  escape,
  buildCSV,
  metaSection,
  getAccountMeta,
};
