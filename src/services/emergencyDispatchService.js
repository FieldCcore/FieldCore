const pool  = require('../db/pool');
const audit = require('./audit');

const VALID_PRIORITIES    = ['p1', 'p2', 'p3'];
const VALID_NOTIF_POLICY  = ['none', 'sms', 'call', 'sms_and_call'];
const VALID_PAY_POLICY    = ['none', 'flat_bonus', 'time_and_half', 'double_time'];

// Statuses that allow an emergency to be declared
const DECLARABLE_STATUSES = new Set([
  'scheduled', 'en_route', 'arrived', 'in_progress', 'paused',
  'awaiting_client', 'awaiting_parts', 'partially_completed', 'ready_for_inspection',
]);

async function getJob(jobId, accountId) {
  const { rows } = await pool.query(
    `SELECT * FROM jobs WHERE id = $1 AND account_id = $2`,
    [jobId, accountId],
  );
  return rows[0] ?? null;
}

async function activate(jobId, accountId, userId, {
  priority = 'p2',
  reasonCode,
  reasonText,
  responseTargetMinutes,
  customerNotificationPolicy = 'none',
  premiumPayPolicy = 'none',
} = {}) {
  if (!VALID_PRIORITIES.includes(priority)) {
    return { error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}`, status: 400 };
  }
  if (!VALID_NOTIF_POLICY.includes(customerNotificationPolicy)) {
    return { error: `customerNotificationPolicy must be one of: ${VALID_NOTIF_POLICY.join(', ')}`, status: 400 };
  }
  if (!VALID_PAY_POLICY.includes(premiumPayPolicy)) {
    return { error: `premiumPayPolicy must be one of: ${VALID_PAY_POLICY.join(', ')}`, status: 400 };
  }

  const job = await getJob(jobId, accountId);
  if (!job) return { error: 'Job not found', status: 404 };
  if (job.is_emergency) return { error: 'Emergency already active on this job', status: 409 };
  if (!DECLARABLE_STATUSES.has(job.status)) {
    return { error: `Cannot declare emergency on a job with status "${job.status}"`, status: 422 };
  }

  const { rows } = await pool.query(
    `UPDATE jobs SET
       is_emergency                           = TRUE,
       emergency_priority                     = $1,
       emergency_reason_code                  = $2,
       emergency_reason_text                  = $3,
       emergency_declared_at                  = NOW(),
       emergency_declared_by                  = $4,
       emergency_response_target_minutes      = $5,
       emergency_customer_notification_policy = $6,
       emergency_premium_pay_policy           = $7,
       emergency_status                       = 'active',
       emergency_deactivated_at               = NULL,
       emergency_deactivated_by               = NULL,
       emergency_deactivation_reason          = NULL,
       emergency_version                      = emergency_version + 1,
       updated_at                             = NOW()
     WHERE id = $8 AND account_id = $9
     RETURNING *`,
    [
      priority, reasonCode || null, reasonText || null, userId,
      responseTargetMinutes ? parseInt(responseTargetMinutes, 10) : null,
      customerNotificationPolicy, premiumPayPolicy,
      jobId, accountId,
    ],
  );

  if (!rows.length) return { error: 'Job not found', status: 404 };

  audit.log(accountId, userId, 'job.emergency_activated', 'job', jobId,
    { priority, reasonCode, responseTargetMinutes }, null);

  return { job: rows[0] };
}

async function update(jobId, accountId, userId, fields = {}) {
  const job = await getJob(jobId, accountId);
  if (!job) return { error: 'Job not found', status: 404 };
  if (!job.is_emergency) return { error: 'No active emergency on this job', status: 409 };

  const allowed = [
    'emergency_priority', 'emergency_reason_code', 'emergency_reason_text',
    'emergency_response_target_minutes', 'emergency_customer_notification_policy',
    'emergency_premium_pay_policy',
  ];
  const sets   = [];
  const values = [];
  let   idx    = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${idx++}`);
      values.push(fields[key] === '' ? null : fields[key]);
    }
  }
  if (!sets.length) return { error: 'No updatable fields provided', status: 400 };

  sets.push(`emergency_version = emergency_version + 1`, `updated_at = NOW()`);
  values.push(jobId, accountId);

  const { rows } = await pool.query(
    `UPDATE jobs SET ${sets.join(', ')} WHERE id = $${idx} AND account_id = $${idx + 1} RETURNING *`,
    values,
  );
  if (!rows.length) return { error: 'Job not found', status: 404 };

  audit.log(accountId, userId, 'job.emergency_updated', 'job', jobId, fields, null);
  return { job: rows[0] };
}

async function resolve(jobId, accountId, userId, { notes } = {}) {
  const job = await getJob(jobId, accountId);
  if (!job) return { error: 'Job not found', status: 404 };
  if (!job.is_emergency || job.emergency_status !== 'active') {
    return { error: 'No active emergency on this job', status: 409 };
  }

  const { rows } = await pool.query(
    `UPDATE jobs SET
       is_emergency         = FALSE,
       emergency_status     = 'resolved',
       emergency_deactivated_at     = NOW(),
       emergency_deactivated_by     = $1,
       emergency_deactivation_reason = $2,
       emergency_version            = emergency_version + 1,
       updated_at                   = NOW()
     WHERE id = $3 AND account_id = $4
     RETURNING *`,
    [userId, notes || null, jobId, accountId],
  );
  if (!rows.length) return { error: 'Job not found', status: 404 };

  audit.log(accountId, userId, 'job.emergency_resolved', 'job', jobId,
    { notes: notes || null }, null);

  return { job: rows[0] };
}

async function deactivate(jobId, accountId, userId, { reason } = {}) {
  const job = await getJob(jobId, accountId);
  if (!job) return { error: 'Job not found', status: 404 };
  if (!job.is_emergency) return { error: 'No active emergency on this job', status: 409 };

  const { rows } = await pool.query(
    `UPDATE jobs SET
       is_emergency                  = FALSE,
       emergency_status              = 'deactivated',
       emergency_deactivated_at      = NOW(),
       emergency_deactivated_by      = $1,
       emergency_deactivation_reason = $2,
       emergency_version             = emergency_version + 1,
       updated_at                    = NOW()
     WHERE id = $3 AND account_id = $4
     RETURNING *`,
    [userId, reason || null, jobId, accountId],
  );
  if (!rows.length) return { error: 'Job not found', status: 404 };

  audit.log(accountId, userId, 'job.emergency_deactivated', 'job', jobId,
    { reason: reason || null }, null);

  return { job: rows[0] };
}

async function getStatus(jobId, accountId) {
  const job = await getJob(jobId, accountId);
  if (!job) return { error: 'Job not found', status: 404 };

  return {
    emergency: {
      isEmergency:                       job.is_emergency,
      priority:                          job.emergency_priority,
      reasonCode:                        job.emergency_reason_code,
      reasonText:                        job.emergency_reason_text,
      declaredAt:                        job.emergency_declared_at,
      responseTargetMinutes:             job.emergency_response_target_minutes,
      customerNotificationPolicy:        job.emergency_customer_notification_policy,
      premiumPayPolicy:                  job.emergency_premium_pay_policy,
      status:                            job.emergency_status,
      deactivatedAt:                     job.emergency_deactivated_at,
      deactivationReason:                job.emergency_deactivation_reason,
      version:                           job.emergency_version,
    },
  };
}

module.exports = { activate, update, resolve, deactivate, getStatus };
