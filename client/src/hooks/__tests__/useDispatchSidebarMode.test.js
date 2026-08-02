import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDispatchSidebarMode } from '../useDispatchSidebarMode';

const STORAGE_KEY = 'fieldcore:dispatch:sidebar-mode';
const PRIOR_KEY   = 'fieldcore:dispatch:pre-full-map-mode';

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
  localStorage.clear();
  setViewport(1440); // default: desktop
});

afterEach(() => {
  localStorage.clear();
  setViewport(1440);
  vi.restoreAllMocks();
});

// ── Default state ─────────────────────────────────────────────────────────────

describe('useDispatchSidebarMode — defaults', () => {
  it('new desktop user defaults to expanded', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('expanded');
  });

  it('respects stored compact preference on desktop', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('compact');
  });

  it('respects stored expanded preference on desktop', () => {
    localStorage.setItem(STORAGE_KEY, 'expanded');
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('expanded');
  });

  it('ignores invalid storage values and defaults to expanded on desktop', () => {
    localStorage.setItem(STORAGE_KEY, 'full_map');
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('expanded');
  });

  it('defaults to compact on tablet', () => {
    setViewport(900);
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('compact');
  });

  it('mobile: mode is always expanded regardless of stored value', () => {
    setViewport(375);
    localStorage.setItem(STORAGE_KEY, 'compact');
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('expanded');
  });
});

// ── toggleExpandedCompact ─────────────────────────────────────────────────────

describe('useDispatchSidebarMode — toggleExpandedCompact', () => {
  it('flips expanded → compact', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('expanded');
    act(() => { result.current.toggleExpandedCompact(); });
    expect(result.current.mode).toBe('compact');
  });

  it('flips compact → expanded', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.toggleExpandedCompact(); });
    expect(result.current.mode).toBe('expanded');
  });

  it('persists mode to localStorage', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.toggleExpandedCompact(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('compact');
    act(() => { result.current.toggleExpandedCompact(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('expanded');
  });

  it('never enters full_map mode via toggle', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.toggleExpandedCompact(); });
    act(() => { result.current.toggleExpandedCompact(); });
    act(() => { result.current.toggleExpandedCompact(); });
    expect(result.current.mode).not.toBe('full_map');
  });
});

// ── enterFullMap / exitFullMap ────────────────────────────────────────────────

describe('useDispatchSidebarMode — enterFullMap / exitFullMap', () => {
  it('enterFullMap sets mode to full_map', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.enterFullMap(); });
    expect(result.current.mode).toBe('full_map');
  });

  it('exitFullMap restores prior expanded mode', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.enterFullMap(); });
    act(() => { result.current.exitFullMap(); });
    expect(result.current.mode).toBe('expanded');
  });

  it('exitFullMap restores prior compact mode', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.enterFullMap(); });
    act(() => { result.current.exitFullMap(); });
    expect(result.current.mode).toBe('compact');
  });

  it('enterFullMap saves prior mode to localStorage under PRIOR_KEY', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.enterFullMap(); });
    expect(localStorage.getItem(PRIOR_KEY)).toBe('expanded');
  });

  it('exitFullMap cleans up PRIOR_KEY from localStorage', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.enterFullMap(); });
    act(() => { result.current.exitFullMap(); });
    expect(localStorage.getItem(PRIOR_KEY)).toBeNull();
  });

  it('enterFullMap does not persist full_map to STORAGE_KEY', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.enterFullMap(); });
    expect(localStorage.getItem(STORAGE_KEY)).not.toBe('full_map');
  });
});

// ── openTeam / openJobs ───────────────────────────────────────────────────────

describe('useDispatchSidebarMode — openTeam / openJobs', () => {
  it('openTeam expands from compact', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.mode).toBe('compact');
    act(() => { result.current.openTeam(); });
    expect(result.current.mode).toBe('expanded');
  });

  it('openJobs expands from compact', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.openJobs(); });
    expect(result.current.mode).toBe('expanded');
  });

  it('openTeam from full_map expands', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.enterFullMap(); });
    act(() => { result.current.openTeam(); });
    expect(result.current.mode).toBe('expanded');
  });

  it('openTeam is a no-op if already expanded', () => {
    const { result } = renderHook(() => useDispatchSidebarMode());
    act(() => { result.current.openTeam(); });
    expect(result.current.mode).toBe('expanded');
  });
});

// ── Responsive flags ──────────────────────────────────────────────────────────

describe('useDispatchSidebarMode — responsive flags', () => {
  it('isDesktop true at 1440px', () => {
    setViewport(1440);
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isMobile).toBe(false);
  });

  it('isTablet true at 900px', () => {
    setViewport(900);
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isMobile).toBe(false);
  });

  it('isMobile true at 375px', () => {
    setViewport(375);
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isMobile).toBe(true);
  });
});

// ── Storage failure safety ─────────────────────────────────────────────────────

describe('useDispatchSidebarMode — storage safety', () => {
  it('does not crash when localStorage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('no storage'); });
    expect(() => renderHook(() => useDispatchSidebarMode())).not.toThrow();
  });

  it('does not crash when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => useDispatchSidebarMode());
    expect(() => act(() => { result.current.toggleExpandedCompact(); })).not.toThrow();
  });
});
