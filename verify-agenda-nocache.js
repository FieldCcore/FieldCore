const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  // Disable cache
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

  // Check if CustomAgendaView is rendering (no rowspan on date cell)
  const structure = await p.evaluate(() => {
    const rows = document.querySelectorAll('.rbc-agenda-table tbody tr');
    return Array.from(rows).map(tr => ({
      tdCount: tr.querySelectorAll('td').length,
      classes: Array.from(tr.querySelectorAll('td')).map(td => td.className),
      rowspan: Array.from(tr.querySelectorAll('td')).map(td => td.rowSpan),
    }));
  });
  console.log('=== TABLE STRUCTURE ===');
  console.log(JSON.stringify(structure, null, 2));

  await p.screenshot({ path: 'agenda-nocache-full.png' });
  const el = await p.$('.rbc-agenda-view');
  if (el) await el.screenshot({ path: 'agenda-nocache-zoom.png' });
  console.log('screenshots saved');
  await b.close();
})().catch(e => console.error('ERROR:', e.message));
