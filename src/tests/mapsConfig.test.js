/**
 * Google Maps client config parser tests.
 *
 * Tests the same logic that client/src/maps/mapsConfig.js applies to
 * VITE_GOOGLE_MAPS_API_KEY at Vite build time. The parser is extracted into
 * src/utils/parseMapsApiKey.js so it can be tested without a Vite/browser env.
 *
 * What CAN be tested here (pure JS, no browser required):
 *   - Key present / missing / empty / whitespace / quoted
 *   - Map ID sanitization
 *   - configured flag and failureReason codes
 *   - maskedKey helper never exposes full key
 *
 * What CANNOT be tested here (requires React + Vitest + jsdom):
 *   - Component rendering states
 *   - Loader invocation
 *   - fieldcore:maps:auth-failure custom event
 *   - useApiLoadingStatus transitions
 */
const { parseMapsConfig, maskedKey } = require('../utils/parseMapsApiKey');

// ── parseMapsConfig ───────────────────────────────────────────────────────────

describe('parseMapsConfig — API key handling', () => {
  test('returns configured:true when key is present', () => {
    const cfg = parseMapsConfig('AIzaSyFakeKeyForTesting1234567890abc');
    expect(cfg.configured).toBe(true);
    expect(cfg.apiKey).toBe('AIzaSyFakeKeyForTesting1234567890abc');
    expect(cfg.failureReason).toBeNull();
  });

  test('returns MAP_CONFIG_MISSING_API_KEY when key is undefined', () => {
    const cfg = parseMapsConfig(undefined);
    expect(cfg.configured).toBe(false);
    expect(cfg.apiKey).toBe('');
    expect(cfg.failureReason).toBe('MAP_CONFIG_MISSING_API_KEY');
  });

  test('returns MAP_CONFIG_MISSING_API_KEY when key is null', () => {
    const cfg = parseMapsConfig(null);
    expect(cfg.configured).toBe(false);
    expect(cfg.failureReason).toBe('MAP_CONFIG_MISSING_API_KEY');
  });

  test('returns MAP_CONFIG_EMPTY_API_KEY when key is empty string', () => {
    const cfg = parseMapsConfig('');
    expect(cfg.configured).toBe(false);
    expect(cfg.failureReason).toBe('MAP_CONFIG_EMPTY_API_KEY');
  });

  test('returns MAP_CONFIG_EMPTY_API_KEY when key is only whitespace', () => {
    const cfg = parseMapsConfig('   ');
    expect(cfg.configured).toBe(false);
    expect(cfg.failureReason).toBe('MAP_CONFIG_EMPTY_API_KEY');
  });

  test('strips leading/trailing whitespace from key', () => {
    const cfg = parseMapsConfig('  AIzaSyFakeKey  ');
    expect(cfg.configured).toBe(true);
    expect(cfg.apiKey).toBe('AIzaSyFakeKey');
  });

  test('strips wrapping double-quotes from key (Vercel copy-paste artifact)', () => {
    const cfg = parseMapsConfig('"AIzaSyFakeKeyForTesting"');
    expect(cfg.configured).toBe(true);
    expect(cfg.apiKey).toBe('AIzaSyFakeKeyForTesting');
  });

  test('strips wrapping single-quotes from key', () => {
    const cfg = parseMapsConfig("'AIzaSyFakeKeyForTesting'");
    expect(cfg.configured).toBe(true);
    expect(cfg.apiKey).toBe('AIzaSyFakeKeyForTesting');
  });

  test('strips quotes AND whitespace together', () => {
    const cfg = parseMapsConfig('  "AIzaSyFakeKey"  ');
    expect(cfg.configured).toBe(true);
    expect(cfg.apiKey).toBe('AIzaSyFakeKey');
  });
});

describe('parseMapsConfig — Map ID handling', () => {
  const KEY = 'AIzaSyFakeKey';

  test('mapId is null when not provided', () => {
    const cfg = parseMapsConfig(KEY);
    expect(cfg.mapId).toBeNull();
  });

  test('mapId is null when undefined', () => {
    const cfg = parseMapsConfig(KEY, undefined);
    expect(cfg.mapId).toBeNull();
  });

  test('mapId is null when empty string', () => {
    const cfg = parseMapsConfig(KEY, '');
    expect(cfg.mapId).toBeNull();
  });

  test('mapId is set when provided', () => {
    const cfg = parseMapsConfig(KEY, 'my-cloud-map-id');
    expect(cfg.mapId).toBe('my-cloud-map-id');
  });

  test('mapId strips whitespace', () => {
    const cfg = parseMapsConfig(KEY, '  map-id-123  ');
    expect(cfg.mapId).toBe('map-id-123');
  });

  test('mapId strips wrapping quotes', () => {
    const cfg = parseMapsConfig(KEY, '"map-id-123"');
    expect(cfg.mapId).toBe('map-id-123');
  });

  test('missing Map ID does not prevent key from being configured', () => {
    const cfg = parseMapsConfig(KEY, undefined);
    expect(cfg.configured).toBe(true);
  });
});

describe('parseMapsConfig — does not block base-map for optional config', () => {
  test('configured:true even when mapId is absent', () => {
    expect(parseMapsConfig('AIzaSyFakeKey').configured).toBe(true);
  });

  test('configured:true even when mapId is empty', () => {
    expect(parseMapsConfig('AIzaSyFakeKey', '').configured).toBe(true);
  });
});

// ── maskedKey ─────────────────────────────────────────────────────────────────

describe('maskedKey — never exposes full key', () => {
  const REAL_KEY = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567';

  test('masked output does not contain the full key', () => {
    expect(maskedKey(REAL_KEY)).not.toBe(REAL_KEY);
  });

  test('masked output is shorter than the full key', () => {
    expect(maskedKey(REAL_KEY).length).toBeLessThan(REAL_KEY.length);
  });

  test('masked output contains ellipsis', () => {
    expect(maskedKey(REAL_KEY)).toContain('…');
  });

  test('masked output shows last 4 chars', () => {
    const last4 = REAL_KEY.slice(-4);
    expect(maskedKey(REAL_KEY)).toContain(last4);
  });

  test('masked output for empty key returns "(none)"', () => {
    expect(maskedKey('')).toBe('(none)');
  });

  test('masked output for short key is safe', () => {
    const short = 'AIza';
    const result = maskedKey(short);
    expect(result).toContain('…');
    expect(result).not.toBe(short);
  });

  test('full key string does not appear in masked output for real key', () => {
    // Ensure no raw key can be reconstructed from the masked form
    const masked = maskedKey(REAL_KEY);
    // The masked form should not contain the middle of the key
    const middle = REAL_KEY.slice(8, -4);
    expect(masked).not.toContain(middle);
  });
});

// ── Loader-not-invoked guarantee (logic-level) ────────────────────────────────

describe('parseMapsConfig — loader invocation logic', () => {
  test('configured:false means loader must be skipped (no key to pass to APIProvider)', () => {
    const cases = [undefined, null, '', '  ', '"  "', "'  '"];
    for (const raw of cases) {
      const cfg = parseMapsConfig(raw);
      expect(cfg.configured).toBe(false);
      // When configured=false, GoogleMap/MapProvider skip APIProvider — no Maps request
    }
  });

  test('configured:true means loader can be invoked (key will be passed to APIProvider)', () => {
    const cfg = parseMapsConfig('AIzaSyFakeKey12345');
    expect(cfg.configured).toBe(true);
    expect(cfg.apiKey).toBeTruthy();
  });
});
