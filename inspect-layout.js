const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('https://www.getfieldcore.com/login');
  await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  await p.goto('https://www.getfieldcore.com/jobs');
  await p.waitForTimeout(2000);
  await p.getByText('Agenda').click();
  await p.waitForTimeout(2500);

  const layout = await p.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return { width: r.width, height: r.height, left: r.left, display: s.display, flex: s.flex, position: s.position };
    };
    return {
      '.rbc-calendar':       get('.rbc-calendar'),
      '.rbc-agenda-view':    get('.rbc-agenda-view'),
      '.rbc-agenda-table':   get('.rbc-agenda-table'),
      'tbody tr:first-child': (() => {
        const tr = document.querySelector('.rbc-agenda-table tbody tr');
        if (!tr) return null;
        const r = tr.getBoundingClientRect();
        const tds = tr.querySelectorAll('td');
        return {
          trWidth: r.width,
          tds: Array.from(tds).map(td => ({ class: td.className, width: td.getBoundingClientRect().width }))
        };
      })(),
      'calendar-wrap': get('.calendar-wrap'),
    };
  });
  console.log(JSON.stringify(layout, null, 2));

  // Full page screenshot with red border injected to show widths
  await p.evaluate(() => {
    const av = document.querySelector('.rbc-agenda-view');
    const at = document.querySelector('.rbc-agenda-table');
    const tr = document.querySelector('.rbc-agenda-table tbody tr');
    if (av) av.style.outline = '3px solid red';
    if (at) at.style.outline = '3px solid blue';
    if (tr) tr.style.outline = '3px solid green';
  });
  await p.screenshot({ path: 'layout-debug.png' });
  console.log('done');
  await b.close();
})().catch(e => console.error('ERROR:', e.message));
