'use strict';
const pool = require('../db/pool');

// Maps accounts.stripe_connect_status → FieldCore Payments status.
// Stripe is an internal processor; the user-facing product is FieldCore Payments.

async function getFieldCorePaymentsStatus(accountId) {
  const { rows } = await pool.query(
    `SELECT stripe_connect_status, stripe_connect_account_id FROM accounts WHERE id = $1`,
    [accountId]
  );

  const row           = rows[0] || {};
  const connectStatus = row.stripe_connect_status || 'not_connected';
  const configured    = !!row.stripe_connect_account_id;

  let status;
  let paymentsAvailable  = false;
  let refundsAvailable   = false;
  let feesAvailable      = false; // fee detail requires accounting integration
  let disputesAvailable  = false;
  let payoutsAvailable   = false;
  let limitations        = [];

  if (connectStatus === 'active') {
    status             = 'ACTIVE';
    paymentsAvailable  = true;
    refundsAvailable   = true;
    feesAvailable      = false;
    disputesAvailable  = true;
    payoutsAvailable   = true;
  } else if (connectStatus === 'pending') {
    status      = 'DEGRADED';
    limitations = ['FieldCore Payments setup is in progress — payments activate once your account is verified.'];
  } else {
    status      = 'NOT_ENABLED';
    limitations = ['Enable FieldCore Payments to automatically include payment, refund, fee, dispute, and payout data in Financials.'];
  }

  return {
    product:           'FIELDCORE_PAYMENTS',
    status,
    providerConfigured: configured,
    paymentsAvailable,
    refundsAvailable,
    feesAvailable,
    disputesAvailable,
    payoutsAvailable,
    lastEventAt:       null,
    limitations,
  };
}

module.exports = { getFieldCorePaymentsStatus };
