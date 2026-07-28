const { chromium } = require('playwright');

async function login(page) {
  await page.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'info@getfieldcore.com');
  await page.fill('input[type="password"]', 'Kc06272007*');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

function checkModal(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay');
    const modal   = document.querySelector('.modal');
    const header  = document.querySelector('.modal-header');
    const body    = document.querySelector('.modal-body');
    if (!modal) return { error: 'no modal found' };
    const ms = window.getComputedStyle(modal);
    const bs = body ? window.getComputedStyle(body) : null;
    const os = overlay ? window.getComputedStyle(overlay) : null;
    // check if bottom of body is accessible (scroll to bottom)
    if (body) body.scrollTop = body.scrollHeight;
    return {
      modal_overflow:     ms.overflow,
      modal_display:      ms.display,
      modal_maxHeight:    ms.maxHeight,
      modal_borderRadius: ms.borderRadius,
      modal_clipped:      modal.scrollHeight > modal.clientHeight && ms.overflow === 'hidden' && ms.overflowY === 'hidden',
      overlay_overflowY:  os?.overflowY,
      header_exists:      !!header,
      header_shrink:      header ? window.getComputedStyle(header).flexShrink : null,
      body_exists:        !!body,
      body_overflowY:     bs?.overflowY,
      body_minHeight:     bs?.minHeight,
      body_flex:          bs?.flex,
      body_scrollable:    body ? body.scrollHeight > body.clientHeight : false,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = {};

  // ── Invoice detail modal ────────────────────────────────────
  const p1 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p1);
  await p1.goto('https://www.getfieldcore.com/invoices', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(1500);
  const invoiceRow = await p1.$('tr[class*="clickable"], tbody tr');
  if (invoiceRow) {
    await invoiceRow.click();
    await p1.waitForTimeout(800);
    await p1.screenshot({ path: 'modal-invoice-top.png' });
    results.invoice = await checkModal(p1);
    await p1.screenshot({ path: 'modal-invoice-scrolled.png' });
  } else {
    results.invoice = { error: 'no invoice row found' };
  }

  // ── New Job modal ────────────────────────────────────────────
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p2);
  await p2.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1500);
  await p2.click('button:has-text("New Job")');
  await p2.waitForTimeout(800);
  results.newJob = await checkModal(p2);
  await p2.screenshot({ path: 'modal-new-job.png' });

  // ── Job detail modal ─────────────────────────────────────────
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p3);
  await p3.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(1500);
  const jobRow = await p3.$('tbody tr');
  if (jobRow) {
    await jobRow.click();
    await p3.waitForTimeout(800);
    results.jobDetail = await checkModal(p3);
    await p3.screenshot({ path: 'modal-job-detail.png' });
  } else {
    results.jobDetail = { skipped: 'no jobs in list' };
  }

  // ── New Estimate modal ───────────────────────────────────────
  const p4 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p4);
  await p4.goto('https://www.getfieldcore.com/estimates', { waitUntil: 'networkidle' });
  await p4.waitForTimeout(1500);
  const newEstBtn = await p4.$('button:has-text("New Estimate"), button:has-text("Create")');
  if (newEstBtn) {
    await newEstBtn.click();
    await p4.waitForTimeout(800);
    results.newEstimate = await checkModal(p4);
    await p4.screenshot({ path: 'modal-new-estimate.png' });
  } else {
    results.newEstimate = { skipped: 'no New Estimate button found' };
  }

  // ── New Client modal ─────────────────────────────────────────
  const p5 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p5);
  await p5.goto('https://www.getfieldcore.com/clients', { waitUntil: 'networkidle' });
  await p5.waitForTimeout(1500);
  const newClientBtn = await p5.$('button:has-text("New Client"), button:has-text("Add Client")');
  if (newClientBtn) {
    await newClientBtn.click();
    await p5.waitForTimeout(800);
    results.newClient = await checkModal(p5);
    await p5.screenshot({ path: 'modal-new-client.png' });
  } else {
    results.newClient = { skipped: 'no New Client button found' };
  }

  console.log('RESULTS:', JSON.stringify(results, null, 2));
  await browser.close();
})();
