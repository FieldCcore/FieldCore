const { chromium } = require('./node_modules/playwright');
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODUyMjI5ODMsImV4cCI6MTc4NTIzMDE4M30.-q6k0SrpWi1HsfIDC23atPDcniejZhjB0NBsNCPJwtk';
const BASE = 'http://localhost:5173';

async function auth(page) {
  await page.goto(BASE);
  await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch();

  // Full breakpoint sweep — topbar only
  for (const { w, h, label } of [
    { w: 1920, h: 1080, label: '1920' },
    { w: 1440, h: 900,  label: '1440' },
    { w: 1280, h: 800,  label: '1280' },
    { w: 1024, h: 768,  label: '1024' },
  ]) {
    const ctx  = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await auth(page);

    // 1. Topbar resting state
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/hdr-rest-${label}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });

    // 2. Open Call panel
    await page.click('[aria-label="Open calling options"]');
    await page.waitForTimeout(280);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/hdr-call-${label}.png`, clip: { x: 0, y: 0, width: w, height: 300 } });

    // 3. Switch to Create panel (mutual exclusion)
    await page.click('[aria-label="Create new"]');
    await page.waitForTimeout(280);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/hdr-create-${label}.png`, clip: { x: 0, y: 0, width: w, height: 500 } });

    // 4. Escape closes
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/hdr-closed-${label}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });

    console.log(`${label}: done`);
    await ctx.close();
  }

  await browser.close();
  console.log('All done.');
})();
