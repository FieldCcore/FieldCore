import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

// Address autocomplete backed by AutocompleteService (programmatic — no DOM widget, no auth overlay).
// Autocomplete is UX-only. Backend geocodes on save, so lat/lng from onPlace are optional.
// If PlacesService.getDetails is unavailable, the form still works and the backend geocodes.
export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className }) {
  const inputRef       = useRef(null);
  const attributionRef = useRef(null); // PlacesService needs an HTMLDivElement, not an <input>
  const serviceRef     = useRef(null);
  const [preds, setPreds] = useState([]);
  const [open,  setOpen]  = useState(false);

  const placesLib = useMapsLibrary('places');

  // Initialise AutocompleteService once the library loads
  useEffect(() => {
    if (!placesLib || serviceRef.current) return;
    try {
      serviceRef.current = new placesLib.AutocompleteService();
    } catch {
      // service unavailable — plain-text input still works; backend geocodes on save
    }
  }, [placesLib]);

  const fetchPreds = useCallback((input) => {
    if (!input?.trim() || input.length < 3) { setPreds([]); setOpen(false); return; }
    if (!serviceRef.current) return;
    serviceRef.current.getPlacePredictions(
      { input, types: ['address'], componentRestrictions: { country: 'us' } },
      (results, status) => {
        if (status === 'OK' && results?.length) {
          setPreds(results);
          setOpen(true);
        } else {
          setPreds([]); setOpen(false);
        }
      }
    );
  }, []); // stable — reads serviceRef.current at call time (ref, not value)

  function selectPred(pred) {
    setPreds([]); setOpen(false);
    const description = pred.description || '';

    // Try PlacesService.getDetails using the hidden attribution div (not the input element)
    if (placesLib && attributionRef.current) {
      try {
        const svc = new placesLib.PlacesService(attributionRef.current);
        svc.getDetails(
          { placeId: pred.place_id, fields: ['address_components', 'geometry'] },
          (place, status) => {
            if (status === 'OK' && place) {
              const parsed = parseComponents(place.address_components || []);
              onChange?.(parsed.street || description);
              onPlace?.({
                ...parsed,
                lat:      place.geometry?.location?.lat() ?? null,
                lng:      place.geometry?.location?.lng() ?? null,
                place_id: pred.place_id ?? null,
              });
            } else {
              // getDetails failed — use prediction text; backend geocodes on save
              onChange?.(description);
              onPlace?.({ street: description, city: '', state: '', zip: '', lat: null, lng: null, place_id: pred.place_id ?? null });
            }
          }
        );
        return;
      } catch {
        // PlacesService unavailable — fall through to text fallback
      }
    }

    // Fallback: populate address text; backend geocodes on save
    onChange?.(description);
    onPlace?.({ street: description, city: '', state: '', zip: '', lat: null, lng: null, place_id: pred.place_id ?? null });
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

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Hidden div for PlacesService attribution — must be HTMLDivElement, not the input */}
      <div ref={attributionRef} style={{ display: 'none' }} aria-hidden="true" />
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
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
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

function parseComponents(components) {
  let streetNum = '', route = '', city = '', state = '', zip = '';
  for (const c of components) {
    const t = (c.types || [])[0];
    if (t === 'street_number')               streetNum = c.long_name  || '';
    if (t === 'route')                       route     = c.long_name  || '';
    if (t === 'locality')                    city      = c.long_name  || '';
    if (t === 'administrative_area_level_1') state     = c.short_name || '';
    if (t === 'postal_code')                 zip       = c.long_name  || '';
  }
  return { street: [streetNum, route].filter(Boolean).join(' '), city, state, zip };
}
