const { chromium } = require('./node_modules/playwright');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODUxNDQ2MTQsImV4cCI6MTc4NTE1MTgxNH0.hzw98KezDJxoOuyniq13U2beBzBn7vhrJcckAbLErGU';
const BASE = 'http://localhost:5173';

async function auth(page) {
  await page.goto(BASE);
  await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch();

  for (const { w, h, label } of [
    { w: 1920, h: 1080, label: '1920' },
    { w: 1440, h: 900,  label: '1440' },
    { w: 1280, h: 800,  label: '1280' },
    { w: 1024, h: 768,  label: '1024' },
  ]) {
    const ctx  = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await auth(page);

    // 1. Topbar closed state
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs2-closed-${label}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });
    console.log(`  closed-${label}.png`);

    // 2. Click trigger to open
    await page.click('.gs-trigger');
    await page.waitForTimeout(350);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs2-open-${label}.png`, clip: { x: 0, y: 0, width: w, height: 600 } });
    console.log(`  open-${label}.png`);

    // 3. Type a query
    const inputSel = w > 1024 ? '#gs-input' : '#gs-input-modal';
    await page.fill(inputSel, 'john');
    await page.waitForTimeout(350);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs2-query-${label}.png`, clip: { x: 0, y: 0, width: w, height: 600 } });
    console.log(`  query-${label}.png`);

    // 4. Escape closes
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/gs2-closed2-${label}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });
    console.log(`  closed2-${label}.png`);

    await ctx.close();
  }

  await browser.close();
  console.log('Done.');
})();
