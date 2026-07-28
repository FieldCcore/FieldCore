const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ bypassCSP: true });
  await ctx.route('**/*', route => route.continue({
    headers: { ...route.request().headers(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
  }));
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await p.waitForSelector('input[type=email]', { timeout: 10000 });
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'pills-dashboard.png' });

  // Measure all StatusBadge-like spans on dashboard
  const badgeSizes = await p.evaluate(() => {
    // Find spans that look like pills (rounded, colored background)
    const spans = document.querySelectorAll('span[style*="borderRadius"], span[style*="border-radius"]');
    return Array.from(spans).slice(0, 20).map(el => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return {
        text: el.textContent.trim(),
        width: Math.round(r.width),
        height: Math.round(r.height),
        fontSize: s.fontSize,
        padding: s.padding,
        lineHeight: s.lineHeight,
        background: s.backgroundColor,
      };
    });
  });
  console.log('=== BADGE SIZES ON DASHBOARD ===');
  console.log(JSON.stringify(badgeSizes, null, 2));

  // Check invoices
  await p.goto('https://www.getfieldcore.com/invoices', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'pills-invoices.png' });

  // Check deposits
  await p.goto('https://www.getfieldcore.com/deposits', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'pills-deposits.png' });

  // Check billing
  await p.goto('https://www.getfieldcore.com/billing', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'pills-billing.png' });

  await b.close();
  console.log('done');
})().catch(e => console.error('ERROR:', e.message));
