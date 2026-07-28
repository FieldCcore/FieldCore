const { chromium } = require('./node_modules/playwright');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODQ5ODU0OTEsImV4cCI6MTc4NDk5MjY5MX0.XWleQ69jemvYeZ3r5la6mw8mw21alyIQq9Pxc5RJEBM';
const BASE  = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch();

  // Full-page screenshots at all required breakpoints
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

    // Crop to just the top of the page to verify greeting
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/greet-${label}.png` });
    console.log(`saved greet-${label}.png`);
    await ctx.close();
  }

  await browser.close();
})();
