const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'info@getfieldcore.com');
  await page.fill('input[type="password"]', 'Kc06272007*');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });

  await page.goto('https://www.getfieldcore.com/account', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture full page
  await page.screenshot({ path: 'ss-settings-check.png', fullPage: true });

  // Spot-check: what color is the muted text rendering at
  const textMutedColor = await page.evaluate(() => {
    const el = document.querySelector('[style*="text-muted"]') ||
               [...document.querySelectorAll('p')].find(p => p.style.color === 'var(--text-muted)');
    if (!el) return 'no element with --text-muted found via style attr';
    return window.getComputedStyle(el).color;
  });

  // Check what --text-muted resolves to via CSS
  const resolvedVar = await page.evaluate(() => {
    const div = document.createElement('div');
    div.style.color = 'var(--text-muted)';
    document.body.appendChild(div);
    const resolved = window.getComputedStyle(div).color;
    document.body.removeChild(div);
    return resolved;
  });

  console.log('--text-muted resolves to:', resolvedVar);
  console.log('element spot-check:', textMutedColor);

  await browser.close();
})();
