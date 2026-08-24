import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { Search, X } from 'lucide-react';

export function highlight(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="ac-hl">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * Universal debounced autocomplete with keyboard navigation.
 *
 * Props:
 *   fetchResults(query, signal) — async fn returning item[]
 *   onSelect(item)     — called when user picks an item
 *   onClear()          — called when user clears the selection
 *   renderItem(item, query) — ReactNode for each dropdown row
 *   renderSelectedCard(item) — ReactNode for the selected-state card (optional)
 *   getKey(item)       — unique string key per item
 *   getDisplayValue(item) — text shown in input when item is selected
 *   selected           — currently selected item or null
 *   placeholder
 *   label              — aria-label for the input
 *   inputId            — optional override id
 *   minLength          — minimum chars to trigger fetch (default 1)
 *   debounceMs         — debounce delay (default 275)
 *   emptyText          — shown when no results (default "No results found.")
 *   className          — outer container class
 *   appendItems        — extra items appended below results (e.g. "+ Custom")
 *   onAppendSelect(item) — called when an appendItem is selected
 */
export default function Autocomplete({
  fetchResults,
  onSelect,
  onClear,
  renderItem,
  renderSelectedCard,
  getKey,
  getDisplayValue,
  selected,
  placeholder   = 'Search…',
  label         = 'Search',
  inputId: externalId,
  minLength     = 1,
  debounceMs    = 275,
  emptyText     = 'No results found.',
  className     = '',
  appendItems,
  onAppendSelect,
}) {
  const autoId       = useId();
  const inputId      = externalId || autoId;
  const listId       = `${inputId}-list`;

  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const debounceRef   = useRef(null);
  const abortRef      = useRef(null);
  const inputRef      = useRef(null);
  const listRef       = useRef(null);
  const containerRef  = useRef(null);

  const appendList = appendItems || [];
  const allItems   = [...results, ...appendList];

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doFetch = useCallback(async (q) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (q.length < minLength) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchResults(q, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setResults(Array.isArray(data) ? data : []);
        setActiveIdx(-1);
      }
    } catch (err) {
      if (!ctrl.signal.aborted && err.name !== 'AbortError' && err.name !== 'CanceledError') {
        setError('Search failed. Try again.');
        setResults([]);
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [fetchResults, minLength]);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doFetch(val), debounceMs);
  }

  function handleFocus() {
    setOpen(true);
    if (query.length >= minLength && results.length === 0 && !loading) {
      doFetch(query);
    }
  }

  function handleKeyDown(e) {
    if (!open) return;
    const total = allItems.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i < total - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i > 0 ? i - 1 : total - 1));
    } else if (e.key === 'Enter' && activeIdx >= 0 && activeIdx < total) {
      e.preventDefault();
      const isAppend = activeIdx >= results.length;
      if (isAppend) {
        onAppendSelect?.(appendList[activeIdx - results.length]);
      } else {
        selectItem(results[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  function selectItem(item) {
    setOpen(false);
    setQuery('');
    setResults([]);
    setActiveIdx(-1);
    onSelect(item);
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setError(null);
    setOpen(false);
    setActiveIdx(-1);
    onClear();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-ac-item]');
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  const showDrop = open && !selected && (
    loading ||
    error ||
    results.length > 0 ||
    appendList.length > 0 ||
    (query.length >= minLength && !loading)
  );

  return (
    <div className={`ac-wrap ${className}`} ref={containerRef}>
      <div
        className="ac-input-row"
        role="combobox"
        aria-expanded={showDrop}
        aria-haspopup="listbox"
        aria-owns={listId}
      >
        <Search size={14} className="ac-search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          className={`ac-input${selected ? ' ac-input--locked' : ''}`}
          type="text"
          value={selected ? (getDisplayValue?.(selected) ?? '') : query}
          readOnly={!!selected}
          onChange={!selected ? handleChange : undefined}
          onFocus={!selected ? handleFocus : undefined}
          onKeyDown={!selected ? handleKeyDown : undefined}
          placeholder={!selected ? placeholder : undefined}
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeIdx >= 0 ? `${inputId}-item-${activeIdx}` : undefined}
          autoComplete="off"
        />
        {selected && (
          <button
            className="ac-clear-btn"
            onClick={handleClear}
            aria-label="Clear selection"
            type="button"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {selected && renderSelectedCard && (
        <div className="ac-selected-card">
          {renderSelectedCard(selected)}
        </div>
      )}

      {showDrop && (
        <ul
          ref={listRef}
          id={listId}
          className="ac-drop"
          role="listbox"
          aria-label={label}
        >
          {loading ? (
            <li className="ac-drop-state">Searching…</li>
          ) : error ? (
            <li className="ac-drop-state ac-drop-error" role="alert">{error}</li>
          ) : results.length === 0 && appendList.length === 0 ? (
            <li className="ac-drop-state ac-drop-empty">{emptyText}</li>
          ) : (
            <>
              {results.map((item, i) => (
                <li
                  key={getKey(item)}
                  id={`${inputId}-item-${i}`}
                  className={`ac-drop-item${i === activeIdx ? ' ac-drop-item--active' : ''}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  data-ac-item=""
                  onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  {renderItem(item, query)}
                </li>
              ))}
              {appendList.map((item, j) => {
                const i = results.length + j;
                return (
                  <li
                    key={`append-${j}`}
                    id={`${inputId}-item-${i}`}
                    className={`ac-drop-item ac-drop-item--append${i === activeIdx ? ' ac-drop-item--active' : ''}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    data-ac-item=""
                    onMouseDown={(e) => { e.preventDefault(); onAppendSelect?.(item); setOpen(false); }}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    {item.label}
                  </li>
                );
              })}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
