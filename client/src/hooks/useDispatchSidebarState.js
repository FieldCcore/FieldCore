import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'fieldcore:dispatch:sidebar-collapsed';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return null;
  } catch { return null; }
}

function writeStored(collapsed) {
  try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch {}
}

function getWindowWidth() {
  return typeof window !== 'undefined' ? window.innerWidth : 1280;
}

function classifyWidth(w) {
  if (w >= 1025) return 'desktop';
  if (w >= 769)  return 'tablet';
  return 'mobile';
}

export function useDispatchSidebarState() {
  const [windowWidth,  setWindowWidth]  = useState(getWindowWidth);
  const viewport = classifyWidth(windowWidth);
  const isDesktop = viewport === 'desktop';
  const isTablet  = viewport === 'tablet';
  const isMobile  = viewport === 'mobile';

  const [isCollapsed, setIsCollapsed] = useState(() => {
    const w = getWindowWidth();
    const bp = classifyWidth(w);
    if (bp === 'mobile') return true;
    if (bp === 'tablet') return true;
    const stored = readStored();
    return stored !== null ? stored : false;
  });

  // Fullscreen: track temporary collapse without overwriting preference
  const preFullscreenRef = useRef(null);

  useEffect(() => {
    function onResize() { setWindowWidth(window.innerWidth); }
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const persist = useCallback((collapsed) => {
    if (isDesktop) writeStored(collapsed);
  }, [isDesktop]);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      persist(next);
      return next;
    });
  }, [persist]);

  const collapseSidebar = useCallback(() => {
    setIsCollapsed(true);
    persist(true);
  }, [persist]);

  const expandSidebar = useCallback(() => {
    setIsCollapsed(false);
    persist(false);
  }, [persist]);

  const expandToTeam = useCallback(() => {
    setIsCollapsed(false);
    persist(false);
  }, [persist]);

  const expandToJobs = useCallback(() => {
    setIsCollapsed(false);
    persist(false);
  }, [persist]);

  const enterFullscreen = useCallback(() => {
    setIsCollapsed(prev => {
      if (preFullscreenRef.current === null) preFullscreenRef.current = prev;
      return true;
    });
  }, []);

  const exitFullscreen = useCallback(() => {
    const prior = preFullscreenRef.current;
    preFullscreenRef.current = null;
    if (prior !== null) setIsCollapsed(prior);
  }, []);

  // Mobile always acts as "expanded" panel (drawer mode, no rail)
  const effectiveCollapsed = isMobile ? false : isCollapsed;

  return {
    isCollapsed: effectiveCollapsed,
    isDesktop,
    isTablet,
    isMobile,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,
    expandToTeam,
    expandToJobs,
    enterFullscreen,
    exitFullscreen,
  };
}
