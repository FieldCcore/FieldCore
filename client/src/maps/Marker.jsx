import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

// Legacy google.maps.Marker wrapper — no mapId required, no marker library required.
// Pass `icon` as a data URI string for custom pin appearance.
export function Marker({ position, title, onClick, icon }) {
  const map = useMap();
  const markerRef  = useRef(null);
  const onClickRef = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; });

  useEffect(() => {
    if (!map || !window.google?.maps?.Marker) return;
    const marker = new window.google.maps.Marker({ position, map, title, icon });
    markerRef.current = marker;
    const listener = marker.addListener('click', () => onClickRef.current?.());
    return () => {
      listener.remove();
      marker.setMap(null);
      markerRef.current = null;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { markerRef.current?.setPosition(position); }, [position]);
  useEffect(() => { markerRef.current?.setIcon(icon ?? null); }, [icon]);
  useEffect(() => { markerRef.current?.setTitle(title ?? ''); }, [title]);

  return null;
}
