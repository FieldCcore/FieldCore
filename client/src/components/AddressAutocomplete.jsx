import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

// Address autocomplete that works with Places API (New).
// Mode selection (in priority order):
//   'new'     — google.maps.places.AutocompleteSuggestion (Places API New)
//   'legacy'  — google.maps.places.Autocomplete widget    (Places API Legacy)
//   'plain'   — unenhanced text input; backend geocodes on save
//
// Falls back gracefully so job creation always works regardless of which
// Places API variant is enabled in Google Cloud Console.
export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className }) {
  const inputRef   = useRef(null);
  const acRef      = useRef(null);   // legacy Autocomplete instance
  const sessionRef = useRef(null);   // new-API session token
  const [preds, setPreds] = useState([]);
  const [open,  setOpen]  = useState(false);

  const placesLib = useMapsLibrary('places');

  const mode = !placesLib
    ? 'loading'
    : typeof window.google?.maps?.places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions === 'function'
      ? 'new'
      : typeof placesLib?.Autocomplete === 'function'
        ? 'legacy'
        : 'plain';

  // ── Legacy mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'legacy' || !inputRef.current || acRef.current) return;
    try {
      acRef.current = new placesLib.Autocomplete(inputRef.current, {
        types:                ['address'],
        componentRestrictions: { country: 'us' },
        fields:               ['address_components', 'geometry'],
      });
      acRef.current.addListener('place_changed', () => {
        const place = acRef.current.getPlace();
        if (!place.address_components) return;
        const parsed = parseComponents(place.address_components, 'legacy');
        onChange?.(parsed.street);
        onPlace?.({
          ...parsed,
          lat: place.geometry?.location?.lat(),
          lng: place.geometry?.location?.lng(),
        });
      });
    } catch {
      // Legacy Places API blocked — input still works for manual typing
    }
    return () => {
      window.google?.maps?.event?.clearInstanceListeners?.(acRef.current);
      acRef.current = null;
    };
  }, [mode, placesLib]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── New API mode ─────────────────────────────────────────────────────────────
  const fetchPreds = useCallback(async (input) => {
    if (!input?.trim() || input.length < 3) { setPreds([]); setOpen(false); return; }
    try {
      if (!sessionRef.current) {
        sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }
      const { suggestions } = await window.google.maps.places.AutocompleteSuggestion
        .fetchAutocompleteSuggestions({
          input,
          sessionToken:        sessionRef.current,
          includedPrimaryTypes: ['address'],
          includedRegionCodes:  ['us'],
        });
      setPreds(suggestions || []);
      setOpen((suggestions || []).length > 0);
    } catch {
      setPreds([]); setOpen(false);
    }
  }, []);

  async function selectPred(sugg) {
    setPreds([]); setOpen(false);
    try {
      const place = sugg.placePrediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'location'] });
      const parsed = parseComponents(place.addressComponents || [], 'new');
      const loc    = place.location;
      onChange?.(parsed.street);
      onPlace?.({ ...parsed, lat: loc?.lat(), lng: loc?.lng() });
      sessionRef.current = null; // new session after each selection
    } catch {
      // fetchFields failed — fall back to main text only
      const text = sugg.placePrediction?.mainText?.text || '';
      onChange?.(text);
    }
  }

  function handleChange(e) {
    onChange?.(e.target.value);
    if (mode === 'new') fetchPreds(e.target.value);
  }

  // Close dropdown when clicking outside
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
      {mode === 'new' && open && preds.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 9999, top: '100%', left: 0, right: 0,
          margin: '2px 0 0', padding: 0, listStyle: 'none',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', overflow: 'hidden',
        }}>
          {preds.map((s, i) => {
            const pred = s.placePrediction;
            return (
              <li
                key={i}
                onMouseDown={() => selectPred(s)}
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
                  {pred.mainText?.text ?? pred.text?.text}
                </span>
                {pred.secondaryText?.text && (
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>
                    {pred.secondaryText.text}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function parseComponents(components, apiVersion) {
  let streetNum = '', route = '', city = '', state = '', zip = '';
  for (const c of components) {
    const types     = c.types || [];
    const longText  = apiVersion === 'new' ? (c.longText  || c.long_name  || '') : (c.long_name  || '');
    const shortText = apiVersion === 'new' ? (c.shortText || c.short_name || '') : (c.short_name || '');
    const t = types[0];
    if (t === 'street_number')               streetNum = longText;
    if (t === 'route')                       route     = longText;
    if (t === 'locality')                    city      = longText;
    if (t === 'administrative_area_level_1') state     = shortText;
    if (t === 'postal_code')                 zip       = longText;
  }
  return { street: [streetNum, route].filter(Boolean).join(' '), city, state, zip };
}
