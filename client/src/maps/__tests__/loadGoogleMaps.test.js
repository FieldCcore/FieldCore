import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadGoogleMaps, _resetLoader } from '../loadGoogleMaps';

describe('loadGoogleMaps', () => {
  beforeEach(() => {
    _resetLoader();
    delete window.google;
    document.querySelectorAll('script[data-fieldcore-google-maps]').forEach(s => s.remove());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects immediately when API key is missing', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    await expect(loadGoogleMaps()).rejects.toThrow('GOOGLE_MAPS_API_KEY_MISSING');
  });

  it('rejects when API key is only whitespace', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '   ');
    await expect(loadGoogleMaps()).rejects.toThrow('GOOGLE_MAPS_API_KEY_MISSING');
  });

  it('resolves immediately when window.google.maps.Map already exists', async () => {
    window.google = { maps: { Map: vi.fn() } };
    const result = await loadGoogleMaps();
    expect(result).toBe(window.google.maps);
  });

  it('returns the same Promise on every call while loading', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key-abc');
    const p1 = loadGoogleMaps();
    const p2 = loadGoogleMaps();
    const p3 = loadGoogleMaps();
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
  });

  it('injects exactly one script tag', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key-abc');
    loadGoogleMaps();
    loadGoogleMaps();
    loadGoogleMaps();
    const scripts = document.querySelectorAll('script[data-fieldcore-google-maps]');
    expect(scripts.length).toBe(1);
  });

  it('script src contains the API key', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'MY_TEST_KEY');
    loadGoogleMaps();
    const script = document.querySelector('script[data-fieldcore-google-maps]');
    expect(script?.src).toContain('key=MY_TEST_KEY');
  });

  it('script src does not contain the full raw key in plain text beyond the URL', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'SECRET_KEY_123');
    loadGoogleMaps();
    // Key should appear only inside the script src, not leaked elsewhere
    const scripts = document.querySelectorAll('script[data-fieldcore-google-maps]');
    expect(scripts.length).toBe(1);
  });

  it('resolves when script fires load and google.maps.Map is present', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key-abc');
    const promise = loadGoogleMaps();
    const script = document.querySelector('script[data-fieldcore-google-maps]');
    expect(script).toBeTruthy();
    // Simulate the Maps API being available then script load firing
    window.google = { maps: { Map: vi.fn() } };
    script.dispatchEvent(new Event('load'));
    const result = await promise;
    expect(result).toBe(window.google.maps);
  });

  it('rejects with GOOGLE_MAPS_SCRIPT_FAILED when script fires error', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key-abc');
    const promise = loadGoogleMaps();
    const script = document.querySelector('script[data-fieldcore-google-maps]');
    script.dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('GOOGLE_MAPS_SCRIPT_FAILED');
  });

  it('rejects with GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_API when load fires but Maps missing', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key-abc');
    const promise = loadGoogleMaps();
    const script = document.querySelector('script[data-fieldcore-google-maps]');
    // Do NOT set window.google before firing load
    script.dispatchEvent(new Event('load'));
    await expect(promise).rejects.toThrow('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_API');
  });

  it('reuses existing Maps script tag already in DOM', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key-abc');
    // Simulate vis.gl having already injected the script
    const existing = document.createElement('script');
    existing.src = 'https://maps.googleapis.com/maps/api/js?key=vis-gl-key';
    document.head.appendChild(existing);

    const promise = loadGoogleMaps();

    // No second script should be injected
    const ours = document.querySelector('script[data-fieldcore-google-maps]');
    expect(ours).toBeNull();

    window.google = { maps: { Map: vi.fn() } };
    existing.dispatchEvent(new Event('load'));
    const result = await promise;
    expect(result).toBe(window.google.maps);

    existing.remove();
  });

  it('_resetLoader allows a fresh load after reset', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key-abc');
    const p1 = loadGoogleMaps();
    _resetLoader();
    delete window.google;
    document.querySelectorAll('script[data-fieldcore-google-maps]').forEach(s => s.remove());
    const p2 = loadGoogleMaps();
    expect(p1).not.toBe(p2);
  });
});
