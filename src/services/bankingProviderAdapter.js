'use strict';

// Provider-neutral banking adapter interface.
// All provider adapters (Plaid, MX, Finicity, etc.) must implement these methods.
// Callers should interact only with this interface — no raw provider payloads
// should reach Revenue/Financials directly.

class BankingProviderAdapter {
  // Create a Link token to initialize the bank-connection UI.
  // Returns { linkToken, expiration }
  async createLinkToken(/* { userId, accountId, webhookUrl } */) { throw new Error('Not implemented'); }

  // Exchange a public_token returned from Link for a permanent access_token.
  // Returns { accessToken, itemId }
  async exchangePublicToken(/* publicToken */) { throw new Error('Not implemented'); }

  // Fetch institution metadata by its provider ID.
  // Returns { institutionId, name, url, logo }
  async getInstitution(/* institutionId */) { throw new Error('Not implemented'); }

  // Fetch accounts for an item.
  // Returns normalized account array
  async getAccounts(/* { accessToken } */) { throw new Error('Not implemented'); }

  // Fetch balances for an item.
  // Returns normalized balance map keyed by providerAccountId
  async getBalances(/* { accessToken } */) { throw new Error('Not implemented'); }

  // Sync transactions using cursor-based sync.
  // Returns { added, modified, removed, nextCursor, hasMore }
  async syncTransactions(/* { accessToken, cursor } */) { throw new Error('Not implemented'); }

  // Force a refresh of item data.
  async refreshItem(/* { accessToken } */) { throw new Error('Not implemented'); }

  // Revoke an item's access token and remove the item.
  async removeItem(/* { accessToken } */) { throw new Error('Not implemented'); }

  // Get item connection health/status.
  // Returns { itemId, institutionId, status, errorCode, errorMessage }
  async getItemStatus(/* { accessToken } */) { throw new Error('Not implemented'); }

  // Verify and parse an inbound webhook payload.
  // Returns normalized webhook event or null if invalid
  async handleWebhook(/* { body, headers } */) { throw new Error('Not implemented'); }
}

module.exports = { BankingProviderAdapter };
