const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('https://www.getfieldcore.com/login');
  await p.waitForSelector('input[type=email]', { timeout: 10000 });
  await p.fill('input[type=email]', 'info@getfieldcore.com');
  await p.fill('input[type=password]', 'Kc06272007*');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 15000 });
  await p.goto('https://www.getfieldcore.com/jobs');
  await p.waitForTimeout(2000);
  await p.getByText('Agenda').click();
  await p.waitForTimeout(1500);

  // Get table HTML
  const html = await p.evaluate(() => {
    const table = document.querySelector('.rbc-agenda-table');
    return table ? table.outerHTML.substring(0, 4000) : 'NOT FOUND';
  });
  console.log('=== TABLE HTML ===');
  console.log(html);

  // Get computed styles on each td
  const styles = await p.evaluate(() => {
    const rows = document.querySelectorAll('.rbc-agenda-table tbody tr');
    const result = [];
    rows.forEach((tr, i) => {
      const tds = tr.querySelectorAll('td');
      tds.forEach((td, j) => {
        const cs = window.getComputedStyle(td);
        result.push({
          row: i, col: j,
          className: td.className,
          borderBottom: cs.borderBottom,
          borderTop: cs.borderTop,
          borderLeft: cs.borderLeft,
          borderRight: cs.borderRight,
        });
      });
    });
    return result;
  });
  console.log('=== COMPUTED STYLES ===');
  console.log(JSON.stringify(styles, null, 2));

  // Zoomed screenshot of just the agenda view
  const tableEl = await p.$('.rbc-agenda-view');
  if (tableEl) {
    await tableEl.screenshot({ path: 'agenda-zoom.png' });
    console.log('zoomed screenshot saved');
  }

  await b.close();
})().catch(e => console.error('ERROR:', e.message));
