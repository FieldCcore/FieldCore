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

  // Clients list
  await p.goto('https://www.getfieldcore.com/clients', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'pills-clients.png' });

  // Entities
  await p.goto('https://www.getfieldcore.com/entities', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'pills-entities.png' });

  // Estimates
  await p.goto('https://www.getfieldcore.com/estimates', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'pills-estimates.png' });

  // Measure all badge-looking spans across clients page
  await p.goto('https://www.getfieldcore.com/clients', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const allPills = await p.evaluate(() => {
    const spans = document.querySelectorAll('span');
    return Array.from(spans).filter(el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const br = parseFloat(s.borderRadius);
      return br >= 8 && r.height > 0 && r.width > 0 && el.textContent.trim().length > 0;
    }).map(el => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return {
        text: el.textContent.trim().slice(0, 30),
        width: Math.round(r.width),
        height: Math.round(r.height),
        fontSize: s.fontSize,
        padding: s.padding,
        lineHeight: s.lineHeight,
        borderRadius: s.borderRadius,
        bg: s.backgroundColor,
        color: s.color,
      };
    });
  });
  console.log('=== ALL PILLS ON CLIENTS PAGE ===');
  console.log(JSON.stringify(allPills, null, 2));

  await b.close();
  console.log('done');
})().catch(e => console.error('ERROR:', e.message));
