const { chromium } = require('./node_modules/playwright');
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODUyMjM5NzEsImV4cCI6MTc4NTIzMTE3MX0.Ee2v35S66eIOZhgho87LSNs1aJG5jQoYjVMZIkNRFKY';
const BASE = 'http://localhost:5173';

async function auth(page) {
  await page.goto(BASE);
  await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
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

    // 1. Resting state — search compact, controls visible
    await page.screenshot({ path: `C:/Users/Kevin/fieldcore/motion-rest-${label}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });

    if (w > 1024) {
      // 2. Click search to open (expansion animation)
      await page.click('.gs-trigger');
      await page.waitForTimeout(500); // let animation finish
      await page.screenshot({ path: `C:/Users/Kevin/fieldcore/motion-expanded-${label}.png`, clip: { x: 0, y: 0, width: w, height: 360 } });

      // 3. Escape to close (contraction)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      await page.screenshot({ path: `C:/Users/Kevin/fieldcore/motion-closed-${label}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });
    }

    console.log(`${label}: done`);
    await ctx.close();
  }

  await browser.close();
  console.log('All done.');
})();
