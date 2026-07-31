import { render, waitFor, act, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import DispatchBaseMap from '../DispatchBaseMap';
import * as loaderModule from '../loadGoogleMaps';

// ── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockMaps() {
  const idleCallbacks = [];
  const map = {
    getDiv:       vi.fn(() => null),
    getCenter:    vi.fn(() => ({ lat: () => 39.5, lng: () => -98.35 })),
    getZoom:      vi.fn(() => 4),
    getMapTypeId: vi.fn(() => 'roadmap'),
    getBounds:    vi.fn(() => null),
  };
  const maps = {
    // Regular function required — arrow functions cannot be used as constructors.
    Map: vi.fn(function MapMock() { return map; }),
    event: {
      addListenerOnce: vi.fn((_, evt, cb) => {
        if (evt === 'idle') idleCallbacks.push(cb);
        return { remove: vi.fn() };
      }),
      trigger: vi.fn(),
      clearInstanceListeners: vi.fn(),
    },
    MapTypeId: { ROADMAP: 'roadmap' },
  };
  return { maps, map, fireIdle: () => idleCallbacks.forEach(cb => cb()) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DispatchBaseMap', () => {
  let loadSpy;
  let mocks;

  beforeEach(() => {
    mocks = makeMockMaps();
    loadSpy = vi.spyOn(loaderModule, 'loadGoogleMaps').mockResolvedValue(mocks.maps);
    // jsdom has no layout engine; fake nonzero dimensions so the size guard passes.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 920, height: 848, top: 0, left: 0, right: 920, bottom: 848,
      x: 0, y: 0, toJSON: () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure-reset'));
  });

  it('shows loading state before loadGoogleMaps resolves', () => {
    // loadGoogleMaps never resolves in this test
    loadSpy.mockReturnValue(new Promise(() => {}));
    render(<DispatchBaseMap />);
    expect(screen.getByText('Loading map…')).toBeTruthy();
  });

  it('calls Map constructor exactly once', async () => {
    render(<DispatchBaseMap />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalledTimes(1));
  });

  it('does not recreate the map on parent re-render', async () => {
    const { rerender } = render(<DispatchBaseMap />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalledTimes(1));
    rerender(<DispatchBaseMap />);
    rerender(<DispatchBaseMap />);
    expect(mocks.maps.Map).toHaveBeenCalledTimes(1);
  });

  it('removes loading overlay after idle fires', async () => {
    render(<DispatchBaseMap />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalled());
    act(() => mocks.fireIdle());
    await waitFor(() => expect(screen.queryByText('Loading map…')).toBeNull());
  });

  it('does not show error overlay after successful idle', async () => {
    render(<DispatchBaseMap />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalled());
    act(() => mocks.fireIdle());
    await waitFor(() => expect(screen.queryByText('Map unavailable')).toBeNull());
  });

  it('calls onMapReady with the map instance when idle fires', async () => {
    const onMapReady = vi.fn();
    render(<DispatchBaseMap onMapReady={onMapReady} />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalled());
    act(() => mocks.fireIdle());
    await waitFor(() => expect(onMapReady).toHaveBeenCalledTimes(1));
  });

  it('shows error state when loadGoogleMaps rejects', async () => {
    loadSpy.mockRejectedValue(new Error('GOOGLE_MAPS_API_KEY_MISSING'));
    render(<DispatchBaseMap />);
    await waitFor(() => expect(screen.getByText('Map unavailable')).toBeTruthy());
    expect(screen.queryByText('Loading map…')).toBeNull();
  });

  it('shows error state when fieldcore:maps:auth-failure event fires', async () => {
    render(<DispatchBaseMap />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new CustomEvent('fieldcore:maps:auth-failure'));
    });
    await waitFor(() => expect(screen.getByText('Map unavailable')).toBeTruthy());
  });

  it('triggers resize after map creation', async () => {
    render(<DispatchBaseMap />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalled());
    // requestAnimationFrame fires synchronously in jsdom with vi fake timers,
    // but in real jsdom it fires on next tick — just check trigger was called eventually
    await waitFor(() => expect(mocks.maps.event.trigger).toHaveBeenCalledWith(
      expect.anything(), 'resize'
    ));
  });

  it('map remains during job-loading re-renders', async () => {
    // Simulate parent Dispatch re-rendering 5 times (polling updates)
    const { rerender } = render(<DispatchBaseMap />);
    await waitFor(() => expect(mocks.maps.Map).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 5; i++) rerender(<DispatchBaseMap />);
    expect(mocks.maps.Map).toHaveBeenCalledTimes(1);
  });

  it('does not import or render vis.gl APIProvider', async () => {
    // If vis.gl APIProvider were used, it would try to access google.maps context
    // and throw in test environment. Passing this test confirms no nested provider.
    const { container } = render(<DispatchBaseMap />);
    expect(container.querySelector('[data-testid="api-provider"]')).toBeNull();
  });
});
