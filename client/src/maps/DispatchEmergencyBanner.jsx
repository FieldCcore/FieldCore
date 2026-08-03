/**
 * DispatchEmergencyBanner
 *
 * Shown as a fixed overlay at the top of the map area when emergency dispatch
 * mode is active. Renders nothing when inactive.
 *
 * Props:
 *   active      — boolean
 *   toggling    — boolean (toggle in-flight)
 *   onToggle    — () => void
 *   userRole    — 'owner' | 'manager' | 'tech' (only owners/managers see the toggle)
 */
export default function DispatchEmergencyBanner({ active, toggling, onToggle, userRole }) {
  if (!active) return null;

  const canToggle = userRole === 'owner' || userRole === 'manager';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 25, display: 'flex', alignItems: 'center', gap: 10,
        background: '#DC2626', color: '#fff',
        padding: '6px 14px 6px 10px', borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        fontSize: 11, fontWeight: 700,
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}
    >
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: '#fff', animation: 'pulse 1.2s ease-in-out infinite',
        flexShrink: 0,
      }} aria-hidden="true" />
      EMERGENCY DISPATCH ACTIVE — Warnings bypassed
      {canToggle && (
        <button
          type="button"
          onClick={onToggle}
          disabled={toggling}
          style={{
            marginLeft: 8, padding: '2px 10px', borderRadius: 4,
            border: '1.5px solid rgba(255,255,255,0.7)',
            background: 'transparent', color: '#fff',
            fontSize: 10, fontWeight: 700, cursor: toggling ? 'not-allowed' : 'pointer',
            opacity: toggling ? 0.6 : 1,
          }}
        >
          {toggling ? '…' : 'Deactivate'}
        </button>
      )}
    </div>
  );
}
