const pool         = require('../db/pool');
const emailService = require('./email');

async function log(accountId, userId, action, entity, entityId, details, ipAddress) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (account_id, user_id, action, entity, entity_id, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [accountId || null, userId || null, action, entity || null, entityId || null,
       details ? JSON.stringify(details) : null, ipAddress || null]
    );
  } catch (err) {
    console.error('[audit]', err.message);
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

module.exports = { log, alertAdmin };
