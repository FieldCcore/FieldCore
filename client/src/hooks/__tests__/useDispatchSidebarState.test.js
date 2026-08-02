import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDispatchSidebarState } from '../useDispatchSidebarState';

const STORAGE_KEY = 'fieldcore:dispatch:sidebar-collapsed';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
});

// ── Default state ─────────────────────────────────────────────────────────────

describe('useDispatchSidebarState — defaults', () => {
  it('new desktop user defaults to expanded', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(false);
  });

  it('respects stored collapsed preference on desktop', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(true);
  });

  it('respects stored expanded preference on desktop', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(false);
  });

  it('ignores malformed storage values and defaults expanded', () => {
    localStorage.setItem(STORAGE_KEY, 'banana');
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(false);
  });

  it('defaults collapsed on tablet', () => {
    setViewport(900);
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(true);
  });

  it('mobile: isCollapsed is false regardless of stored value (drawer mode)', () => {
    setViewport(375);
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(false);
  });
});

// ── Toggle ────────────────────────────────────────────────────────────────────

describe('useDispatchSidebarState — toggle', () => {
  it('toggleSidebar flips collapsed state', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(false);
    act(() => { result.current.toggleSidebar(); });
    expect(result.current.isCollapsed).toBe(true);
    act(() => { result.current.toggleSidebar(); });
    expect(result.current.isCollapsed).toBe(false);
  });

  it('persists collapsed state to localStorage on desktop', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    act(() => { result.current.toggleSidebar(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    act(() => { result.current.toggleSidebar(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('expandSidebar sets isCollapsed to false and persists', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useDispatchSidebarState());
    act(() => { result.current.expandSidebar(); });
    expect(result.current.isCollapsed).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('collapseSidebar sets isCollapsed to true and persists', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    act(() => { result.current.collapseSidebar(); });
    expect(result.current.isCollapsed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});

// ── expandToTeam / expandToJobs ───────────────────────────────────────────────

describe('useDispatchSidebarState — rail expansion', () => {
  it('expandToTeam expands the sidebar', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    act(() => { result.current.collapseSidebar(); });
    expect(result.current.isCollapsed).toBe(true);
    act(() => { result.current.expandToTeam(); });
    expect(result.current.isCollapsed).toBe(false);
  });

  it('expandToJobs expands the sidebar', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    act(() => { result.current.collapseSidebar(); });
    act(() => { result.current.expandToJobs(); });
    expect(result.current.isCollapsed).toBe(false);
  });
});

// ── Fullscreen ────────────────────────────────────────────────────────────────

describe('useDispatchSidebarState — fullscreen', () => {
  it('enterFullscreen collapses the sidebar temporarily', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(false);
    act(() => { result.current.enterFullscreen(); });
    expect(result.current.isCollapsed).toBe(true);
  });

  it('exitFullscreen restores prior expanded state', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    // Start expanded
    act(() => { result.current.enterFullscreen(); });
    act(() => { result.current.exitFullscreen(); });
    expect(result.current.isCollapsed).toBe(false);
  });

  it('exitFullscreen restores prior collapsed state', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isCollapsed).toBe(true);
    act(() => { result.current.enterFullscreen(); });
    act(() => { result.current.exitFullscreen(); });
    expect(result.current.isCollapsed).toBe(true);
  });

  it('fullscreen collapse does not overwrite localStorage preference', () => {
    const { result } = renderHook(() => useDispatchSidebarState());
    // Expanded preference stored
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null);
    act(() => { result.current.enterFullscreen(); });
    // Should still be null (not overwritten) or whatever was there before
    expect(localStorage.getItem(STORAGE_KEY)).not.toBe('true');
  });
});

// ── Responsive ────────────────────────────────────────────────────────────────

describe('useDispatchSidebarState — responsive flags', () => {
  it('isDesktop true at 1440px', () => {
    setViewport(1440);
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isMobile).toBe(false);
  });

  it('isTablet true at 900px', () => {
    setViewport(900);
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isMobile).toBe(false);
  });

  it('isMobile true at 375px', () => {
    setViewport(375);
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isMobile).toBe(true);
  });
});

// ── Storage failure safety ─────────────────────────────────────────────────────

describe('useDispatchSidebarState — storage safety', () => {
  it('does not crash when localStorage throws', () => {
    const originalGetItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('no storage'); });
    expect(() => renderHook(() => useDispatchSidebarState())).not.toThrow();
    vi.restoreAllMocks();
  });

  it('does not crash when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => useDispatchSidebarState());
    expect(() => act(() => { result.current.toggleSidebar(); })).not.toThrow();
    vi.restoreAllMocks();
  });
});
