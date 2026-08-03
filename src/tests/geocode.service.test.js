'use strict';
/**
 * Unit tests for src/services/geocode.js
 *
 * Verifies:
 *   1. Server key isolation — GOOGLE_MAPS_SERVER_KEY is the only credential.
 *   2. No browser-key fallback — GOOGLE_MAPS_API_KEY is never used.
 *   3. No VITE_ key usage — Vite env vars never reach server geocoding.
 *   4. Missing server key returns NO_API_KEY (not a silent fallback).
 *   5. Source-level assertions — the geocodeAddress function body never
 *      references forbidden variable names.
 */

const fs = require('fs');
const path = require('path');

const GEOCODE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../services/geocode.js'),
  'utf8'
);

// Isolate the geocodeAddress function body for static assertions.
// Everything after "async function geocodeAddress" up to the closing "module.exports".
const fnBodyStart  = GEOCODE_SOURCE.indexOf('async function geocodeAddress');
const exportsStart = GEOCODE_SOURCE.indexOf('module.exports');
const GEOCODE_FN   = GEOCODE_SOURCE.slice(fnBodyStart, exportsStart);

// ── Static source assertions ───────────────────────────────────────────────

describe('geocode.js static source assertions', () => {
  it('geocodeAddress reads GOOGLE_MAPS_SERVER_KEY', () => {
    expect(GEOCODE_FN).toContain('GOOGLE_MAPS_SERVER_KEY');
  });

  it('geocodeAddress does not read process.env.GOOGLE_MAPS_API_KEY', () => {
    // The function body may mention "GOOGLE_MAPS_API_KEY" in error message strings
    // (to explain what NOT to use), but it must never read it from process.env.
    expect(GEOCODE_FN).not.toContain("process.env.GOOGLE_MAPS_API_KEY");
  });

  it('geocodeAddress does not read process.env.VITE_GOOGLE_MAPS_API_KEY', () => {
    expect(GEOCODE_FN).not.toContain("process.env.VITE_GOOGLE_MAPS_API_KEY");
  });

  it('geocodeAddress does not read any GOOGLE_MAPS_KEY variant other than SERVER_KEY', () => {
    // Ensure no "process.env.GOOGLE_MAPS_KEY" or "process.env.MAPS_API_KEY" sneaks in.
    expect(GEOCODE_FN).not.toMatch(/process\.env\.(?!GOOGLE_MAPS_SERVER_KEY)\w*(?:MAPS|GOOGLE)\w*/);
  });

  it('the full source does not reference VITE_GOOGLE_MAPS_API_KEY anywhere', () => {
    expect(GEOCODE_SOURCE).not.toContain('VITE_GOOGLE_MAPS_API_KEY');
  });

  it('browserKeyFallbackEnabled is explicitly false in startup log', () => {
    expect(GEOCODE_SOURCE).toContain('browserKeyFallbackEnabled');
    expect(GEOCODE_SOURCE).toContain('false');
  });
});

// ── Runtime behaviour ──────────────────────────────────────────────────────

describe('geocodeAddress runtime behaviour', () => {
  let geocodeAddress;

  beforeAll(() => {
    // Load the module once. geocodeAddress() reads process.env.GOOGLE_MAPS_SERVER_KEY
    // on every call, so tests can manipulate it freely between invocations.
    ({ geocodeAddress } = require('../services/geocode'));
  });

  it('returns NO_API_KEY error when GOOGLE_MAPS_SERVER_KEY is absent', async () => {
    const saved = process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    try {
      const result = await geocodeAddress('305 Lincoln Court, Deerfield Beach, FL');
      expect(result.error).toBe(true);
      expect(result.geocode_provider_status).toBe('NO_API_KEY');
      expect(result.geocode_error).toMatch(/GOOGLE_MAPS_SERVER_KEY/);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = saved;
    }
  });

  it('returns NO_API_KEY even when GOOGLE_MAPS_API_KEY is set (no fallback)', async () => {
    const savedServer  = process.env.GOOGLE_MAPS_SERVER_KEY;
    const savedBrowser = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'AIzaSy_browser_key_must_never_be_used';
    try {
      const result = await geocodeAddress('305 Lincoln Court, Deerfield Beach, FL');
      expect(result.error).toBe(true);
      expect(result.geocode_provider_status).toBe('NO_API_KEY');
    } finally {
      if (savedServer !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = savedServer;
      else delete process.env.GOOGLE_MAPS_SERVER_KEY;
      if (savedBrowser !== undefined) process.env.GOOGLE_MAPS_API_KEY = savedBrowser;
      else delete process.env.GOOGLE_MAPS_API_KEY;
    }
  });

  it('returns NO_API_KEY even when VITE_GOOGLE_MAPS_API_KEY is set (no fallback)', async () => {
    const savedServer = process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    process.env.VITE_GOOGLE_MAPS_API_KEY = 'AIzaSy_vite_key_must_never_reach_server';
    try {
      const result = await geocodeAddress('305 Lincoln Court, Deerfield Beach, FL');
      expect(result.error).toBe(true);
      expect(result.geocode_provider_status).toBe('NO_API_KEY');
    } finally {
      if (savedServer !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = savedServer;
      else delete process.env.GOOGLE_MAPS_SERVER_KEY;
      delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    }
  });

  it('returns INVALID_REQUEST error when address is empty and key is present', async () => {
    const saved = process.env.GOOGLE_MAPS_SERVER_KEY;
    process.env.GOOGLE_MAPS_SERVER_KEY = 'AIzaSy_fake_server_key_1234';
    try {
      const result = await geocodeAddress('');
      expect(result.error).toBe(true);
      expect(result.geocode_provider_status).toBe('INVALID_REQUEST');
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = saved;
      else delete process.env.GOOGLE_MAPS_SERVER_KEY;
    }
  });

  it('error message for missing key mentions browser-key fallback is disabled', async () => {
    const saved = process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    try {
      const result = await geocodeAddress('305 Lincoln Court, Deerfield Beach, FL');
      expect(result.geocode_error).toMatch(/browser-key fallback is intentionally disabled/i);
      expect(result.geocode_error).toMatch(/GOOGLE_MAPS_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = saved;
    }
  });
});
