const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ bypassCSP: true });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  await p.waitForTimeout(1500);

  await p.goto('https://www.getfieldcore.com/estimates', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  // Open New Estimate
  await p.locator('button:has-text("New Estimate")').first().click();
  await p.waitForTimeout(800);

  // Select a client
  const clientSel = p.locator('select').first();
  const opts = await clientSel.locator('option').allTextContents();
  const realClient = opts.find(o => o && !o.toLowerCase().includes('select'));
  if (realClient) await clientSel.selectOption({ label: realClient });
  await p.waitForTimeout(300);

  // Fill in Description field
  await p.locator('input[placeholder="Description"]').fill('HVAC Tune-Up');
  // Fill in Amount
  await p.locator('input[type="number"], input[placeholder="0.00"]').first().fill('150');
  await p.waitForTimeout(300);

  await p.screenshot({ path: 'est3-filled.png' });

  // Intercept and submit
  const [response] = await Promise.all([
    p.waitForResponse(r => r.url().includes('/api/estimates') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
    p.locator('button:has-text("Create Estimate")').click(),
  ]);

  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'est3-after-submit.png' });

  if (response) {
    console.log('API status:', response.status());
    const body = await response.text().catch(() => '');
    console.log('API body:', body.slice(0, 800));
  } else {
    console.log('No API POST intercepted — form may have been blocked by validation');
  }

  // Check DOM for errors or success
  const pageState = await p.evaluate(() => {
    const err = document.querySelector('[class*="error"], [class*="toast"], [role="alert"], .toast-error, .error-msg');
    const modal = document.querySelector('.modal');
    return {
      errorVisible: err ? err.textContent.trim() : null,
      modalStillOpen: !!modal,
      pageURL: window.location.pathname,
    };
  });
  console.log('Page state after submit:', JSON.stringify(pageState, null, 2));

  // If list now shows estimates
  const rows = await p.evaluate(() =>
    Array.from(document.querySelectorAll('tr, [class*="row"]'))
      .map(el => el.textContent.trim().slice(0, 80))
      .filter(t => t.length > 5)
      .slice(0, 10)
  );
  console.log('Table rows:', rows);

  await b.close();
  console.log('done');
})().catch(e => console.error('ERROR:', e.message));
