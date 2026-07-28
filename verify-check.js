const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("https://www.getfieldcore.com/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "info@getfieldcore.com");
  await page.fill('input[type="password"]', "Kc06272007*");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });

  // Calendar - full page
  await page.goto("https://www.getfieldcore.com/jobs", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "full-calendar.png", fullPage: true });

  // Clients - full page
  await page.goto("https://www.getfieldcore.com/clients", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "full-clients.png", fullPage: true });

  // Communications
  await page.goto("https://www.getfieldcore.com/communications", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "full-comms.png", fullPage: true });

  // Settings - scroll to show sessions
  await page.goto("https://www.getfieldcore.com/account", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "full-settings-top.png", fullPage: true });

  // Entities
  await page.goto("https://www.getfieldcore.com/entities", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "full-entities.png", fullPage: true });

  // Billing
  await page.goto("https://www.getfieldcore.com/billing", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "full-billing.png", fullPage: true });

  await browser.close();
})();
