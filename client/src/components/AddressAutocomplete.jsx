import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';

// Address autocomplete backed by the server-side /api/maps/autocomplete proxy.
// No dependency on useMapsLibrary or client-side Places API.
// Backend geocodes coordinates on job save — lat/lng from onPlace are optional.
export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className }) {
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const [preds, setPreds] = useState([]);
  const [open,  setOpen]  = useState(false);

  // Debounced fetch — 300 ms to avoid a backend call on every keystroke
  const fetchPreds = useCallback((input) => {
    clearTimeout(timerRef.current);
    if (!input?.trim() || input.length < 3) { setPreds([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res   = await api.get('/maps/autocomplete', { params: { input: input.trim() } });
        const preds = res.data?.predictions || [];
        setPreds(preds);
        setOpen(preds.length > 0);
      } catch {
        setPreds([]); setOpen(false);
      }
    }, 300);
  }, []);

  function selectPred(pred) {
    setPreds([]); setOpen(false);
    const sf          = pred.structured_formatting;
    const street      = sf?.main_text    || pred.description || '';
    const secondary   = sf?.secondary_text || '';               // e.g. "Coral Springs, FL 33065, USA"
    const parts       = secondary.split(',').map(s => s.trim());
    const city        = parts[0] || '';
    const stateZip    = (parts[1] || '').trim().split(' ').filter(Boolean);
    const state       = stateZip[0] || '';
    const zip         = stateZip[1] || '';

    onChange?.(street);
    // lat/lng are null — backend geocodes on save
    onPlace?.({ street, city, state, zip, lat: null, lng: null, place_id: pred.place_id ?? null });
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
        placeholder={placeholder || 'Street address'}
        style={style}
        className={className}
        autoComplete="off"
        onBlur={() => setTimeout(() => setOpen(false), 150)}
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
