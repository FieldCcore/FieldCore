// Browser-specific instructions for enabling geolocation.
// Detection is for instructional wording only — we never attempt to
// programmatically change browser or OS settings.

function detectBrowser() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad/i.test(ua) && !/Chrome/i.test(ua)) return 'ios';
  if (/Android/i.test(ua) && !/Chrome/i.test(ua))     return 'android_firefox';
  if (/Android/i.test(ua))                             return 'android';
  if (/Edg\//i.test(ua))                              return 'edge';
  if (/Chrome\//i.test(ua))                           return 'chrome';
  if (/Firefox\//i.test(ua))                          return 'firefox';
  if (/Safari\//i.test(ua))                           return 'safari';
  return 'other';
}

const INSTRUCTIONS = {
  chrome: {
    name: 'Chrome',
    steps: [
      'Select the lock icon (🔒) in the address bar.',
      'Select "Site settings".',
      'Find "Location" and change it to "Allow".',
      'Refresh FieldCore.',
    ],
  },
  edge: {
    name: 'Edge',
    steps: [
      'Select the lock icon beside the website address.',
      'Open "Permissions for this site".',
      'Set "Location" to "Allow".',
      'Refresh FieldCore.',
    ],
  },
  safari: {
    name: 'Safari',
    steps: [
      'Open Safari → Settings (gear icon).',
      'Select "Privacy & Security" → "Location Services".',
      'Find FieldCore and set it to "Allow".',
      'Return to FieldCore and refresh.',
    ],
  },
  ios: {
    name: 'Safari on iOS',
    steps: [
      'Open iPhone Settings → Privacy & Security → Location Services.',
      'Find Safari Websites → set to "While Using".',
      'Return to FieldCore in Safari and refresh.',
    ],
  },
  android: {
    name: 'Chrome on Android',
    steps: [
      'Tap the lock icon in Chrome\'s address bar.',
      'Tap "Permissions" → "Location".',
      'Choose "Allow".',
      'Refresh FieldCore.',
    ],
  },
  android_firefox: {
    name: 'Firefox on Android',
    steps: [
      'Tap the lock icon beside the address.',
      'Tap "Edit Site Settings".',
      'Enable "Location" → tap "Clear & Reset".',
      'Refresh FieldCore and allow when prompted.',
    ],
  },
  firefox: {
    name: 'Firefox',
    steps: [
      'Click the lock icon in the address bar.',
      'Click "Connection secure" → "More information".',
      'Open the "Permissions" tab.',
      'Find "Access Your Location" → remove the "Block" setting.',
      'Refresh FieldCore.',
    ],
  },
  other: {
    name: 'Your browser',
    steps: [
      'Open your browser settings.',
      'Find "Privacy" or "Site permissions".',
      'Look for "Location" and allow access for FieldCore.',
      'Refresh FieldCore.',
    ],
  },
};

const OVERLAY = {
  position:       'fixed',
  inset:          0,
  background:     'rgba(28,35,51,.55)',
  zIndex:         1000,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        16,
};

const CARD = {
  background:   '#fff',
  borderRadius: 12,
  padding:      '24px 24px 20px',
  maxWidth:     420,
  width:        '100%',
  boxShadow:    '0 8px 32px rgba(0,0,0,.20)',
};

export default function LocationInstructionsModal({ onClose }) {
  const browser = detectBrowser();
  const info    = INSTRUCTIONS[browser] || INSTRUCTIONS.other;

  return (
    <div style={OVERLAY} onClick={onClose} role="dialog" aria-modal="true" aria-label="Location access instructions">
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <svg viewBox="0 0 20 20" fill="none" style={{ width: 22, height: 22, flexShrink: 0 }}>
            <circle cx="10" cy="10" r="9" stroke="#1C2333" strokeWidth="1.5" />
            <path d="M10 6v4M10 14h.01" stroke="#1C2333" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1C2333' }}>
            Enable Location in {info.name}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close instructions"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20,
                     lineHeight: 1, cursor: 'pointer', color: '#8A90A2', padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#5F667A', marginBottom: 14, lineHeight: 1.55 }}>
          FieldCore cannot change browser settings on your behalf. Follow these steps, then
          return to FieldCore and click <strong>Try Again</strong>.
        </p>

        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {info.steps.map((s, i) => (
            <li key={i} style={{ fontSize: 13, color: '#1C2333', lineHeight: 1.5 }}>{s}</li>
          ))}
        </ol>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 18px', background: '#1C2333', color: '#fff', border: 'none',
                     borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
