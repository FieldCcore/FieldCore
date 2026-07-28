const { chromium } = require('./node_modules/playwright');
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODUxNDQ2MTQsImV4cCI6MTc4NTE1MTgxNH0.hzw98KezDJxoOuyniq13U2beBzBn7vhrJcckAbLErGU';
const BASE = 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch();
  for (const { w, h, label } of [
    { w: 1600, h: 900, label: '1600' },
    { w: 1366, h: 768, label: '1366' },
  ]) {
    const ctx  = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs3-closed-${label}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });
    await page.click('.gs-trigger');
    await page.waitForTimeout(350);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs3-open-${label}.png`, clip: { x: 0, y: 0, width: w, height: 550 } });
    console.log(`${label}: done`);
    await ctx.close();
  }
  await browser.close();
})();
