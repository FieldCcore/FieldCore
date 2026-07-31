import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocationPermission, getLocPrefs, saveLocPrefs, PREFS_KEY } from '../useLocationPermission';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePermStatus(state) {
  const listeners = {};
  const status = {
    state,
    addEventListener: vi.fn((evt, fn) => { listeners[evt] = fn; }),
    removeEventListener: vi.fn(),
    // Simulate a state change
    _change(newState) { status.state = newState; listeners['change']?.(); },
  };
  return status;
}

function setupPermissionsApi(state) {
  const status = makePermStatus(state);
  Object.defineProperty(navigator, 'permissions', {
    value:        { query: vi.fn().mockResolvedValue(status) },
    configurable: true,
    writable:     true,
  });
  return status;
}

function removePermissionsApi() {
  Object.defineProperty(navigator, 'permissions', {
    value:        undefined,
    configurable: true,
    writable:     true,
  });
}

function setGeolocationSupport(supported) {
  Object.defineProperty(navigator, 'geolocation', {
    value:        supported ? { getCurrentPosition: vi.fn() } : undefined,
    configurable: true,
    writable:     true,
  });
}

// ── localStorage helpers ──────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true, writable: true });
  setGeolocationSupport(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Secure context ────────────────────────────────────────────────────────────

describe('useLocationPermission — insecure context', () => {
  it('returns insecure_context when window.isSecureContext is false', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true, writable: true });
    const { result } = renderHook(() => useLocationPermission());
    expect(result.current.permState).toBe('insecure_context');
  });
});

// ── Unsupported geolocation ───────────────────────────────────────────────────

describe('useLocationPermission — unsupported', () => {
  it('returns unsupported when navigator.geolocation is missing', () => {
    setGeolocationSupport(false);
    const { result } = renderHook(() => useLocationPermission());
    expect(result.current.permState).toBe('unsupported');
  });
});

// ── No Permissions API ────────────────────────────────────────────────────────

describe('useLocationPermission — no Permissions API', () => {
  beforeEach(() => removePermissionsApi());

  it('returns unavailable when no Permissions API and no saved preference', () => {
    const { result } = renderHook(() => useLocationPermission());
    expect(result.current.permState).toBe('unavailable');
  });

  it('uses saved preference when Permissions API is absent', () => {
    saveLocPrefs({ lastPermissionStatus: 'granted' });
    const { result } = renderHook(() => useLocationPermission());
    expect(result.current.permState).toBe('granted');
  });
});

// ── Permissions API — granted ─────────────────────────────────────────────────

describe('useLocationPermission — granted', () => {
  it('returns granted when Permissions API reports granted', async () => {
    setupPermissionsApi('granted');
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(result.current.permState).toBe('granted');
  });

  it('saves lastPermissionStatus to localStorage when granted', async () => {
    setupPermissionsApi('granted');
    renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(getLocPrefs().lastPermissionStatus).toBe('granted');
  });
});

// ── Permissions API — prompt ──────────────────────────────────────────────────

describe('useLocationPermission — prompt', () => {
  it('returns prompt when Permissions API reports prompt', async () => {
    setupPermissionsApi('prompt');
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(result.current.permState).toBe('prompt');
  });
});

// ── Permissions API — denied ──────────────────────────────────────────────────

describe('useLocationPermission — denied', () => {
  it('returns denied when Permissions API reports denied', async () => {
    setupPermissionsApi('denied');
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(result.current.permState).toBe('denied');
  });

  it('saves denied status to localStorage', async () => {
    setupPermissionsApi('denied');
    renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(getLocPrefs().lastPermissionStatus).toBe('denied');
  });
});

// ── Permission change events ──────────────────────────────────────────────────

describe('useLocationPermission — permission changes', () => {
  it('updates state when permission changes from prompt to granted', async () => {
    const status = setupPermissionsApi('prompt');
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(result.current.permState).toBe('prompt');

    await act(async () => { status._change('granted'); });
    expect(result.current.permState).toBe('granted');
  });

  it('updates state when permission changes from granted to denied', async () => {
    const status = setupPermissionsApi('granted');
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(result.current.permState).toBe('granted');

    await act(async () => { status._change('denied'); });
    expect(result.current.permState).toBe('denied');
  });

  it('removes change listener on unmount', async () => {
    const status = setupPermissionsApi('granted');
    const { unmount } = renderHook(() => useLocationPermission());
    await act(async () => {});
    unmount();
    expect(status.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

// ── Permissions API failure ───────────────────────────────────────────────────

describe('useLocationPermission — Permissions API query failure', () => {
  it('returns unavailable when permissions.query rejects', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value:        { query: vi.fn().mockRejectedValue(new Error('not supported')) },
      configurable: true,
      writable:     true,
    });
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(result.current.permState).toBe('unavailable');
  });
});

// ── requestLocation ───────────────────────────────────────────────────────────

describe('useLocationPermission — requestLocation', () => {
  it('rejects with UNSUPPORTED when geolocation is not available', async () => {
    setGeolocationSupport(false);
    const { result } = renderHook(() => useLocationPermission());
    await expect(result.current.requestLocation()).rejects.toThrow('UNSUPPORTED');
  });

  it('resolves when getCurrentPosition succeeds', async () => {
    const fakePos = { coords: { latitude: 25.7617, longitude: -80.1918 } };
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: vi.fn((res) => res(fakePos)) },
      configurable: true, writable: true,
    });
    setupPermissionsApi('granted');
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    const pos = await result.current.requestLocation();
    expect(pos.coords.latitude).toBeCloseTo(25.7617);
  });
});

// ── recheck ───────────────────────────────────────────────────────────────────

describe('useLocationPermission — recheck', () => {
  it('re-queries Permissions API and updates state', async () => {
    const status = setupPermissionsApi('prompt');
    const { result } = renderHook(() => useLocationPermission());
    await act(async () => {});
    expect(result.current.permState).toBe('prompt');

    // Simulate user granting in browser settings
    status.state = 'granted';
    await act(async () => { await result.current.recheck(); });
    expect(result.current.permState).toBe('granted');
  });

  it('does nothing when Permissions API is missing', async () => {
    removePermissionsApi();
    const { result } = renderHook(() => useLocationPermission());
    // Should not throw
    await act(async () => { await result.current.recheck(); });
    expect(result.current.permState).toBe('unavailable');
  });
});

// ── localStorage helpers ──────────────────────────────────────────────────────

describe('getLocPrefs / saveLocPrefs', () => {
  it('returns empty object when nothing saved', () => {
    expect(getLocPrefs()).toEqual({});
  });

  it('saves and retrieves preferences', () => {
    saveLocPrefs({ locationOnboardingCompleted: true });
    expect(getLocPrefs().locationOnboardingCompleted).toBe(true);
  });

  it('merges updates without overwriting existing keys', () => {
    saveLocPrefs({ locationOnboardingCompleted: true });
    saveLocPrefs({ lastPermissionStatus: 'granted' });
    const prefs = getLocPrefs();
    expect(prefs.locationOnboardingCompleted).toBe(true);
    expect(prefs.lastPermissionStatus).toBe('granted');
  });

  it('does not store precise location coordinates', () => {
    saveLocPrefs({ lastPermissionStatus: 'granted' });
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
    expect(saved.lat).toBeUndefined();
    expect(saved.lng).toBeUndefined();
    expect(saved.latitude).toBeUndefined();
    expect(saved.longitude).toBeUndefined();
  });
});
