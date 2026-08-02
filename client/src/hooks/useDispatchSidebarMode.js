import { useState, useEffect, useCallback, useRef } from 'react';

// Three sidebar states: expanded (280px) | compact (96px) | full_map (0px).
// Only "expanded" and "compact" are persisted — full_map is a transient session state.

const STORAGE_KEY  = 'fieldcore:dispatch:sidebar-mode';
const PRIOR_KEY    = 'fieldcore:dispatch:pre-full-map-mode';
const VALID_MODES  = new Set(['expanded', 'compact']);

function readMode(key) {
  try {
    const v = localStorage.getItem(key);
    return VALID_MODES.has(v) ? v : null;
  } catch { return null; }
}

function writeMode(key, mode) {
  try { localStorage.setItem(key, mode); } catch {}
}

function removeKey(key) {
  try { localStorage.removeItem(key); } catch {}
}

function getWindowWidth() {
  return typeof window !== 'undefined' ? window.innerWidth : 1280;
}

function classifyViewport(w) {
  if (w >= 1025) return 'desktop';
  if (w >= 769)  return 'tablet';
  return 'mobile';
}

export function useDispatchSidebarMode() {
  const [windowWidth, setWindowWidth] = useState(getWindowWidth);
  const viewport  = classifyViewport(windowWidth);
  const isDesktop = viewport === 'desktop';
  const isTablet  = viewport === 'tablet';
  const isMobile  = viewport === 'mobile';

  const [mode, setModeRaw] = useState(() => {
    const w  = getWindowWidth();
    const vp = classifyViewport(w);
    if (vp === 'mobile') return 'expanded'; // mobile uses drawer
    const stored = readMode(STORAGE_KEY);
    if (stored) return stored;
    return vp === 'desktop' ? 'expanded' : 'compact';
  });

  // Store prior mode before entering full_map so we can restore it
  const priorModeRef = useRef(null);

  useEffect(() => {
    function onResize() { setWindowWidth(window.innerWidth); }
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setMode = useCallback((next) => {
    setModeRaw(next);
    if (VALID_MODES.has(next)) writeMode(STORAGE_KEY, next);
  }, []);

  // Normal toggle: expanded ↔ compact only. Never jumps to full_map.
  const toggleExpandedCompact = useCallback(() => {
    setModeRaw(prev => {
      const next = (prev === 'expanded') ? 'compact' : 'expanded';
      writeMode(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Full Map: separate action, remembers prior mode for restore.
  const enterFullMap = useCallback(() => {
    setModeRaw(prev => {
      const prior = VALID_MODES.has(prev) ? prev : 'expanded';
      priorModeRef.current = prior;
      writeMode(PRIOR_KEY, prior);
      return 'full_map';
    });
  }, []);

  const exitFullMap = useCallback(() => {
    const prior = priorModeRef.current ?? readMode(PRIOR_KEY) ?? 'expanded';
    priorModeRef.current = null;
    removeKey(PRIOR_KEY);
    setModeRaw(prior);
    writeMode(STORAGE_KEY, prior);
  }, []);

  // openTeam / openJobs: expand from compact or full_map, then navigate
  const openTeam = useCallback(() => {
    setModeRaw(prev => {
      const next = prev !== 'expanded' ? 'expanded' : prev;
      if (VALID_MODES.has(next)) writeMode(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const openJobs = useCallback(() => {
    setModeRaw(prev => {
      const next = prev !== 'expanded' ? 'expanded' : prev;
      if (VALID_MODES.has(next)) writeMode(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Mobile always presents as expanded (bottom-sheet / drawer — no compact rail)
  const effectiveMode = isMobile ? 'expanded' : mode;

  return {
    mode:                 effectiveMode,
    setMode,
    toggleExpandedCompact,
    enterFullMap,
    exitFullMap,
    openTeam,
    openJobs,
    isDesktop,
    isTablet,
    isMobile,
  };
}
