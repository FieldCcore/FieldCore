const cron   = require('node-cron');
const crypto = require('crypto');
const pool   = require('../db/pool');
const sms    = require('./sms');
const email  = require('./email');
const stripe = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());

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
          ).then(result => {
            if (!result?.blocked) return pool.query(`UPDATE jobs SET confirmation_sent = TRUE WHERE id = $1`, [newJob.id]);
          }).catch(err => console.error('[Scheduler] Recurring confirmation SMS failed:', err.message));
        }

        console.log(`[Scheduler] Created recurring job ${newJob.id} (${job.recurring}) for ${job.client_id}`);
      }
    } catch (err) {
      console.error('[Scheduler] Recurring job error:', err.message);
    }
  });

  console.log('[Scheduler] Recurring job creation scheduled (nightly 01:00)');
}

// ── 3. Deposit payment reminders — runs every hour ──────────
function startDepositReminderJob() {
  cron.schedule('30 * * * *', async () => {
    try {
      const { rows: deposits } = await pool.query(`
        SELECT d.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
               j.service_type, j.scheduled_at
        FROM deposits d
        JOIN clients c ON c.id = d.client_id
        JOIN jobs j ON j.id = d.job_id
        WHERE d.status = 'pending'
          AND d.expires_at IS NOT NULL
          AND d.expires_at > NOW()
      `);

      for (const d of deposits) {
        const hoursUntilExpiry = (new Date(d.expires_at) - Date.now()) / 3600000;
        const hoursSinceCreated = (Date.now() - new Date(d.created_at)) / 3600000;

        // 24h reminder: send once between 23-25 hours after creation
        if (hoursSinceCreated >= 23 && hoursSinceCreated < 25 && !d.reminder_24h_sent) {
          if (d.client_phone) {
            sms.send(d.account_id, d.client_id, d.client_phone,
              `Hi ${d.client_name}, a deposit of $${parseFloat(d.amount).toFixed(2)} is required to confirm your ${d.service_type} appointment. Please complete payment to secure your spot. Reply STOP to opt out.`
            ).catch(() => {});
          }
          if (d.client_email) {
            email.send({
              to: d.client_email,
              subject: `Reminder: deposit required for your ${d.service_type} appointment`,
              html: `<p>Hi ${d.client_name},</p><p>A deposit of <strong>$${parseFloat(d.amount).toFixed(2)}</strong> is required to confirm your <strong>${d.service_type}</strong> appointment. Please complete payment to secure your spot.</p>`,
            }).catch(() => {});
          }
          await pool.query(`UPDATE deposits SET reminder_24h_sent = TRUE WHERE id = $1`, [d.id]);
        }

        // 48h reminder: send once between 47-49 hours after creation
        if (hoursSinceCreated >= 47 && hoursSinceCreated < 49 && !d.reminder_48h_sent) {
          if (d.client_phone) {
            sms.send(d.account_id, d.client_id, d.client_phone,
              `Hi ${d.client_name}, final reminder: your $${parseFloat(d.amount).toFixed(2)} deposit for ${d.service_type} expires in ~24 hours. Pay now to keep your appointment. Reply STOP to opt out.`
            ).catch(() => {});
          }
          if (d.client_email) {
            email.send({
              to: d.client_email,
              subject: `Final reminder: deposit expires soon for your ${d.service_type} appointment`,
              html: `<p>Hi ${d.client_name},</p><p>Your deposit of <strong>$${parseFloat(d.amount).toFixed(2)}</strong> for <strong>${d.service_type}</strong> expires in approximately 24 hours. Pay now to keep your appointment — after expiry, the slot will be released.</p>`,
            }).catch(() => {});
          }
          await pool.query(`UPDATE deposits SET reminder_48h_sent = TRUE WHERE id = $1`, [d.id]);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Deposit reminder error:', err.message);
    }
  });
  console.log('[Scheduler] Deposit reminder job scheduled (hourly :30)');
}

// ── 5. Deposit expiry — runs every 15 minutes ───────────────
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
        if (process.env.STRIPE_SECRET_KEY && (d.stripe_charge_id || d.stripe_payment_intent_id)) {
          const stripeClient = require('stripe')((process.env.STRIPE_SECRET_KEY || '').trim());
          const refundParams = d.stripe_charge_id
            ? { charge: d.stripe_charge_id }
            : { payment_intent: d.stripe_payment_intent_id };
          stripeClient.refunds.create(refundParams)
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

// ── 6. No-show auto-declare — runs every 2 minutes ──────────────────────────
function startNoShowClockJob() {
  cron.schedule('*/2 * * * *', async () => {
    try {
      // Find settings for all accounts that have auto_declare enabled
      const { rows: candidates } = await pool.query(`
        SELECT j.id AS job_id, j.account_id, j.client_id, j.tech_id,
               j.service_type, j.scheduled_at, j.no_show_clock_started_at,
               j.deposit_retained,
               c.name AS client_name, c.phone AS client_phone,
               c.email AS client_email, c.address AS client_address,
               u.name AS tech_name, u.phone AS tech_phone,
               COALESCE(nss.grace_period_minutes, 15) AS grace_period_minutes,
               COALESCE(nss.auto_declare, TRUE) AS auto_declare,
               nss.client_sms_template, nss.tech_sms_template,
               d.amount AS deposit_amount
        FROM jobs j
        JOIN clients c ON c.id = j.client_id
        LEFT JOIN users u ON u.id = j.tech_id
        LEFT JOIN no_show_settings nss ON nss.account_id = j.account_id
        LEFT JOIN deposits d ON d.job_id = j.id AND d.status = 'collected'
        WHERE j.status = 'scheduled'
          AND j.no_show_clock_started_at IS NOT NULL
          AND j.noshow_declared_at IS NULL
          AND EXTRACT(EPOCH FROM (NOW() - j.no_show_clock_started_at)) / 60
              >= COALESCE(nss.grace_period_minutes, 15)
          AND COALESCE(nss.auto_declare, TRUE) = TRUE
      `);

      for (const job of candidates) {
        try {
          const depositRetained = parseFloat(job.deposit_amount || 0);

          await pool.query(
            `UPDATE jobs SET status = 'no_show', noshow_declared_at = NOW(),
                deposit_retained = $1
             WHERE id = $2`,
            [depositRetained, job.job_id]
          );

          const { rows: [record] } = await pool.query(
            `INSERT INTO no_show_records
               (account_id, job_id, client_id, tech_id, client_name, tech_name,
                scheduled_at, clock_started_at, declared_at, grace_period_minutes,
                deposit_retained)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10)
             RETURNING *`,
            [
              job.account_id, job.job_id, job.client_id, job.tech_id,
              job.client_name, job.tech_name,
              job.scheduled_at, job.no_show_clock_started_at,
              job.grace_period_minutes, depositRetained,
            ]
          );

          const clientSms = job.client_sms_template
            ? job.client_sms_template.replace('{minutes}', job.grace_period_minutes).replace('{amount}', depositRetained.toFixed(2))
            : sms.noShowClientBody(job.client_name, job.grace_period_minutes, depositRetained);

          if (job.client_phone) {
            sms.send(job.account_id, job.client_id, job.client_phone, clientSms)
              .then(result => { if (!result?.blocked) return pool.query(`UPDATE no_show_records SET client_notified_at = NOW() WHERE id = $1`, [record.id]); })
              .catch(e => console.error('[NoShow clock SMS client]', e.message));
          }

          if (job.tech_phone) {
            const techSms = job.tech_sms_template
              ? job.tech_sms_template.replace('{client_name}', job.client_name).replace('{amount}', depositRetained.toFixed(2))
              : sms.noShowTechBody(job.client_name, job.client_address, depositRetained);
            sms.send(job.account_id, null, job.tech_phone, techSms)
              .then(result => { if (!result?.blocked) return pool.query(`UPDATE no_show_records SET tech_released_at = NOW() WHERE id = $1`, [record.id]); })
              .catch(e => console.error('[NoShow clock SMS tech]', e.message));
          }

          // Email operator
          const { rows: [owner] } = await pool.query(
            `SELECT email, name FROM users WHERE account_id = $1 AND role = 'owner' LIMIT 1`,
            [job.account_id]
          );
          if (owner?.email) {
            email.send({
              to: owner.email,
              subject: `No-Show Auto-Declared — ${job.client_name} · ${job.service_type}`,
              html: email.noShowOperatorHtml(job, { ...record, declared_at: new Date() }, depositRetained),
            }).catch(e => console.error('[NoShow clock email]', e.message));
          }

          console.log(`[Scheduler] No-show auto-declared for job ${job.job_id} (${job.client_name})`);
        } catch (err) {
          console.error(`[Scheduler] No-show auto-declare failed for job ${job.job_id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] No-show clock error:', err.message);
    }
  });
  console.log('[Scheduler] No-show clock job scheduled (every 2 min)');
}

// ── 7. Pre-charge advance notices — runs every hour ─────────────────────────
// Notifies clients 24h before their card on file will be auto-charged
function startPreChargeNoticeJob() {
  cron.schedule('15 * * * *', async () => {
    try {
      const { rows: jobs } = await pool.query(`
        SELECT j.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
               a.name AS business_name
        FROM jobs j
        JOIN clients c ON c.id = j.client_id AND c.card_on_file = TRUE
        JOIN accounts a ON a.id = j.account_id
        WHERE j.status = 'scheduled'
          AND j.amount > 0
          AND j.pre_charge_notice_sent = FALSE
          AND j.scheduled_at BETWEEN NOW() + INTERVAL '23 hours'
                                  AND NOW() + INTERVAL '25 hours'
      `);

      for (const job of jobs) {
        try {
          const fmtDate = d => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
          const msg = `Hi ${job.client_name}, a reminder that $${parseFloat(job.amount).toFixed(2)} will be charged to your card on file for your ${job.service_type} appointment on ${fmtDate(job.scheduled_at)}.`;

          if (job.client_email) {
            await email.send({
              to:      job.client_email,
              subject: `Upcoming charge for your ${job.service_type} appointment`,
              html:    email.wrap(`
                <p>Hi ${job.client_name},</p>
                <p>This is a reminder that <strong>$${parseFloat(job.amount).toFixed(2)}</strong> will be charged to your card on file for your upcoming <strong>${job.service_type}</strong> appointment on <strong>${fmtDate(job.scheduled_at)}</strong>.</p>
                <p>If you have any questions, please contact ${job.business_name}.</p>
              `),
            });
          }
          if (job.client_phone) {
            await sms.send(job.account_id, job.client_id, job.client_phone, msg + ' Reply STOP to opt out.');
          }
          await pool.query(`UPDATE jobs SET pre_charge_notice_sent = TRUE WHERE id = $1`, [job.id]);
          console.log(`[Scheduler] Pre-charge notice sent for job ${job.id}`);
        } catch (err) {
          console.error(`[Scheduler] Pre-charge notice failed for job ${job.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Pre-charge notice error:', err.message);
    }
  });
  console.log('[Scheduler] Pre-charge notice job scheduled (hourly :15)');
}

// ── 8. Billing renewal reminders — runs daily at 09:00 ─────────────────────
function startBillingRenewalReminders() {
  cron.schedule('0 9 * * *', async () => {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.endsWith('_')) return;
    try {
      const { rows: accounts } = await pool.query(
        `SELECT a.id, a.name, a.stripe_subscription_id, a.stripe_customer_id,
                a.plan, a.renewal_7d_sent, a.renewal_3d_sent,
                u.email AS owner_email
         FROM accounts a
         JOIN users u ON u.account_id = a.id AND u.role = 'owner'
         WHERE a.stripe_subscription_id IS NOT NULL
           AND a.plan_status = 'active'`
      );

      for (const acct of accounts) {
        try {
          const sub = await stripe.subscriptions.retrieve(acct.stripe_subscription_id);
          const nextDate = new Date(sub.current_period_end * 1000);
          const daysUntil = Math.ceil((nextDate - Date.now()) / (1000 * 60 * 60 * 24));
          const amount = sub.items.data[0]?.price?.unit_amount / 100 || 0;
          const planName = { solo: 'Solo', pro: 'Pro', scale: 'Scale' }[acct.plan] || acct.plan;

          if (daysUntil === 7 && !acct.renewal_7d_sent) {
            await email.send({
              to:      acct.owner_email,
              subject: `Your FieldCore subscription renews in 7 days — $${amount.toFixed(2)}`,
              html:    email.billingRenewalHtml(acct.name, 7, amount, nextDate),
            });
            await pool.query(`UPDATE accounts SET renewal_7d_sent = TRUE WHERE id = $1`, [acct.id]);
          } else if (daysUntil === 3 && !acct.renewal_3d_sent) {
            await email.send({
              to:      acct.owner_email,
              subject: `Your FieldCore subscription renews in 3 days — $${amount.toFixed(2)}`,
              html:    email.billingRenewalHtml(acct.name, 3, amount, nextDate),
            });
            await pool.query(`UPDATE accounts SET renewal_3d_sent = TRUE WHERE id = $1`, [acct.id]);
          }
        } catch (err) {
          console.error(`[Scheduler] Renewal reminder failed for account ${acct.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Billing renewal error:', err.message);
    }
  });
  console.log('[Scheduler] Billing renewal reminders scheduled (daily 09:00)');
}

// ── 9. Post-job review requests — runs every hour at :45 ────────────────────
function startReviewRequestJob() {
  cron.schedule('45 * * * *', async () => {
    try {
      const appUrl = process.env.APP_URL || '';
      const { rows: jobs } = await pool.query(`
        SELECT j.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
               a.name AS business_name
        FROM jobs j
        JOIN clients c ON c.id = j.client_id
        JOIN accounts a ON a.id = j.account_id
        WHERE j.status = 'complete'
          AND j.review_request_sent = FALSE
          AND j.completed_at IS NOT NULL
          AND j.completed_at < NOW() - INTERVAL '1 hour'
          AND j.completed_at > NOW() - INTERVAL '25 hours'
      `);

      for (const job of jobs) {
        try {
          const token = crypto.randomBytes(24).toString('hex');
          await pool.query(
            `UPDATE jobs SET review_token = $1, review_request_sent = TRUE WHERE id = $2`,
            [token, job.id]
          );

          const reviewUrl = `${appUrl}/review/${token}`;
          const smsBody   = `Hi ${job.client_name}, thanks for your ${job.service_type} with ${job.business_name}! We'd love your feedback: ${reviewUrl} Reply STOP to opt out.`;

          if (job.client_email) {
            await email.send({
              to:      job.client_email,
              subject: `How did your ${job.service_type} go? Leave a quick review`,
              html:    email.reviewRequestHtml(job.client_name, job.service_type, job.business_name, reviewUrl),
            });
          }
          if (job.client_phone) {
            await sms.send(job.account_id, job.client_id, job.client_phone, smsBody);
          }

          console.log(`[Scheduler] Review request sent for job ${job.id} (${job.client_name})`);
        } catch (err) {
          console.error(`[Scheduler] Review request failed for job ${job.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Review request error:', err.message);
    }
  });
  console.log('[Scheduler] Review request job scheduled (hourly :45)');
}

// ── 10. Expired token cleanup — runs daily at 03:00 ─────────────────────────
function startExpiredTokenCleanup() {
  cron.schedule('0 3 * * *', async () => {
    try {
      const { rowCount: resetRows } = await pool.query(
        `DELETE FROM password_reset_tokens WHERE expires_at < NOW()`
      );
      console.log(`[Scheduler] Cleaned up ${resetRows} expired password reset token(s)`);
    } catch (err) {
      console.error('[Scheduler] password_reset_tokens cleanup error:', err.message);
    }

    try {
      const { rowCount: portalRows } = await pool.query(
        `DELETE FROM client_portal_tokens WHERE expires_at < NOW()`
      );
      console.log(`[Scheduler] Cleaned up ${portalRows} expired portal token(s)`);
    } catch (err) {
      console.error('[Scheduler] client_portal_tokens cleanup error:', err.message);
    }
  });
  console.log('[Scheduler] Expired token cleanup scheduled (daily 03:00)');
}

function startReminderJobs() {
  startReminderJob();
  startRecurringJobCreation();
  startDepositReminderJob();
  startDepositExpiryJob();
  startNoShowClockJob();
  startPreChargeNoticeJob();
  startBillingRenewalReminders();
  startReviewRequestJob();
  startExpiredTokenCleanup();
}

module.exports = { startReminderJob: startReminderJobs };
