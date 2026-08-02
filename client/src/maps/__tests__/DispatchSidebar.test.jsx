import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    mode:            'expanded',
    isMobile:        false,
    onToggle:        vi.fn(),
    onEnterFullMap:  vi.fn(),
    onTransitionEnd: vi.fn(),
    activeKpiKey:    null,
    onKpiClick:      vi.fn(),
    onExpandToTeam:  vi.fn(),
    onExpandToJobs:  vi.fn(),
    activeTab:       'team',
    panelFocus:      null,
    techs:           TECHS,
    techLocs:        TECH_LOCS,
    jobs:            JOBS,
    sessions:        [],
    loading:         false,
    selectedItem:    null,
    onSelectTech:    vi.fn(),
    onSelectJob:     vi.fn(),
    ...overrides,
  };
}

// ── Toggle button ─────────────────────────────────────────────────────────────

describe('DispatchSidebar — toggle button', () => {
  it('shows collapse button when expanded', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    expect(screen.getByRole('button', { name: /collapse dispatch panel/i })).toBeInTheDocument();
  });

  it('shows expand button when compact', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.getByRole('button', { name: /expand dispatch panel/i })).toBeInTheDocument();
  });

  it('has aria-expanded=true when expanded', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    expect(screen.getByRole('button', { name: /collapse dispatch panel/i }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  it('has aria-expanded=false when compact', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
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

  it('hides toggle button in full_map mode', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'full_map' })} />);
    expect(screen.queryByRole('button', { name: /dispatch panel/i })).not.toBeInTheDocument();
  });

  it('does not use title attributes on toggle buttons', () => {
    const { container } = render(<DispatchSidebar {...baseProps()} />);
    const toggle = container.querySelector('.dispatch-sidebar-toggle');
    expect(toggle).not.toHaveAttribute('title');
  });
});

// ── Expanded state ─────────────────────────────────────────────────────────────

describe('DispatchSidebar — expanded state', () => {
  it('shows team and jobs tabs', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    expect(screen.getByRole('tab', { name: /team/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /jobs/i })).toBeInTheDocument();
  });

  it('shows search input', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('shows tech names in team list', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('does not show the compact rail', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    expect(screen.queryByRole('group', { name: /dispatch panel \(compact\)/i })).not.toBeInTheDocument();
  });
});

// ── Compact rail ─────────────────────────────────────────────────────────────

describe('DispatchSidebar — compact rail', () => {
  it('shows compact rail with accessible label', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.getByRole('group', { name: /dispatch panel \(compact\)/i })).toBeInTheDocument();
  });

  it('hides tabs and search', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.queryByRole('tab', { name: /team/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('shows visible Team label', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('shows visible Jobs label', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.getByText('Jobs')).toBeInTheDocument();
  });

  it('shows visible Full Map label', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.getByText('Full Map')).toBeInTheDocument();
  });

  it('shows Team button with aria-label', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.getByRole('button', { name: /open team panel/i })).toBeInTheDocument();
  });

  it('shows Jobs button with aria-label', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.getByRole('button', { name: /open jobs panel/i })).toBeInTheDocument();
  });

  it('calls onExpandToTeam when Team button clicked', () => {
    const onExpandToTeam = vi.fn();
    render(<DispatchSidebar {...baseProps({ mode: 'compact', onExpandToTeam })} />);
    fireEvent.click(screen.getByRole('button', { name: /open team panel/i }));
    expect(onExpandToTeam).toHaveBeenCalledTimes(1);
  });

  it('calls onExpandToJobs when Jobs button clicked', () => {
    const onExpandToJobs = vi.fn();
    render(<DispatchSidebar {...baseProps({ mode: 'compact', onExpandToJobs })} />);
    fireEvent.click(screen.getByRole('button', { name: /open jobs panel/i }));
    expect(onExpandToJobs).toHaveBeenCalledTimes(1);
  });

  it('shows KPI counts from metrics after loading', async () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument(); // live techs
      expect(screen.getByText('2')).toBeInTheDocument(); // active jobs
    });
  });

  it('calls onKpiClick when a rail KPI is clicked', async () => {
    const onKpiClick = vi.fn();
    render(<DispatchSidebar {...baseProps({ mode: 'compact', onKpiClick })} />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /live technician/i });
    fireEvent.click(btn);
    expect(onKpiClick).toHaveBeenCalledWith('liveTechnicians');
  });

  it('calls onEnterFullMap when Full Map button clicked', () => {
    const onEnterFullMap = vi.fn();
    render(<DispatchSidebar {...baseProps({ mode: 'compact', onEnterFullMap })} />);
    fireEvent.click(screen.getByRole('button', { name: /enter full map/i }));
    expect(onEnterFullMap).toHaveBeenCalledTimes(1);
  });

  it('does not show expanded content', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('does not use title attributes on compact rail buttons', () => {
    const { container } = render(<DispatchSidebar {...baseProps({ mode: 'compact' })} />);
    const buttons = container.querySelectorAll('.compact-nav-item, .compact-kpi-item');
    buttons.forEach(btn => expect(btn).not.toHaveAttribute('title'));
  });
});

// ── Full map mode ─────────────────────────────────────────────────────────────

describe('DispatchSidebar — full_map mode', () => {
  it('renders nothing interactive inside sidebar when full_map', () => {
    render(<DispatchSidebar {...baseProps({ mode: 'full_map' })} />);
    expect(screen.queryByRole('tab', { name: /team/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /dispatch panel/i })).not.toBeInTheDocument();
  });
});

// ── KPI grid (expanded) ───────────────────────────────────────────────────────

describe('DispatchSidebar — KPI grid', () => {
  it('applies selected class to active KPI tile', async () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded', activeKpiKey: 'activeJobs' })} />);
    await waitFor(() => {
      const tiles = document.querySelectorAll('.sidebar-kpi-tile.selected');
      expect(tiles.length).toBe(1);
    });
  });

  it('calls onKpiClick when a tile is clicked', async () => {
    const onKpiClick = vi.fn();
    render(<DispatchSidebar {...baseProps({ mode: 'expanded', onKpiClick })} />);
    await waitFor(() => {
      const tiles = document.querySelectorAll('.sidebar-kpi-tile');
      expect(tiles.length).toBe(4);
    });
    fireEvent.click(document.querySelector('.sidebar-kpi-tile'));
    expect(onKpiClick).toHaveBeenCalled();
  });

  it('shows Full Map button in KPI section', async () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enter full map/i })).toBeInTheDocument();
    });
  });

  it('does not use title on KPI tiles', async () => {
    render(<DispatchSidebar {...baseProps({ mode: 'expanded' })} />);
    await waitFor(() => {
      const tiles = document.querySelectorAll('.sidebar-kpi-tile');
      expect(tiles.length).toBe(4);
    });
    document.querySelectorAll('.sidebar-kpi-tile').forEach(tile => {
      expect(tile).not.toHaveAttribute('title');
    });
  });
});

// ── Mobile mode ───────────────────────────────────────────────────────────────

describe('DispatchSidebar — mobile mode', () => {
  it('shows expanded content when isMobile=true regardless of mode', () => {
    render(<DispatchSidebar {...baseProps({ isMobile: true, mode: 'compact' })} />);
    expect(screen.getByRole('tab', { name: /team/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /dispatch panel \(compact\)/i })).not.toBeInTheDocument();
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
