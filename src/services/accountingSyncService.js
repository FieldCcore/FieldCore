'use strict';
const pool   = require('../db/pool');
const qb     = require('./quickbooksAdapter');
const connSvc = require('./accountingConnectionService');

// ── Category definitions ──────────────────────────────────────────────────────

const FIELDCORE_CATEGORIES = [
  {
    category: 'revenue',
    label: 'Revenue',
    pnlRelevant: true,
    subcategories: [
      { value: 'service_revenue', label: 'Service Revenue' },
      { value: 'product_revenue', label: 'Product Revenue' },
      { value: 'other_revenue',   label: 'Other Revenue'   },
    ],
  },
  {
    category: 'cogs',
    label: 'Direct Cost / COGS',
    pnlRelevant: true,
    subcategories: [
      { value: 'direct_labor',       label: 'Direct Labor'        },
      { value: 'materials',          label: 'Materials'           },
      { value: 'fuel',               label: 'Fuel'                },
      { value: 'travel',             label: 'Travel'              },
      { value: 'merchant_fees',      label: 'Merchant Fees'       },
      { value: 'subcontractors',     label: 'Subcontractors'      },
      { value: 'premium_pay',        label: 'Premium Pay'         },
      { value: 'equipment_rental',   label: 'Equipment / Rental'  },
      { value: 'other_direct_cost',  label: 'Other Direct Cost'   },
    ],
  },
  {
    category: 'operating_expenses',
    label: 'Operating Expense',
    pnlRelevant: true,
    subcategories: [
      { value: 'admin_payroll',          label: 'Admin Payroll'          },
      { value: 'marketing',              label: 'Marketing'              },
      { value: 'software',               label: 'Software'               },
      { value: 'insurance',              label: 'Insurance'              },
      { value: 'rent',                   label: 'Rent'                   },
      { value: 'utilities',              label: 'Utilities'              },
      { value: 'vehicle_overhead',       label: 'Vehicle Overhead'       },
      { value: 'professional_services',  label: 'Professional Services'  },
      { value: 'office_expense',         label: 'Office Expense'         },
      { value: 'travel',                 label: 'Travel'                 },
      { value: 'other_operating',        label: 'Other Operating'        },
    ],
  },
  {
    category: 'taxes',
    label: 'Tax',
    pnlRelevant: true,
    subcategories: [
      { value: 'tax',           label: 'Tax'           },
      { value: 'interest',      label: 'Interest'      },
      { value: 'other_income',  label: 'Other Income'  },
      { value: 'other_expense', label: 'Other Expense' },
    ],
  },
  {
    category: 'balance_sheet',
    label: 'Balance Sheet',
    pnlRelevant: false,
    subcategories: [
      { value: 'cash_bank',            label: 'Cash / Bank'              },
      { value: 'accounts_receivable',  label: 'Accounts Receivable'      },
      { value: 'accounts_payable',     label: 'Accounts Payable'         },
      { value: 'credit_card',          label: 'Credit Card / Liability'  },
      { value: 'other_asset',          label: 'Other Asset'              },
      { value: 'other_liability',      label: 'Other Liability'          },
      { value: 'equity',               label: 'Equity'                   },
    ],
  },
];

// ── Classification rules ──────────────────────────────────────────────────────
// Processed in order; first match wins.

const CLASSIFICATION_RULES = [
  // DETERMINISTIC — balance sheet types
  {
    confidence: 'deterministic',
    category:   'balance_sheet',
    subcategory: 'cash_bank',
    isBalanceSheet: true,
    test: (t) => t === 'Bank' || t === 'Cash and Cash Equivalent',
  },
  {
    confidence: 'deterministic',
    category:   'balance_sheet',
    subcategory: 'accounts_receivable',
    isBalanceSheet: true,
    test: (t) => t === 'Accounts Receivable',
  },
  {
    confidence: 'deterministic',
    category:   'balance_sheet',
    subcategory: 'accounts_payable',
    isBalanceSheet: true,
    test: (t) => t === 'Accounts Payable',
  },
  {
    confidence: 'deterministic',
    category:   'balance_sheet',
    subcategory: 'credit_card',
    isBalanceSheet: true,
    test: (t) => t === 'Credit Card',
  },
  {
    confidence: 'deterministic',
    category:   'balance_sheet',
    subcategory: 'equity',
    isBalanceSheet: true,
    test: (t) => t === 'Equity',
  },
  {
    confidence: 'deterministic',
    category:   'balance_sheet',
    subcategory: 'other_asset',
    isBalanceSheet: true,
    test: (t) => t === 'Fixed Asset' || t === 'Other Current Asset' || t === 'Other Asset',
  },
  {
    confidence: 'deterministic',
    category:   'balance_sheet',
    subcategory: 'other_liability',
    isBalanceSheet: true,
    test: (t) => t === 'Long Term Liability' || t === 'Other Current Liability',
  },
  // DETERMINISTIC — revenue
  {
    confidence: 'deterministic',
    category:   'revenue',
    subcategoryFn: (t) => t === 'Other Income' ? 'other_revenue' : 'service_revenue',
    isRevenue: true,
    test: (t) => t === 'Income' || t === 'Other Income',
  },
  // DETERMINISTIC — COGS
  {
    confidence: 'deterministic',
    category:   'cogs',
    subcategory: 'other_direct_cost',
    isDirectCost: true,
    test: (t) => t === 'Cost of Goods Sold',
  },
  // HIGH_CONFIDENCE — tax
  {
    confidence: 'high_confidence',
    category:   'taxes',
    subcategory: 'tax',
    isTax: true,
    test: (t, st) => t === 'Other Expense' && st === 'IncomeTaxExpense',
  },
  // HIGH_CONFIDENCE — expense with known subtype
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'insurance',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'Insurance',
  },
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'rent',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'Rent',
  },
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'utilities',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'Utilities',
  },
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'marketing',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'Advertising',
  },
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'vehicle_overhead',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'Vehicle',
  },
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'professional_services',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'LegalAndProfessionalFees',
  },
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'office_expense',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'OfficeGeneralAdminExpenses',
  },
  {
    confidence: 'high_confidence',
    category:   'operating_expenses',
    subcategory: 'travel',
    isOperatingExpense: true,
    test: (t, st) => t === 'Expense' && st === 'TravelExpenses',
  },
  // REVIEW_REQUIRED — generic expense
  {
    confidence: 'review_required',
    category:   'operating_expenses',
    subcategory: null,
    isOperatingExpense: true,
    test: (t) => t === 'Expense',
  },
  // REVIEW_REQUIRED — Other Expense (catch-all)
  {
    confidence: 'review_required',
    category:   'operating_expenses',
    subcategory: null,
    isOperatingExpense: true,
    test: (t) => t === 'Other Expense',
  },
];

/**
 * Returns a classification result for a given QB account type + subtype.
 * Result shape:
 *   { category, subcategory, confidence, isRevenue, isBalanceSheet,
 *     isDirectCost, isOperatingExpense, isTax, isCashAccount }
 */
function classify(accountType, accountSubType) {
  const t  = accountType    || '';
  const st = accountSubType || '';

  for (const rule of CLASSIFICATION_RULES) {
    if (!rule.test(t, st)) continue;
    const subcategory = rule.subcategoryFn ? rule.subcategoryFn(t, st) : (rule.subcategory ?? null);
    return {
      category:           rule.category || null,
      subcategory,
      confidence:         rule.confidence || 'review_required',
      isRevenue:          !!rule.isRevenue,
      isBalanceSheet:     !!rule.isBalanceSheet,
      isDirectCost:       !!rule.isDirectCost,
      isOperatingExpense: !!rule.isOperatingExpense,
      isTax:              !!rule.isTax,
      isCashAccount:      false, // deprecated; always false
    };
  }

  // No rule matched
  return {
    category:           null,
    subcategory:        null,
    confidence:         'review_required',
    isRevenue:          false,
    isBalanceSheet:     false,
    isDirectCost:       false,
    isOperatingExpense: false,
    isTax:              false,
    isCashAccount:      false,
  };
}

// Legacy suggest function kept for backward compat (tests call syncSvc.suggestCategory)
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

function categoryToFlags(category) {
  return {
    isDirectCost:       category === 'cogs',
    isOperatingExpense: category === 'operating_expenses',
    isTax:              category === 'taxes',
    isCashAccount:      false, // deprecated
    isRevenue:          category === 'revenue',
    isBalanceSheet:     category === 'balance_sheet',
  };
}

// Converts a dollar amount to integer cents.
function toCents(amount) {
  return Math.round((parseFloat(amount) || 0) * 100);
}

// ── Stale sync recovery ───────────────────────────────────────────────────────

const STALE_SYNC_MINUTES = 30;

async function isActivelySyncing(accountId, provider) {
  const { rows } = await pool.query(
    `SELECT 1 FROM accounting_connections
     WHERE account_id = $1 AND provider = $2
       AND status = 'syncing'
       AND last_sync_attempt_at > NOW() - INTERVAL '${STALE_SYNC_MINUTES} minutes'`,
    [accountId, provider]
  );
  return rows.length > 0;
}

async function recoverStaleSyncs(provider = 'quickbooks_online') {
  const { rowCount } = await pool.query(
    `UPDATE accounting_connections
     SET status                  = 'sync_error',
         last_error_code         = 'STALE_SYNC',
         last_error_message_safe = 'Sync did not complete. Please retry.',
         updated_at              = NOW()
     WHERE provider = $1
       AND status = 'syncing'
       AND last_sync_attempt_at < NOW() - INTERVAL '${STALE_SYNC_MINUTES} minutes'`,
    [provider]
  );
  if (rowCount > 0) {
    console.log(`[AccountingSync] Recovered ${rowCount} stale sync(s) for provider=${provider}`);
  }
}

// ── Chart of accounts sync ────────────────────────────────────────────────────

async function syncChartOfAccounts(conn, opts = {}) {
  const accounts = await qb.queryAccounts(conn, opts);
  let upserted = 0;

  for (const acct of accounts) {
    const cls = classify(acct.accountType, acct.accountSubType);

    await pool.query(
      `INSERT INTO accounting_account_mappings
         (account_id, provider, provider_account_id, provider_account_name,
          provider_account_type, provider_account_subtype, fieldcore_category,
          fieldcore_subcategory, is_direct_cost, is_operating_expense, is_tax,
          is_cash_account, is_revenue, is_balance_sheet, mapping_confidence,
          is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
       ON CONFLICT (account_id, provider, provider_account_id) DO UPDATE
         SET provider_account_name    = EXCLUDED.provider_account_name,
             provider_account_type    = EXCLUDED.provider_account_type,
             provider_account_subtype = EXCLUDED.provider_account_subtype,
             fieldcore_category       = COALESCE(
               accounting_account_mappings.fieldcore_category,
               EXCLUDED.fieldcore_category
             ),
             fieldcore_subcategory    = COALESCE(
               accounting_account_mappings.fieldcore_subcategory,
               EXCLUDED.fieldcore_subcategory
             ),
             is_direct_cost           = EXCLUDED.is_direct_cost,
             is_operating_expense     = EXCLUDED.is_operating_expense,
             is_tax                   = EXCLUDED.is_tax,
             is_cash_account          = EXCLUDED.is_cash_account,
             is_revenue               = EXCLUDED.is_revenue,
             is_balance_sheet         = EXCLUDED.is_balance_sheet,
             mapping_confidence       = COALESCE(
               CASE WHEN accounting_account_mappings.mapping_confidence = 'review_required'
                    THEN NULL ELSE accounting_account_mappings.mapping_confidence END,
               EXCLUDED.mapping_confidence
             ),
             is_active                = EXCLUDED.is_active,
             updated_at               = NOW()`,
      [
        conn.accountId, conn.provider || 'quickbooks_online',
        acct.id, acct.name, acct.accountType, acct.accountSubType,
        cls.category,
        cls.subcategory,
        cls.isDirectCost,
        cls.isOperatingExpense,
        cls.isTax,
        cls.isCashAccount,
        cls.isRevenue,
        cls.isBalanceSheet,
        cls.confidence,
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
  fieldcoreCategory, fieldcoreSubcategory, isIgnored,
}) {
  const category = fieldcoreCategory || null;
  const flags    = categoryToFlags(category);
  await pool.query(
    `UPDATE accounting_account_mappings
     SET fieldcore_category     = $1::text,
         fieldcore_subcategory  = $2::text,
         is_ignored             = $3,
         is_direct_cost         = $4,
         is_operating_expense   = $5,
         is_tax                 = $6,
         is_cash_account        = $7,
         is_revenue             = $8,
         is_balance_sheet       = $9,
         mapping_confidence     = CASE WHEN $1::text IS NOT NULL THEN 'high_confidence' ELSE 'review_required' END,
         updated_at             = NOW()
     WHERE account_id = $10 AND provider = $11 AND provider_account_id = $12`,
    [
      category,
      fieldcoreSubcategory || null,
      !!isIgnored,
      flags.isDirectCost,
      flags.isOperatingExpense,
      flags.isTax,
      flags.isCashAccount,
      flags.isRevenue,
      flags.isBalanceSheet,
      accountId, provider, providerAccountId,
    ]
  );
}

async function bulkUpdateMappings(accountId, provider, mappings) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const m of mappings) {
      const category = m.fieldcoreCategory || null;
      const flags    = categoryToFlags(category);
      await client.query(
        `UPDATE accounting_account_mappings
         SET fieldcore_category     = $1::text,
             fieldcore_subcategory  = $2::text,
             is_ignored             = $3,
             is_direct_cost         = $4,
             is_operating_expense   = $5,
             is_tax                 = $6,
             is_cash_account        = $7,
             is_revenue             = $8,
             is_balance_sheet       = $9,
             mapping_confidence     = CASE WHEN $1::text IS NOT NULL THEN 'high_confidence' ELSE 'review_required' END,
             updated_at             = NOW()
         WHERE account_id = $10 AND provider = $11 AND provider_account_id = $12`,
        [
          category,
          m.fieldcoreSubcategory || null,
          !!m.isIgnored,
          flags.isDirectCost,
          flags.isOperatingExpense,
          flags.isTax,
          flags.isCashAccount,
          flags.isRevenue,
          flags.isBalanceSheet,
          accountId, provider, m.providerAccountId,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Mapping stats ─────────────────────────────────────────────────────────────

async function getMappingStats(accountId, provider) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                                                              AS total,
       SUM(CASE WHEN is_balance_sheet = TRUE  THEN 1 ELSE 0 END)           AS balance_sheet,
       SUM(CASE WHEN is_balance_sheet = FALSE AND is_ignored = FALSE
                 AND mapping_confidence = 'review_required' THEN 1 ELSE 0 END) AS needs_review,
       SUM(CASE WHEN mapping_confidence = 'deterministic'   THEN 1 ELSE 0 END) AS deterministic,
       SUM(CASE WHEN mapping_confidence = 'high_confidence' THEN 1 ELSE 0 END) AS high_confidence
     FROM accounting_account_mappings
     WHERE account_id = $1 AND provider = $2 AND is_active = TRUE`,
    [accountId, provider]
  );
  const r = rows[0] || {};
  return {
    total:          parseInt(r.total          || 0),
    balanceSheet:   parseInt(r.balance_sheet  || 0),
    needsReview:    parseInt(r.needs_review   || 0),
    deterministic:  parseInt(r.deterministic  || 0),
    highConfidence: parseInt(r.high_confidence || 0),
  };
}

// ── COGS / operating expense totals for P&L ───────────────────────────────────

async function getAccountingTotals(accountId, provider, start, end) {
  // First check if there are any mapped COGS/opex/tax accounts
  const { rows: flagRows } = await pool.query(
    `SELECT
       bool_or(is_direct_cost)       AS has_cogs,
       bool_or(is_operating_expense) AS has_opex,
       bool_or(is_tax)               AS has_tax
     FROM accounting_account_mappings
     WHERE account_id = $1 AND provider = $2
       AND is_ignored = FALSE AND is_active = TRUE`,
    [accountId, provider]
  );

  const flags = flagRows[0] || {};

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
    cogsCents:          parseInt(row.cogs_cents || 0),
    opexCents:          parseInt(row.opex_cents || 0),
    taxCents:           parseInt(row.tax_cents  || 0),
    hasCOGSAccounts:    !!flags.has_cogs,
    hasOpExAccounts:    !!flags.has_opex,
    hasTaxAccounts:     !!flags.has_tax,
  };
}

module.exports = {
  FIELDCORE_CATEGORIES,
  classify,
  categoryToFlags,
  syncChartOfAccounts,
  syncVendors,
  syncExpenses,
  syncBills,
  syncCreditMemos,
  isActivelySyncing,
  recoverStaleSyncs,
  runSync,
  getMappings,
  updateMapping,
  bulkUpdateMappings,
  getMappingStats,
  getAccountingTotals,
  suggestCategory,
};
