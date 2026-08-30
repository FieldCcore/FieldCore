import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';

// Address autocomplete backed by the server-side /api/maps/autocomplete proxy.
// On selection, fetches /api/maps/place-details for coordinates + full address.
// All Google API calls are proxied through the server — no client-side Places library needed.
export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className, 'data-testid': dataTestId }) {
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);
  const [preds,    setPreds]    = useState([]);
  const [open,     setOpen]     = useState(false);
  const [resolving, setResolving] = useState(false);

  // Debounced fetch — 300 ms to avoid a backend call on every keystroke
  const fetchPreds = useCallback((input) => {
    clearTimeout(timerRef.current);
    if (!input?.trim() || input.length < 3) { setPreds([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res  = await api.get('/maps/autocomplete', { params: { input: input.trim() } });
        const list = res.data?.predictions || [];
        setPreds(list);
        setOpen(list.length > 0);
      } catch {
        setPreds([]); setOpen(false);
      }
    }, 300);
  }, []);

  async function selectPred(pred) {
    setPreds([]);
    setOpen(false);

    const sf        = pred.structured_formatting;
    const street    = sf?.main_text || pred.description || '';
    const secondary = sf?.secondary_text || '';
    const parts     = secondary.split(',').map(s => s.trim());
    const city      = parts[0] || '';
    const stateZip  = (parts[1] || '').trim().split(' ').filter(Boolean);
    const state     = stateZip[0] || '';
    const zip       = stateZip[1] || '';

    // Update visible text immediately so the input doesn't appear frozen
    onChange?.(street);

    if (!pred.place_id) {
      onPlace?.({ street, city, state, zip, lat: null, lng: null, place_id: null });
      return;
    }

    // Fetch place details for coordinates + full address components
    try {
      setResolving(true);
      const { data } = await api.get('/maps/place-details', { params: { placeId: pred.place_id } });
      onPlace?.({
        street:           data.addressLine1   || street,
        city:             data.city           || city,
        state:            data.region         || state,
        zip:              data.postalCode      || zip,
        lat:              data.latitude        ?? null,
        lng:              data.longitude       ?? null,
        place_id:         data.placeId         || pred.place_id,
        formattedAddress: data.formattedAddress || '',
        country:          data.country          || '',
        countryCode:      data.countryCode       || '',
      });
    } catch {
      // Coordinates not critical — backend will geocode on save
      onPlace?.({ street, city, state, zip, lat: null, lng: null, place_id: pred.place_id });
    } finally {
      setResolving(false);
    }
  }

  function handleChange(e) {
    onChange?.(e.target.value);
    fetchPreds(e.target.value);
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!inputRef.current?.contains(e.target)) { setPreds([]); setOpen(false); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Clear debounce on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        placeholder={resolving ? 'Looking up address…' : (placeholder || 'Street address')}
        style={style}
        className={className}
        autoComplete="off"
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-busy={resolving}
        data-testid={dataTestId}
      />
      {open && preds.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 9999, top: '100%', left: 0, right: 0,
          margin: '2px 0 0', padding: 0, listStyle: 'none',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', overflow: 'hidden',
        }}>
          {preds.map((p, i) => (
            <li
              key={p.place_id || i}
              onMouseDown={() => selectPred(p)}
              style={{
                padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                borderBottom: i < preds.length - 1 ? '1px solid #f1f5f9' : 'none',
                display: 'flex', gap: 6, alignItems: 'baseline',
                background: '#fff',
              }}
              onMouseEnter={e  => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e  => e.currentTarget.style.background = '#fff'}
            >
              <span style={{ fontWeight: 500, color: '#1C2333' }}>
                {p.structured_formatting?.main_text ?? p.description}
              </span>
              {p.structured_formatting?.secondary_text && (
                <span style={{ color: '#94a3b8', fontSize: 12 }}>
                  {p.structured_formatting.secondary_text}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
