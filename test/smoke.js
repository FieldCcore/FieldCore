#!/usr/bin/env node
/**
 * FieldCore end-to-end smoke test
 * Usage: node test/smoke.js [BASE_URL]
 * Default BASE_URL: http://localhost:3001
 *
 * Covers: auth, CRUD, booking, invoices, pay page, plan enforcement.
 * Stripe webhook flow requires manual Stripe CLI steps (see bottom).
 */

const BASE = process.argv[2] || 'http://localhost:3001';
const http  = require('http');
const https = require('https');
const { URL } = require('url');

let passed = 0;
let failed = 0;
let token  = '';
let ctx    = {}; // shared state across steps

// ── helpers ──────────────────────────────────────────────────────────────────

function request(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url     = new URL(path, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const lib     = url.protocol === 'https:' ? https : http;
    const opts    = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  {
        'Content-Type': 'application/json',
        ...(payload         ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(authToken       ? { 'Authorization': `Bearer ${authToken}` }       : {}),
      },
    };
    const req = lib.request(opts, res => {
      let raw = '';
      res.on('data', d => (raw += d));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function ok(label, condition, detail) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail !== undefined ? ` — got: ${JSON.stringify(detail)}` : ''}`);
    failed++;
  }
}

async function step(label, fn) {
  console.log(`\n▸ ${label}`);
  try {
    await fn();
  } catch (e) {
    console.log(`  ✗  THREW: ${e.message}`);
    failed++;
  }
}

// ── test steps ───────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nFieldCore Smoke Test  →  ${BASE}\n${'─'.repeat(52)}`);

  // 1. Health
  await step('Health check', async () => {
    const r = await request('GET', '/health');
    ok('status 200',        r.status === 200, r.status);
    ok('body.status = ok',  r.body?.status === 'ok', r.body);
  });

  // 2. Seed test account (idempotent — safe to run repeatedly)
  await step('Seed test owner account', async () => {
    const r = await request('POST', '/api/auth/seed-owner', {
      accountName: 'Smoke Test Co',
      name:        'Smoke Owner',
      email:       'smoke@test.local',
      password:    'smokepass123',
    });
    ok('seeded or 500 on prod guard', [200, 500].includes(r.status), r.status);
    if (r.status === 200) ctx.accountId = r.body.accountId;
  });

  // 3. Login
  await step('Login', async () => {
    const r = await request('POST', '/api/auth/login', {
      email:    'smoke@test.local',
      password: 'smokepass123',
    });
    ok('status 200',              r.status === 200, r.status);
    ok('token present',           typeof r.body?.token === 'string');
    ok('user.role = owner',       r.body?.user?.role === 'owner', r.body?.user?.role);
    ok('user.plan present',       typeof r.body?.user?.plan === 'string', r.body?.user?.plan);
    ok('user.onboarded present',  r.body?.user?.onboarded !== undefined, r.body?.user?.onboarded);
    token = r.body?.token || '';
    ctx.accountId = r.body?.user?.accountId;
  });

  // 4. /me
  await step('GET /api/auth/me', async () => {
    const r = await request('GET', '/api/auth/me', null, token);
    ok('status 200',         r.status === 200, r.status);
    ok('user returned',      !!r.body?.user, r.body);
    ok('plan returned',      typeof r.body?.user?.plan === 'string');
    ok('onboarded returned', r.body?.user?.onboarded !== undefined);
  });

  // 5. Onboarding
  await step('POST /api/onboarding/complete', async () => {
    const r = await request('POST', '/api/onboarding/complete', {
      business_name: 'Smoke Test Co',
      services:      ['General Service', 'Inspection'],
    }, token);
    ok('status 200',     r.status === 200, r.body);
    ok('success: true',  r.body?.success === true);
  });

  // 6. Billing status
  await step('GET /api/billing', async () => {
    const r = await request('GET', '/api/billing', null, token);
    ok('status 200',         r.status === 200, r.status);
    ok('plan field present', typeof r.body?.plan === 'string', r.body);
  });

  // 7. Notifications
  await step('GET /api/notifications', async () => {
    const r = await request('GET', '/api/notifications', null, token);
    ok('status 200',  r.status === 200, r.status);
    ok('array body',  Array.isArray(r.body), r.body);
  });

  // 8. Users list
  await step('GET /api/users', async () => {
    const r = await request('GET', '/api/users', null, token);
    ok('status 200',     r.status === 200, r.status);
    ok('array returned', Array.isArray(r.body), r.body);
    ctx.ownerId = r.body?.[0]?.id;
  });

  // 9. Booking settings
  await step('GET /api/booking-settings', async () => {
    const r = await request('GET', '/api/booking-settings', null, token);
    ok('status 200',       r.status === 200, r.status);
    ok('business_name set', typeof r.body?.business_name === 'string', r.body);
  });

  // 10. Create client
  await step('POST /api/clients', async () => {
    const r = await request('POST', '/api/clients', {
      name:  'Smoke Client',
      email: 'client@smoke.local',
      phone: '+15555550100',
    }, token);
    ok('status 201 or 200', [200, 201].includes(r.status), r.status);
    ctx.clientId = r.body?.id;
    ok('client id returned', !!ctx.clientId, r.body);
  });

  // 11. Create job
  await step('POST /api/jobs', async () => {
    const r = await request('POST', '/api/jobs', {
      client_id:    ctx.clientId,
      service_type: 'General Service',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      address:      '123 Smoke St',
    }, token);
    ok('status 201 or 200', [200, 201].includes(r.status), r.status);
    ctx.jobId = r.body?.id;
    ok('job id returned', !!ctx.jobId, r.body);
  });

  // 12. Get jobs
  await step('GET /api/jobs', async () => {
    const r = await request('GET', '/api/jobs', null, token);
    ok('status 200',     r.status === 200, r.status);
    ok('array returned', Array.isArray(r.body), r.body);
  });

  // 13. Public booking config
  await step('GET /api/booking/:accountId (public)', async () => {
    const r = await request('GET', `/api/booking/${ctx.accountId}`);
    ok('status 200',         r.status === 200, r.status);
    ok('business_name set',  typeof r.body?.business_name === 'string', r.body);
    ok('services array',     Array.isArray(r.body?.services), r.body);
  });

  // 14. Booking submission (no deposit)
  await step('POST /api/booking/:accountId/submit', async () => {
    const r = await request('POST', `/api/booking/${ctx.accountId}/submit`, {
      name:         'Walk-In Customer',
      phone:        '+15555550200',
      service:      'General Service',
      scheduled_at: new Date(Date.now() + 172800000).toISOString(),
      address:      '456 Widget Ave',
      agreed:       true,
    });
    // 200 = confirmed (no deposit required); 402 = deposit required; both are valid
    ok('status 200 or 402', [200, 402].includes(r.status), r.status);
  });

  // 15. Complete job
  await step('PATCH /api/jobs/:id/status (complete)', async () => {
    if (!ctx.jobId) { ok('job id available', false, 'skipped'); return; }
    const r = await request('PATCH', `/api/jobs/${ctx.jobId}/status`, { status: 'complete' }, token);
    ok('status 200', r.status === 200, r.body);
  });

  // 16. Create invoice
  await step('POST /api/invoices', async () => {
    if (!ctx.jobId) { ok('job id available', false, 'skipped'); return; }
    const r = await request('POST', '/api/invoices', {
      job_id:      ctx.jobId,
      line_items:  [{ description: 'General Service', amount: 150 }],
      tax_percent: 0,
    }, token);
    ok('status 201 or 200', [200, 201].includes(r.status), r.status);
    ctx.invoiceId = r.body?.id;
    ok('invoice id returned', !!ctx.invoiceId, r.body);
  });

  // 17. Send invoice → gets payment_link
  await step('POST /api/invoices/:id/send', async () => {
    if (!ctx.invoiceId) { ok('invoice id available', false, 'skipped'); return; }
    const r = await request('POST', `/api/invoices/${ctx.invoiceId}/send`, null, token);
    // 200 = sent; 400 = no client email (smoke client has email so should be 200)
    ok('status 200', r.status === 200, r.body);
    ok('payment_link returned', typeof r.body?.payment_link === 'string', r.body);
    ctx.paymentLink = r.body?.payment_link;
  });

  // 18. Public invoice GET (pay page)
  await step('GET /api/pay/:invoiceId (public)', async () => {
    if (!ctx.invoiceId) { ok('invoice id available', false, 'skipped'); return; }
    const r = await request('GET', `/api/pay/${ctx.invoiceId}`);
    ok('status 200',           r.status === 200, r.status);
    ok('invoice.id matches',   r.body?.id === ctx.invoiceId, r.body?.id);
    ok('amount present',       typeof r.body?.amount === 'string' || typeof r.body?.amount === 'number', r.body?.amount);
    ok('business_name present', typeof r.body?.business_name === 'string', r.body?.business_name);
  });

  // 19. Analytics
  await step('GET /api/analytics/dashboard', async () => {
    const r = await request('GET', '/api/analytics/dashboard', null, token);
    ok('status 200',            r.status === 200, r.status);
    ok('mtdRevenue present',   'mtdRevenue' in (r.body || {}), r.body);
  });

  // 20. Plan enforcement — add 3rd user on Starter should fail
  await step('Plan limit: 3rd user blocked on Starter', async () => {
    // Add user #2 first (owner is #1)
    const r1 = await request('POST', '/api/users', {
      name:     'Smoke Tech 1',
      email:    'tech1@smoke.local',
      password: 'techpass123',
      role:     'tech',
    }, token);
    // Don't assert r1 status — might already exist from prior run

    // Try to add user #3 — should be blocked on Starter (limit: 2)
    const r2 = await request('POST', '/api/users', {
      name:     'Smoke Tech 2',
      email:    'tech2@smoke.local',
      password: 'techpass123',
      role:     'tech',
    }, token);
    ok(
      'blocked with 403 + PLAN_LIMIT_USERS (or allowed if plan > Starter)',
      r2.status === 403
        ? r2.body?.code === 'PLAN_LIMIT_USERS'
        : [200, 201].includes(r2.status), // allowed on growth/scale
      `status=${r2.status} code=${r2.body?.code}`,
    );
  });

  // ── summary ──────────────────────────────────────────────────────────────

  const total = passed + failed;
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Results: ${passed}/${total} passed${failed ? `  (${failed} failed)` : ''}`);

  if (failed === 0) {
    console.log('\nAll checks passed.\n');
  } else {
    console.log('\nSome checks failed — review output above.\n');
  }

  // ── Stripe manual steps ───────────────────────────────────────────────────

  console.log(`${'─'.repeat(52)}`);
  console.log('Stripe webhook flow (manual steps):');
  console.log('');
  console.log('  1. Install Stripe CLI:  https://stripe.com/docs/stripe-cli');
  console.log('  2. Login:               stripe login');
  console.log('  3. Forward webhooks:    stripe listen --forward-to localhost:3000/api/webhooks/stripe');
  console.log('     (Copy the webhook signing secret and set STRIPE_WEBHOOK_SECRET in .env)');
  console.log('');
  console.log('  4. Test payment_intent.succeeded:');
  console.log('     stripe trigger payment_intent.succeeded');
  console.log('');
  console.log('  5. Test subscription created (billing):');
  console.log('     stripe trigger customer.subscription.created');
  console.log('');
  console.log('  6. Test checkout.session.completed (invoice payment):');
  console.log('     stripe trigger checkout.session.completed');
  console.log('');
  console.log('  Or use a test card (4242 4242 4242 4242) on the /pay/:invoiceId page');
  console.log('  after running the smoke test to get a real payment_link URL.');
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
