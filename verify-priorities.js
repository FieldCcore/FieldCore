const { chromium } = require('./node_modules/playwright');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODQ5MzAxNTUsImV4cCI6MTc4NDkzNzM1NX0.Xew8f3y7V2tFjiGAVHMdppJeyAkFnVCJopHdfHqBHZw';
const BASE  = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch();

  for (const { w, h, label } of [
    { w: 1440, h: 900, label: '1440' },
    { w: 1024, h: 768, label: '1024' },
  ]) {
    const ctx  = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/prio-${label}.png` });
    console.log(`saved prio-${label}.png`);
    await ctx.close();
  }

  await browser.close();
})();
