const { chromium } = require('./node_modules/playwright');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODQ5Mjg3NTksImV4cCI6MTc4NDkzNTk1OX0.6fGLZgb-G0evLyJWNShjZ6GyqvjNy2sDqbda9rv6m54';
const BASE  = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch();

  for (const { w, h, label } of [
    { w: 1440, h: 900, label: '1440' },
    { w: 1280, h: 800, label: '1280' },
    { w: 1024, h: 768, label: '1024' },
  ]) {
    const ctx  = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/fsnap-${label}.png` });
    console.log(`saved fsnap-${label}.png`);
    await ctx.close();
  }

  await browser.close();
})();
