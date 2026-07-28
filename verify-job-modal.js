const { chromium } = require('playwright');

async function login(ctx, width, height) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width, height });
  await p.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await p.waitForSelector('input[type=email]', { timeout: 10000 });
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  return p;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ bypassCSP: true });
  await ctx.route('**/*', route => route.continue({
    headers: { ...route.request().headers(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
  }));

  // ── Desktop: open modal from calendar event ──────────────
  const desktop = await login(ctx, 1280, 900);
  await desktop.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(2000);

  // Try to click a calendar event (week view is default)
  const calEvent = await desktop.$('.rbc-event');
  if (calEvent) {
    await calEvent.click();
    await desktop.waitForTimeout(1000);
    const modalVisible = await desktop.$('.modal-overlay');
    console.log('Calendar event click → modal-overlay present:', !!modalVisible);
    await desktop.screenshot({ path: 'modal-desktop-calendar.png' });

    // Check modal classes and sizing
    const info = await desktop.evaluate(() => {
      const overlay = document.querySelector('.modal-overlay');
      const modal   = document.querySelector('.modal');
      if (!modal) return { modal: null };
      const r = modal.getBoundingClientRect();
      const s = window.getComputedStyle(modal);
      return {
        overlayPresent: !!overlay,
        modalWidth:  Math.round(r.width),
        modalHeight: Math.round(r.height),
        padding: s.padding,
        headerBorderBottom: (() => {
          const h = document.querySelector('.modal-header');
          return h ? window.getComputedStyle(h).borderBottomWidth : 'no header';
        })(),
        jdSectionCount: document.querySelectorAll('.jd-section').length,
        detailRowCount: document.querySelectorAll('.detail-row').length,
      };
    });
    console.log('=== DESKTOP MODAL INFO ===');
    console.log(JSON.stringify(info, null, 2));

    // Close modal
    await desktop.keyboard.press('Escape');
    await desktop.waitForTimeout(500);
  } else {
    console.log('No calendar events found — switching to agenda to test');
  }

  // ── Desktop: open modal from agenda row ──────────────────
  await desktop.getByText('Agenda').click();
  await desktop.waitForTimeout(1500);
  const agendaRow = await desktop.$('.fc-agenda-row');
  if (agendaRow) {
    await agendaRow.click();
    await desktop.waitForTimeout(1000);
    await desktop.screenshot({ path: 'modal-desktop-agenda.png' });
    console.log('Agenda row click → modal screenshot saved');

    // Zoom in on modal
    const modalEl = await desktop.$('.modal');
    if (modalEl) await modalEl.screenshot({ path: 'modal-desktop-zoom.png' });

    await desktop.keyboard.press('Escape');
    await desktop.waitForTimeout(500);
  } else {
    console.log('No agenda rows found');
  }

  // ── Mobile: open modal from agenda row ───────────────────
  const mobile = await login(ctx, 390, 844);
  await mobile.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.getByText('Agenda').click();
  await mobile.waitForTimeout(1500);
  const mobileRow = await mobile.$('.fc-agenda-row');
  if (mobileRow) {
    await mobileRow.click();
    await mobile.waitForTimeout(1000);
    await mobile.screenshot({ path: 'modal-mobile.png' });
    const mInfo = await mobile.evaluate(() => {
      const modal = document.querySelector('.modal');
      if (!modal) return null;
      const r = modal.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top) };
    });
    console.log('=== MOBILE MODAL INFO ===', JSON.stringify(mInfo));
    console.log('Mobile screenshot saved');
  } else {
    console.log('No agenda rows on mobile');
  }

  await b.close();
  console.log('done');
})().catch(e => console.error('ERROR:', e.message));
