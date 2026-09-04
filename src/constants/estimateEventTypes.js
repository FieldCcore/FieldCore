'use strict';

// Canonical estimate lifecycle event types — single source of truth.
// Do not invent aliases. Do not add frontend-only names.

const ESTIMATE = {
  CREATED:              'estimate.created',
  SENT:                 'estimate.sent',
  VIEWED:               'estimate.viewed',
  FOLLOW_UP_DUE:        'estimate.follow_up_due',
  APPROVED:             'estimate.approved',
  DECLINED:             'estimate.declined',
  EXPIRED:              'estimate.expired',
  REVISION_CREATED:     'estimate.revision_created',
  DEPOSIT_RECEIVED:     'estimate.deposit_received',
  CONVERTED_TO_JOB:     'estimate.converted_to_job',
  CONVERTED_TO_PROJECT: 'estimate.converted_to_project',
};

module.exports = { ESTIMATE };
