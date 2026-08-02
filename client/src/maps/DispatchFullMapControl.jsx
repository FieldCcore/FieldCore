// Floating "Open Panel" button shown when sidebar is in full_map mode.
// Positioned top-left of the map stage to avoid overlapping top-right map controls.

function PanelOpenIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16, flexShrink: 0 }} aria-hidden="true">
      <path
        d="M15 3v10M5 4l4 4-4 4M10 4l4 4-4 4"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DispatchFullMapControl({ onOpen }) {
  return (
    <div className="dispatch-fullmap-control">
      <button
        type="button"
        className="dispatch-fullmap-btn"
        onClick={onOpen}
        aria-label="Open dispatch panel"
      >
        <PanelOpenIcon />
        <span>Open Panel</span>
      </button>
    </div>
  );
}
