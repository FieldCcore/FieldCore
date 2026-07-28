const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
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
  await p.screenshot({ path: 'est2-list.png' });
  console.log('Estimates list loaded');

  // Click + New Estimate (avoid the header "+ New Job" button)
  const newEstBtn = p.locator('main button:has-text("Estimate"), main a:has-text("Estimate")').first();
  const fallback  = p.locator('button:has-text("New Estimate")').first();
  const btn = await newEstBtn.count() > 0 ? newEstBtn : fallback;
  await btn.click();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: 'est2-form.png' });
  console.log('Estimate form opened');

  // Measure form/modal
  const formInfo = await p.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay');
    const modal   = document.querySelector('.modal');
    if (!modal) {
      // look for any form-like container
      const form = document.querySelector('form');
      if (!form) return { found: false };
      const r = form.getBoundingClientRect();
      return { found: true, tag: 'FORM', width: Math.round(r.width), height: Math.round(r.height) };
    }
    const r  = modal.getBoundingClientRect();
    const s  = window.getComputedStyle(modal);
    const or = overlay ? overlay.getBoundingClientRect() : null;
    return {
      found: true,
      tag: 'MODAL',
      width:   Math.round(r.width),
      height:  Math.round(r.height),
      padding: s.padding,
      overflowY: s.overflowY,
      overlayFullscreen: or ? (Math.round(or.width) === 1280) : null,
    };
  });
  console.log('Form info:', JSON.stringify(formInfo, null, 2));

  // Try to fill the estimate form
  // Select a client
  const clientSel = p.locator('select').first();
  const clientCount = await clientSel.count();
  if (clientCount > 0) {
    const opts = await clientSel.locator('option').allTextContents();
    console.log('Client options:', opts.slice(0, 5));
    // pick first non-placeholder
    const realOpt = opts.find(o => o && !o.toLowerCase().includes('select') && !o.toLowerCase().includes('client'));
    if (realOpt) {
      await clientSel.selectOption({ label: realOpt });
      console.log('Selected client:', realOpt);
    }
  }

  await p.screenshot({ path: 'est2-form-filled.png' });

  // Try submitting and capture any errors
  const submitBtn = p.locator('button[type=submit], button:has-text("Create"), button:has-text("Save")').first();
  if (await submitBtn.count() > 0) {
    // Intercept response
    const [response] = await Promise.all([
      p.waitForResponse(resp => resp.url().includes('/api/estimates'), { timeout: 10000 }).catch(() => null),
      submitBtn.click(),
    ]);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: 'est2-after-submit.png' });

    if (response) {
      const status = response.status();
      let body = '';
      try { body = await response.text(); } catch {}
      console.log('API response status:', status);
      console.log('API response body:', body.slice(0, 500));
    } else {
      console.log('No /api/estimates response intercepted');
    }

    // Check for error messages in DOM
    const errText = await p.evaluate(() => {
      const errEl = document.querySelector('[class*="error"], [class*="alert"], .toast, [role="alert"]');
      return errEl ? errEl.textContent.trim() : null;
    });
    console.log('Error in DOM:', errText);
  } else {
    console.log('No submit button found');
    const allBtns = await p.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().slice(0, 30))
    );
    console.log('All buttons:', allBtns);
  }

  await b.close();
  console.log('done');
})().catch(e => console.error('ERROR:', e.message));
