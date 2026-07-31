// Fieldcore dispatch map diagnostic — runs against production, writes findings to JSON.
// Updated for DispatchBaseMap class names (.dispatch-base-map-canvas, .dispatch-base-map-root).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROD_URL   = 'https://www.getfieldcore.com';
const DIAG_DIR   = path.join(__dirname, 'diag-map-artifacts');
const EMAIL      = 'info@getfieldcore.com';
const PASSWORD   = 'Kc06272007*';
const VIEWPORT   = { width: 1440, height: 900 };

if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR);

function ts() { return new Date().toISOString(); }

async function run() {
  const consoleLogs = [];
  const pageErrors  = [];
  const networkReqs = [];

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page    = await ctx.newPage();

  page.on('console', msg => {
    const txt = msg.text();
    if (msg.type() === 'error' ||
        txt.includes('DispatchBaseMap') || txt.includes('loadGoogleMaps') ||
        txt.includes('gm_authFailure') || txt.includes('ApiTarget') ||
        txt.includes('Google Maps') || txt.includes('MapProvider') ||
        txt.includes('GOOGLE_MAPS') || txt.includes('importLibrary')) {
      consoleLogs.push({ type: msg.type(), text: txt.slice(0, 600), at: ts() });
    }
  });
  page.on('pageerror', err => pageErrors.push({ message: err.message.slice(0, 400), at: ts() }));

  page.on('response', resp => {
    const url  = resp.url();
    try {
      const host = new URL(url).hostname;
      if (host.includes('google') || host.includes('googleapis') || host.includes('gstatic')) {
        const sanitised = url.replace(/([?&]key=)[^&]*/g, '$1REDACTED').slice(0, 300);
        networkReqs.push({
          host, path: new URL(url).pathname.slice(0, 120),
          status: resp.status(), type: resp.request().resourceType(),
          sanitised, at: ts(),
        });
      }
    } catch (_) {}
  });

  // ── Login ───────────────────────────────────────────────────────────────────
  console.log('[DIAG] navigating to login');
  await page.goto(`${PROD_URL}/login`, { waitUntil: 'load', timeout: 30000 });
  await page.fill('input[type=email]',    EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  console.log('[DIAG] logged in, going to /dispatch');

  // ── Navigate to Dispatch ────────────────────────────────────────────────────
  await page.goto(`${PROD_URL}/dispatch`, { waitUntil: 'load', timeout: 30000 });
  await page.screenshot({ path: path.join(DIAG_DIR, '01-dispatch-0s.png') });

  // ── Wait for loading overlay to clear (up to 15 s) ─────────────────────────
  let loadingCleared = false;
  try {
    await page.waitForFunction(
      () => !document.querySelector('.dispatch-map-loading'),
      { timeout: 15000 }
    );
    loadingCleared = true;
    console.log('[DIAG] loading overlay cleared');
  } catch (_) {
    console.log('[DIAG] loading overlay did NOT clear within 15 s');
  }

  await page.screenshot({ path: path.join(DIAG_DIR, '02-dispatch-settled.png') });

  // ── DOM inspection ──────────────────────────────────────────────────────────
  const domReport = await page.evaluate(() => {
    function measure(sel) {
      const el = document.querySelector(sel);
      if (!el) return { selector: sel, exists: false };
      const r  = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        selector: sel, exists: true, isConnected: el.isConnected,
        childCount: el.childElementCount,
        offsetW: el.offsetWidth, offsetH: el.offsetHeight,
        bcrW: Math.round(r.width), bcrH: Math.round(r.height),
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
        position: cs.position, zIndex: cs.zIndex, overflow: cs.overflow,
      };
    }

    const canvas   = document.querySelector('.dispatch-base-map-canvas');
    const gmStyle  = canvas?.querySelector('.gm-style');

    function gmDetails(el) {
      if (!el) return { exists: false };
      const r  = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        exists: true,
        offsetW: el.offsetWidth, offsetH: el.offsetHeight,
        bcrW: Math.round(r.width), bcrH: Math.round(r.height),
        childCount:  el.childElementCount,
        images:      el.querySelectorAll('img').length,
        canvases:    el.querySelectorAll('canvas').length,
        buttons:     el.querySelectorAll('button').length,
        divs:        el.querySelectorAll('div').length,
        display:     cs.display,
        visibility:  cs.visibility,
        opacity:     cs.opacity,
        hasGoogleLogo: !!el.querySelector('[title*="Google"]') || !!el.querySelector('.gm-style-cc'),
      };
    }

    const loadingEl = document.querySelector('.dispatch-map-loading');
    const errorEl   = document.querySelector('.dispatch-map-error');

    // Elements stacked at the center of the map canvas
    let elemStack = [];
    if (canvas) {
      const cb = canvas.getBoundingClientRect();
      const cx = Math.round(cb.left + cb.width  / 2);
      const cy = Math.round(cb.top  + cb.height / 2);
      elemStack = document.elementsFromPoint(cx, cy)
        .slice(0, 10)
        .map(e => `${e.tagName}${e.className ? '.' + String(e.className).split(' ')[0] : ''}`);
    }

    const googleMapsStateInBrowser = {
      googleExists:            typeof window.google !== 'undefined',
      mapsExists:              !!window.google?.maps,
      mapConstructorExists:    !!window.google?.maps?.Map,
      importLibraryExists:     typeof window.google?.maps?.importLibrary === 'function',
    };

    return {
      loadingOverlayPresent: !!loadingEl,
      errorOverlayPresent:   !!errorEl,
      errorText:             errorEl?.textContent?.slice(0, 200) || null,
      mapRoot:               measure('.dispatch-base-map-root'),
      mapCanvas:             measure('.dispatch-base-map-canvas'),
      mapWrap:               measure('.dispatch-map-wrap'),
      gmStyle:               gmDetails(gmStyle),
      elemStackAtCenter:     elemStack,
      googleMapsState:       googleMapsStateInBrowser,
      gmStyleClassification: gmStyle
        ? (gmStyle.offsetWidth === 0 || gmStyle.offsetHeight === 0
            ? 'ZERO_SIZE'
            : (gmStyle.querySelectorAll('img,canvas').length === 0
                ? 'PRESENT_EMPTY'
                : 'PRESENT_WITH_CONTENT'))
        : 'MISSING',
    };
  });

  // ── Checkpoint screenshots ──────────────────────────────────────────────────
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(DIAG_DIR, '03-dispatch-3s.png') });

  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(DIAG_DIR, '04-dispatch-15s.png') });

  // ── Zoom into map area ──────────────────────────────────────────────────────
  const mapEl = await page.$('.dispatch-map-wrap');
  if (mapEl) await mapEl.screenshot({ path: path.join(DIAG_DIR, '05-map-zoom.png') });

  // ── Classify network ────────────────────────────────────────────────────────
  const tileReqs   = networkReqs.filter(r =>
    r.sanitised.includes('/vt?') || r.sanitised.includes('/maps/vt') ||
    r.sanitised.includes('/kh?') || r.sanitised.includes('/cbk?')
  );
  const loaderReqs = networkReqs.filter(r =>
    r.sanitised.includes('maps/api/js') || r.sanitised.includes('maps.googleapis.com/maps/api')
  );
  const networkClass = tileReqs.length > 0
    ? (tileReqs.every(r => r.status === 200) ? 'BASEMAP_TILES_200_OK' : 'BASEMAP_TILES_ERRORS')
    : (loaderReqs.length > 0 ? 'LIBRARIES_LOADED_NO_TILES' : 'NO_MAPS_REQUESTS');

  // ── Write report ────────────────────────────────────────────────────────────
  const report = {
    timestamp: ts(), loadingCleared,
    gmStyleClassification: domReport.gmStyleClassification,
    networkClassification: networkClass,
    dom: domReport,
    consoleLogs: consoleLogs.slice(0, 60),
    pageErrors,
    network: {
      classification: networkClass,
      loaderRequests: loaderReqs.slice(0, 5),
      tileRequests:   tileReqs.slice(0, 10),
      allGoogleReqs:  networkReqs.slice(0, 30),
    },
  };

  fs.writeFileSync(
    path.join(DIAG_DIR, 'FIELDCORE_MAP_DIAGNOSTIC.json'),
    JSON.stringify(report, null, 2)
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n========== MAP DIAGNOSTIC SUMMARY ==========');
  console.log('Loading cleared:         ', loadingCleared);
  console.log('Loading overlay present: ', domReport.loadingOverlayPresent);
  console.log('Error overlay present:   ', domReport.errorOverlayPresent);
  console.log('Error text:              ', domReport.errorText);
  console.log('gm-style classification: ', domReport.gmStyleClassification);
  console.log('gm-style size:           ', domReport.gmStyle.exists ? `${domReport.gmStyle.offsetW}x${domReport.gmStyle.offsetH}` : 'MISSING');
  console.log('gm-style imgs/canvases:  ', domReport.gmStyle.exists ? `${domReport.gmStyle.images} imgs, ${domReport.gmStyle.canvases} canvases` : 'N/A');
  console.log('network classification:  ', networkClass);
  console.log('tile requests:           ', tileReqs.length);
  console.log('loader requests:         ', loaderReqs.length);
  console.log('google.maps.Map exists:  ', domReport.googleMapsState.mapConstructorExists);
  console.log('importLibrary exists:    ', domReport.googleMapsState.importLibraryExists);
  console.log('elem stack at center:    ', domReport.elemStackAtCenter.join(' > '));
  console.log('\nConsole logs:');
  consoleLogs.forEach(l => console.log(' ', l.type.toUpperCase(), l.text));
  console.log('\nPage errors:');
  pageErrors.forEach(e => console.log('  ERROR', e.message));
  console.log('\nLoader requests:');
  loaderReqs.forEach(r => console.log(' ', r.status, r.sanitised.slice(0, 120)));
  console.log('\nTile requests (', tileReqs.length, '):');
  tileReqs.slice(0, 5).forEach(r => console.log(' ', r.status, r.host, r.path.slice(0, 80)));
  console.log('\nArtifacts in:', DIAG_DIR);
  console.log('=============================================\n');

  await browser.close();
}

run().catch(e => { console.error('[DIAG] FATAL:', e.message); process.exit(1); });
