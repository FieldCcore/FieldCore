const cron = require('node-cron');
const pool = require('../db/pool');
const sms  = require('./sms');

// Runs every hour — sends 24h-ahead appointment reminders
function startReminderJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Checking for appointment reminders...');
    try {
      // Find jobs scheduled 23–25 hours from now that haven't had a reminder sent
      const { rows: jobs } = await pool.query(`
        SELECT j.*, c.name AS client_name, c.phone AS client_phone, a.id AS account_id
        FROM jobs j
        JOIN clients c ON c.id = j.client_id
        JOIN accounts a ON a.id = j.account_id
        WHERE j.status IN ('scheduled')
          AND j.reminder_sent = FALSE
          AND j.scheduled_at BETWEEN NOW() + INTERVAL '23 hours'
                                  AND NOW() + INTERVAL '25 hours'
          AND c.phone IS NOT NULL
      `);

      console.log(`[Scheduler] Found ${jobs.length} reminder(s) to send`);

      for (const job of jobs) {
        try {
          await sms.send(
            job.account_id,
            job.client_id,
            job.client_phone,
            sms.reminderBody(job.client_name, job.service_type, job.scheduled_at)
          );
          await pool.query(
            `UPDATE jobs SET reminder_sent = TRUE WHERE id = $1`,
            [job.id]
          );
          console.log(`[Scheduler] Reminder sent for job ${job.id} → ${job.client_phone}`);
        } catch (err) {
          console.error(`[Scheduler] Failed to send reminder for job ${job.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error querying reminder jobs:', err.message);
    }
  });

  console.log('[Scheduler] Reminder job scheduled (runs every hour)');
}

module.exports = { startReminderJob };
