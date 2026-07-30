import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── Module mocks (hoisted — must be top-level vi.mock calls) ─────────────────

const mockResetModuleState = vi.fn();
let mockStatus = 'NOT_LOADED';
let mockIsLoaded = false;

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children, apiKey, libraries }) => (
    <div
      data-testid="api-provider"
      data-key-length={String(apiKey?.length ?? 0)}
      data-libraries={JSON.stringify(libraries ?? [])}
    >
      {children}
    </div>
  ),
  useApiIsLoaded:      () => mockIsLoaded,
  useApiLoadingStatus: () => mockStatus,
  __resetModuleState:  mockResetModuleState,
}));

let mockConfigured   = true;
let mockApiKey       = 'AIzaSyTestKey12345678';
let mockFailureReason = null;

vi.mock('../mapsConfig', () => ({
  getGoogleMapsClientConfig: () => ({
    apiKey:        mockConfigured ? mockApiKey : '',
    mapId:         null,
    libraries:     [],
    configured:    mockConfigured,
    failureReason: mockFailureReason,
  }),
  maskedKey: (k) => (k ? k.slice(0, 6) + '…' + k.slice(-4) : '(none)'),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MapProvider', () => {
  beforeEach(() => {
    mockConfigured    = true;
    mockApiKey        = 'AIzaSyTestKey12345678';
    mockFailureReason = null;
    mockStatus        = 'NOT_LOADED';
    mockIsLoaded      = false;
    mockResetModuleState.mockClear();
  });

  // 1. Provider renders with key ────────────────────────────────────────────────
  it('renders APIProvider when key is configured', async () => {
    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(<MapProvider><span>child</span></MapProvider>);
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  // 2. Renders with zero jobs ───────────────────────────────────────────────────
  it('renders APIProvider with no job data (no job prop dependency)', async () => {
    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(<MapProvider><span data-testid="no-jobs">no jobs</span></MapProvider>);
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();
    expect(screen.getByTestId('no-jobs')).toBeInTheDocument();
  });

  // 3. Renders with zero technicians ───────────────────────────────────────────
  it('renders APIProvider with no technician data (no tech prop dependency)', async () => {
    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(<MapProvider><span data-testid="no-techs">no techs</span></MapProvider>);
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();
    expect(screen.getByTestId('no-techs')).toBeInTheDocument();
  });

  // 4. Renders without mapId ───────────────────────────────────────────────────
  it('renders APIProvider even when mapId is null', async () => {
    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(<MapProvider><span>no map id</span></MapProvider>);
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();
  });

  // 5. Skips APIProvider when key is absent ────────────────────────────────────
  it('skips APIProvider and renders children when key is absent', async () => {
    mockConfigured    = false;
    mockFailureReason = 'MAP_CONFIG_MISSING_API_KEY';
    vi.resetModules();

    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(<MapProvider><span data-testid="child">child</span></MapProvider>);
    });
    expect(screen.queryByTestId('api-provider')).not.toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  // 6. Stale missing-key state does not persist after fresh module import ───────
  it('renders APIProvider when config is configured in a fresh module load', async () => {
    // Simulate missing key first
    mockConfigured    = false;
    mockFailureReason = 'MAP_CONFIG_MISSING_API_KEY';
    vi.resetModules();

    const { MapProvider: MP1 } = await import('../MapProvider');
    const { unmount } = await (() => {
      let result;
      act(() => { result = render(<MP1><span>c</span></MP1>); });
      return Promise.resolve(result);
    })();
    await act(async () => {});
    expect(screen.queryByTestId('api-provider')).not.toBeInTheDocument();
    unmount();

    // Now key is present — new module load
    mockConfigured    = true;
    mockFailureReason = null;
    vi.resetModules();

    const { MapProvider: MP2 } = await import('../MapProvider');
    await act(async () => {
      render(<MP2><span>c</span></MP2>);
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();
  });

  // 7. React Strict Mode double mount ──────────────────────────────────────────
  it('renders correctly under React.StrictMode', async () => {
    vi.resetModules();
    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(
        <React.StrictMode>
          <MapProvider>
            <span data-testid="strict-child">strict</span>
          </MapProvider>
        </React.StrictMode>
      );
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();
    expect(screen.getByTestId('strict-child')).toBeInTheDocument();
  });

  // 8. Route away and back: unmount + remount ──────────────────────────────────
  it('re-renders APIProvider after MapProvider unmount and remount', async () => {
    vi.resetModules();
    const { MapProvider } = await import('../MapProvider');

    let unmount;
    await act(async () => {
      ({ unmount } = render(<MapProvider><span>child</span></MapProvider>));
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();

    act(() => unmount());
    expect(screen.queryByTestId('api-provider')).not.toBeInTheDocument();

    await act(async () => {
      render(<MapProvider><span>child</span></MapProvider>);
    });
    expect(screen.getByTestId('api-provider')).toBeInTheDocument();
  });

  // 9. Retry resets module state ────────────────────────────────────────────────
  it('retry calls __resetModuleState', async () => {
    vi.resetModules();
    const { MapProvider, useMapRetry } = await import('../MapProvider');

    let retryFn;
    function Capturer() { retryFn = useMapRetry(); return null; }

    await act(async () => {
      render(<MapProvider><Capturer /></MapProvider>);
    });

    expect(screen.getByTestId('api-provider')).toBeInTheDocument();

    await act(async () => { retryFn(); });

    expect(mockResetModuleState).toHaveBeenCalledTimes(1);
  });

  // 10. Retry dispatches fieldcore:maps:retry event ────────────────────────────
  it('retry dispatches fieldcore:maps:retry event', async () => {
    vi.resetModules();
    const { MapProvider, useMapRetry } = await import('../MapProvider');

    let retryFn;
    function Capturer() { retryFn = useMapRetry(); return null; }

    await act(async () => {
      render(<MapProvider><Capturer /></MapProvider>);
    });

    const listener = vi.fn();
    window.addEventListener('fieldcore:maps:retry', listener);

    await act(async () => { retryFn(); });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('fieldcore:maps:retry', listener);
  });

  // 11. Stable empty libraries array is passed to APIProvider ──────────────────
  it('passes a stable empty libraries array to APIProvider', async () => {
    vi.resetModules();
    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(<MapProvider><span>child</span></MapProvider>);
    });
    const provider = screen.getByTestId('api-provider');
    const libs = JSON.parse(provider.getAttribute('data-libraries') || '[]');
    expect(libs).toEqual([]);
  });

  // 12. Full API key never appears in any console output ───────────────────────
  it('never logs the full API key', async () => {
    vi.resetModules();
    const logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { MapProvider } = await import('../MapProvider');
    await act(async () => {
      render(<MapProvider><span>child</span></MapProvider>);
    });

    const allArgs = [
      ...logSpy.mock.calls.flat(Infinity).map(String),
      ...warnSpy.mock.calls.flat(Infinity).map(String),
      ...errSpy.mock.calls.flat(Infinity).map(String),
    ].join(' ');

    expect(allArgs).not.toContain(mockApiKey);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });
});
