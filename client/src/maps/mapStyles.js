// FieldCore brand palette applied to Google Maps
// Removes POI clutter, warms the road/landscape tones, mutes labels to match the UI.
export const FIELDCORE_MAP_STYLES = [
  { featureType: 'poi',               elementType: 'labels',             stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business',      elementType: 'all',                stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',          elementType: 'labels.text',        stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',           elementType: 'labels.icon',        stylers: [{ visibility: 'off' }] },
  { featureType: 'road',              elementType: 'geometry',           stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway',      elementType: 'geometry',           stylers: [{ color: '#f0ece5' }] },
  { featureType: 'road.highway',      elementType: 'geometry.stroke',    stylers: [{ color: '#e0dbd2' }] },
  { featureType: 'road',              elementType: 'labels.text.fill',   stylers: [{ color: '#8a90a2' }] },
  { featureType: 'water',             elementType: 'geometry',           stylers: [{ color: '#c9d8e8' }] },
  { featureType: 'landscape',         elementType: 'geometry',           stylers: [{ color: '#f5f3ef' }] },
  { featureType: 'landscape.man_made',elementType: 'geometry',           stylers: [{ color: '#edebe7' }] },
  { featureType: 'administrative',    elementType: 'labels.text.fill',   stylers: [{ color: '#5f667a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#1c2333' }] },
];

// Cloud Map ID — required for AdvancedMarker in production.
// Set VITE_GOOGLE_MAPS_MAP_ID in Vercel to your Cloud Console Map ID.
// When null, GoogleMap falls back to legacy styles (no AdvancedMarker).
export const FIELDCORE_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || null;
