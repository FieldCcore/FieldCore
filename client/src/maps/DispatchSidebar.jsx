import { useDispatchKpiMetrics } from '../hooks/useDispatchKpiMetrics';
import DispatchSidebarKpiGrid from './DispatchSidebarKpiGrid';
import DispatchSidebarRail from './DispatchSidebarRail';
import DispatchTeamPanel from './DispatchTeamPanel';

// Panel-left-close icon (collapse)
function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }} aria-hidden="true">
      <path
        d="M1 3v10M6 4L2 8l4 4M11 4L7 8l4 4"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// Panel-left-open icon (expand)
function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }} aria-hidden="true">
      <path
        d="M15 3v10M5 4l4 4-4 4M10 4l4 4-4 4"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * DispatchSidebar
 *
 * Outer wrapper that renders the expanded sidebar (KPI grid + team panel)
 * or the collapsed 52px rail. The toggle button floats on the divider between
 * this sidebar and the map via position: absolute + right: -15px.
 *
 * Props:
 *   isCollapsed       — bool: current sidebar state
 *   isMobile          — bool: suppress toggle button and rail on mobile
 *   onToggle          — () => void
 *   onTransitionEnd   — () => void — triggers map resize after animation
 *   activeKpiKey      — string|null: highlighted KPI
 *   onKpiClick        — (key) => void
 *   onExpandToTeam    — () => void — expand + navigate Team tab
 *   onExpandToJobs    — () => void — expand + navigate Jobs tab
 *   panelFocus        — { tab, teamFilter?, jobFilter?, _nonce } | null
 *   ... (team panel props: techs, techLocs, jobs, sessions, loading, selectedItem, onSelectTech, onSelectJob)
 */
export default function DispatchSidebar({
  isCollapsed,
  isMobile,
  onToggle,
  onTransitionEnd,
  activeKpiKey,
  onKpiClick,
  onExpandToTeam,
  onExpandToJobs,
  panelFocus,
  techs,
  techLocs,
  jobs,
  sessions,
  loading,
  selectedItem,
  onSelectTech,
  onSelectJob,
}) {
  const { metrics, loading: kpiLoading } = useDispatchKpiMetrics();

  const showRail   = isCollapsed && !isMobile;
  const showToggle = !isMobile;

  return (
    <div
      id="dispatch-sidebar"
      className="dispatch-sidebar"
      onTransitionEnd={onTransitionEnd}
    >
      {/* Toggle button — mounted on the divider between sidebar and map */}
      {showToggle && (
        <button
          type="button"
          className="dispatch-sidebar-toggle"
          onClick={onToggle}
          aria-expanded={!isCollapsed}
          aria-controls="dispatch-sidebar"
          aria-label={isCollapsed ? 'Expand dispatch panel' : 'Collapse dispatch panel'}
          title={isCollapsed ? 'Expand dispatch panel' : 'Collapse dispatch panel'}
        >
          {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
        </button>
      )}

      {showRail ? (
        <DispatchSidebarRail
          metrics={metrics}
          activeKpiKey={activeKpiKey}
          onExpandToTeam={onExpandToTeam}
          onExpandToJobs={onExpandToJobs}
          onKpiClick={onKpiClick}
        />
      ) : (
        <>
          <DispatchSidebarKpiGrid
            metrics={metrics}
            loading={kpiLoading}
            activeKpiKey={activeKpiKey}
            onKpiClick={onKpiClick}
          />
          <DispatchTeamPanel
            techs={techs}
            techLocs={techLocs}
            jobs={jobs}
            sessions={sessions}
            loading={loading}
            selectedItem={selectedItem}
            onSelectTech={onSelectTech}
            onSelectJob={onSelectJob}
            panelFocus={panelFocus}
          />
        </>
      )}
    </div>
  );
}
