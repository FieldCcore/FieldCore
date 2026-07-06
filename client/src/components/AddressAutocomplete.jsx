import { useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

// Uses the Places library loaded by MapProvider (App.jsx root).
// Gracefully no-ops when the API key is absent or the library hasn't loaded yet.
export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className }) {
  const inputRef  = useRef(null);
  const acRef     = useRef(null);
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !inputRef.current || acRef.current) return;

    acRef.current = new placesLib.Autocomplete(inputRef.current, {
      types:                ['address'],
      componentRestrictions: { country: 'us' },
      fields:               ['address_components', 'geometry'],
    });

    acRef.current.addListener('place_changed', () => {
      const place = acRef.current.getPlace();
      if (!place.address_components) return;

      let streetNum = '', route = '', city = '', state = '', zip = '';
      for (const c of place.address_components) {
        const t = c.types[0];
        if (t === 'street_number')               streetNum = c.long_name;
        if (t === 'route')                       route     = c.long_name;
        if (t === 'locality')                    city      = c.long_name;
        if (t === 'administrative_area_level_1') state     = c.short_name;
        if (t === 'postal_code')                 zip       = c.long_name;
      }
      const street = [streetNum, route].filter(Boolean).join(' ');
      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();

      onChange?.(street);
      onPlace?.({ street, city, state, zip, lat, lng });
    });

    return () => {
      if (acRef.current) {
        window.google?.maps?.event?.clearInstanceListeners?.(acRef.current);
        acRef.current = null;
      }
    };
  }, [placesLib]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder || 'Street address'}
      style={style}
      className={className}
      autoComplete="off"
    />
  );
}
