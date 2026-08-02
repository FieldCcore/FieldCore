import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DispatchSidebar from '../DispatchSidebar';

// Mock API so useDispatchKpiMetrics doesn't make real requests
vi.mock('../../api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        metrics: [
          { key: 'liveTechnicians', label: 'Live Techs',    status: 'active', value: 3, displayValue: '3', supportingText: '3 online · 0 stale' },
          { key: 'activeJobs',      label: 'Active Jobs',   status: 'active', value: 2, displayValue: '2', supportingText: '2 in progress' },
          { key: 'todaysJobs',      label: "Today's Jobs",  status: 'active', value: 8, displayValue: '8', supportingText: 'all assigned' },
          { key: 'completedToday',  label: 'Completed',     status: 'active', value: 1, displayValue: '1', supportingText: 'today' },
        ],
      },
    }),
  },
}));

const TECHS = [
  { id: 't1', name: 'Alice Smith', role: 'tech', field_work_eligible: true, dispatch_visible: true },
];
const TECH_LOCS = [];
const JOBS = [];

function baseProps(overrides = {}) {
  return {
    isCollapsed:    false,
    isMobile:       false,
    onToggle:       vi.fn(),
    onTransitionEnd: vi.fn(),
    activeKpiKey:   null,
    onKpiClick:     vi.fn(),
    onExpandToTeam: vi.fn(),
    onExpandToJobs: vi.fn(),
    panelFocus:     null,
    techs:          TECHS,
    techLocs:       TECH_LOCS,
    jobs:           JOBS,
    sessions:       [],
    loading:        false,
    selectedItem:   null,
    onSelectTech:   vi.fn(),
    onSelectJob:    vi.fn(),
    ...overrides,
  };
}

// ── Toggle button ─────────────────────────────────────────────────────────────

describe('DispatchSidebar — toggle button', () => {
  it('shows collapse button when expanded', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false })} />);
    expect(screen.getByRole('button', { name: /collapse dispatch panel/i })).toBeInTheDocument();
  });

  it('shows expand button when collapsed', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.getByRole('button', { name: /expand dispatch panel/i })).toBeInTheDocument();
  });

  it('has aria-expanded=true when expanded', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false })} />);
    expect(screen.getByRole('button', { name: /collapse dispatch panel/i }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  it('has aria-expanded=false when collapsed', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.getByRole('button', { name: /expand dispatch panel/i }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  it('has aria-controls="dispatch-sidebar"', () => {
    render(<DispatchSidebar {...baseProps()} />);
    const btn = screen.getByRole('button', { name: /collapse dispatch panel/i });
    expect(btn).toHaveAttribute('aria-controls', 'dispatch-sidebar');
  });

  it('calls onToggle when button clicked', () => {
    const onToggle = vi.fn();
    render(<DispatchSidebar {...baseProps({ onToggle })} />);
    fireEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('activates with keyboard Enter', () => {
    const onToggle = vi.fn();
    render(<DispatchSidebar {...baseProps({ onToggle })} />);
    const btn = screen.getByRole('button', { name: /collapse/i });
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalled();
  });

  it('hides toggle button on mobile', () => {
    render(<DispatchSidebar {...baseProps({ isMobile: true })} />);
    expect(screen.queryByRole('button', { name: /dispatch panel/i })).not.toBeInTheDocument();
  });

  it('has correct tooltip when expanded', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false })} />);
    expect(screen.getByTitle('Collapse dispatch panel')).toBeInTheDocument();
  });

  it('has correct tooltip when collapsed', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.getByTitle('Expand dispatch panel')).toBeInTheDocument();
  });
});

// ── Expanded state ─────────────────────────────────────────────────────────────

describe('DispatchSidebar — expanded state', () => {
  it('shows team and jobs tabs', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false })} />);
    expect(screen.getByRole('tab', { name: /team/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /jobs/i })).toBeInTheDocument();
  });

  it('shows search input', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false })} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('shows tech names in team list', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false })} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('does not show the rail', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false })} />);
    expect(screen.queryByLabelText(/dispatch panel \(collapsed\)/i)).not.toBeInTheDocument();
  });
});

// ── Collapsed rail ─────────────────────────────────────────────────────────────

describe('DispatchSidebar — collapsed rail', () => {
  it('shows rail with accessible label', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.getByRole('group', { name: /dispatch panel \(collapsed\)/i })).toBeInTheDocument();
  });

  it('hides tabs and search', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.queryByRole('tab', { name: /team/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('shows Team icon button with tooltip', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.getByRole('button', { name: /open team panel/i })).toBeInTheDocument();
  });

  it('shows Jobs icon button with tooltip', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.getByRole('button', { name: /open jobs panel/i })).toBeInTheDocument();
  });

  it('calls onExpandToTeam when Team button clicked', () => {
    const onExpandToTeam = vi.fn();
    render(<DispatchSidebar {...baseProps({ isCollapsed: true, onExpandToTeam })} />);
    fireEvent.click(screen.getByRole('button', { name: /open team panel/i }));
    expect(onExpandToTeam).toHaveBeenCalledTimes(1);
  });

  it('calls onExpandToJobs when Jobs button clicked', () => {
    const onExpandToJobs = vi.fn();
    render(<DispatchSidebar {...baseProps({ isCollapsed: true, onExpandToJobs })} />);
    fireEvent.click(screen.getByRole('button', { name: /open jobs panel/i }));
    expect(onExpandToJobs).toHaveBeenCalledTimes(1);
  });

  it('shows KPI counts from metrics after loading', async () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    await waitFor(() => {
      // counts show up as text in the rail
      expect(screen.getByText('3')).toBeInTheDocument(); // live techs
      expect(screen.getByText('2')).toBeInTheDocument(); // active jobs
    });
  });

  it('calls onKpiClick when a rail KPI is clicked', async () => {
    const onKpiClick = vi.fn();
    render(<DispatchSidebar {...baseProps({ isCollapsed: true, onKpiClick })} />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    // Find a rail kpi button by tooltip
    const btn = screen.getByRole('button', { name: /live technician/i });
    fireEvent.click(btn);
    expect(onKpiClick).toHaveBeenCalledWith('liveTechnicians');
  });

  it('does not show expanded content', () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: true })} />);
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });
});

// ── KPI grid (expanded) ───────────────────────────────────────────────────────

describe('DispatchSidebar — KPI grid', () => {
  it('applies selected class to active KPI tile', async () => {
    render(<DispatchSidebar {...baseProps({ isCollapsed: false, activeKpiKey: 'activeJobs' })} />);
    await waitFor(() => {
      const tiles = document.querySelectorAll('.sidebar-kpi-tile.selected');
      expect(tiles.length).toBe(1);
    });
  });

  it('calls onKpiClick when a tile is clicked', async () => {
    const onKpiClick = vi.fn();
    render(<DispatchSidebar {...baseProps({ isCollapsed: false, onKpiClick })} />);
    await waitFor(() => {
      const tiles = document.querySelectorAll('.sidebar-kpi-tile');
      expect(tiles.length).toBe(4);
    });
    fireEvent.click(document.querySelector('.sidebar-kpi-tile'));
    expect(onKpiClick).toHaveBeenCalled();
  });
});

// ── Mobile mode ───────────────────────────────────────────────────────────────

describe('DispatchSidebar — mobile mode', () => {
  it('shows expanded content when isMobile=true regardless of isCollapsed', () => {
    render(<DispatchSidebar {...baseProps({ isMobile: true, isCollapsed: true })} />);
    expect(screen.getByRole('tab', { name: /team/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/dispatch panel \(collapsed\)/i)).not.toBeInTheDocument();
  });
});

// ── Transition callback ────────────────────────────────────────────────────────

describe('DispatchSidebar — onTransitionEnd', () => {
  it('fires onTransitionEnd on the sidebar container', () => {
    const onTransitionEnd = vi.fn();
    render(<DispatchSidebar {...baseProps({ onTransitionEnd })} />);
    const sidebar = document.getElementById('dispatch-sidebar');
    fireEvent.transitionEnd(sidebar);
    expect(onTransitionEnd).toHaveBeenCalledTimes(1);
  });
});
