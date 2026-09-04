import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { Search, X, Plus, Trash2 } from 'lucide-react';
import api from '../api';

// ─── Utilities ────────────────────────────────────────────────────────────────
function fmtMoney(n) {
  const v = parseFloat(n) || 0;
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function today() { return format(new Date(), 'yyyy-MM-dd'); }
function thirtyDays() { return format(addDays(new Date(), 30), 'yyyy-MM-dd'); }

// ─── Client Autocomplete ──────────────────────────────────────────────────────
function ClientAutocomplete({ selected, onSelect, onClear }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(-1);
  const [open,    setOpen]    = useState(false);
  const timer  = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const search = useCallback((q) => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get('/clients/search', { params: { q } });
        setResults(r.data || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, []);

  function handleChange(e) {
    setQuery(e.target.value);
    setFocused(-1);
    search(e.target.value);
  }

  function handleSelect(client) {
    onSelect(client);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter' && focused >= 0) { e.preventDefault(); handleSelect(results[focused]); }
    if (e.key === 'Escape') setOpen(false);
  }

  if (selected) {
    return (
      <div className="ec-ac-selected">
        <div className="ec-ac-selected-info">
          <span className="ec-ac-selected-name">{selected.name}</span>
          {(selected.address || selected.email) && (
            <span className="ec-ac-selected-sub">
              {selected.address ? `${selected.address}${selected.city ? `, ${selected.city}` : ''}` : selected.email}
            </span>
          )}
        </div>
        <button className="ec-ac-selected-clear" onClick={onClear} aria-label="Clear client">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="ec-ac-wrap" ref={wrapRef}>
      <div className="ec-ac-input-wrap">
        <span className="ec-ac-icon"><Search size={14} /></span>
        <input
          className="ec-ac-input"
          placeholder="Search by name, company, email, or phone…"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setOpen(true)}
          aria-label="Search clients"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && (
          <button className="ec-ac-clear" onClick={() => { setQuery(''); setResults([]); setOpen(false); }} aria-label="Clear search">
            <X size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="ec-ac-drop" role="listbox">
          {loading && <div className="ec-ac-loading">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="ec-ac-empty">No clients found for "{query}"</div>
          )}
          {!loading && results.map((c, i) => (
            <button
              key={c.id}
              className={`ec-ac-item${focused === i ? ' ec-ac-focused' : ''}`}
              role="option"
              onMouseDown={() => handleSelect(c)}
              onMouseEnter={() => setFocused(i)}
            >
              <div className="ec-ac-item-row">
                <span className="ec-ac-item-name">{c.name}</span>
                {c.tier && c.tier !== 'standard' && (
                  <span className="ec-ac-item-sub" style={{ marginLeft: 'auto', textTransform: 'capitalize' }}>{c.tier}</span>
                )}
              </div>
              {(c.address || c.email || c.phone) && (
                <span className="ec-ac-item-sub">
                  {c.address ? `${c.address}${c.city ? `, ${c.city}` : ''}` : (c.email || c.phone)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Service Catalog Autocomplete ─────────────────────────────────────────────
function ServiceAutocomplete({ onSelect, onCustom }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(-1);
  const [open,    setOpen]    = useState(false);
  const timer   = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const search = useCallback((q) => {
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get('/services/search', { params: { q } });
        setResults(r.data || []);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, []);

  function handleChange(e) {
    setQuery(e.target.value);
    setFocused(-1);
    search(e.target.value);
  }

  function handleFocus() {
    if (!open) search(query);
  }

  function handleSelect(svc) {
    onSelect(svc);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function handleCustom() {
    onCustom(query.trim());
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open) return;
    const total = results.length + 1; // +1 for custom
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, total - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, -1)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focused >= 0 && focused < results.length) handleSelect(results[focused]);
      else if (focused === results.length) handleCustom();
    }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="ec-ac-wrap" ref={wrapRef}>
      <div className="ec-ac-input-wrap">
        <span className="ec-ac-icon"><Search size={14} /></span>
        <input
          className="ec-ac-input"
          placeholder="Search service catalog or add a custom item…"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          aria-label="Search service catalog"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && (
          <button className="ec-ac-clear" onClick={() => { setQuery(''); setResults([]); setOpen(false); }} aria-label="Clear">
            <X size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="ec-ac-drop" role="listbox">
          {loading && <div className="ec-ac-loading">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="ec-ac-empty">No catalog services found</div>
          )}
          {!loading && results.map((s, i) => (
            <button
              key={s.id}
              className={`ec-ac-item${focused === i ? ' ec-ac-focused' : ''}`}
              role="option"
              onMouseDown={() => handleSelect(s)}
              onMouseEnter={() => setFocused(i)}
            >
              <div className="ec-ac-item-row">
                <span className="ec-ac-item-name">{s.name}</span>
                {s.price != null && (
                  <span className="ec-ac-item-price">{fmtMoney(s.price)}</span>
                )}
              </div>
              {s.description && <span className="ec-ac-item-sub">{s.description}</span>}
            </button>
          ))}
          <button
            className={`ec-ac-add${focused === results.length ? ' ec-ac-focused' : ''}`}
            onMouseDown={handleCustom}
            onMouseEnter={() => setFocused(results.length)}
          >
            <Plus size={13} />
            {query.trim() ? `Add "${query.trim()}" as custom item` : 'Add custom item'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Empty item factory ───────────────────────────────────────────────────────
function newItem(taxRate) {
  return {
    _key:        Math.random().toString(36).slice(2),
    name:        '',
    description: '',
    quantity:    '1',
    unit_price:  '',
    taxable:     taxRate > 0,
  };
}

function computeLineTotal(item) {
  const qty   = Math.max(0, parseFloat(item.quantity)  || 0);
  const price = Math.max(0, parseFloat(item.unit_price) || 0);
  return parseFloat((qty * price).toFixed(2));
}

function computeSummary(items, discount, taxRate) {
  const subtotal = parseFloat(items.reduce((s, i) => s + computeLineTotal(i), 0).toFixed(2));
  const disc     = parseFloat(Math.min(Math.max(parseFloat(discount) || 0, 0), subtotal).toFixed(2));
  const taxableSub     = parseFloat(items.filter(i => i.taxable).reduce((s, i) => s + computeLineTotal(i), 0).toFixed(2));
  const discountRatio  = subtotal > 0 ? disc / subtotal : 0;
  const taxableAfterD  = parseFloat((taxableSub * (1 - discountRatio)).toFixed(2));
  const tax            = parseFloat((taxableAfterD * parseFloat(taxRate || 0)).toFixed(2));
  const total          = parseFloat((subtotal - disc + tax).toFixed(2));
  return { subtotal, discount: disc, tax, total };
}

// ─── Estimate Composer ────────────────────────────────────────────────────────
export default function EstimateComposer({ onCreated, onClose }) {
  const [client,      setClient]      = useState(null);
  const [locations,   setLocations]   = useState([]);
  const [locationId,  setLocationId]  = useState('');
  const [title,       setTitle]       = useState('');
  const [estDate,     setEstDate]     = useState(today());
  const [validUntil,  setValidUntil]  = useState(thirtyDays());
  const [nextNum,     setNextNum]     = useState(null);
  const [taxRate,     setTaxRate]     = useState(0);
  const [items,       setItems]       = useState(null); // null until taxRate loads
  const [discount,    setDiscount]    = useState('0');
  const [clientMsg,   setClientMsg]   = useState('');
  const [terms,       setTerms]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  // Load next estimate number + tax rate on mount
  useEffect(() => {
    api.get('/estimates/next-number').then(r => {
      setNextNum(r.data.next_number);
      const tr = parseFloat(r.data.tax_rate || 0);
      setTaxRate(tr);
      setItems([newItem(tr)]);
    }).catch(() => {
      setTaxRate(0);
      setItems([newItem(0)]);
    });
  }, []);

  // Load locations when client changes
  useEffect(() => {
    if (!client) { setLocations([]); setLocationId(''); return; }
    api.get(`/clients/${client.id}/locations`).then(r => {
      const locs = r.data || [];
      setLocations(locs);
      const primary = locs.find(l => l.is_primary);
      setLocationId(primary ? primary.id : (locs[0]?.id || ''));
    }).catch(() => { setLocations([]); setLocationId(''); });
  }, [client]);

  function handleSelectClient(c) {
    setClient(c);
  }

  function handleClearClient() {
    setClient(null);
    setLocations([]);
    setLocationId('');
  }

  // Line item operations
  function updateItem(key, patch) {
    setItems(prev => prev.map(it => it._key === key ? { ...it, ...patch } : it));
  }

  function addItem() {
    setItems(prev => [...prev, newItem(taxRate)]);
  }

  function removeItem(key) {
    setItems(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(it => it._key !== key);
    });
  }

  function handleServiceSelect(key, svc) {
    updateItem(key, {
      name:        svc.name,
      description: svc.description || '',
      unit_price:  svc.price != null ? String(svc.price) : '',
      taxable:     taxRate > 0,
    });
  }

  function handleCustomItem(key, customName) {
    updateItem(key, {
      name: customName || '',
    });
  }

  const summary = items ? computeSummary(items, discount, taxRate) : { subtotal: 0, discount: 0, tax: 0, total: 0 };

  async function handleSubmit() {
    if (!client) { setError('Please select a client.'); return; }
    if (!items || items.length === 0) { setError('Add at least one estimate item.'); return; }

    const validItems = items.filter(it => {
      const qty   = parseFloat(it.quantity)  || 0;
      const price = parseFloat(it.unit_price) || 0;
      return qty > 0 && price >= 0 && (it.name || it.description);
    });
    if (validItems.length === 0) {
      setError('Add at least one item with a name and unit price.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        client_id:            client.id,
        title:                title.trim() || 'Service Estimate',
        line_items:           validItems.map(it => ({
          name:        it.name.trim() || it.description.trim() || 'Service',
          description: it.description,
          quantity:    parseFloat(it.quantity) || 1,
          unit_price:  parseFloat(it.unit_price) || 0,
          taxable:     it.taxable,
        })),
        estimate_date:        estDate || null,
        valid_until:          validUntil || null,
        client_message:       clientMsg.trim() || null,
        terms_and_conditions: terms.trim() || null,
        discount:             parseFloat(discount) || 0,
        location_id:          locationId || null,
      };
      const r = await api.post('/estimates', payload);
      onCreated(r.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create estimate. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Trap Escape
  useEffect(() => {
    function handle(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  const loadingInit = items === null;

  return (
    <div className="ec-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ec-composer" role="dialog" aria-modal="true" aria-label="New Estimate">

        {/* Header */}
        <div className="ec-head">
          <div>
            <h2 className="ec-head-title">New Estimate</h2>
            <p className="ec-head-sub">Build a detailed proposal for your client.</p>
          </div>
          <button className="ec-close" onClick={onClose} aria-label="Close composer">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="ec-body">

          {/* ── CLIENT & ESTIMATE DETAILS ── */}
          <div className="ec-section">
            <p className="ec-section-title">Client &amp; Estimate Details</p>

            <div className="ec-2col">
              <div className="ec-field">
                <label className="ec-label">Client *</label>
                <ClientAutocomplete
                  selected={client}
                  onSelect={handleSelectClient}
                  onClear={handleClearClient}
                />
              </div>

              <div className="ec-field">
                <label className="ec-label">Service Address</label>
                {client && locations.length > 0 ? (
                  <select
                    className="ec-select"
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    aria-label="Service address"
                  >
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label ? `${loc.label} — ` : ''}{loc.formatted_address || `${loc.address}${loc.city ? `, ${loc.city}` : ''}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="ec-input"
                    value={client ? 'No saved locations' : ''}
                    disabled
                    placeholder="Select a client first"
                    aria-label="Service address"
                  />
                )}
              </div>
            </div>

            <div className="ec-2col">
              <div className="ec-field">
                <label className="ec-label" htmlFor="ec-title">Estimate Title</label>
                <input
                  id="ec-title"
                  className="ec-input"
                  placeholder="e.g. Ceramic Coating &amp; Paint Correction"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className="ec-field">
                <label className="ec-label">Estimate #</label>
                <input
                  className="ec-input ec-input--mono"
                  value={nextNum != null ? `#${nextNum}` : ''}
                  disabled
                  placeholder="Loading…"
                  aria-label="Estimate number preview"
                />
              </div>
            </div>

            <div className="ec-2col">
              <div className="ec-field">
                <label className="ec-label" htmlFor="ec-estdate">Estimate Date</label>
                <input
                  id="ec-estdate"
                  type="date"
                  className="ec-input"
                  value={estDate}
                  onChange={e => setEstDate(e.target.value)}
                />
              </div>
              <div className="ec-field">
                <label className="ec-label" htmlFor="ec-valid">Valid Until</label>
                <input
                  id="ec-valid"
                  type="date"
                  className="ec-input"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="ec-divider" />

          {/* ── ESTIMATE ITEMS ── */}
          <div className="ec-section">
            <p className="ec-section-title">Estimate Items</p>

            {loadingInit ? (
              <div style={{ padding: '24px 0', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--steel)' }}>
                Loading…
              </div>
            ) : (
              <div className="ec-items">
                {items.map((item, idx) => (
                  <LineItemBlock
                    key={item._key}
                    item={item}
                    index={idx}
                    taxRate={taxRate}
                    canRemove={items.length > 1}
                    onUpdate={patch => updateItem(item._key, patch)}
                    onRemove={() => removeItem(item._key)}
                    onServiceSelect={svc => handleServiceSelect(item._key, svc)}
                    onCustomItem={name => handleCustomItem(item._key, name)}
                  />
                ))}

                <button className="ec-add-item" onClick={addItem} type="button">
                  <Plus size={14} />
                  Add Item
                </button>
              </div>
            )}
          </div>

          <div className="ec-divider" />

          {/* ── MESSAGE + TERMS + PRICING SUMMARY ── */}
          <div className="ec-section">
            <div className="ec-bottom">
              <div className="ec-bottom-left">
                <div className="ec-field">
                  <label className="ec-label" htmlFor="ec-msg">Message to Client</label>
                  <textarea
                    id="ec-msg"
                    className="ec-textarea"
                    rows={4}
                    placeholder="Thank you for the opportunity to provide this estimate. The proposed scope and pricing are outlined below."
                    value={clientMsg}
                    onChange={e => setClientMsg(e.target.value)}
                  />
                </div>
                <div className="ec-field">
                  <label className="ec-label" htmlFor="ec-terms">Terms &amp; Conditions</label>
                  <textarea
                    id="ec-terms"
                    className="ec-textarea"
                    rows={4}
                    placeholder="Estimate valid for 30 days. A 25% deposit is required prior to scheduling."
                    value={terms}
                    onChange={e => setTerms(e.target.value)}
                  />
                </div>
              </div>

              <div className="ec-summary">
                <p className="ec-summary-title">Pricing Summary</p>

                <div className="ec-summary-row">
                  <span className="ec-summary-row-label">Subtotal</span>
                  <span className="ec-summary-row-val">{fmtMoney(summary.subtotal)}</span>
                </div>

                <div className="ec-summary-discount-row">
                  <span className="ec-summary-discount-label">Discount</span>
                  <input
                    className="ec-summary-discount-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    aria-label="Discount amount"
                  />
                </div>

                {taxRate > 0 && (
                  <div className="ec-summary-row">
                    <span className="ec-summary-row-label">
                      Tax ({(taxRate * 100).toFixed(1)}%)
                    </span>
                    <span className="ec-summary-row-val">{fmtMoney(summary.tax)}</span>
                  </div>
                )}

                <div className="ec-summary-line" />

                <div className="ec-summary-total-row">
                  <span className="ec-summary-total-label">Estimate Total</span>
                  <span className="ec-summary-total-val">{fmtMoney(summary.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="ec-foot">
          {error && <span className="ec-foot-error" role="alert">{error}</span>}
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving || loadingInit}>
            {saving ? 'Creating…' : 'Create Estimate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Line Item Block ──────────────────────────────────────────────────────────
function LineItemBlock({ item, index, taxRate, canRemove, onUpdate, onRemove, onServiceSelect, onCustomItem }) {
  const lineTotal = computeLineTotal(item);
  const showCatalog = !item.name; // show catalog search until a service is named

  return (
    <div className="ec-item">
      <div className="ec-item-header">
        <span className="ec-item-num">{String(index + 1).padStart(2, '0')}</span>

        {showCatalog ? (
          <div style={{ flex: 1 }}>
            <ServiceAutocomplete
              onSelect={onServiceSelect}
              onCustom={onCustomItem}
            />
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <input
              className="ec-input"
              value={item.name}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="Product / Service"
              aria-label="Product or service name"
            />
          </div>
        )}

        {canRemove && (
          <button className="ec-item-remove" onClick={onRemove} aria-label="Remove item" type="button">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="ec-field">
        <label className="ec-label">Description / Scope of Work</label>
        <textarea
          className="ec-textarea"
          rows={3}
          placeholder="Describe the scope of work, deliverables, and any inclusions or exclusions…"
          value={item.description}
          onChange={e => onUpdate({ description: e.target.value })}
          aria-label="Description or scope of work"
        />
      </div>

      <div className="ec-item-controls">
        <div className="ec-field">
          <label className="ec-label" htmlFor={`ec-qty-${item._key}`}>Qty</label>
          <input
            id={`ec-qty-${item._key}`}
            className="ec-input ec-input--mono"
            type="number"
            min="0"
            step="1"
            value={item.quantity}
            onChange={e => onUpdate({ quantity: e.target.value })}
            aria-label="Quantity"
          />
        </div>

        <div className="ec-field">
          <label className="ec-label" htmlFor={`ec-price-${item._key}`}>Unit Price</label>
          <input
            id={`ec-price-${item._key}`}
            className="ec-input ec-input--mono"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={item.unit_price}
            onChange={e => onUpdate({ unit_price: e.target.value })}
            aria-label="Unit price"
          />
        </div>

        <div className="ec-field">
          <label className="ec-label" htmlFor={`ec-tax-${item._key}`}>Tax</label>
          <select
            id={`ec-tax-${item._key}`}
            className="ec-select"
            value={item.taxable ? 'taxable' : 'nontaxable'}
            onChange={e => onUpdate({ taxable: e.target.value === 'taxable' })}
            aria-label="Tax status"
            disabled={taxRate === 0}
          >
            <option value="taxable">Taxable</option>
            <option value="nontaxable">Non-Taxable</option>
          </select>
        </div>

        <div className="ec-item-total-display">
          <label className="ec-label">Total</label>
          <div className="ec-item-total-val">{fmtMoney(lineTotal)}</div>
        </div>
      </div>
    </div>
  );
}
