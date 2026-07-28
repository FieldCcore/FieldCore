const { chromium } = require('./node_modules/playwright');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTAyZjMwZC1iZjBkLTRjYjItYTI1Zi02NmJkYzljMTg5ODkiLCJhY2NvdW50SWQiOiI3YjgwOTYyOC1iOWQ5LTRlNzgtYjcxZi05NGZlMjhiZTZiYTgiLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3ODQ5Mjg0MjIsImV4cCI6MTc4NDkzNTYyMn0.xAyBlt1E0R-TUrfHy4tP_m-D93ScbVdcOP-AEQBVXBk';
const BASE  = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch();
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(BASE);
  await page.evaluate(tok => localStorage.setItem('fc_token', tok), TOKEN);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Zoom in on the sidebar bottom (user bar)
  await page.screenshot({ path: 'C:/Users/Kevin/fieldcore/logout-full.png', clip: { x: 0, y: 780, width: 210, height: 90 } });
  console.log('saved logout-full.png');

  // Full sidebar
  await page.screenshot({ path: 'C:/Users/Kevin/fieldcore/logout-sidebar.png', clip: { x: 0, y: 0, width: 210, height: 900 } });
  console.log('saved logout-sidebar.png');

  await ctx.close();
  await browser.close();
})();
