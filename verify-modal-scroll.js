const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();

  // ── Desktop (1280×900) ──────────────────────────────────────
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktop.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await desktop.fill('input[type="email"]', 'info@getfieldcore.com');
  await desktop.fill('input[type="password"]', 'Kc06272007*');
  await desktop.click('button[type="submit"]');
  await desktop.waitForURL('**/dashboard', { timeout: 10000 });

  // Open New Job modal
  await desktop.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(1500);
  await desktop.click('button:has-text("New Job")');
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: 'verify-modal-desktop.png' });

  const desktopCheck = await desktop.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay');
    const modal   = document.querySelector('.modal');
    const body    = document.querySelector('.modal-body');
    if (!overlay || !modal) return { error: 'modal elements not found' };
    const os = window.getComputedStyle(overlay);
    const ms = window.getComputedStyle(modal);
    const bs = body ? window.getComputedStyle(body) : null;
    return {
      overlay_overflowY:   os.overflowY,
      overlay_alignItems:  os.alignItems,
      modal_overflow:      ms.overflow,
      modal_display:       ms.display,
      modal_maxHeight:     ms.maxHeight,
      modal_borderRadius:  ms.borderRadius,
      modal_hasScrollbar:  modal.scrollHeight > modal.clientHeight,
      body_exists:         !!body,
      body_overflowY:      bs?.overflowY,
      body_hasScrollbar:   body ? body.scrollHeight > body.clientHeight : null,
    };
  });
  console.log('DESKTOP:', JSON.stringify(desktopCheck, null, 2));

  // ── Mobile (390×844) ───────────────────────────────────────
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  await mobile.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await mobile.fill('input[type="email"]', 'info@getfieldcore.com');
  await mobile.fill('input[type="password"]', 'Kc06272007*');
  await mobile.click('button[type="submit"]');
  await mobile.waitForURL('**/dashboard', { timeout: 10000 });

  await mobile.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(1500);
  await mobile.click('button:has-text("New Job")');
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: 'verify-modal-mobile.png' });

  const mobileCheck = await mobile.evaluate(() => {
    const modal = document.querySelector('.modal');
    const body  = document.querySelector('.modal-body');
    if (!modal) return { error: 'modal not found' };
    const ms = window.getComputedStyle(modal);
    return {
      modal_borderRadius:  ms.borderRadius,
      modal_display:       ms.display,
      modal_overflowY:     ms.overflowY,
      modal_maxHeight:     ms.maxHeight,
      body_exists:         !!body,
    };
  });
  console.log('MOBILE:', JSON.stringify(mobileCheck, null, 2));

  await browser.close();
})();
