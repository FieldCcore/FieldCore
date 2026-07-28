const { chromium } = require('./node_modules/playwright');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODUxNDQ2MTQsImV4cCI6MTc4NTE1MTgxNH0.hzw98KezDJxoOuyniq13U2beBzBn7vhrJcckAbLErGU';
const BASE = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch();

  for (const { w, h, label } of [
    { w: 1920, h: 1080, label: '1920' },
    { w: 1600, h: 900,  label: '1600' },
    { w: 1440, h: 900,  label: '1440' },
    { w: 1366, h: 768,  label: '1366' },
    { w: 1280, h: 800,  label: '1280' },
    { w: 1024, h: 768,  label: '1024' },
  ]) {
    const ctx  = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // Screenshot 1: topbar closed state
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs-closed-${label}.png` });
    console.log(`saved gs-closed-${label}.png`);

    // Screenshot 2: open the search dialog
    await page.click('.gs-trigger');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs-open-${label}.png` });
    console.log(`saved gs-open-${label}.png`);

    // Screenshot 3: type a query to show no-results state
    await page.fill('#gs-input', 'test query');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs-query-${label}.png` });
    console.log(`saved gs-query-${label}.png`);

    await ctx.close();
  }

  await browser.close();
})();
