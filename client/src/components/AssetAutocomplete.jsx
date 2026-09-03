import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Plus } from 'lucide-react';
import api from '../api';

const ASSET_TYPES = [
  'Vehicle', 'Equipment', 'Generator', 'Trailer', 'Tool',
  'Fixture', 'HVAC', 'Electrical', 'Plumbing', 'Other',
];

// Inline form shown when the user clicks "+ Add … as new asset"
function AddAssetForm({ initialName, clientId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name:          initialName || '',
    asset_type:    '',
    unit_number:   '',
    serial_number: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function field(key) {
    return e => setForm(p => ({ ...p, [key]: e.target.value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Asset name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await api.post('/assets', {
        name:          form.name.trim(),
        client_id:     clientId   || null,
        asset_type:    form.asset_type    || null,
        unit_number:   form.unit_number.trim()   || null,
        serial_number: form.serial_number.trim() || null,
      });
      onSaved(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create asset. Please try again.');
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); handleSave(); }
  }

  return (
    <div className="asset-add-form" onKeyDown={handleKeyDown}>
      <div className="asset-add-title">Add New Asset</div>
      {error && <div className="asset-add-error">{error}</div>}
      <div className="asset-add-fields">
        <input
          ref={nameRef}
          className="asset-add-input"
          placeholder="Asset name *"
          value={form.name}
          onChange={field('name')}
        />
        <select
          className="asset-add-select"
          value={form.asset_type}
          onChange={field('asset_type')}
        >
          <option value="">Type (optional)</option>
          {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="asset-add-row2">
          <input
            className="asset-add-input"
            placeholder="Unit # (optional)"
            value={form.unit_number}
            onChange={field('unit_number')}
          />
          <input
            className="asset-add-input"
            placeholder="Serial # (optional)"
            value={form.serial_number}
            onChange={field('serial_number')}
          />
        </div>
      </div>
      <div className="asset-add-actions">
        <button type="button" className="asset-add-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="asset-add-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Creating…' : 'Create Asset'}
        </button>
      </div>
    </div>
  );
}

// Canonical asset autocomplete.
// Props:
//   value     — asset_id currently selected (string | null)
//   assetName — display name for the selected asset (string | null)
//   onChange  — fn(id: string|null, name: string|null) called on select or clear
//   clientId  — optional; scopes results to this client's assets first
//   placeholder — input placeholder text
export default function AssetAutocomplete({
  value,
  assetName,
  onChange,
  clientId,
  placeholder = 'Search assets…',
}) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [activeIdx,setActiveIdx]= useState(-1);
  const [showAdd,  setShowAdd]  = useState(false);

  const inputRef = useRef(null);
  const dropRef  = useRef(null);
  const timerRef = useRef(null);

  const fetchAssets = useCallback(async (q) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (q?.trim()) params.search = q.trim();
      if (clientId) params.client_id = clientId;
      const r = await api.get('/assets', { params });
      setResults(r.data || []);
    } catch {
      setError('Unable to load assets.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Debounced fetch whenever query or open state changes
  useEffect(() => {
    if (!open) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchAssets(query), query.trim() ? 250 : 0);
    return () => clearTimeout(timerRef.current);
  }, [query, open, fetchAssets]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function openDrop() { setOpen(true); setActiveIdx(-1); }

  function closeDrop() {
    setOpen(false);
    setShowAdd(false);
    setActiveIdx(-1);
  }

  function select(asset) {
    onChange(asset.id, asset.name);
    setQuery('');
    closeDrop();
  }

  function clear(e) {
    e.stopPropagation();
    onChange(null, null);
    setQuery('');
    closeDrop();
  }

  function handleBlur(e) {
    const rt = e.relatedTarget;
    // Don't close if focus stays inside the dropdown (e.g. Add form inputs)
    if (rt && dropRef.current?.contains(rt)) return;
    setTimeout(closeDrop, 150);
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); openDrop(); }
      return;
    }
    if (e.key === 'Escape') { closeDrop(); return; }
    if (showAdd) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      if (results[activeIdx]) select(results[activeIdx]);
    }
  }

  function handleAddSaved(asset) {
    onChange(asset.id, asset.name);
    setQuery('');
    closeDrop();
  }

  function handleCancelAdd() {
    setShowAdd(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // ── Selected chip state ───────────────────────────────────
  if (value) {
    return (
      <div className="asset-ac-selected">
        <span className="asset-ac-selected-name">{assetName || value}</span>
        <button
          type="button"
          className="asset-ac-clear"
          onClick={clear}
          aria-label="Clear asset selection"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // ── Search input + dropdown ───────────────────────────────
  return (
    <div className="asset-ac-wrap">
      <div className="asset-ac-input-row">
        <Search size={13} className="asset-ac-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="asset-ac-input"
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIdx(-1); if (!open) openDrop(); }}
          onFocus={openDrop}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-label="Search assets"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? 'asset-ac-drop' : undefined}
          aria-activedescendant={activeIdx >= 0 ? `asset-ac-item-${activeIdx}` : undefined}
        />
      </div>

      {open && (
        <div ref={dropRef} id="asset-ac-drop" className="asset-ac-drop" role="listbox">
          {showAdd ? (
            <AddAssetForm
              initialName={query}
              clientId={clientId}
              onSaved={handleAddSaved}
              onCancel={handleCancelAdd}
            />
          ) : loading ? (
            <div className="asset-ac-state">Loading…</div>
          ) : error ? (
            <div className="asset-ac-state asset-ac-state--error">
              {error}
              <button
                type="button"
                className="asset-ac-retry"
                onMouseDown={e => { e.preventDefault(); fetchAssets(query); }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {results.length === 0 ? (
                <div className="asset-ac-empty">
                  <span className="asset-ac-empty-msg">
                    {query.trim() ? 'No matching assets' : 'Type to search assets'}
                  </span>
                  {query.trim() && (
                    <button
                      type="button"
                      className="asset-ac-add-btn"
                      onMouseDown={e => { e.preventDefault(); setShowAdd(true); }}
                    >
                      <Plus size={12} /> Add &ldquo;{query.trim()}&rdquo; as new asset
                    </button>
                  )}
                </div>
              ) : (
                results.map((a, i) => (
                  <button
                    key={a.id}
                    id={`asset-ac-item-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`asset-ac-item${i === activeIdx ? ' asset-ac-item--active' : ''}`}
                    onMouseDown={e => { e.preventDefault(); select(a); }}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <span className="asset-ac-item-name">{a.name}</span>
                    <span className="asset-ac-item-meta">
                      {a.asset_type  && <span>{a.asset_type}</span>}
                      {a.client_name && <span>· {a.client_name}</span>}
                      {a.unit_number && <span>· Unit {a.unit_number}</span>}
                    </span>
                  </button>
                ))
              )}
              {query.trim() && results.length > 0 && (
                <button
                  type="button"
                  className="asset-ac-add-row"
                  onMouseDown={e => { e.preventDefault(); setShowAdd(true); }}
                >
                  <Plus size={12} /> Add &ldquo;{query.trim()}&rdquo; as new asset
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
