// Singleton Google Maps script loader.
// Returns a Promise that resolves to window.google.maps once the API is ready.
// Subsequent calls return the same Promise — never injects a duplicate script.

let _promise = null;

export function loadGoogleMaps() {
  // Fast path — API already available (vis.gl or a prior load beat us)
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  // In-progress load — reuse the existing promise
  if (_promise) return _promise;

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();

  if (!apiKey) {
    return Promise.reject(new Error('GOOGLE_MAPS_API_KEY_MISSING'));
  }

  _promise = new Promise((resolve, reject) => {
    // Reuse any Maps script already in the DOM (including vis.gl's injection)
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');

    if (existing) {
      // Script tag exists but Maps API not yet initialised — wait for load
      if (window.google?.maps?.Map) { resolve(window.google.maps); return; }
      existing.addEventListener('load', () => {
        window.google?.maps?.Map
          ? resolve(window.google.maps)
          : reject(new Error('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_API'));
      }, { once: true });
      existing.addEventListener('error',
        () => reject(new Error('GOOGLE_MAPS_SCRIPT_FAILED')),
        { once: true });
      return;
    }

    // Inject a new script tag
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.fieldcoreGoogleMaps = 'true';

    script.onload = () => {
      window.google?.maps?.Map
        ? resolve(window.google.maps)
        : reject(new Error('GOOGLE_MAPS_SCRIPT_LOADED_WITHOUT_API'));
    };
    script.onerror = () => reject(new Error('GOOGLE_MAPS_SCRIPT_FAILED'));

    document.head.appendChild(script);
  });

  return _promise;
}

// For tests only — resets module state so each test gets a fresh loader.
export function _resetLoader() {
  _promise = null;
}
