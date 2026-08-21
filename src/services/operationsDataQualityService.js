'use strict';
const pool = require('../db/pool');

function defaultRange() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

async function getOperationsDataQuality(accountId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;

  const issues = [];

  // Completed jobs with no team assignment and no legacy tech_id
  const { rows: [noAsgn] } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM jobs j
     WHERE j.account_id = $1
       AND j.status = 'complete'
       AND j.scheduled_at >= $2::date
       AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
       AND j.tech_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM job_assignments ja
         WHERE ja.job_id = j.id AND ja.account_id = $1 AND ja.removed_at IS NULL
       )`,
    [accountId, s, e]
  );
  if (noAsgn.cnt > 0) {
    issues.push({
      code:        'completed_job_no_assignment',
      severity:    'warning',
      title:       'Completed Jobs Without Assignment',
      description: `${noAsgn.cnt} completed job(s) have no technician or team assignment — team performance will be incomplete.`,
      count:       noAsgn.cnt,
    });
  }

  // Completed jobs with missing service type
  const { rows: [noSvc] } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM jobs
     WHERE account_id = $1 AND status = 'complete'
       AND scheduled_at >= $2::date AND scheduled_at < ($3::date + INTERVAL '1 day')
       AND (service_type IS NULL OR service_type = '')`,
    [accountId, s, e]
  );
  if (noSvc.cnt > 0) {
    issues.push({
      code:        'completed_job_no_service',
      severity:    'info',
      title:       'Completed Jobs Without Service Type',
      description: `${noSvc.cnt} completed job(s) have no service type — Revenue by Service may be incomplete.`,
      count:       noSvc.cnt,
    });
  }

  // Jobs with a zero-amount on completion (potential data entry issue)
  const { rows: [zeroAmt] } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM jobs
     WHERE account_id = $1 AND status = 'complete'
       AND scheduled_at >= $2::date AND scheduled_at < ($3::date + INTERVAL '1 day')
       AND (amount IS NULL OR amount = 0)`,
    [accountId, s, e]
  );
  if (zeroAmt.cnt > 0) {
    issues.push({
      code:        'completed_job_zero_amount',
      severity:    'info',
      title:       'Completed Jobs With Zero Revenue',
      description: `${zeroAmt.cnt} completed job(s) have $0.00 revenue — verify these are intentional (warranty, free service, etc.).`,
      count:       zeroAmt.cnt,
    });
  }

  // Commission rules exist but no entries in period
  try {
    const { rows: [ruleCheck] } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM commission_rules WHERE account_id = $1 AND active = true) AS rule_cnt,
         (SELECT COUNT(*)::int FROM commission_entries WHERE account_id = $1
           AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')) AS entry_cnt`,
      [accountId, s, e]
    );
    if (ruleCheck.rule_cnt > 0 && ruleCheck.entry_cnt === 0) {
      issues.push({
        code:        'commission_rules_no_entries',
        severity:    'info',
        title:       'Commission Rules Without Entries',
        description: `${ruleCheck.rule_cnt} active rule(s) defined but no commission entries for this period. Entries are generated automatically on job completion.`,
        count:       ruleCheck.rule_cnt,
      });
    }
  } catch { /* commission tables may not exist on first deploy */ }

  const state = issues.some(i => i.severity === 'error')   ? 'error'
    : issues.some(i => i.severity === 'warning')            ? 'partial'
    : issues.length > 0                                     ? 'partial'
    : 'complete';

  return { state, limitationCount: issues.length, limitations: issues };
}

module.exports = { getOperationsDataQuality };
