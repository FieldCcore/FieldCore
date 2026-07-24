const { chromium } = require('playwright');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODQ4NjE1MDAsImV4cCI6MTc4NDg2ODcwMH0.UO2OrLidRJm1DdqZySWRbSIlNvkbXsXiHPa25VI1uLM';
const BASE  = 'http://localhost:5173';
const WIDTHS = [1600, 1440, 1366, 1280, 1024];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx  = await browser.newContext({ viewport: { width: 1920, height: 900 } });
  const page = await ctx.newPage();

  // Single auth load — set token then navigate once
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('fc_token', t), TOKEN);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForSelector('.kpi-grid', { timeout: 15000 });
  await page.waitForTimeout(1200);

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 1080 });
    await page.waitForTimeout(500); // allow layout reflow
    const path = `kpi-${w}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`✓ Saved ${path}`);
  }

  await browser.close();
})();
