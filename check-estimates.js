const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ bypassCSP: true });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  await p.waitForTimeout(1500);

  await p.goto('https://www.getfieldcore.com/estimates', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'est-list.png' });

  // Click New Estimate button
  const newBtn = await p.$('button:has-text("New"), button:has-text("Estimate"), a:has-text("New")');
  if (newBtn) {
    await newBtn.click();
    await p.waitForTimeout(1000);
    await p.screenshot({ path: 'est-form.png' });

    // Measure the modal/form if present
    const formInfo = await p.evaluate(() => {
      const modal = document.querySelector('.modal, [class*="modal"], form, [class*="form"]');
      if (!modal) return { found: false };
      const r = modal.getBoundingClientRect();
      const s = window.getComputedStyle(modal);
      return {
        found: true,
        tag: modal.tagName,
        className: modal.className,
        width: Math.round(r.width),
        height: Math.round(r.height),
        padding: s.padding,
        overflow: s.overflow,
      };
    });
    console.log('Form/modal info:', JSON.stringify(formInfo, null, 2));
  } else {
    console.log('No new estimate button found');
    // Log all buttons visible
    const btns = await p.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().slice(0, 30))
    );
    console.log('Buttons on page:', btns);
  }

  // Try creating via API directly to test DB
  const apiTest = await p.evaluate(async () => {
    try {
      const res = await fetch('/api/estimates', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const body = await res.json();
      return { status: res.status, body };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('GET /api/estimates:', JSON.stringify(apiTest, null, 2));

  await b.close();
})().catch(e => console.error('ERROR:', e.message));
