import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Module mocks ──────────────────────────────────────────────────────────────

let mockStatus = 'NOT_LOADED';

// Capture the onIdle callback so tests can fire it manually to simulate map ready.
let capturedOnIdle = null;

vi.mock('@vis.gl/react-google-maps', () => ({
  Map: ({ children, style, className, onIdle }) => {
    capturedOnIdle = onIdle ?? null;
    return (
      <div data-testid="google-map-rendered" style={style} className={className}>
        {children}
      </div>
    );
  },
  useMap:              () => null,
  useApiLoadingStatus: () => mockStatus,
  __resetModuleState:  vi.fn(),
}));

let mockConfigured = true;
const FULL_KEY = 'AIzaSyTestKeyFullValue1234567890';

vi.mock('../mapsConfig', () => ({
  getGoogleMapsClientConfig: () => ({
    apiKey:        mockConfigured ? FULL_KEY : '',
    mapId:         null,
    libraries:     [],
    configured:    mockConfigured,
    failureReason: mockConfigured ? null : 'MAP_CONFIG_MISSING_API_KEY',
  }),
  maskedKey: (k) => (k ? k.slice(0, 6) + '…' + k.slice(-4) : '(none)'),
}));

const mockRetry = vi.fn();
vi.mock('../MapProvider', () => ({
  useMapRetry: () => mockRetry,
}));

vi.mock('../mapStyles', () => ({
  FIELDCORE_MAP_STYLES: [],
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function importGoogleMap() {
  const mod = await import('../GoogleMap');
  return mod.GoogleMap;
}

async function renderMap(props = {}) {
  const GoogleMap = await importGoogleMap();
  let result;
  await act(async () => {
    result = render(<GoogleMap center={{ lat: 0, lng: 0 }} zoom={4} {...props} />);
  });
  return result;
}

async function fireIdle() {
  await act(async () => {
    if (capturedOnIdle) capturedOnIdle();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GoogleMap', () => {
  beforeEach(() => {
    mockConfigured = true;
    mockStatus     = 'NOT_LOADED';
    capturedOnIdle = null;
    mockRetry.mockClear();
    vi.resetModules();
  });

  // 1. Loading placeholder when NOT_LOADED ─────────────────────────────────────
  it('renders loading placeholder when Maps is not yet loaded', async () => {
    mockStatus = 'NOT_LOADED';
    await renderMap();
    expect(screen.queryByTestId('google-map-rendered')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Map loading')).toBeInTheDocument();
  });

  // 2. Loading placeholder when LOADING ────────────────────────────────────────
  it('renders loading placeholder while Maps is loading', async () => {
    mockStatus = 'LOADING';
    await renderMap();
    expect(screen.getByLabelText('Map loading')).toBeInTheDocument();
    expect(screen.queryByTestId('google-map-rendered')).not.toBeInTheDocument();
  });

  // 3. Renders <Map> when status LOADED (onIdle not yet fired) ─────────────────
  it('renders <Map> when loader status is LOADED', async () => {
    mockStatus = 'LOADED';
    await renderMap();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
  });

  // 4. LOAD_ERROR when status FAILED ───────────────────────────────────────────
  it('renders error fallback when loader status is FAILED', async () => {
    mockStatus = 'FAILED';
    await renderMap();
    await waitFor(() => {
      expect(screen.getByText('Map unavailable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // 5. AUTH_ERROR on fieldcore:maps:auth-failure event (before onIdle) ──────────
  it('shows error fallback on fieldcore:maps:auth-failure event before map is ready', async () => {
    mockStatus = 'LOADED';
    await renderMap();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();

    // onIdle has NOT fired (capturedOnIdle exists but we don't call it),
    // so lifecycle is still LOADING → auth-failure can transition to AUTH_ERROR
    await act(async () => {
      window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
        detail: { code: 'auth-failure' },
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Map unavailable')).toBeInTheDocument();
    });
  });

  // 6. READY is sticky: auth-failure after onIdle does NOT hide the map ─────────
  it('keeps map visible when auth-failure fires after onIdle (READY is sticky)', async () => {
    mockStatus = 'LOADED';
    await renderMap();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();

    // Transition to READY
    await fireIdle();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();

    // Stale auth-failure event must not regress the lifecycle
    await act(async () => {
      window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure', {
        detail: { code: 'auth-failure' },
      }));
    });

    // Map should still be visible — READY is sticky
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
    expect(screen.queryByText('Map unavailable')).not.toBeInTheDocument();
  });

  // 7. READY is sticky: status FAILED after onIdle does NOT show LOAD_ERROR ─────
  it('keeps map visible when status becomes FAILED after onIdle (READY is sticky)', async () => {
    mockStatus = 'LOADED';
    const GoogleMap = await importGoogleMap();
    let rerender;
    await act(async () => {
      ({ rerender } = render(<GoogleMap center={{ lat: 0, lng: 0 }} />));
    });

    await fireIdle();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();

    // Simulate a late FAILED signal
    mockStatus = 'FAILED';
    await act(async () => {
      rerender(<GoogleMap center={{ lat: 0, lng: 0 }} />);
    });

    // Map should still be visible — READY is sticky
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
    expect(screen.queryByText('Map unavailable')).not.toBeInTheDocument();
  });

  // 8. onIdle → lifecycle READY ─────────────────────────────────────────────────
  it('transitions to READY when onIdle fires and map remains rendered', async () => {
    mockStatus = 'LOADED';
    await renderMap();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();

    await fireIdle();

    // Map stays rendered after onIdle
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
    expect(screen.queryByLabelText('Map loading')).not.toBeInTheDocument();
    expect(screen.queryByText('Map unavailable')).not.toBeInTheDocument();
  });

  // 9. Retry button calls useMapRetry() ─────────────────────────────────────────
  it('Retry button calls the retry function from MapRetryContext', async () => {
    mockStatus = 'FAILED';
    await renderMap();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  // 10. fieldcore:maps:retry resets AUTH_ERROR → LOADING ────────────────────────
  it('clears AUTH_ERROR and returns to loading when fieldcore:maps:retry fires', async () => {
    mockStatus = 'LOADED';
    await renderMap();

    // Trigger AUTH_ERROR (onIdle has not fired)
    await act(async () => {
      window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure'));
    });
    await waitFor(() => {
      expect(screen.getByText('Map unavailable')).toBeInTheDocument();
    });

    // Now retry — resets lifecycle to LOADING; status still LOADED → Map renders
    await act(async () => {
      window.dispatchEvent(new CustomEvent('fieldcore:maps:retry'));
    });

    await waitFor(() => {
      expect(screen.queryByText('Map unavailable')).not.toBeInTheDocument();
    });
  });

  // 11. fieldcore:maps:retry resets LOAD_ERROR → LOADING ────────────────────────
  it('clears LOAD_ERROR and returns to loading when fieldcore:maps:retry fires', async () => {
    mockStatus = 'FAILED';
    await renderMap();
    await waitFor(() => {
      expect(screen.getByText('Map unavailable')).toBeInTheDocument();
    });

    mockStatus = 'NOT_LOADED'; // simulates new load attempt
    await act(async () => {
      window.dispatchEvent(new CustomEvent('fieldcore:maps:retry'));
    });

    await waitFor(() => {
      expect(screen.queryByText('Map unavailable')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Map loading')).toBeInTheDocument();
    });
  });

  // 12. MapConfigMissing when key is absent ─────────────────────────────────────
  it('renders MapConfigMissing when API key is not configured', async () => {
    mockConfigured = false;
    vi.resetModules();
    const GoogleMap = await importGoogleMap();
    await act(async () => {
      render(<GoogleMap center={{ lat: 0, lng: 0 }} />);
    });
    expect(screen.getByText('Map unavailable')).toBeInTheDocument();
    expect(screen.getByText(/VITE_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  // 13. Renders with zero jobs (no data prop dependency) ────────────────────────
  it('renders without requiring job data', async () => {
    mockStatus = 'LOADED';
    await renderMap();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
  });

  // 14. Renders with zero technicians (no data prop dependency) ─────────────────
  it('renders without requiring technician data', async () => {
    mockStatus = 'LOADED';
    await renderMap();
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
  });

  // 15. Renders without mapId (falls back to branded styles) ────────────────────
  it('renders without a mapId and uses branded styles as fallback', async () => {
    mockStatus = 'LOADED';
    await renderMap({ branded: true });
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
  });

  // 16. MapLayerErrorBoundary: layer crash does not kill base map ────────────────
  it('keeps base map visible when an optional layer throws', async () => {
    function BrokenLayer() { throw new Error('layer crash'); }

    mockStatus = 'LOADED';
    vi.resetModules();
    const GoogleMap = await importGoogleMap();

    // Suppress React's console.error for the caught error boundary throw
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      render(
        <GoogleMap center={{ lat: 0, lng: 0 }}>
          <BrokenLayer />
        </GoogleMap>
      );
    });
    errSpy.mockRestore();

    // Base map stays; layer content is silently dropped
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
  });

  // 17. userOnIdle prop is forwarded through handleIdle ─────────────────────────
  it('calls a userOnIdle prop after transitioning to READY', async () => {
    mockStatus = 'LOADED';
    const userOnIdle = vi.fn();
    await renderMap({ onIdle: userOnIdle });
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();

    await fireIdle();

    expect(userOnIdle).toHaveBeenCalledTimes(1);
    // Map still rendered after READY
    expect(screen.getByTestId('google-map-rendered')).toBeInTheDocument();
  });

  // 18. UNCONFIGURED shows no Retry button; error fallbacks do ──────────────────
  it('error fallback shows Retry but MapConfigMissing does not', async () => {
    // AUTH_ERROR path — has Retry
    mockStatus = 'LOADED';
    const { unmount } = await (async () => {
      const r = await renderMap();
      await act(async () => {
        window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure'));
      });
      return r;
    })();
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
    unmount();

    // UNCONFIGURED path — no Retry
    mockConfigured = false;
    vi.resetModules();
    const GoogleMap = await importGoogleMap();
    await act(async () => {
      render(<GoogleMap center={{ lat: 0, lng: 0 }} />);
    });
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  // 19. LOAD_ERROR shows Retry ───────────────────────────────────────────────────
  it('renders Retry button in LOAD_ERROR state', async () => {
    mockStatus = 'FAILED';
    await renderMap();
    await waitFor(() => {
      expect(screen.getByText('Map unavailable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // 20. Full API key never appears in console output ────────────────────────────
  it('never logs the full API key', async () => {
    const logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockStatus = 'LOADED';
    vi.resetModules();
    const GoogleMap = await importGoogleMap();
    await act(async () => {
      render(<GoogleMap center={{ lat: 0, lng: 0 }} />);
    });

    const allArgs = [
      ...logSpy.mock.calls.flat(Infinity).map(String),
      ...warnSpy.mock.calls.flat(Infinity).map(String),
      ...errSpy.mock.calls.flat(Infinity).map(String),
    ].join(' ');

    expect(allArgs).not.toContain(FULL_KEY);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });
});
