import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

const DEV = import.meta.env.DEV;

// Address autocomplete that works with Places API (New).
//
// Mode selection uses placesLib (the importLibrary result), NOT window.google.maps.places.
// window.google.maps.places is NOT guaranteed to reflect dynamic imports; placesLib IS.
//
// Priority:
//   'new'    — placesLib.AutocompleteSuggestion  (Places API New)
//   'legacy' — placesLib.Autocomplete widget     (Places API Legacy)
//   'plain'  — bare text input; backend geocodes on save
//
// Manual typing always works regardless of mode.
export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className }) {
  const inputRef   = useRef(null);
  const acRef      = useRef(null);   // legacy Autocomplete instance
  const sessionRef = useRef(null);   // new-API session token

  const [preds, setPreds] = useState([]);
  const [open,  setOpen]  = useState(false);

  const placesLib = useMapsLibrary('places');

  // Detect using placesLib, not window.google.maps.places
  const mode = !placesLib
    ? 'loading'
    : typeof placesLib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions === 'function'
      ? 'new'
      : typeof placesLib?.Autocomplete === 'function'
        ? 'legacy'
        : 'plain';

  // Log mode transitions in dev so it's easy to see which API is active
  const prevModeRef = useRef('loading');
  useEffect(() => {
    if (mode !== prevModeRef.current) {
      prevModeRef.current = mode;
      if (DEV) {
        // eslint-disable-next-line no-console
        console.log('[AddressAutocomplete] mode →', mode,
          '| AutocompleteSuggestion:', !!placesLib?.AutocompleteSuggestion,
          '| Autocomplete widget:', !!placesLib?.Autocomplete);
      }
    }
  });

  // ── Legacy mode ───────────────────────────────────────────────────────────────
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
        if (DEV) console.log('[AddressAutocomplete] legacy place_changed →', parsed); // eslint-disable-line no-console
        onChange?.(parsed.street);
        onPlace?.({
          ...parsed,
          lat:      place.geometry?.location?.lat() ?? null,
          lng:      place.geometry?.location?.lng() ?? null,
          place_id: place.place_id ?? null,
        });
      });
    } catch (err) {
      if (DEV) console.warn('[AddressAutocomplete] legacy init failed:', err.message); // eslint-disable-line no-console
    }
    return () => {
      window.google?.maps?.event?.clearInstanceListeners?.(acRef.current);
      acRef.current = null;
    };
  }, [mode, placesLib]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── New API mode ─────────────────────────────────────────────────────────────
  // placesLib is in the deps array so the callback is recreated once the library
  // loads and never runs with a stale null reference.
  const fetchPreds = useCallback(async (input) => {
    if (!input?.trim() || input.length < 3) { setPreds([]); setOpen(false); return; }
    if (!placesLib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      if (DEV) console.warn('[AddressAutocomplete] fetchPreds: AutocompleteSuggestion not available'); // eslint-disable-line no-console
      return;
    }
    try {
      // Session token reduces billing cost; skip gracefully if constructor is absent
      if (!sessionRef.current && typeof placesLib.AutocompleteSessionToken === 'function') {
        sessionRef.current = new placesLib.AutocompleteSessionToken();
      }
      const req = {
        input,
        includedPrimaryTypes: ['address'],
        includedRegionCodes:  ['us'],
        ...(sessionRef.current ? { sessionToken: sessionRef.current } : {}),
      };
      const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
      if (DEV) console.log('[AddressAutocomplete] suggestions count:', suggestions?.length ?? 0); // eslint-disable-line no-console
      setPreds(suggestions || []);
      setOpen((suggestions || []).length > 0);
    } catch (err) {
      if (DEV) console.warn('[AddressAutocomplete] fetchAutocompleteSuggestions failed:', err.message); // eslint-disable-line no-console
      setPreds([]); setOpen(false);
    }
  }, [placesLib]); // recreated when placesLib resolves from null

  async function selectPred(sugg) {
    setPreds([]); setOpen(false);
    try {
      const place = sugg.placePrediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'location'] });
      const parsed  = parseComponents(place.addressComponents || [], 'new');
      const loc     = place.location;
      const placeId = sugg.placePrediction.placeId ?? null;
      if (DEV) { // eslint-disable-next-line no-console
        console.log('[AddressAutocomplete] selectPred →', parsed, '| lat:', loc?.lat(), 'lng:', loc?.lng());
      }
      onChange?.(parsed.street);
      onPlace?.({ ...parsed, lat: loc?.lat() ?? null, lng: loc?.lng() ?? null, place_id: placeId });
      sessionRef.current = null; // reset after each selection
    } catch (err) {
      if (DEV) console.warn('[AddressAutocomplete] fetchFields failed:', err.message); // eslint-disable-line no-console
      const text = sugg.placePrediction?.mainText?.text || '';
      onChange?.(text);
    }
  }

  function handleChange(e) {
    onChange?.(e.target.value);
    if (mode === 'new') fetchPreds(e.target.value);
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
                onMouseEnter={e  => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e  => e.currentTarget.style.background = '#fff'}
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
