const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  const networkLog = [];
  page.on('response', async r => {
    const url = r.url();
    if (url.includes('autocomplete') || url.includes('geocode') || url.includes('maps')) {
      let body = '';
      try { body = await r.text(); } catch {}
      networkLog.push({ status: r.status(), url, body: body.slice(0, 300) });
      console.log('[net]', r.status(), url);
    }
  });
  page.on('console', m => {
    if (m.type() === 'error' || m.text().includes('[')) {
      console.log('[browser-console]', m.type(), m.text());
    }
  });

  // Step 1: load the site
  console.log('\n=== STEP 1: load production site ===');
  await page.goto('https://www.getfieldcore.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: 'verify-ac-1-home.png' });
  console.log('title:', await page.title());
  console.log('url:', page.url());

  // Step 2: attempt login
  console.log('\n=== STEP 2: login ===');
  const emailInput = await page.$('input[type="email"]');
  if (!emailInput) {
    console.log('No email input found — checking if already authenticated');
    await page.screenshot({ path: 'verify-ac-2-state.png' });
  } else {
    await page.fill('input[type="email"]', 'kevincaines925@gmail.com');
    await page.screenshot({ path: 'verify-ac-2-login-form.png' });
    console.log('Login form found — cannot proceed without password');
    console.log('BLOCKED: need login credentials');
    await browser.close();
    return;
  }

  // Step 3: navigate to jobs
  console.log('\n=== STEP 3: navigate to /jobs ===');
  await page.goto('https://www.getfieldcore.com/jobs', { waitUntil: 'networkidle', timeout: 20000 });
  await page.screenshot({ path: 'verify-ac-3-jobs.png' });
  console.log('url after nav:', page.url());

  // Step 4: open New Job modal
  console.log('\n=== STEP 4: open New Job modal ===');
  const newJobBtn = await page.$('button:has-text("New Job"), button:has-text("+ New Job"), a:has-text("New Job")');
  if (!newJobBtn) {
    console.log('New Job button not found on page');
    const btns = await page.$$eval('button', els => els.map(e => e.textContent.trim()).filter(t => t));
    console.log('buttons on page:', btns);
    await page.screenshot({ path: 'verify-ac-4-nobutton.png' });
  } else {
    await newJobBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'verify-ac-4-modal.png' });
    console.log('modal opened');

    // Step 5: find Service Location input and type
    console.log('\n=== STEP 5: type in Service Location ===');
    const addrInput = await page.$('input[placeholder="Street address"], input[placeholder*="address"], input[placeholder*="Address"]');
    if (!addrInput) {
      console.log('Address input not found');
      const inputs = await page.$$eval('input', els => els.map(e => ({ placeholder: e.placeholder, name: e.name, type: e.type })));
      console.log('all inputs:', JSON.stringify(inputs));
      await page.screenshot({ path: 'verify-ac-5-noinput.png' });
    } else {
      await addrInput.click();
      await addrInput.type('8791 NW 35', { delay: 80 });
      console.log('typed: 8791 NW 35');
      await page.waitForTimeout(1200); // wait for 300ms debounce + API round trip
      await page.screenshot({ path: 'verify-ac-5-typed.png' });

      // Step 6: check for dropdown
      console.log('\n=== STEP 6: check for suggestion dropdown ===');
      const dropdown = await page.$('ul[style*="z-index: 9999"], ul[style*="zIndex"]');
      const listItems = await page.$$('li');
      console.log('dropdown element found:', !!dropdown);
      console.log('li elements on page:', listItems.length);

      if (listItems.length > 0) {
        const texts = await page.$$eval('li', els => els.map(e => e.textContent.trim()).filter(t => t));
        console.log('suggestion text:', JSON.stringify(texts));
        await page.screenshot({ path: 'verify-ac-6-suggestions.png' });

        // Step 7: click first suggestion
        console.log('\n=== STEP 7: click first suggestion ===');
        await listItems[0].click();
        await page.waitForTimeout(500);
        const addrVal = await addrInput.inputValue();
        console.log('address value after selection:', addrVal);
        await page.screenshot({ path: 'verify-ac-7-selected.png' });
      } else {
        console.log('NO SUGGESTIONS APPEARED');
        await page.screenshot({ path: 'verify-ac-6-nosuggestions.png' });
      }
    }
  }

  console.log('\n=== NETWORK LOG ===');
  networkLog.forEach(n => console.log(n.status, n.url, '\n  body:', n.body));

  await browser.close();
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
