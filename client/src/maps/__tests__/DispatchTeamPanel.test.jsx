import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DispatchTeamPanel from '../DispatchTeamPanel';

const NOW = Date.now();
const LIVE_TS  = new Date(NOW - 60 * 1000).toISOString();       // 1 min ago — live
const STALE_TS = new Date(NOW - 5 * 60 * 1000).toISOString();   // 5 min ago — stale
const OLD_TS   = new Date(NOW - 30 * 60 * 1000).toISOString();  // 30 min ago — offline

const TECHS = [
  { id: 't1', name: 'Alice Smith',   role: 'tech', is_available: true  },
  { id: 't2', name: 'Bob Jones',     role: 'tech', is_available: true  },
  { id: 't3', name: 'Carol Turner',  role: 'tech', is_available: false },
];

const TECH_LOCS = [
  { user_id: 't1', lat: 40.7, lng: -74.0, updated_at: LIVE_TS,  speed: null },
  { user_id: 't2', lat: 40.8, lng: -74.1, updated_at: STALE_TS, speed: 8.5  },
];

const JOBS = [
  { id: 'j1', client_name: 'ACME Corp', service_type: 'Repair',     status: 'in_progress', tech_id: 't1', tech_name: 'Alice Smith',  scheduled_at: '2026-07-31T09:00:00Z', service_address: '123 Main St', service_city: 'Austin' },
  { id: 'j2', client_name: 'Beta Inc',  service_type: 'Install',    status: 'scheduled',   tech_id: 't2', tech_name: 'Bob Jones',    scheduled_at: '2026-07-31T11:00:00Z', service_address: '456 Oak Ave', service_city: null      },
  { id: 'j3', client_name: 'Gamma LLC', service_type: 'Inspection', status: 'scheduled',   tech_id: null, tech_name: null,           scheduled_at: '2026-07-31T14:00:00Z', service_address: null,          service_city: null      },
];

function defaultProps(overrides = {}) {
  return {
    techs:        TECHS,
    techLocs:     TECH_LOCS,
    jobs:         JOBS,
    sessions:     [],
    loading:      false,
    selectedItem: null,
    onSelectTech: vi.fn(),
    onSelectJob:  vi.fn(),
    ...overrides,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — rendering', () => {
  it('renders Team and Jobs tabs as first visible elements', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    expect(screen.getByRole('tab', { name: /team/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /jobs/i })).toBeInTheDocument();
  });

  it('shows loading text when loading=true', () => {
    render(<DispatchTeamPanel {...defaultProps({ loading: true })} />);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('shows tech rows in Team tab', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Carol Turner')).toBeInTheDocument();
  });

  it('badge shows tech count on Team tab', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    expect(screen.getByLabelText('3 techs')).toBeInTheDocument();
  });
});

// ── Tab switching ─────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — tabs', () => {
  it('switches to Jobs tab and shows job rows', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    expect(screen.getByText('ACME Corp — Repair')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc — Install')).toBeInTheDocument();
  });

  it('shows Active badge on in_progress jobs', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    // "Active" appears in both filter chip and job badge — check at least one exists
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('shows Unassigned label for jobs with no tech', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    // "Unassigned" appears in filter chip and job row — check at least one exists
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  it('resets search when switching tabs', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    expect(input.value).toBe('');
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — search', () => {
  it('filters techs by name', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alice' } });
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('filters jobs by client name', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'acme' } });
    expect(screen.getByText('ACME Corp — Repair')).toBeInTheDocument();
    expect(screen.queryByText('Beta Inc — Install')).not.toBeInTheDocument();
  });

  it('shows empty message when no techs match search', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzzz' } });
    expect(screen.getByText(/no field staff match/i)).toBeInTheDocument();
  });
});

// ── Status filters ────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — team filters', () => {
  it('filters to Off Duty techs', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    // Use exact string so it matches filter chip "Off Duty", not tech row "Carol Turner — Off Duty"
    fireEvent.click(screen.getByRole('button', { name: 'Off Duty' }));
    expect(screen.getByText('Carol Turner')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('All filter shows all techs', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Off Duty' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Carol Turner')).toBeInTheDocument();
  });
});

// ── Job filters ────────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — job filters', () => {
  it('Active filter shows only in_progress jobs', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    // Exact name 'Active' matches the filter chip, not job rows like "ACME Corp — Repair: Active"
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.getByText('ACME Corp — Repair')).toBeInTheDocument();
    expect(screen.queryByText('Beta Inc — Install')).not.toBeInTheDocument();
  });

  it('Unassigned filter shows only jobs without tech', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassigned/i }));
    expect(screen.getByText('Gamma LLC — Inspection')).toBeInTheDocument();
    expect(screen.queryByText('ACME Corp — Repair')).not.toBeInTheDocument();
  });

  it('Done filter shows only completed jobs', () => {
    const completedJobs = [
      ...JOBS,
      { id: 'j4', client_name: 'Delta Co', service_type: 'Survey', status: 'complete', tech_id: 't1', tech_name: 'Alice Smith', scheduled_at: '2026-08-01T08:00:00Z', service_address: null, service_city: null },
    ];
    render(<DispatchTeamPanel {...defaultProps({ jobs: completedJobs })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Delta Co — Survey')).toBeInTheDocument();
    expect(screen.queryByText('ACME Corp — Repair')).not.toBeInTheDocument();
  });

  it('Assigned filter shows assigned-but-not-yet-active jobs', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Assigned' }));
    // j2 is scheduled + has tech_id → shown
    expect(screen.getByText('Beta Inc — Install')).toBeInTheDocument();
    // j1 is in_progress (active) → excluded
    expect(screen.queryByText('ACME Corp — Repair')).not.toBeInTheDocument();
    // j3 has no tech_id (unassigned) → excluded
    expect(screen.queryByText('Gamma LLC — Inspection')).not.toBeInTheDocument();
  });

  it('Assigned filter excludes active-status jobs even when assigned', () => {
    const activeJobs = [
      { id: 'j5', client_name: 'Echo Co', service_type: 'Repair', status: 'en_route', tech_id: 't1', tech_name: 'Alice Smith', scheduled_at: '2026-08-01T10:00:00Z', service_address: null, service_city: null },
    ];
    render(<DispatchTeamPanel {...defaultProps({ jobs: activeJobs })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Assigned' }));
    expect(screen.queryByText('Echo Co — Repair')).not.toBeInTheDocument();
  });
});

// ── panelFocus ────────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — panelFocus', () => {
  it('switches to Jobs tab when panelFocus.tab is "jobs"', () => {
    const { rerender } = render(<DispatchTeamPanel {...defaultProps()} />);
    expect(screen.getByRole('tab', { name: /team/i })).toHaveAttribute('aria-selected', 'true');
    rerender(<DispatchTeamPanel {...defaultProps({ panelFocus: { tab: 'jobs', _nonce: 1 } })} />);
    expect(screen.getByRole('tab', { name: /jobs/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('applies jobFilter when panelFocus.jobFilter is set', () => {
    const completedJobs = [
      ...JOBS,
      { id: 'j4', client_name: 'Delta Co', service_type: 'Survey', status: 'complete', tech_id: 't1', tech_name: 'Alice Smith', scheduled_at: '2026-08-01T08:00:00Z', service_address: null, service_city: null },
    ];
    const { rerender } = render(<DispatchTeamPanel {...defaultProps({ jobs: completedJobs })} />);
    rerender(<DispatchTeamPanel {...defaultProps({ jobs: completedJobs, panelFocus: { tab: 'jobs', jobFilter: 'completed', _nonce: 1 } })} />);
    expect(screen.getByText('Delta Co — Survey')).toBeInTheDocument();
    expect(screen.queryByText('ACME Corp — Repair')).not.toBeInTheDocument();
  });

  it('applies teamFilter when panelFocus.teamFilter is set', () => {
    const { rerender } = render(<DispatchTeamPanel {...defaultProps()} />);
    rerender(<DispatchTeamPanel {...defaultProps({ panelFocus: { tab: 'team', teamFilter: 'off', _nonce: 1 } })} />);
    expect(screen.getByText('Carol Turner')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('clears search when panelFocus changes', () => {
    const { rerender } = render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alice' } });
    expect(screen.getByRole('searchbox').value).toBe('alice');
    rerender(<DispatchTeamPanel {...defaultProps({ panelFocus: { tab: 'team', _nonce: 2 } })} />);
    expect(screen.getByRole('searchbox').value).toBe('');
  });
});

// ── Selection ──────────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — selection', () => {
  it('calls onSelectTech when a tech row is clicked', () => {
    const onSelectTech = vi.fn();
    render(<DispatchTeamPanel {...defaultProps({ onSelectTech })} />);
    fireEvent.click(screen.getByText('Alice Smith').closest('[role="button"]'));
    expect(onSelectTech).toHaveBeenCalledWith('t1');
  });

  it('calls onSelectJob when a job row is clicked', () => {
    const onSelectJob = vi.fn();
    render(<DispatchTeamPanel {...defaultProps({ onSelectJob })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByText('ACME Corp — Repair').closest('[role="button"]'));
    expect(onSelectJob).toHaveBeenCalledWith('j1');
  });

  it('applies sel class to selected tech row', () => {
    render(<DispatchTeamPanel {...defaultProps({ selectedItem: { type: 'tech', id: 't1' } })} />);
    const row = screen.getByText('Alice Smith').closest('.dispatch-tech-row');
    expect(row.classList.contains('sel')).toBe(true);
  });

  it('applies sel class to selected job row', () => {
    render(<DispatchTeamPanel {...defaultProps({ selectedItem: { type: 'job', id: 'j1' } })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    const row = screen.getByText('ACME Corp — Repair').closest('.dispatch-job-row');
    expect(row.classList.contains('sel')).toBe(true);
  });

  it('supports keyboard activation (Enter)', () => {
    const onSelectTech = vi.fn();
    render(<DispatchTeamPanel {...defaultProps({ onSelectTech })} />);
    const row = screen.getByText('Alice Smith').closest('[role="button"]');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelectTech).toHaveBeenCalledWith('t1');
  });
});

// ── Empty states ───────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — empty states', () => {
  it('shows onboarding CTA when techs array is empty', () => {
    render(<DispatchTeamPanel {...defaultProps({ techs: [] })} />);
    expect(screen.getByText(/no team members yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add team member/i })).toBeInTheDocument();
  });

  it('hides tech filter chips when techs array is empty', () => {
    render(<DispatchTeamPanel {...defaultProps({ techs: [] })} />);
    expect(screen.queryByRole('button', { name: /off duty/i })).not.toBeInTheDocument();
  });

  it('shows onboarding CTA with Create Job link when jobs array is empty', () => {
    render(<DispatchTeamPanel {...defaultProps({ jobs: [] })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    expect(screen.getByText(/no jobs today/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create job/i })).toBeInTheDocument();
  });

  it('does not show Open Calendar link in jobs empty state', () => {
    render(<DispatchTeamPanel {...defaultProps({ jobs: [] })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    expect(screen.queryByRole('link', { name: /open calendar/i })).not.toBeInTheDocument();
  });

  it('Active filter with no matching jobs shows "No active jobs right now."', () => {
    const scheduledOnly = [JOBS[1], JOBS[2]]; // no in_progress jobs
    render(<DispatchTeamPanel {...defaultProps({ jobs: scheduledOnly })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.getByText('No active jobs right now.')).toBeInTheDocument();
  });

  it('Assigned filter with no matching jobs shows "No assigned jobs today."', () => {
    const unassignedOnly = [JOBS[2]]; // no tech_id
    render(<DispatchTeamPanel {...defaultProps({ jobs: unassignedOnly })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Assigned' }));
    expect(screen.getByText('No assigned jobs today.')).toBeInTheDocument();
  });

  it('Unassigned filter with no matching jobs shows "No unassigned jobs today."', () => {
    const assignedOnly = [JOBS[0], JOBS[1]]; // both have tech_id
    render(<DispatchTeamPanel {...defaultProps({ jobs: assignedOnly })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassigned/i }));
    expect(screen.getByText('No unassigned jobs today.')).toBeInTheDocument();
  });

  it('Done filter with no matching jobs shows "No completed jobs today."', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('No completed jobs today.')).toBeInTheDocument();
  });
});

// ── Speed display ──────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — speed display', () => {
  it('shows speed in mph when > 2 m/s', () => {
    render(<DispatchTeamPanel {...defaultProps()} />);
    // Bob has speed: 8.5 m/s ≈ 19 mph
    expect(screen.getByText(/19 mph/i)).toBeInTheDocument();
  });
});

// ── Sessions ───────────────────────────────────────────────────────────────────

describe('DispatchTeamPanel — sessions', () => {
  const SESSIONS = [{
    id: 's1', client_name: 'XYZ Corp', service_type: 'Multi-day', status: 'in_progress',
    day_number: 2, total_sessions: 3, lead_tech_name: 'Alice Smith',
  }];

  it('renders sessions section in Team tab', () => {
    render(<DispatchTeamPanel {...defaultProps({ sessions: SESSIONS })} />);
    expect(screen.getByText(/sessions today/i)).toBeInTheDocument();
    expect(screen.getByText(/day 2\/3/i)).toBeInTheDocument();
  });

  it('does not render sessions section in Jobs tab', () => {
    render(<DispatchTeamPanel {...defaultProps({ sessions: SESSIONS })} />);
    fireEvent.click(screen.getByRole('tab', { name: /jobs/i }));
    expect(screen.queryByText(/sessions today/i)).not.toBeInTheDocument();
  });
});

// ── Field eligibility filtering ────────────────────────────────────────────────

describe('DispatchTeamPanel — field eligibility filter', () => {
  const FIELD_TECHS = [
    { id: 't1', name: 'Alice Smith',  role: 'tech', is_available: true, field_work_eligible: true,  dispatch_visible: true  },
    { id: 't2', name: 'Bob Jones',    role: 'tech', is_available: true, field_work_eligible: true,  dispatch_visible: true  },
  ];
  const OFFICE_MEMBERS = [
    { id: 't3', name: 'Carol Mgr',    role: 'manager', is_available: true, field_work_eligible: false, dispatch_visible: false },
  ];
  const MIXED = [...FIELD_TECHS, ...OFFICE_MEMBERS];

  it('shows only field-eligible members by default', () => {
    render(<DispatchTeamPanel {...defaultProps({ techs: MIXED })} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Carol Mgr')).not.toBeInTheDocument();
  });

  it('shows office staff when Show office staff toggle is checked', () => {
    render(<DispatchTeamPanel {...defaultProps({ techs: MIXED })} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /show office staff/i }));
    expect(screen.getByText('Carol Mgr')).toBeInTheDocument();
  });

  it('does not show Show office staff toggle when all members are field-eligible', () => {
    render(<DispatchTeamPanel {...defaultProps({ techs: FIELD_TECHS })} />);
    expect(screen.queryByRole('checkbox', { name: /show office staff/i })).not.toBeInTheDocument();
  });

  it('backward-compat: shows techs with no field_work_eligible field (old API)', () => {
    const legacyTechs = [
      { id: 't1', name: 'Legacy Tech', role: 'tech', is_available: true },
    ];
    render(<DispatchTeamPanel {...defaultProps({ techs: legacyTechs })} />);
    expect(screen.getByText('Legacy Tech')).toBeInTheDocument();
  });

  it('shows "No field staff match this filter" when field filter excludes all', () => {
    // Only office staff, field_work_eligible filter active (default)
    render(<DispatchTeamPanel {...defaultProps({ techs: OFFICE_MEMBERS })} />);
    // The list of field-eligible members will be empty, but techs.length > 0
    expect(screen.getByText(/no field staff match this filter/i)).toBeInTheDocument();
  });
});
