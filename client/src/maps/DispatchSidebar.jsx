import { useDispatchKpiMetrics } from '../hooks/useDispatchKpiMetrics';
import DispatchSidebarKpiGrid from './DispatchSidebarKpiGrid';
import DispatchCompactRail from './DispatchCompactRail';
import DispatchTeamPanel from './DispatchTeamPanel';
import DispatchDateControl from './DispatchDateControl';

// Panel-left-close: two chevrons pointing left + vertical bar
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

// Panel-left-open: two chevrons pointing right + vertical bar
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
 * Three modes: "expanded" (280px) | "compact" (76px, labeled rail) | "full_map" (0px, hidden).
 *
 * The toggle button sits on the divider (position:absolute right:-15px) and switches
 * between expanded ↔ compact only. Full Map is a separate action inside the compact rail.
 *
 * No title attributes on any interactive element — visible labels and aria-label are
 * used instead to prevent browser native tooltip popups.
 */
export default function DispatchSidebar({
  mode,             // 'expanded' | 'compact' | 'full_map'
  isMobile,
  onToggle,         // toggleExpandedCompact
  onEnterFullMap,
  onTransitionEnd,
  activeKpiKey,
  onKpiClick,
  onExpandToTeam,
  onExpandToJobs,
  activeTab,        // 'team' | 'jobs' — for compact rail active state
  panelFocus,
  techs,
  techLocs,
  jobs,
  sessions,
  loading,
  selectedItem,
  onSelectTech,
  onSelectJob,
  dispatchDate,     // 'YYYY-MM-DD' or null (null = today)
  onDateChange,     // (date: string|null) => void
  timezone,
}) {
  const { metrics, loading: kpiLoading } = useDispatchKpiMetrics(dispatchDate);

  const isExpanded = mode === 'expanded';
  const isCompact  = mode === 'compact';
  const isFullMap  = mode === 'full_map';
  const showToggle = !isMobile && !isFullMap;

  return (
    <div
      id="dispatch-sidebar"
      className={`dispatch-sidebar${isFullMap ? ' dispatch-sidebar--full-map' : ''}`}
      onTransitionEnd={onTransitionEnd}
    >
      {/* Toggle: expanded→compact or compact→expanded. No title attribute. */}
      {showToggle && (
        <button
          type="button"
          className="dispatch-sidebar-toggle"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls="dispatch-sidebar"
          aria-label={isExpanded ? 'Collapse dispatch panel' : 'Expand dispatch panel'}
        >
          {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}

      {/* Compact labeled rail */}
      {isCompact && !isMobile && (
        <DispatchCompactRail
          metrics={metrics}
          activeKpiKey={activeKpiKey}
          activeTab={activeTab}
          onExpandToTeam={onExpandToTeam}
          onExpandToJobs={onExpandToJobs}
          onKpiClick={onKpiClick}
          onEnterFullMap={onEnterFullMap}
        />
      )}

      {/* Expanded content: KPI grid + date control + team/jobs panel */}
      {(isExpanded || isMobile) && (
        <>
          <DispatchSidebarKpiGrid
            metrics={metrics}
            loading={kpiLoading}
            activeKpiKey={activeKpiKey}
            onKpiClick={onKpiClick}
            onEnterFullMap={onEnterFullMap}
          />
          <DispatchDateControl
            date={dispatchDate}
            onDateChange={onDateChange}
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
            timezone={timezone}
          />
        </>
      )}
    </div>
  );
}
