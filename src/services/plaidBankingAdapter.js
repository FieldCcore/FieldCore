'use strict';

const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');
const { getPlaidConfig } = require('./plaidConfig');
const { BankingProviderAdapter } = require('./bankingProviderAdapter');

// Maps Plaid environment names to Plaid SDK base URLs
const ENV_MAP = {
  sandbox:     PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production:  PlaidEnvironments.production,
};

function buildClient() {
  const cfg = getPlaidConfig();
  if (!cfg.configured) throw new Error('Plaid is not configured');

  const basePath = ENV_MAP[cfg.environment] || PlaidEnvironments.sandbox;
  const config = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': cfg.clientId,
        'PLAID-SECRET':    cfg.secret,
      },
    },
  });
  return new PlaidApi(config);
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeAccount(plaidAccount) {
  const type    = (plaidAccount.type    || '').toLowerCase();
  const subtype = (plaidAccount.subtype || '').toLowerCase();
  const includeInCash =
    type === 'depository' && ['checking', 'savings', 'money market', 'cd', 'prepaid'].includes(subtype);

  return {
    providerAccountId:  plaidAccount.account_id,
    name:               plaidAccount.name,
    officialName:       plaidAccount.official_name || null,
    mask:               plaidAccount.mask || null,
    type,
    subtype,
    currency:           plaidAccount.balances?.iso_currency_code || plaidAccount.balances?.unofficial_currency_code || 'USD',
    currentBalance:     plaidAccount.balances?.current ?? null,
    availableBalance:   plaidAccount.balances?.available ?? null,
    limitBalance:       plaidAccount.balances?.limit    ?? null,
    includeInCashPosition: includeInCash,
  };
}

function normalizeTransaction(plaidTx) {
  // Plaid sign convention: positive = money out of account (debit/expense)
  //                        negative = money into account (credit/deposit)
  // FieldCore convention: CASH_IN = positive inflow, CASH_OUT = positive outflow
  const direction = plaidTx.amount > 0 ? 'CASH_OUT' : 'CASH_IN';
  const absAmount = Math.abs(plaidTx.amount);

  const primaryCat  = plaidTx.personal_finance_category?.primary   || null;
  const detailedCat = plaidTx.personal_finance_category?.detailed  || null;

  return {
    providerTransactionId:        plaidTx.transaction_id,
    providerPendingTransactionId: plaidTx.pending_transaction_id || null,
    providerAccountId:            plaidTx.account_id,
    authorizedDate:               plaidTx.authorized_date || null,
    postedDate:                   plaidTx.date,
    description:                  plaidTx.original_description || plaidTx.name,
    merchantName:                 plaidTx.merchant_name || null,
    amount:                       absAmount,
    direction,
    currency:                     plaidTx.iso_currency_code || plaidTx.unofficial_currency_code || 'USD',
    pending:                      plaidTx.pending || false,
    personalFinanceCategoryPrimary:  primaryCat,
    personalFinanceCategoryDetailed: detailedCat,
    paymentChannel:               plaidTx.payment_channel || null,
    isoCurrencyCode:              plaidTx.iso_currency_code || null,
    unofficialCurrencyCode:       plaidTx.unofficial_currency_code || null,
    rawMetadataSafe: {
      transactionType:     plaidTx.transaction_type || null,
      transactionCode:     plaidTx.transaction_code || null,
      counterparties:      plaidTx.counterparties?.map(c => ({ name: c.name, type: c.type })) || [],
    },
  };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

class PlaidBankingAdapter extends BankingProviderAdapter {
  async createLinkToken({ userId, accountId, webhookUrl }) {
    const client = buildClient();
    const request = {
      user:            { client_user_id: `fc_${accountId}_${userId}` },
      client_name:     'FieldCore',
      products:        ['transactions'],
      country_codes:   ['US'],
      language:        'en',
    };
    if (webhookUrl) request.webhook = webhookUrl;

    const response = await client.linkTokenCreate(request);
    return {
      linkToken:  response.data.link_token,
      expiration: response.data.expiration,
    };
  }

  async exchangePublicToken(publicToken) {
    const client = buildClient();
    const response = await client.itemPublicTokenExchange({ public_token: publicToken });
    return {
      accessToken: response.data.access_token,
      itemId:      response.data.item_id,
    };
  }

  async getInstitution(institutionId) {
    const client = buildClient();
    try {
      const response = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes:  ['US'],
        options:        { include_optional_metadata: true },
      });
      const inst = response.data.institution;
      return {
        institutionId: inst.institution_id,
        name:          inst.name,
        url:           inst.url || null,
        logo:          inst.logo || null,
      };
    } catch {
      return { institutionId, name: 'Unknown Institution', url: null, logo: null };
    }
  }

  async getAccounts({ accessToken }) {
    const client = buildClient();
    const response = await client.accountsGet({ access_token: accessToken });
    return {
      accounts:      response.data.accounts.map(normalizeAccount),
      institutionId: response.data.item?.institution_id || null,
    };
  }

  async getBalances({ accessToken }) {
    const client = buildClient();
    const response = await client.accountsBalanceGet({ access_token: accessToken });
    const balanceMap = {};
    for (const acct of response.data.accounts) {
      balanceMap[acct.account_id] = {
        currentBalance:   acct.balances?.current  ?? null,
        availableBalance: acct.balances?.available ?? null,
        limitBalance:     acct.balances?.limit     ?? null,
      };
    }
    return balanceMap;
  }

  async syncTransactions({ accessToken, cursor }) {
    const client = buildClient();
    const added    = [];
    const modified = [];
    const removed  = [];
    let nextCursor = cursor || undefined;
    let hasMore    = true;

    while (hasMore) {
      const request = { access_token: accessToken };
      if (nextCursor) request.cursor = nextCursor;

      const response = await client.transactionsSync(request);
      const data = response.data;

      added.push(   ...data.added.map(normalizeTransaction));
      modified.push(...data.modified.map(normalizeTransaction));
      removed.push( ...data.removed.map(r => r.transaction_id));

      nextCursor = data.next_cursor;
      hasMore    = data.has_more;
    }

    return { added, modified, removed, nextCursor };
  }

  async refreshItem({ accessToken }) {
    // Plaid doesn't have a direct "refresh" — calling getAccounts triggers a fresh fetch
    const client = buildClient();
    await client.accountsGet({ access_token: accessToken });
    return { refreshed: true };
  }

  async removeItem({ accessToken }) {
    const client = buildClient();
    await client.itemRemove({ access_token: accessToken });
    return { removed: true };
  }

  async getItemStatus({ accessToken }) {
    const client = buildClient();
    const response = await client.itemGet({ access_token: accessToken });
    const item  = response.data.item;
    const error = item.error;
    return {
      itemId:        item.item_id,
      institutionId: item.institution_id,
      status:        error ? 'ERROR' : 'HEALTHY',
      errorCode:     error?.error_code    || null,
      errorMessage:  error?.display_message || error?.error_message || null,
    };
  }

  async handleWebhook({ body }) {
    const type    = body.webhook_type;
    const code    = body.webhook_code;
    const itemId  = body.item_id;

    if (type === 'TRANSACTIONS') {
      return { type: 'TRANSACTIONS', code, itemId };
    }
    if (type === 'ITEM') {
      const errorCode = body.error?.error_code || null;
      return { type: 'ITEM', code, itemId, errorCode };
    }
    return { type, code, itemId };
  }
}

const plaidBankingAdapter = new PlaidBankingAdapter();
module.exports = { plaidBankingAdapter };
