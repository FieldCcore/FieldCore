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
  await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  await p.waitForTimeout(1500);

  // Dashboard — Collect + Action Needed (red) + full page
  await p.screenshot({ path: 'verify-pills-dashboard.png' });
  const badgeSizes = await p.evaluate(() => {
    const spans = document.querySelectorAll('span[style*="borderRadius"]');
    return Array.from(spans).filter(el => el.textContent.trim().length > 0).map(el => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return {
        text: el.textContent.trim().slice(0, 25),
        height: Math.round(r.height),
        fontSize: s.fontSize,
        bg: s.backgroundColor,
        color: s.color,
        lineHeight: s.lineHeight,
        fontWeight: s.fontWeight,
      };
    });
  });
  console.log('=== BADGE MEASUREMENTS (dashboard) ===');
  console.log(JSON.stringify(badgeSizes.filter(b => b.height > 10 && b.height < 40), null, 2));

  // Billing — Active badge
  await p.goto('https://www.getfieldcore.com/billing', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'verify-pills-billing.png' });

  // Entities — Not Connected
  await p.goto('https://www.getfieldcore.com/entities', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'verify-pills-entities.png' });

  // Clients
  await p.goto('https://www.getfieldcore.com/clients', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'verify-pills-clients.png' });

  await b.close();
  console.log('done');
})().catch(e => console.error('ERROR:', e.message));
