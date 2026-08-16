'use strict';
const crypto = require('crypto');
const axios  = require('axios');
const { updateTokens, updateStatus } = require('./accountingConnectionService');
const { getQBConfig } = require('./qbConfig');

const QB_AUTH_URL   = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL  = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const QB_SCOPES     = 'com.intuit.quickbooks.accounting';

function getApiBase() {
  const cfg = getQBConfig();
  return cfg.environment === 'production'
    ? 'https://quickbooks.api.intuit.com/v3/company'
    : 'https://sandbox-quickbooks.api.intuit.com/v3/company';
}

function isConfigured() {
  return getQBConfig().configured;
}

// ── OAuth state (CSRF) ────────────────────────────────────────────────────────

function createState(accountId, userId) {
  const nonce   = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify({ accountId, userId, nonce, ts: Date.now() });
  const sig     = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
    .update(payload)
    .digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig }), 'utf8').toString('base64url');
}

function parseState(state) {
  const { payload, sig } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
    .update(payload)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('Invalid OAuth state signature');
  }
  const data = JSON.parse(payload);
  if (Date.now() - data.ts > 15 * 60 * 1000) throw new Error('OAuth state expired');
  return data;
}

// ── Authorization URL ─────────────────────────────────────────────────────────

function getAuthorizationUrl(accountId, userId) {
  const cfg = getQBConfig();
  if (!cfg.configured) throw new Error('QuickBooks credentials not configured');
  const state  = createState(accountId, userId);
  const params = new URLSearchParams({
    client_id:     cfg.clientId,
    scope:         QB_SCOPES,
    redirect_uri:  cfg.redirectUri,
    response_type: 'code',
    state,
  });
  return `${QB_AUTH_URL}?${params.toString()}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

async function exchangeCode(code) {
  const cfg = getQBConfig();
  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

  const { data } = await axios.post(
    QB_TOKEN_URL,
    new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept:         'application/json',
      },
    }
  );

  const now = new Date();
  return {
    accessToken:           data.access_token,
    refreshToken:          data.refresh_token,
    tokenExpiresAt:        new Date(now.getTime() + data.expires_in * 1000).toISOString(),
    refreshTokenExpiresAt: data.x_refresh_token_expires_in
      ? new Date(now.getTime() + data.x_refresh_token_expires_in * 1000).toISOString()
      : null,
  };
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  const cfg = getQBConfig();
  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

  const { data } = await axios.post(
    QB_TOKEN_URL,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept:         'application/json',
      },
    }
  );

  const now = new Date();
  return {
    accessToken:  data.access_token,
    tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000).toISOString(),
    refreshToken:  data.refresh_token || refreshToken,
  };
}

// Ensures the connection's access token is fresh; refreshes and persists if near expiry.
async function ensureFreshTokens(conn) {
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
  const bufferMs  = 5 * 60 * 1000; // refresh if expiring within 5 min

  if (!expiresAt || expiresAt.getTime() - Date.now() < bufferMs) {
    if (!conn.refreshToken) {
      await updateStatus(conn.accountId, 'quickbooks_online', 'reauth_required', {
        errorCode:    'NO_REFRESH_TOKEN',
        errorMessage: 'Reauthorization required. Please reconnect QuickBooks.',
      });
      throw new Error('QuickBooks access token expired and no refresh token available');
    }
    const fresh = await refreshAccessToken(conn.refreshToken);
    await updateTokens(conn.accountId, 'quickbooks_online', {
      accessToken:    fresh.accessToken,
      tokenExpiresAt: fresh.tokenExpiresAt,
    });
    return { ...conn, accessToken: fresh.accessToken, tokenExpiresAt: fresh.tokenExpiresAt };
  }
  return conn;
}

// ── Token revocation ──────────────────────────────────────────────────────────

async function revokeToken(token) {
  const cfg = getQBConfig();
  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  try {
    await axios.post(
      QB_REVOKE_URL,
      new URLSearchParams({ token }).toString(),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept:         'application/json',
        },
      }
    );
  } catch (err) {
    // Best-effort revocation — log but don't block disconnect
    console.warn('[QuickBooks] Token revocation failed (non-fatal):', err.message);
  }
}

// ── API query helper ──────────────────────────────────────────────────────────

async function qbGet(conn, path, params = {}) {
  const url = `${getApiBase()}/${conn.realmId}${path}`;
  try {
    const { data } = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        Accept:         'application/json',
      },
      params: { ...params, minorversion: '65' },
    });
    return data;
  } catch (err) {
    if (err.response?.status === 401) {
      await updateStatus(conn.accountId, 'quickbooks_online', 'reauth_required', {
        errorCode:    'AUTH_EXPIRED',
        errorMessage: 'QuickBooks authorization expired. Please reconnect.',
      });
    }
    throw err;
  }
}

async function qbQuery(conn, sql) {
  return qbGet(conn, '/query', { query: sql });
}

// ── Company info ──────────────────────────────────────────────────────────────

async function getCompanyInfo(conn) {
  const data = await qbGet(conn, `/companyinfo/${conn.realmId}`);
  return {
    companyName:  data.CompanyInfo?.CompanyName || null,
    companyAddr:  data.CompanyInfo?.CompanyAddr || null,
    country:      data.CompanyInfo?.Country || 'US',
    fiscalYearStart: data.CompanyInfo?.FiscalYearStartMonth || null,
  };
}

// ── Chart of accounts ─────────────────────────────────────────────────────────

async function queryAccounts(conn, opts = {}) {
  const where  = opts.since
    ? `WHERE Metadata.LastUpdatedTime > '${opts.since}'`
    : `WHERE Active = true`;
  const sql    = `SELECT * FROM Account ${where} MAXRESULTS 1000`;
  const data   = await qbQuery(conn, sql);
  return (data.QueryResponse?.Account || []).map(a => ({
    id:          a.Id,
    name:        a.Name,
    fullyQualifiedName: a.FullyQualifiedName,
    accountType: a.AccountType,
    accountSubType: a.AccountSubType,
    classification: a.Classification,
    active:      a.Active,
    currentBalance: a.CurrentBalance,
    updatedAt:   a.MetaData?.LastUpdatedTime,
  }));
}

// ── Vendors ───────────────────────────────────────────────────────────────────

async function queryVendors(conn, opts = {}) {
  const where = opts.since
    ? `WHERE Metadata.LastUpdatedTime > '${opts.since}'`
    : `WHERE Active = true`;
  const sql   = `SELECT * FROM Vendor ${where} MAXRESULTS 1000`;
  const data  = await qbQuery(conn, sql);
  return (data.QueryResponse?.Vendor || []).map(v => ({
    id:          v.Id,
    displayName: v.DisplayName,
    companyName: v.CompanyName,
    email:       v.PrimaryEmailAddr?.Address,
    active:      v.Active,
    updatedAt:   v.MetaData?.LastUpdatedTime,
  }));
}

// ── Expenses / Purchases ──────────────────────────────────────────────────────

async function queryExpenses(conn, opts = {}) {
  const where = opts.since
    ? `WHERE Metadata.LastUpdatedTime > '${opts.since}'`
    : `WHERE TxnDate >= '2020-01-01'`;
  const sql   = `SELECT * FROM Purchase ${where} MAXRESULTS 1000`;
  const data  = await qbQuery(conn, sql);
  return (data.QueryResponse?.Purchase || []).map(e => ({
    id:         e.Id,
    txnDate:    e.TxnDate,
    totalAmt:   e.TotalAmt,
    currency:   e.CurrencyRef?.value || 'USD',
    paymentType: e.PaymentType,
    accountRef: e.AccountRef,
    entityRef:  e.EntityRef,
    memo:       e.PrivateNote,
    lines:      (e.Line || []).map(l => ({
      amount:      l.Amount,
      accountRef:  l.AccountBasedExpenseLineDetail?.AccountRef,
      description: l.Description,
    })),
    updatedAt:  e.MetaData?.LastUpdatedTime,
  }));
}

// ── Bills ─────────────────────────────────────────────────────────────────────

async function queryBills(conn, opts = {}) {
  const where = opts.since
    ? `WHERE Metadata.LastUpdatedTime > '${opts.since}'`
    : `WHERE TxnDate >= '2020-01-01'`;
  const sql   = `SELECT * FROM Bill ${where} MAXRESULTS 1000`;
  const data  = await qbQuery(conn, sql);
  return (data.QueryResponse?.Bill || []).map(b => ({
    id:        b.Id,
    txnDate:   b.TxnDate,
    dueDate:   b.DueDate,
    totalAmt:  b.TotalAmt,
    balance:   b.Balance,
    currency:  b.CurrencyRef?.value || 'USD',
    vendorRef: b.VendorRef,
    lines:     (b.Line || []).map(l => ({
      amount:     l.Amount,
      accountRef: l.AccountBasedExpenseLineDetail?.AccountRef,
    })),
    updatedAt: b.MetaData?.LastUpdatedTime,
  }));
}

// ── Tax codes ─────────────────────────────────────────────────────────────────

async function queryTaxCodes(conn) {
  const data = await qbQuery(conn, `SELECT * FROM TaxCode MAXRESULTS 200`);
  return (data.QueryResponse?.TaxCode || []).map(t => ({
    id:          t.Id,
    name:        t.Name,
    description: t.Description,
    active:      t.Active,
    taxable:     t.Taxable,
  }));
}

// ── Invoices (for reconciliation) ────────────────────────────────────────────

async function queryInvoices(conn, opts = {}) {
  const where = opts.since
    ? `WHERE Metadata.LastUpdatedTime > '${opts.since}'`
    : `WHERE TxnDate >= '2020-01-01'`;
  const sql   = `SELECT * FROM Invoice ${where} MAXRESULTS 1000`;
  const data  = await qbQuery(conn, sql);
  return (data.QueryResponse?.Invoice || []).map(inv => ({
    id:          inv.Id,
    docNumber:   inv.DocNumber,
    txnDate:     inv.TxnDate,
    dueDate:     inv.DueDate,
    totalAmt:    inv.TotalAmt,
    balance:     inv.Balance,
    customerRef: inv.CustomerRef,
    currency:    inv.CurrencyRef?.value || 'USD',
    emailStatus: inv.EmailStatus,
    updatedAt:   inv.MetaData?.LastUpdatedTime,
  }));
}

// ── Credit memos ──────────────────────────────────────────────────────────────

async function queryCreditMemos(conn, opts = {}) {
  const where = opts.since
    ? `WHERE Metadata.LastUpdatedTime > '${opts.since}'`
    : `WHERE TxnDate >= '2020-01-01'`;
  const sql   = `SELECT * FROM CreditMemo ${where} MAXRESULTS 500`;
  const data  = await qbQuery(conn, sql);
  return (data.QueryResponse?.CreditMemo || []).map(c => ({
    id:          c.Id,
    docNumber:   c.DocNumber,
    txnDate:     c.TxnDate,
    totalAmt:    c.TotalAmt,
    balance:     c.Balance,
    customerRef: c.CustomerRef,
    updatedAt:   c.MetaData?.LastUpdatedTime,
  }));
}

module.exports = {
  isConfigured,
  createState,
  parseState,
  getAuthorizationUrl,
  exchangeCode,
  refreshAccessToken,
  ensureFreshTokens,
  revokeToken,
  getCompanyInfo,
  queryAccounts,
  queryVendors,
  queryExpenses,
  queryBills,
  queryTaxCodes,
  queryInvoices,
  queryCreditMemos,
};
