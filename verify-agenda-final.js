const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ bypassCSP: true });
  await ctx.route('**/*', route => {
    route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
  });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('https://www.getfieldcore.com/login', { waitUntil: 'networkidle' });
  await p.waitForSelector('input[type=email]', { timeout: 10000 });
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  await p.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.getByText('Agenda').click();
  await p.waitForTimeout(2500);

  // Check if fc-agenda is present (new custom component)
  const fcAgendaPresent = await p.evaluate(() => !!document.querySelector('.fc-agenda'));
  console.log('fc-agenda present:', fcAgendaPresent);

  // Check widths of container, header, rows
  const widths = await p.evaluate(() => {
    const get = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    };
    const rows = document.querySelectorAll('.fc-agenda-row');
    const rowWidths = Array.from(rows).map(r => Math.round(r.getBoundingClientRect().width));
    const cells = rows.length > 0 ? Array.from(rows[0].querySelectorAll('.fc-agenda-cell')).map(c => ({
      class: c.className,
      width: Math.round(c.getBoundingClientRect().width),
    })) : [];
    return {
      calWrap: get('.calendar-wrap'),
      fcAgenda: get('.fc-agenda'),
      fcHeader: get('.fc-agenda-header'),
      rowCount: rows.length,
      rowWidths,
      firstRowCells: cells,
    };
  });
  console.log('=== WIDTHS ===');
  console.log(JSON.stringify(widths, null, 2));

  // Full page screenshot
  await p.screenshot({ path: 'agenda-final-full.png' });

  // Zoom into the agenda component
  const el = await p.$('.fc-agenda');
  if (el) {
    await el.screenshot({ path: 'agenda-final-zoom.png' });
    console.log('Zoomed agenda screenshot saved');
  } else {
    console.log('WARNING: .fc-agenda not found — old component may still be live');
    const rbcEl = await p.$('.rbc-agenda-view');
    if (rbcEl) {
      await rbcEl.screenshot({ path: 'agenda-final-zoom.png' });
      console.log('Fell back to .rbc-agenda-view screenshot');
    }
  }

  await b.close();
})().catch(e => console.error('ERROR:', e.message));
