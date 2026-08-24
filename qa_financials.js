// Financials acceptance QA — railway run node qa_financials.js
// gitignored — never committed
const https = require('https');
const BASE  = 'https://fieldcore-production-ee0d.up.railway.app';

function req(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const url  = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   method || 'GET',
      headers:  { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    };
    const r = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const email = process.env.SEED_EMAIL, pw = process.env.SEED_PASSWORD;
  if (!email || !pw) { console.error('CREDS missing'); process.exit(1); }

  // Auth
  const login = await req('/api/auth/login', 'POST', { email, password: pw });
  if (login.status !== 200 || !login.body.token) { console.error('LOGIN FAIL', login.status); process.exit(1); }
  const token = login.body.token;
  console.log('✓ Login OK:', login.body.user.email, '| role:', login.body.user.role);

  // Financials endpoint
  const fin = await req('/api/revenue/financials', 'GET', null, token);
  console.log('\n── /revenue/financials status:', fin.status);
  if (fin.status !== 200) { console.error('FAIL:', JSON.stringify(fin.body)); process.exit(1); }
  const d = fin.body;

  // Period
  console.log('Period:', JSON.stringify(d.period));
  console.log('CalculatedAt:', d.calculatedAt);

  // KPIs
  console.log('\n── KPIs ──');
  const kpis = d.kpis || {};
  for (const [k, v] of Object.entries(kpis)) {
    if (!v) continue;
    const val = v.value != null ? `$${parseFloat(v.value).toFixed(2)}` : 'null';
    console.log(` ${k}: status=${v.status} value=${val}`);
  }

  // AR Aging
  console.log('\n── AR Aging ──');
  const ar = d.arAging;
  if (ar) {
    console.log(` total=$${ar.total} invoiceCount=${ar.invoiceCount} overdueTotal=$${ar.overdueTotal}`);
    (ar.buckets || []).forEach(b => console.log(`   ${b.label}: $${b.amount} (${b.count})`));
    if (ar.avgDaysToPay != null) console.log(` avgDaysToPay: ${ar.avgDaysToPay.toFixed(1)}`);
  }

  // Cash Flow
  console.log('\n── Cash Flow ──');
  const cf = d.cashFlow;
  if (cf) {
    const ci = cf.cashIn;
    console.log(` cashIn: status=${ci.status} value=${ci.value != null ? '$'+parseFloat(ci.value).toFixed(2) : 'null'}`);
    if (ci.breakdown) console.log(`   invoices=$${ci.breakdown.invoices} deposits=$${ci.breakdown.deposits}`);
    console.log(` cashOut: status=${cf.cashOut.status}`);
    console.log(` netCashFlow: status=${cf.netCashFlow.status}`);
  }

  // P&L
  console.log('\n── P&L rows ──');
  (d.pnl?.rows || []).forEach(r => {
    const val = r.value != null ? `$${parseFloat(r.value).toFixed(2)}` : r.status;
    console.log(` ${r.key}: ${val}`);
  });

  // Coverage
  console.log('\n── Coverage ──');
  const cov = d.coverage;
  console.log(` coverageState: ${cov?.coverageState}`);
  console.log(` activeSources:  ${(cov?.activeSources||[]).map(s=>s.sourceKey+':'+s.status).join(', ')}`);
  console.log(` optionalSources: ${(cov?.optionalSources||[]).map(s=>s.sourceKey+':'+s.status).join(', ')}`);
  if (cov?.notEnabledSources?.length) console.log(` notEnabled: ${cov.notEnabledSources.map(s=>s.sourceKey).join(', ')}`);

  // Data Quality
  console.log('\n── Data Quality ──');
  const dq = d.dataQuality;
  console.log(` state=${dq?.state} limitationCount=${dq?.limitationCount}`);
  (dq?.limitations||[]).forEach(l => console.log(`   [${l.severity}] ${l.code}: ${l.title}`));

  // Quarterly spot-check
  console.log('\n── Quarterly Q1/Q2 ──');
  const q = d.quarterly?.quarters;
  if (q) {
    ['Q1','Q2'].forEach(k => {
      const qd = q[k];
      if (qd) console.log(` ${k}: earnedRevenue=${qd.earnedRevenue} collectedRevenue=${qd.collectedRevenue}`);
    });
  }

  // Dashboard cross-check
  const dash = await req('/api/analytics/dashboard', 'GET', null, token);
  console.log('\n── Dashboard KPIs (cross-check) ──');
  if (dash.status === 200) {
    console.log(` activeJobs=${dash.body.activeJobs} todaysJobs=${dash.body.todaysJobs}`);
  }

  // Verify no silent $0 fallbacks: Cash Out and Net Cash Flow must be unavailable
  const passes = [];
  const fails  = [];

  const check = (name, condition, note) => (condition ? passes : fails).push(`${condition ? 'PASS' : 'FAIL'} ${name}${note ? ' — '+note : ''}`);

  check('Financials endpoint reachable',        fin.status === 200);
  check('Gross Revenue has value and status=ok', kpis.grossRevenue?.status === 'ok');
  check('Cash Out status=unavailable (no $0)',   cf?.cashOut?.status === 'unavailable');
  check('Net Cash Flow status=unavailable',      cf?.netCashFlow?.status === 'unavailable');
  check('AR aging has buckets',                 (ar?.buckets?.length || 0) >= 5);
  check('Coverage state defined',               !!cov?.coverageState);
  check('FieldCore Payments active',            (cov?.activeSources||[]).some(s=>s.sourceKey==='fieldcore_payments'&&s.status==='active'));
  check('P&L rows present',                     (d.pnl?.rows?.length||0) > 0);
  check('calculatedAt present',                 !!d.calculatedAt);
  check('Period start and end defined',         !!d.period?.start && !!d.period?.end);

  console.log('\n── QA Results ──');
  [...passes, ...fails].forEach(r => console.log(r));
  console.log(`\nPASS: ${passes.length} | FAIL: ${fails.length}`);
  if (fails.length > 0) process.exit(1);
  console.log('\nFINANCIALS PRODUCTION QA PASSED');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
