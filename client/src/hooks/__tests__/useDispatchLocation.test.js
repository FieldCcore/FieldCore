import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDispatchLocation, getLocPrefs, saveLocPrefs, PREFS_KEY } from '../useDispatchLocation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePermStatus(state) {
  const listeners = {};
  const status = {
    state,
    addEventListener:    vi.fn((evt, fn) => { listeners[evt] = fn; }),
    removeEventListener: vi.fn(),
    _change(newState) { status.state = newState; listeners['change']?.(); },
  };
  return status;
}

function setupPermissionsApi(state) {
  const status = makePermStatus(state);
  Object.defineProperty(navigator, 'permissions', {
    value: { query: vi.fn().mockResolvedValue(status) },
    configurable: true,
    writable: true,
  });
  return status;
}

function removePermissionsApi() {
  Object.defineProperty(navigator, 'permissions', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

function setGeolocationSupport(supported) {
  Object.defineProperty(navigator, 'geolocation', {
    value: supported ? { getCurrentPosition: vi.fn() } : undefined,
    configurable: true,
    writable: true,
  });
}

function mockGeoSuccess(pos) {
  navigator.geolocation.getCurrentPosition = vi.fn((success) => success(pos));
}

function mockGeoError(code) {
  navigator.geolocation.getCurrentPosition = vi.fn((_, error) => {
    const err = { code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    error(err);
  });
}

const FAKE_POS = { coords: { latitude: 25.7617, longitude: -80.1918 } };

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true, writable: true });
  setGeolocationSupport(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe('useDispatchLocation — initial state', () => {
  it('starts with unknown permission state', () => {
    setupPermissionsApi('prompt');
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.permissionState).toBe('unknown');
  });

  it('starts with idle status', () => {
    setupPermissionsApi('prompt');
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.status).toBe('idle');
  });

  it('starts with null message', () => {
    setupPermissionsApi('prompt');
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.message).toBeNull();
  });
});

// ── Permission initialisation ─────────────────────────────────────────────────

describe('useDispatchLocation — permission initialisation', () => {
  it('reads granted permission from Permissions API on mount', async () => {
    setupPermissionsApi('granted');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('granted');
  });

  it('reads prompt permission from Permissions API on mount', async () => {
    setupPermissionsApi('prompt');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('prompt');
  });

  it('reads denied permission from Permissions API on mount', async () => {
    setupPermissionsApi('denied');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('denied');
  });

  it('saves permission state to localStorage on mount', async () => {
    setupPermissionsApi('granted');
    renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(getLocPrefs().lastPermissionStatus).toBe('granted');
  });

  it('returns unsupported when navigator.geolocation is absent', () => {
    setGeolocationSupport(false);
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.permissionState).toBe('unsupported');
  });

  it('returns insecure_context when page is not HTTPS', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true, writable: true });
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.permissionState).toBe('insecure_context');
  });

  it('returns unavailable when Permissions API is absent', () => {
    removePermissionsApi();
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.permissionState).toBe('unavailable');
  });

  it('uses saved localStorage hint when Permissions API is absent', () => {
    removePermissionsApi();
    saveLocPrefs({ lastPermissionStatus: 'granted' });
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.permissionState).toBe('granted');
  });

  it('falls back to unavailable when saved hint is unknown', () => {
    removePermissionsApi();
    saveLocPrefs({ lastPermissionStatus: 'unknown' });
    const { result } = renderHook(() => useDispatchLocation());
    expect(result.current.permissionState).toBe('unavailable');
  });

  it('returns unavailable when Permissions API query rejects', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockRejectedValue(new Error('not supported')) },
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('unavailable');
  });
});

// ── Permission change events ──────────────────────────────────────────────────

describe('useDispatchLocation — permission change events', () => {
  it('updates state when browser fires permission change to granted', async () => {
    const status = setupPermissionsApi('denied');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('denied');

    await act(async () => { status._change('granted'); });
    expect(result.current.permissionState).toBe('granted');
  });

  it('clears message and resets status to idle when permission becomes granted', async () => {
    const status = setupPermissionsApi('denied');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { status._change('granted'); });
    expect(result.current.message).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('removes change listener on unmount', async () => {
    const status = setupPermissionsApi('granted');
    const { unmount } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    unmount();
    expect(status.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

// ── refreshPermission ─────────────────────────────────────────────────────────

describe('useDispatchLocation — refreshPermission', () => {
  it('re-queries Permissions API and updates state', async () => {
    const status = setupPermissionsApi('denied');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('denied');

    status.state = 'granted';
    await act(async () => { await result.current.refreshPermission(); });
    expect(result.current.permissionState).toBe('granted');
  });

  it('saves updated state to localStorage', async () => {
    const status = setupPermissionsApi('denied');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    status.state = 'granted';
    await act(async () => { await result.current.refreshPermission(); });
    expect(getLocPrefs().lastPermissionStatus).toBe('granted');
  });

  it('returns unavailable when Permissions API is absent', async () => {
    removePermissionsApi();
    const { result } = renderHook(() => useDispatchLocation());
    let returned;
    await act(async () => { returned = await result.current.refreshPermission(); });
    expect(returned).toBe('unavailable');
  });
});

// ── centerOnMe ────────────────────────────────────────────────────────────────

describe('useDispatchLocation — centerOnMe', () => {
  it('sets status to checking while locating', async () => {
    setupPermissionsApi('granted');
    navigator.geolocation.getCurrentPosition = vi.fn(); // never resolves
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    act(() => { result.current.centerOnMe(); });
    expect(result.current.status).toBe('checking');
  });

  it('calls onLocated callback with position on success', async () => {
    setupPermissionsApi('granted');
    const onLocated = vi.fn();
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation({ onLocated }));
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(onLocated).toHaveBeenCalledWith(FAKE_POS);
  });

  it('sets permissionState to granted on success', async () => {
    setupPermissionsApi('prompt');
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(result.current.permissionState).toBe('granted');
  });

  it('sets status to success and clears message on success', async () => {
    setupPermissionsApi('granted');
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(result.current.status).toBe('success');
    expect(result.current.message).toBeNull();
  });

  it('saves granted status to localStorage on success', async () => {
    setupPermissionsApi('granted');
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(getLocPrefs().lastPermissionStatus).toBe('granted');
  });

  it('sets permissionState to denied on PERMISSION_DENIED error', async () => {
    setupPermissionsApi('granted');
    mockGeoError(1);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(result.current.permissionState).toBe('denied');
  });

  it('calls onDenied callback on PERMISSION_DENIED error', async () => {
    setupPermissionsApi('granted');
    mockGeoError(1);
    const onDenied = vi.fn();
    const { result } = renderHook(() => useDispatchLocation({ onDenied }));
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(onDenied).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onDenied for POSITION_UNAVAILABLE error', async () => {
    setupPermissionsApi('granted');
    mockGeoError(2);
    const onDenied = vi.fn();
    const { result } = renderHook(() => useDispatchLocation({ onDenied }));
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(onDenied).not.toHaveBeenCalled();
  });

  it('sets error message on POSITION_UNAVAILABLE', async () => {
    setupPermissionsApi('granted');
    mockGeoError(2);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(result.current.message).toMatch(/could not determine/i);
  });

  it('sets error message on TIMEOUT', async () => {
    setupPermissionsApi('granted');
    mockGeoError(3);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(result.current.message).toMatch(/timed out/i);
  });

  it('re-enables after failure (status goes back to error, not stuck checking)', async () => {
    setupPermissionsApi('granted');
    mockGeoError(2);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.centerOnMe(); });
    expect(result.current.status).toBe('error');
  });

  it('sets unsupported state when geolocation is absent', async () => {
    setupPermissionsApi('granted');
    setGeolocationSupport(false);
    const { result } = renderHook(() => useDispatchLocation());

    act(() => { result.current.centerOnMe(); });
    expect(result.current.permissionState).toBe('unsupported');
    expect(result.current.status).toBe('error');
  });
});

// ── tryAgain ──────────────────────────────────────────────────────────────────
// tryAgain calls getCurrentPosition directly — no async permission pre-check
// that could lose user activation or bail out because a Permissions-Policy
// header caused the Permissions API to return 'denied' while the browser
// site permission is actually Allow. The actual browser/OS result is authoritative.

describe('useDispatchLocation — tryAgain', () => {
  it('calls getCurrentPosition immediately, even when Permissions API shows denied', async () => {
    setupPermissionsApi('denied');
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('denied');

    await act(async () => { result.current.tryAgain(); });
    // Must have called getCurrentPosition — never bail out due to Permissions API state
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled();
  });

  it('sets status to checking immediately on click', async () => {
    setupPermissionsApi('denied');
    navigator.geolocation.getCurrentPosition = vi.fn(); // never resolves
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    act(() => { result.current.tryAgain(); });
    expect(result.current.status).toBe('checking');
  });

  it('calls onLocated when getCurrentPosition succeeds (stale denied state clears)', async () => {
    setupPermissionsApi('denied');
    const onLocated = vi.fn();
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation({ onLocated }));
    await act(async () => {});

    await act(async () => { result.current.tryAgain(); });
    expect(onLocated).toHaveBeenCalledWith(FAKE_POS);
  });

  it('clears stale denied permissionState when getCurrentPosition succeeds', async () => {
    setupPermissionsApi('denied');
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('denied');

    await act(async () => { result.current.tryAgain(); });
    expect(result.current.permissionState).toBe('granted');
  });

  it('calls onDenied when getCurrentPosition returns PERMISSION_DENIED', async () => {
    setupPermissionsApi('denied');
    mockGeoError(1);
    const onDenied = vi.fn();
    const { result } = renderHook(() => useDispatchLocation({ onDenied }));
    await act(async () => {});

    await act(async () => { result.current.tryAgain(); });
    expect(onDenied).toHaveBeenCalledTimes(1);
  });

  it('calls getCurrentPosition when permission is prompt (browser will prompt)', async () => {
    setupPermissionsApi('prompt');
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    await act(async () => { result.current.tryAgain(); });
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled();
  });

  it('does not pre-query the Permissions API before calling getCurrentPosition', async () => {
    const querySpy = setupPermissionsApi('denied').constructor;
    const queryFn = navigator.permissions.query;
    mockGeoSuccess(FAKE_POS);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    const callsBeforeClick = queryFn.mock?.calls?.length ?? 0;

    await act(async () => { result.current.tryAgain(); });
    // No additional Permissions API calls from tryAgain itself
    expect(navigator.permissions.query.mock.calls.length).toBe(callsBeforeClick);
    void querySpy; // suppress unused
  });
});

// ── Focus / visibility refresh ────────────────────────────────────────────────

describe('useDispatchLocation — focus / visibility refresh', () => {
  it('calls refreshPermission on window focus', async () => {
    const status = setupPermissionsApi('denied');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    expect(result.current.permissionState).toBe('denied');

    // Simulate user granting in browser settings then returning to tab
    status.state = 'granted';
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current.permissionState).toBe('granted'));
  });

  it('calls refreshPermission on visibilitychange to visible', async () => {
    const status = setupPermissionsApi('denied');
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    status.state = 'granted';
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(result.current.permissionState).toBe('granted'));
  });

  it('does not refresh on visibilitychange when hidden', async () => {
    const mockStatus = { state: 'denied', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const querySpy = vi.fn().mockResolvedValue(mockStatus);
    Object.defineProperty(navigator, 'permissions', {
      value: { query: querySpy },
      configurable: true, writable: true,
    });
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    const callCount = querySpy.mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(querySpy.mock.calls.length).toBe(callCount); // no extra calls
    void result; // suppress lint
  });

  it('clears message and resets status to idle on focus when granted', async () => {
    const status = setupPermissionsApi('denied');
    mockGeoError(1);
    const { result } = renderHook(() => useDispatchLocation());
    await act(async () => {});
    await act(async () => { result.current.centerOnMe(); });
    expect(result.current.message).not.toBeNull();

    status.state = 'granted';
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => {
      expect(result.current.message).toBeNull();
      expect(result.current.status).toBe('idle');
    });
  });

  it('removes focus and visibilitychange listeners on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const removeDocSpy = vi.spyOn(document, 'removeEventListener');
    setupPermissionsApi('granted');
    const { unmount } = renderHook(() => useDispatchLocation());
    await act(async () => {});

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeDocSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

// ── Callback ref stability ────────────────────────────────────────────────────

describe('useDispatchLocation — callback ref stability', () => {
  it('uses the latest onLocated without recreating centerOnMe', async () => {
    setupPermissionsApi('granted');
    const onLocatedV1 = vi.fn();
    const onLocatedV2 = vi.fn();
    mockGeoSuccess(FAKE_POS);

    const { result, rerender } = renderHook(
      ({ onLocated }) => useDispatchLocation({ onLocated }),
      { initialProps: { onLocated: onLocatedV1 } }
    );
    await act(async () => {});

    const centerOnMeBeforeRerender = result.current.centerOnMe;
    rerender({ onLocated: onLocatedV2 });
    const centerOnMeAfterRerender = result.current.centerOnMe;

    // Stable function reference
    expect(centerOnMeAfterRerender).toBe(centerOnMeBeforeRerender);

    // But calls the updated callback
    await act(async () => { result.current.centerOnMe(); });
    expect(onLocatedV1).not.toHaveBeenCalled();
    expect(onLocatedV2).toHaveBeenCalledWith(FAKE_POS);
  });
});

// ── localStorage helpers ──────────────────────────────────────────────────────

describe('getLocPrefs / saveLocPrefs', () => {
  it('returns empty object when nothing saved', () => {
    expect(getLocPrefs()).toEqual({});
  });

  it('saves and retrieves preferences', () => {
    saveLocPrefs({ lastPermissionStatus: 'granted' });
    expect(getLocPrefs().lastPermissionStatus).toBe('granted');
  });

  it('merges updates without overwriting existing keys', () => {
    saveLocPrefs({ lastPermissionStatus: 'denied' });
    saveLocPrefs({ lastPermissionCheckedAt: '2026-01-01' });
    const prefs = getLocPrefs();
    expect(prefs.lastPermissionStatus).toBe('denied');
    expect(prefs.lastPermissionCheckedAt).toBe('2026-01-01');
  });

  it('does not store precise coordinates', () => {
    saveLocPrefs({ lastPermissionStatus: 'granted' });
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
    expect(saved.lat).toBeUndefined();
    expect(saved.lng).toBeUndefined();
    expect(saved.latitude).toBeUndefined();
    expect(saved.longitude).toBeUndefined();
  });
});
