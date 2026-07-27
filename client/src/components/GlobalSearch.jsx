import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, ArrowRight,
  Users, Briefcase, FileText, Receipt, CreditCard, Star, Clock,
} from 'lucide-react';

const TYPE_ICON = {
  client:   Users,
  job:      Briefcase,
  invoice:  Receipt,
  estimate: FileText,
  payment:  CreditCard,
  review:   Star,
  request:  FileText,
  project:  Briefcase,
};

// Stage 2 replaces this body — clean adapter boundary
function useSearchAdapter(query) {
  return { groups: [], loading: false, error: null };
}

const RECENT_KEY = 'fc_search_recent';
const MAX_RECENT = 6;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

function pushRecent(item) {
  const next = [item, ...getRecent().filter(r => r.id !== item.id || r.type !== item.type)]
    .slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
}

const isMac =
  typeof navigator !== 'undefined' &&
  (navigator.platform?.toUpperCase().includes('MAC') ||
   navigator.userAgent.includes('Mac'));

const NARROW_BP = 1024;

function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= NARROW_BP
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_BP}px)`);
    const handler = (e) => setNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return narrow;
}

function KbdHint({ label }) {
  return (
    <span className="gs-kbd" aria-hidden="true">
      {label ?? (isMac ? '⌘K' : 'Ctrl K')}
    </span>
  );
}

function GsSkeleton() {
  return (
    <div className="gs-skeleton-wrap" aria-label="Loading results" aria-busy="true">
      {[0, 1, 2].map(i => (
        <div key={i} className="gs-skeleton-item">
          <div className="gs-skeleton-icon" />
          <div className="gs-skeleton-body">
            <div className="gs-skeleton-line gs-skeleton-line--title" />
            <div className="gs-skeleton-line gs-skeleton-line--sub"
              style={{ animationDelay: `${i * 60}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GsEmptyQuery({ recent, onSelect }) {
  if (recent.length === 0) {
    return (
      <div className="gs-empty-state">
        <Search size={20} strokeWidth={1.5} className="gs-empty-state__icon" aria-hidden="true" />
        <p className="gs-empty-state__hint">
          Start typing to search clients, jobs, invoices, addresses, and more.
        </p>
      </div>
    );
  }
  return (
    <div className="gs-recent" role="listbox" aria-label="Recent searches">
      <div className="gs-group__label">Recent</div>
      {recent.map(item => (
        <GsItem
          key={`${item.type}-${item.id}`}
          item={item}
          isActive={false}
          onSelect={onSelect}
          onHover={() => {}}
          showClock
        />
      ))}
    </div>
  );
}

function GsNoResults() {
  return (
    <div className="gs-empty-state">
      <p className="gs-empty-state__title">No results found</p>
      <p className="gs-empty-state__hint">
        Try a client name, phone number, address, or record number.
      </p>
    </div>
  );
}

function GsError({ onRetry }) {
  return (
    <div className="gs-empty-state gs-empty-state--error">
      <p className="gs-empty-state__title">Search is temporarily unavailable.</p>
      {onRetry && (
        <button className="gs-retry" onClick={onRetry} type="button">Retry</button>
      )}
    </div>
  );
}

function GsItem({ item, isActive, onSelect, onHover, showClock }) {
  const Icon = showClock ? Clock : (TYPE_ICON[item.type] || ArrowRight);
  const rowRef = useRef(null);
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);
  return (
    <button
      ref={rowRef}
      className={`gs-item${isActive ? ' gs-item--active' : ''}`}
      onClick={() => onSelect(item)}
      onMouseEnter={onHover}
      role="option"
      aria-selected={isActive}
      type="button"
      aria-label={item.title + (item.subtitle ? ` — ${item.subtitle}` : '')}
    >
      <span className="gs-item__icon" aria-hidden="true">
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className="gs-item__body">
        <span className="gs-item__title">{item.title}</span>
        {item.subtitle && <span className="gs-item__sub">{item.subtitle}</span>}
      </span>
      {item.status && <span className="gs-item__status">{item.status}</span>}
      {(item.amount || item.date) && (
        <span className="gs-item__meta" aria-hidden="true">
          {item.amount && <span>{item.amount}</span>}
          {item.date   && <span>{item.date}</span>}
        </span>
      )}
      <ArrowRight size={11} strokeWidth={2} className="gs-item__arrow" aria-hidden="true" />
    </button>
  );
}

function GsGroup({ group, allResults, activeIndex, onSelect, onHover }) {
  return (
    <div className="gs-group" role="group" aria-label={group.label}>
      <div className="gs-group__label">{group.label}</div>
      {group.results.map(item => {
        const idx = allResults.findIndex(r => r.id === item.id && r.type === item.type);
        return (
          <GsItem
            key={`${item.type}-${item.id}`}
            item={item}
            isActive={idx === activeIndex}
            onSelect={onSelect}
            onHover={() => onHover(idx)}
          />
        );
      })}
    </div>
  );
}

function GsBody({ query, recent, groups, loading, error, active, allResults, handleSelect, setActive }) {
  if (error)          return <GsError />;
  if (!query.trim())  return <GsEmptyQuery recent={recent} onSelect={handleSelect} />;
  if (loading)        return <GsSkeleton />;
  if (!groups.length) return <GsNoResults />;
  return (
    <div className="gs-results" role="listbox" aria-label="Search results">
      {groups.map(g => (
        <GsGroup
          key={g.type}
          group={g}
          allResults={allResults}
          activeIndex={active}
          onSelect={handleSelect}
          onHover={setActive}
        />
      ))}
    </div>
  );
}

function GsFooter() {
  return (
    <div className="gs-footer" aria-hidden="true">
      <span><KbdHint label="↑↓" /> navigate</span>
      <span><KbdHint label="↵" /> select</span>
      <span><KbdHint label="Esc" /> close</span>
    </div>
  );
}

export default function GlobalSearch() {
  const nav      = useNavigate();
  const isNarrow = useIsNarrow();

  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState('');
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState([]);

  const wrapRef    = useRef(null);
  const triggerRef = useRef(null);
  const inputRef   = useRef(null);
  const dialogRef  = useRef(null);

  const { groups, loading, error } = useSearchAdapter(query.trim());
  const allResults = useMemo(() => groups.flatMap(g => g.results), [groups]);

  const openSearch = useCallback(() => {
    setQuery('');
    setActive(-1);
    setRecent(getRecent());
    setOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const handleSelect = useCallback((item) => {
    pushRecent(item);
    closeSearch();
    nav(item.route);
  }, [closeSearch, nav]);

  function handleQueryChange(e) {
    setQuery(e.target.value);
    setActive(-1);
  }

  function clearQuery() {
    setQuery('');
    setActive(-1);
    inputRef.current?.focus();
  }

  // Focus input when opening
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Global Ctrl+K / Cmd+K
  useEffect(() => {
    function onKeyDown(e) {
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (!modKey || e.key !== 'k') return;
      if (open) { e.preventDefault(); closeSearch(); return; }
      const tag      = document.activeElement?.tagName?.toLowerCase();
      const editable = document.activeElement?.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) return;
      e.preventDefault();
      openSearch();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, openSearch, closeSearch]);

  // In-panel / in-dialog keyboard handling
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(a => Math.min(a + 1, allResults.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(a => Math.max(a - 1, -1));
        if (active === 0) inputRef.current?.focus();
        return;
      }
      if (e.key === 'Enter' && active >= 0 && allResults[active]) {
        handleSelect(allResults[active]);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, active, allResults, closeSearch, handleSelect]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (wrapRef.current   && !wrapRef.current.contains(e.target))   closeSearch();
      if (dialogRef.current && !dialogRef.current.contains(e.target)) closeSearch();
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open, closeSearch]);

  // Wide-mode: open = wrap expands + inline input + dropdown panel
  // Narrow-mode (≤1024px): open = full-screen modal dialog
  const wideOpen = open && !isNarrow;

  const bodyProps = { query, recent, groups, loading, error, active, allResults, handleSelect, setActive };

  return (
    <>
      {/* ── Expanding wrapper (always in topbar) ─── */}
      <div
        ref={wrapRef}
        className={`gs-wrap${wideOpen ? ' gs-wrap--open' : ''}`}
        role="search"
        aria-label="FieldCore search"
      >
        {/* Compact trigger — always rendered; hidden by CSS when wide+open */}
        <button
          ref={triggerRef}
          className="gs-trigger"
          onClick={openSearch}
          aria-label="Search FieldCore"
          aria-expanded={open}
          aria-haspopup="listbox"
          type="button"
          tabIndex={wideOpen ? -1 : 0}
        >
          <Search size={13} strokeWidth={2} className="gs-trigger__icon" aria-hidden="true" />
          <span className="gs-trigger__label">Search</span>
          <KbdHint />
        </button>

        {/* Inline active input (wide mode only) */}
        {wideOpen && (
          <div className="gs-inline">
            <Search size={14} strokeWidth={2} className="gs-inline__icon" aria-hidden="true" />
            <label htmlFor="gs-input" className="gs-sr-label">Search</label>
            <input
              ref={inputRef}
              id="gs-input"
              className="gs-inline__input"
              type="search"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search FieldCore..."
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                className="gs-inline__clear"
                onClick={clearQuery}
                aria-label="Clear search"
                type="button"
              >
                <X size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            <button
              className="gs-inline__close"
              onClick={closeSearch}
              aria-label="Close search"
              type="button"
            >
              <KbdHint label="Esc" />
            </button>
          </div>
        )}

        {/* Dropdown results panel (wide mode only) */}
        {wideOpen && (
          <div className="gs-panel">
            <div className="gs-panel__body">
              <GsBody {...bodyProps} />
            </div>
            <GsFooter />
          </div>
        )}
      </div>

      {/* ── Full-screen modal (narrow mode ≤1024px) ─ */}
      {open && isNarrow && (
        <div className="gs-backdrop" role="presentation">
          <div
            ref={dialogRef}
            className="gs-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search FieldCore"
          >
            <div className="gs-dialog__header">
              <Search size={15} strokeWidth={2} className="gs-dialog__search-icon" aria-hidden="true" />
              <label htmlFor="gs-input-modal" className="gs-dialog__label">Search</label>
              <input
                ref={inputRef}
                id="gs-input-modal"
                className="gs-dialog__input"
                type="search"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search FieldCore..."
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  className="gs-dialog__clear"
                  onClick={clearQuery}
                  aria-label="Clear search"
                  type="button"
                >
                  <X size={13} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <button
                className="gs-dialog__close"
                onClick={closeSearch}
                aria-label="Close search"
                type="button"
              >
                <KbdHint label="Esc" />
              </button>
            </div>
            <div className="gs-dialog__body">
              <GsBody {...bodyProps} />
            </div>
            <GsFooter />
          </div>
        </div>
      )}
    </>
  );
}
