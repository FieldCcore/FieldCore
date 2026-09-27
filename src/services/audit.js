const pool         = require('../db/pool');
const emailService = require('./email');

// Running count of audit write failures since process start.
// Used to detect persistent DB issues that would leave gaps in the audit trail.
let _failureCount = 0;

async function log(accountId, userId, action, entity, entityId, details, ipAddress) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (account_id, user_id, action, entity, entity_id, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [accountId || null, userId || null, action, entity || null, entityId || null,
       details ? JSON.stringify(details) : null, ipAddress || null]
    );
  } catch (err) {
    _failureCount++;
    // Write to stderr synchronously so the failure is visible even if the event loop is stressed.
    process.stderr.write(
      `[audit-failure] ${new Date().toISOString()} count=${_failureCount} action=${action} error=${err.message}\n`
    );
    // Emit a named process event so server.js and tests can hook into it.
    // This does NOT throw — audit failures must not cascade into primary request failures.
    process.emit('auditFailure', { error: err.message, failureCount: _failureCount, action, accountId });
  }
}

// Alert admin when suspicious activity detected
async function alertAdmin(subject, body) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'admin@getfieldcore.com';
  try {
    await emailService.send({
      to:      adminEmail,
      subject: `[FieldCore Security Alert] ${subject}`,
      html:    `<p style="font-family:sans-serif">${body.replace(/\n/g, '<br>')}</p>
                <p style="color:#999;font-size:12px">FieldCore Security System · ${new Date().toISOString()}</p>`,
    });
  } catch (err) {
    console.error('[audit alert email]', err.message);
  }
}

// Exposed for test introspection only.
function getFailureCount() { return _failureCount; }
function resetFailureCount() { _failureCount = 0; }

module.exports = { log, alertAdmin, getFailureCount, resetFailureCount };
