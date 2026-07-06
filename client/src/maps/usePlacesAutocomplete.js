import { useState, useCallback, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

// Programmatic autocomplete predictions — not widget-based.
// Use this when you need the prediction list separate from the input element
// (e.g. custom dropdown UIs, mobile flows).
//
// AddressAutocomplete.jsx uses the widget-based Autocomplete class instead.
//
// Usage:
//   const { predictions, loading, getPredictions, clearPredictions } = usePlacesAutocomplete();
//   await getPredictions('123 Main');   // triggers fetch, sets predictions
export function usePlacesAutocomplete({ country = 'us', types = ['address'] } = {}) {
  const placesLib = useMapsLibrary('places');
  const serviceRef = useRef(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);

  const getService = useCallback(() => {
    if (!placesLib) return null;
    if (!serviceRef.current) {
      serviceRef.current = new placesLib.AutocompleteService();
    }
    return serviceRef.current;
  }, [placesLib]);

  const getPredictions = useCallback((input) => {
    const svc = getService();
    if (!svc || !input?.trim()) {
      setPredictions([]);
      return Promise.resolve([]);
    }
    setLoading(true);
    return new Promise((resolve) => {
      svc.getPlacePredictions(
        { input, types, componentRestrictions: { country } },
        (results, status) => {
          setLoading(false);
          const preds = status === 'OK' ? results : [];
          setPredictions(preds);
          resolve(preds);
        },
      );
    });
  }, [getService, country, types]);

  const clearPredictions = useCallback(() => setPredictions([]), []);

  return {
    predictions,
    loading,
    getPredictions,
    clearPredictions,
    isReady: !!placesLib,
  };
}
