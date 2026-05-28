const cron  = require('node-cron');
const pool  = require('../db/pool');
const sms   = require('./sms');
const email = require('./email');

// ── 1. Appointment reminders — runs every hour ──────────────
function startReminderJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Checking for appointment reminders...');
    try {
      const { rows: jobs } = await pool.query(`
        SELECT j.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
        FROM jobs j
        JOIN clients c ON c.id = j.client_id
        WHERE j.status IN ('scheduled')
          AND j.reminder_sent = FALSE
          AND j.scheduled_at BETWEEN NOW() + INTERVAL '23 hours'
                                  AND NOW() + INTERVAL '25 hours'
      `);

      for (const job of jobs) {
        try {
          if (job.client_phone) {
            await sms.send(
              job.account_id, job.client_id, job.client_phone,
              sms.reminderBody(job.client_name, job.service_type, job.scheduled_at)
            );
          }
          if (job.client_email) {
            await email.send({
              to:      job.client_email,
              subject: `Reminder: your ${job.service_type} appointment is tomorrow`,
              html:    email.reminderHtml(job.client_name, job.service_type, job.scheduled_at),
            });
          }
          await pool.query(`UPDATE jobs SET reminder_sent = TRUE WHERE id = $1`, [job.id]);
          console.log(`[Scheduler] Reminder sent for job ${job.id}`);
        } catch (err) {
          console.error(`[Scheduler] Reminder failed for job ${job.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Reminder error:', err.message);
    }
  });

  console.log('[Scheduler] Reminder job scheduled (hourly)');
}

// ── 2. Recurring job creation — runs nightly at 01:00 ───────
function startRecurringJobCreation() {
  cron.schedule('0 1 * * *', async () => {
    console.log('[Scheduler] Processing recurring jobs...');
    try {
      // Find completed jobs with a recurring schedule
      const { rows: jobs } = await pool.query(`
        SELECT j.*, c.name AS client_name, c.phone AS client_phone
        FROM jobs j
        JOIN clients c ON c.id = j.client_id
        WHERE j.status = 'complete'
          AND j.recurring != 'none'
          AND j.scheduled_at IS NOT NULL
      `);

      const intervalMap = {
        weekly:    '7 days',
        biweekly: '14 days',
        monthly:  '1 month',
      };

      for (const job of jobs) {
        const interval = intervalMap[job.recurring];
        if (!interval) continue;

        // Calculate next scheduled date
        const nextDate = new Date(job.scheduled_at);
        if (job.recurring === 'weekly')    nextDate.setDate(nextDate.getDate() + 7);
        if (job.recurring === 'biweekly')  nextDate.setDate(nextDate.getDate() + 14);
        if (job.recurring === 'monthly')   nextDate.setMonth(nextDate.getMonth() + 1);

        // Only create if next date is in the future and within 3 days from now
        const now    = new Date();
        const in3d   = new Date(); in3d.setDate(now.getDate() + 3);
        if (nextDate < now || nextDate > in3d) continue;

        // Check if a follow-up job already exists near this date (±2 days)
        const lower = new Date(nextDate); lower.setDate(lower.getDate() - 2);
        const upper = new Date(nextDate); upper.setDate(upper.getDate() + 2);

        const { rows: existing } = await pool.query(
          `SELECT id FROM jobs
           WHERE account_id = $1 AND client_id = $2 AND service_type = $3
             AND scheduled_at BETWEEN $4 AND $5
             AND status != 'cancelled'`,
          [job.account_id, job.client_id, job.service_type, lower, upper]
        );
        if (existing.length) continue;

        // Create the next occurrence
        const { rows: [newJob] } = await pool.query(
          `INSERT INTO jobs
             (account_id, client_id, tech_id, service_type, scheduled_at, amount, notes, recurring)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [job.account_id, job.client_id, job.tech_id, job.service_type,
           nextDate, job.amount, job.notes, job.recurring]
        );

        // Send confirmation SMS if client has phone
        if (job.client_phone) {
          sms.send(
            job.account_id, job.client_id, job.client_phone,
            sms.confirmationBody(job.client_name, job.service_type, nextDate)
          ).then(() =>
            pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [newJob.id])
          ).catch(err => console.error('[Scheduler] Recurring confirmation SMS failed:', err.message));
        }

        console.log(`[Scheduler] Created recurring job ${newJob.id} (${job.recurring}) for ${job.client_id}`);
      }
    } catch (err) {
      console.error('[Scheduler] Recurring job error:', err.message);
    }
  });

  console.log('[Scheduler] Recurring job creation scheduled (nightly 01:00)');
}

// ── 3. Deposit expiry — runs every 15 minutes ───────────────
function startDepositExpiryJob() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      // Auto-refund expired pending deposits
      const { rows: expired } = await pool.query(`
        UPDATE deposits
        SET status = 'refunded'
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        RETURNING *
      `);

      for (const d of expired) {
        console.log(`[Scheduler] Deposit ${d.id} expired — marked refunded`);
        // If Stripe charge exists, issue refund via Stripe
        if (d.stripe_charge_id && process.env.STRIPE_SECRET_KEY) {
          const stripe = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());
          stripe.refunds.create({ charge: d.stripe_charge_id })
            .then(() => console.log(`[Scheduler] Stripe refund issued for deposit ${d.id}`))
            .catch(err => console.error(`[Scheduler] Stripe refund failed for deposit ${d.id}:`, err.message));
        }
      }
    } catch (err) {
      console.error('[Scheduler] Deposit expiry error:', err.message);
    }
  });

  console.log('[Scheduler] Deposit expiry job scheduled (every 15 min)');
}

function startReminderJobs() {
  startReminderJob();
  startRecurringJobCreation();
  startDepositExpiryJob();
}

module.exports = { startReminderJob: startReminderJobs };
