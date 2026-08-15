'use strict';
const pool   = require('../db/pool');
const qb     = require('./quickbooksAdapter');
const connSvc = require('./accountingConnectionService');

// ── Category auto-suggestion rules ───────────────────────────────────────────
// Suggests a fieldcore_category based on QB account type/subtype.
// The user can override via the mapping UI.

const CATEGORY_SUGGESTIONS = [
  { types: ['Cost of Goods Sold'],                              category: 'cogs'               },
  { types: ['Expense'], subtypes: ['Advertising'],              category: 'operating_expenses'  },
  { types: ['Expense'], subtypes: ['Insurance'],                category: 'operating_expenses'  },
  { types: ['Expense'], subtypes: ['LegalAndProfessionalFees'], category: 'operating_expenses'  },
  { types: ['Expense'], subtypes: ['OfficeGeneralAdminExpenses'], category: 'operating_expenses' },
  { types: ['Expense'], subtypes: ['Rent'],                     category: 'operating_expenses'  },
  { types: ['Expense'], subtypes: ['Utilities'],                category: 'operating_expenses'  },
  { types: ['Expense'], subtypes: ['Vehicle'],                  category: 'operating_expenses'  },
  { types: ['Expense'], subtypes: ['TravelExpenses'],           category: 'operating_expenses'  },
  { types: ['Expense'],                                         category: 'operating_expenses'  },
  { types: ['Other Expense'], subtypes: ['IncomeTaxExpense'],   category: 'taxes'               },
  { types: ['Other Expense'],                                   category: 'operating_expenses'  },
  { types: ['Bank', 'Cash and Cash Equivalent'],                category: 'cash_accounts'       },
];

function suggestCategory(accountType, accountSubType) {
  for (const rule of CATEGORY_SUGGESTIONS) {
    const typeMatch    = rule.types.includes(accountType);
    const subtypeMatch = !rule.subtypes || rule.subtypes.includes(accountSubType);
    if (typeMatch && subtypeMatch) return rule.category;
  }
  return null;
}

// Converts a dollar amount to integer cents.
function toCents(amount) {
  return Math.round((parseFloat(amount) || 0) * 100);
}

// ── Chart of accounts sync ────────────────────────────────────────────────────

async function syncChartOfAccounts(conn, opts = {}) {
  const accounts = await qb.queryAccounts(conn, opts);
  let upserted = 0;

  for (const acct of accounts) {
    const suggested = suggestCategory(acct.accountType, acct.accountSubType);
    await pool.query(
      `INSERT INTO accounting_account_mappings
         (account_id, provider, provider_account_id, provider_account_name,
          provider_account_type, provider_account_subtype, fieldcore_category,
          is_direct_cost, is_operating_expense, is_tax, is_cash_account, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (account_id, provider, provider_account_id) DO UPDATE
         SET provider_account_name    = EXCLUDED.provider_account_name,
             provider_account_type    = EXCLUDED.provider_account_type,
             provider_account_subtype = EXCLUDED.provider_account_subtype,
             fieldcore_category       = COALESCE(
               accounting_account_mappings.fieldcore_category,
               EXCLUDED.fieldcore_category
             ),
             is_direct_cost           = EXCLUDED.is_direct_cost,
             is_operating_expense     = EXCLUDED.is_operating_expense,
             is_tax                   = EXCLUDED.is_tax,
             is_cash_account          = EXCLUDED.is_cash_account,
             is_active                = EXCLUDED.is_active,
             updated_at               = NOW()`,
      [
        conn.accountId, conn.provider || 'quickbooks_online',
        acct.id, acct.name, acct.accountType, acct.accountSubType,
        suggested,
        suggested === 'cogs',
        suggested === 'operating_expenses',
        suggested === 'taxes',
        suggested === 'cash_accounts',
        acct.active !== false,
      ]
    );
    upserted++;
  }
  return { upserted };
}

// ── Vendor sync ───────────────────────────────────────────────────────────────

async function syncVendors(conn, opts = {}) {
  const vendors = await qb.queryVendors(conn, opts);
  let upserted  = 0;

  for (const v of vendors) {
    await pool.query(
      `INSERT INTO accounting_synced_records
         (account_id, provider, record_type, provider_record_id,
          provider_updated_at, vendor_name, raw_summary_safe, synced_at)
       VALUES ($1,$2,'vendor',$3,$4,$5,$6,NOW())
       ON CONFLICT (account_id, provider, record_type, provider_record_id) DO UPDATE
         SET vendor_name          = EXCLUDED.vendor_name,
             provider_updated_at  = EXCLUDED.provider_updated_at,
             raw_summary_safe     = EXCLUDED.raw_summary_safe,
             sync_version         = accounting_synced_records.sync_version + 1,
             synced_at            = NOW()`,
      [
        conn.accountId, conn.provider || 'quickbooks_online',
        v.id, v.updatedAt ? new Date(v.updatedAt) : null,
        v.displayName,
        JSON.stringify({ displayName: v.displayName, companyName: v.companyName }),
      ]
    );
    upserted++;
  }
  return { upserted };
}

// ── Expense sync ──────────────────────────────────────────────────────────────

async function syncExpenses(conn, opts = {}) {
  const expenses = await qb.queryExpenses(conn, opts);
  let upserted   = 0;

  for (const e of expenses) {
    const primaryLine = e.lines?.[0];
    const acctId      = primaryLine?.accountRef?.value;

    // Lookup fieldcore_category for this account
    let category = null;
    if (acctId) {
      const { rows: mapRows } = await pool.query(
        `SELECT fieldcore_category FROM accounting_account_mappings
         WHERE account_id = $1 AND provider = $2 AND provider_account_id = $3`,
        [conn.accountId, conn.provider || 'quickbooks_online', acctId]
      );
      category = mapRows[0]?.fieldcore_category || null;
    }

    await pool.query(
      `INSERT INTO accounting_synced_records
         (account_id, provider, record_type, provider_record_id,
          provider_updated_at, amount_cents, currency, accounting_date,
          fieldcore_category, provider_account_id, memo, raw_summary_safe, synced_at)
       VALUES ($1,$2,'expense',$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (account_id, provider, record_type, provider_record_id) DO UPDATE
         SET provider_updated_at = EXCLUDED.provider_updated_at,
             amount_cents        = EXCLUDED.amount_cents,
             accounting_date     = EXCLUDED.accounting_date,
             fieldcore_category  = COALESCE(EXCLUDED.fieldcore_category, accounting_synced_records.fieldcore_category),
             provider_account_id = EXCLUDED.provider_account_id,
             memo                = EXCLUDED.memo,
             raw_summary_safe    = EXCLUDED.raw_summary_safe,
             sync_version        = accounting_synced_records.sync_version + 1,
             synced_at           = NOW()`,
      [
        conn.accountId, conn.provider || 'quickbooks_online',
        e.id, e.updatedAt ? new Date(e.updatedAt) : null,
        toCents(e.totalAmt), e.currency || 'USD',
        e.txnDate || null,
        category, acctId, e.memo,
        JSON.stringify({ paymentType: e.paymentType }),
      ]
    );
    upserted++;
  }
  return { upserted };
}

// ── Bill sync ─────────────────────────────────────────────────────────────────

async function syncBills(conn, opts = {}) {
  const bills   = await qb.queryBills(conn, opts);
  let upserted  = 0;

  for (const b of bills) {
    const primaryLine = b.lines?.[0];
    const acctId      = primaryLine?.accountRef?.value;

    let category = null;
    if (acctId) {
      const { rows: mapRows } = await pool.query(
        `SELECT fieldcore_category FROM accounting_account_mappings
         WHERE account_id = $1 AND provider = $2 AND provider_account_id = $3`,
        [conn.accountId, conn.provider || 'quickbooks_online', acctId]
      );
      category = mapRows[0]?.fieldcore_category || null;
    }

    await pool.query(
      `INSERT INTO accounting_synced_records
         (account_id, provider, record_type, provider_record_id,
          provider_updated_at, amount_cents, currency, accounting_date,
          vendor_name, fieldcore_category, provider_account_id, raw_summary_safe, synced_at)
       VALUES ($1,$2,'bill',$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (account_id, provider, record_type, provider_record_id) DO UPDATE
         SET provider_updated_at = EXCLUDED.provider_updated_at,
             amount_cents        = EXCLUDED.amount_cents,
             accounting_date     = EXCLUDED.accounting_date,
             vendor_name         = EXCLUDED.vendor_name,
             fieldcore_category  = COALESCE(EXCLUDED.fieldcore_category, accounting_synced_records.fieldcore_category),
             raw_summary_safe    = EXCLUDED.raw_summary_safe,
             sync_version        = accounting_synced_records.sync_version + 1,
             synced_at           = NOW()`,
      [
        conn.accountId, conn.provider || 'quickbooks_online',
        b.id, b.updatedAt ? new Date(b.updatedAt) : null,
        toCents(b.totalAmt), b.currency || 'USD',
        b.txnDate || null,
        b.vendorRef?.name || null,
        category, acctId,
        JSON.stringify({ dueDate: b.dueDate, balance: b.balance }),
      ]
    );
    upserted++;
  }
  return { upserted };
}

// ── Credit memo sync ──────────────────────────────────────────────────────────

async function syncCreditMemos(conn, opts = {}) {
  const credits  = await qb.queryCreditMemos(conn, opts);
  let upserted   = 0;

  for (const c of credits) {
    await pool.query(
      `INSERT INTO accounting_synced_records
         (account_id, provider, record_type, provider_record_id,
          provider_updated_at, amount_cents, currency, accounting_date,
          raw_summary_safe, synced_at)
       VALUES ($1,$2,'credit',$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (account_id, provider, record_type, provider_record_id) DO UPDATE
         SET provider_updated_at = EXCLUDED.provider_updated_at,
             amount_cents        = EXCLUDED.amount_cents,
             accounting_date     = EXCLUDED.accounting_date,
             raw_summary_safe    = EXCLUDED.raw_summary_safe,
             sync_version        = accounting_synced_records.sync_version + 1,
             synced_at           = NOW()`,
      [
        conn.accountId, conn.provider || 'quickbooks_online',
        c.id, c.updatedAt ? new Date(c.updatedAt) : null,
        toCents(c.totalAmt), 'USD',
        c.txnDate || null,
        JSON.stringify({ docNumber: c.docNumber, balance: c.balance }),
      ]
    );
    upserted++;
  }
  return { upserted };
}

// ── Full / incremental sync orchestration ─────────────────────────────────────

async function runSync(accountId, provider, { incremental = false } = {}) {
  const tokens = await connSvc.getDecryptedTokens(accountId, provider);
  if (!tokens || !['connected', 'syncing', 'sync_error'].includes(tokens.status)) {
    throw new Error(`Account ${accountId} has no active accounting connection`);
  }

  const conn = await qb.ensureFreshTokens(tokens);
  conn.provider = provider;

  await connSvc.markSyncStarted(accountId, provider);

  const since = incremental ? tokens.lastSyncAt : null;
  const opts  = since ? { since } : {};

  const results = { accounts: 0, vendors: 0, expenses: 0, bills: 0, credits: 0 };
  let errorCode, errorMessage;

  try {
    const [acctResult, vendorResult, expResult, billResult, creditResult] = await Promise.allSettled([
      syncChartOfAccounts(conn, opts),
      syncVendors(conn, opts),
      syncExpenses(conn, opts),
      syncBills(conn, opts),
      syncCreditMemos(conn, opts),
    ]);

    if (acctResult.status === 'fulfilled')   results.accounts  = acctResult.value.upserted;
    if (vendorResult.status === 'fulfilled') results.vendors   = vendorResult.value.upserted;
    if (expResult.status === 'fulfilled')    results.expenses  = expResult.value.upserted;
    if (billResult.status === 'fulfilled')   results.bills     = billResult.value.upserted;
    if (creditResult.status === 'fulfilled') results.credits   = creditResult.value.upserted;

    // Any critical failure (accounts) → sync_error
    const criticalFailed = acctResult.status === 'rejected';
    if (criticalFailed) {
      errorCode    = 'ACCOUNTS_SYNC_FAILED';
      errorMessage = 'Chart of Accounts sync failed. Other data may be partial.';
    }
  } catch (err) {
    errorCode    = 'SYNC_ERROR';
    errorMessage = err.message;
  }

  await connSvc.markSyncCompleted(accountId, provider, {
    hadError:     !!errorCode,
    errorCode,
    errorMessage,
  });

  console.log(`[AccountingSync] ${accountId} sync complete:`, results);
  return { results, errorCode };
}

// ── Account mapping CRUD ──────────────────────────────────────────────────────

async function getMappings(accountId, provider) {
  const { rows } = await pool.query(
    `SELECT * FROM accounting_account_mappings
     WHERE account_id = $1 AND provider = $2 AND is_active = TRUE
     ORDER BY provider_account_type, provider_account_name`,
    [accountId, provider]
  );
  return rows;
}

async function updateMapping(accountId, provider, providerAccountId, {
  fieldcoreCategory, isIgnored,
}) {
  await pool.query(
    `UPDATE accounting_account_mappings
     SET fieldcore_category   = $1,
         is_ignored           = $2,
         is_direct_cost       = (COALESCE($1,'') = 'cogs'),
         is_operating_expense = (COALESCE($1,'') = 'operating_expenses'),
         is_tax               = (COALESCE($1,'') = 'taxes'),
         is_cash_account      = (COALESCE($1,'') = 'cash_accounts'),
         updated_at           = NOW()
     WHERE account_id = $3 AND provider = $4 AND provider_account_id = $5`,
    [fieldcoreCategory || null, isIgnored || false, accountId, provider, providerAccountId]
  );
}

// ── COGS / operating expense totals for P&L ───────────────────────────────────
// Returns dollar totals (not cents) from synced + mapped accounting records.

async function getAccountingTotals(accountId, provider, start, end) {
  const { rows } = await pool.query(
    `SELECT
       SUM(CASE WHEN m.is_direct_cost       = TRUE THEN r.amount_cents ELSE 0 END) AS cogs_cents,
       SUM(CASE WHEN m.is_operating_expense = TRUE THEN r.amount_cents ELSE 0 END) AS opex_cents,
       SUM(CASE WHEN m.is_tax              = TRUE THEN r.amount_cents ELSE 0 END) AS tax_cents
     FROM accounting_synced_records r
     JOIN accounting_account_mappings m
       ON m.account_id         = r.account_id
      AND m.provider           = r.provider
      AND m.provider_account_id = r.provider_account_id
      AND m.is_ignored         = FALSE
      AND m.is_active          = TRUE
     WHERE r.account_id        = $1
       AND r.provider          = $2
       AND r.record_type       IN ('expense', 'bill')
       AND r.accounting_date  >= $3::date
       AND r.accounting_date  <= $4::date`,
    [accountId, provider, start, end]
  );

  const row = rows[0] || {};
  return {
    cogsCents:     parseInt(row.cogs_cents || 0),
    opexCents:     parseInt(row.opex_cents || 0),
    taxCents:      parseInt(row.tax_cents  || 0),
  };
}

module.exports = {
  syncChartOfAccounts,
  syncVendors,
  syncExpenses,
  syncBills,
  syncCreditMemos,
  runSync,
  getMappings,
  updateMapping,
  getAccountingTotals,
  suggestCategory,
};
