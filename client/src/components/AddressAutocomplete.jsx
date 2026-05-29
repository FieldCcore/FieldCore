import { useEffect, useRef } from 'react';

const SCRIPT_ID = 'gm-places-script';

function loadScript(apiKey, cb) {
  if (window.google?.maps?.places) { cb(); return; }
  if (document.getElementById(SCRIPT_ID)) {
    document.getElementById(SCRIPT_ID).addEventListener('load', cb, { once: true });
    return;
  }
  const s = document.createElement('script');
  s.id = SCRIPT_ID;
  s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
  s.async = true;
  s.defer = true;
  s.addEventListener('load', cb, { once: true });
  document.head.appendChild(s);
}

export default function AddressAutocomplete({ value, onChange, onPlace, placeholder, style, className }) {
  const inputRef = useRef(null);
  const acRef    = useRef(null);
  const apiKey   = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) return;

    function attach() {
      if (!inputRef.current || acRef.current) return;
      acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
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
          if (t === 'street_number')              streetNum = c.long_name;
          if (t === 'route')                      route     = c.long_name;
          if (t === 'locality')                   city      = c.long_name;
          if (t === 'administrative_area_level_1') state    = c.short_name;
          if (t === 'postal_code')                zip       = c.long_name;
        }
        const street = [streetNum, route].filter(Boolean).join(' ');
        const lat    = place.geometry?.location?.lat();
        const lng    = place.geometry?.location?.lng();

        onChange?.(street);
        onPlace?.({ street, city, state, zip, lat, lng });
      });
    }

    loadScript(apiKey, attach);

    return () => {
      if (acRef.current) {
        window.google?.maps?.event?.clearInstanceListeners?.(acRef.current);
        acRef.current = null;
      }
    };
  }, [apiKey]);

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
