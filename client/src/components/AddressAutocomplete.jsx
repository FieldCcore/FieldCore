import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

// Priority order for the active API mode:
//   'new'    — AutocompleteSuggestion (Places API New)   ← most API keys today
//   'legacy' — AutocompleteService   (Places API Legacy) ← fallback
//   'plain'  — bare text input; backend geocodes on save ← last resort
//
// Autocomplete is UX-only. Backend geocodes on save regardless, so lat/lng
// from the frontend are a bonus, never a requirement.
export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className }) {
  const inputRef       = useRef(null);
  const attributionRef = useRef(null);  // hidden div — PlacesService needs HTMLDivElement, not <input>
  const sessionRef     = useRef(null);  // AutocompleteSessionToken (new API billing optimisation)
  const acServiceRef   = useRef(null);  // AutocompleteService instance (legacy mode only)

  const [preds, setPreds] = useState([]);
  const [open,  setOpen]  = useState(false);
  const [mode,  setMode]  = useState('loading');

  const placesLib = useMapsLibrary('places');

  // Determine mode and initialise any service instances once the library loads.
  // Always check placesLib (the importLibrary result), never window.google.maps.places —
  // dynamic imports don't reliably register on the global namespace.
  useEffect(() => {
    if (!placesLib) return;
    if (typeof placesLib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions === 'function') {
      setMode('new');
    } else if (typeof placesLib?.AutocompleteService === 'function') {
      try {
        acServiceRef.current = new placesLib.AutocompleteService();
        setMode('legacy');
      } catch {
        setMode('plain');
      }
    } else {
      setMode('plain');
    }
  }, [placesLib]);

  // ── New API predictions ────────────────────────────────────────────────────
  // placesLib is in deps so this callback is recreated when the library resolves
  // from null — otherwise it captures a stale null reference.
  const fetchNew = useCallback(async (input) => {
    if (!placesLib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) return;
    try {
      if (!sessionRef.current && typeof placesLib.AutocompleteSessionToken === 'function') {
        sessionRef.current = new placesLib.AutocompleteSessionToken();
      }
      const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedPrimaryTypes: ['address'],
        includedRegionCodes:  ['us'],
        ...(sessionRef.current ? { sessionToken: sessionRef.current } : {}),
      });
      setPreds(suggestions || []);
      setOpen((suggestions || []).length > 0);
    } catch {
      setPreds([]); setOpen(false);
    }
  }, [placesLib]);

  // ── Legacy API predictions ─────────────────────────────────────────────────
  const fetchLegacy = useCallback((input) => {
    if (!acServiceRef.current) return;
    acServiceRef.current.getPlacePredictions(
      { input, types: ['address'], componentRestrictions: { country: 'us' } },
      (results, status) => {
        if (status === 'OK' && results?.length) { setPreds(results); setOpen(true); }
        else { setPreds([]); setOpen(false); }
      }
    );
  }, []);

  function fetchPreds(input) {
    if (!input?.trim() || input.length < 3) { setPreds([]); setOpen(false); return; }
    if (mode === 'new')    fetchNew(input);
    if (mode === 'legacy') fetchLegacy(input);
  }

  // ── New API: select a prediction ───────────────────────────────────────────
  async function selectNew(sugg) {
    setPreds([]); setOpen(false);
    const fallback = sugg.placePrediction?.mainText?.text || sugg.placePrediction?.text?.text || '';
    try {
      const place = sugg.placePrediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'location'] });
      const parsed = parseComponents(place.addressComponents || [], 'new');
      const loc    = place.location;
      onChange?.(parsed.street || fallback);
      onPlace?.({
        ...parsed,
        lat:      loc?.lat() ?? null,
        lng:      loc?.lng() ?? null,
        place_id: sugg.placePrediction.placeId ?? null,
      });
      sessionRef.current = null; // reset after each selection to start fresh billing session
    } catch {
      // fetchFields failed — text is enough; backend geocodes on save
      onChange?.(fallback);
      onPlace?.({ street: fallback, city: '', state: '', zip: '', lat: null, lng: null, place_id: null });
    }
  }

  // ── Legacy API: select a prediction ───────────────────────────────────────
  function selectLegacy(pred) {
    setPreds([]); setOpen(false);
    const description = pred.description || '';
    if (!placesLib || !attributionRef.current) {
      onChange?.(description);
      onPlace?.({ street: description, city: '', state: '', zip: '', lat: null, lng: null, place_id: pred.place_id ?? null });
      return;
    }
    try {
      const svc = new placesLib.PlacesService(attributionRef.current);
      svc.getDetails(
        { placeId: pred.place_id, fields: ['address_components', 'geometry'] },
        (place, status) => {
          if (status === 'OK' && place) {
            const parsed = parseComponents(place.address_components || [], 'legacy');
            onChange?.(parsed.street || description);
            onPlace?.({ ...parsed, lat: place.geometry?.location?.lat() ?? null,
              lng: place.geometry?.location?.lng() ?? null, place_id: pred.place_id ?? null });
          } else {
            onChange?.(description);
            onPlace?.({ street: description, city: '', state: '', zip: '', lat: null, lng: null, place_id: pred.place_id ?? null });
          }
        }
      );
    } catch {
      onChange?.(description);
      onPlace?.({ street: description, city: '', state: '', zip: '', lat: null, lng: null, place_id: pred.place_id ?? null });
    }
  }

  function selectPred(pred) {
    if (mode === 'new') selectNew(pred);
    else                selectLegacy(pred);
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

  // Extract display text from whichever API format the prediction came in as
  function predMain(pred) {
    if (mode === 'new') return pred.placePrediction?.mainText?.text ?? pred.placePrediction?.text?.text ?? '';
    return pred.structured_formatting?.main_text ?? pred.description ?? '';
  }
  function predSecondary(pred) {
    if (mode === 'new') return pred.placePrediction?.secondaryText?.text ?? '';
    return pred.structured_formatting?.secondary_text ?? '';
  }
  function predKey(pred, i) {
    if (mode === 'new') return pred.placePrediction?.placeId ?? i;
    return pred.place_id ?? i;
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Required by PlacesService (legacy) — must be an HTMLDivElement, not the <input> */}
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
              key={predKey(p, i)}
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
              <span style={{ fontWeight: 500, color: '#1C2333' }}>{predMain(p)}</span>
              {predSecondary(p) && (
                <span style={{ color: '#94a3b8', fontSize: 12 }}>{predSecondary(p)}</span>
              )}
            </li>
          ))}
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
