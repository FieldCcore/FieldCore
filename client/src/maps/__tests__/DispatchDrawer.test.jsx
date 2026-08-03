import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DispatchDrawer from '../DispatchDrawer';

vi.mock('../../api', () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from '../../api';

const NOW = Date.now();
const LIVE_TS = new Date(NOW - 60 * 1000).toISOString();

const TECHS = [
  { id: 't1', name: 'Alice Smith',  role: 'Senior Tech', phone: '5125551234', is_available: true },
  { id: 't2', name: 'Bob Jones',    role: 'Tech',        phone: null,          is_available: true },
];

const TECH_LOCS = [
  { user_id: 't1', lat: 40.7, lng: -74.0, updated_at: LIVE_TS, speed: null },
];

const JOBS = [
  {
    id: 'j1', client_name: 'ACME Corp', service_type: 'Repair', status: 'in_progress',
    tech_id: 't1', scheduled_at: '2026-07-31T09:00:00Z',
    service_address: '123 Main St', service_city: 'Austin', service_state: 'TX', service_zip: '78701',
    service_lat: 30.27, service_lng: -97.74,
    priority: 'high', amount: 24999, notes: 'Customer notes here.',
  },
  {
    id: 'j2', client_name: 'Beta Inc', service_type: 'Install', status: 'scheduled',
    tech_id: null, scheduled_at: '2026-07-31T11:00:00Z',
    service_address: null, service_city: null, service_state: null, service_zip: null,
    service_lat: null, service_lng: null,
    priority: 'normal', amount: null, notes: null,
  },
];

function defaultProps(overrides = {}) {
  return {
    item:         null,
    techs:        TECHS,
    techLocs:     TECH_LOCS,
    jobs:         JOBS,
    onClose:      vi.fn(),
    onCenterTech: vi.fn(),
    onCenterJob:  vi.fn(),
    ...overrides,
  };
}

// ── Closed state ──────────────────────────────────────────────────────────────

describe('DispatchDrawer — closed state', () => {
  it('renders the drawer without open class when item is null', () => {
    const { container } = render(<DispatchDrawer {...defaultProps()} />);
    expect(container.querySelector('.dispatch-drawer')).toBeInTheDocument();
    expect(container.querySelector('.dispatch-drawer.open')).not.toBeInTheDocument();
  });

  it('is aria-hidden when closed', () => {
    const { container } = render(<DispatchDrawer {...defaultProps()} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

// ── Tech view ─────────────────────────────────────────────────────────────────

describe('DispatchDrawer — tech view', () => {
  function renderTech(overrides = {}) {
    return render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, ...overrides })} />);
  }

  it('opens with open class when tech item provided', () => {
    const { container } = renderTech();
    expect(container.querySelector('.dispatch-drawer.open')).toBeInTheDocument();
  });

  it('shows tech name', () => {
    renderTech();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows tech role', () => {
    renderTech();
    expect(screen.getByText('Senior Tech')).toBeInTheDocument();
  });

  it('shows GPS status row', () => {
    renderTech();
    expect(screen.getByText('Status')).toBeInTheDocument();
    // Alice has live GPS + active job → status is 'On Job' (busy)
    expect(screen.getByText('On Job')).toBeInTheDocument();
  });

  it('shows Last seen row', () => {
    renderTech();
    expect(screen.getByText('Last seen')).toBeInTheDocument();
  });

  it('shows current job card for tech with active job', () => {
    renderTech();
    expect(screen.getByText('Current Job')).toBeInTheDocument();
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
  });

  it('shows Center Map button when tech has live GPS', () => {
    renderTech();
    expect(screen.getByRole('button', { name: /center map/i })).toBeInTheDocument();
  });

  it('calls onCenterTech when Center Map is clicked', () => {
    const onCenterTech = vi.fn();
    renderTech({ onCenterTech });
    fireEvent.click(screen.getByRole('button', { name: /center map/i }));
    expect(onCenterTech).toHaveBeenCalledWith('t1');
  });

  it('shows Call button when tech has a phone number', () => {
    renderTech();
    expect(screen.getByRole('link', { name: /call/i })).toBeInTheDocument();
  });

  it('does not show Call button when tech has no phone', () => {
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't2' } })} />);
    expect(screen.queryByRole('link', { name: /call/i })).not.toBeInTheDocument();
  });

  it('shows Profile link', () => {
    renderTech();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });

  it('shows Off Duty label when tech is not available', () => {
    const offTech = { ...TECHS[0], is_available: false };
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, techs: [offTech, TECHS[1]] })} />);
    expect(screen.getByText('Off Duty')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderTech({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Job view ──────────────────────────────────────────────────────────────────

describe('DispatchDrawer — job view', () => {
  function renderJob(overrides = {}) {
    return render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j1' }, ...overrides })} />);
  }

  it('opens with open class when job item provided', () => {
    const { container } = renderJob();
    expect(container.querySelector('.dispatch-drawer.open')).toBeInTheDocument();
  });

  it('shows job client name', () => {
    renderJob();
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
  });

  it('shows service type', () => {
    renderJob();
    expect(screen.getByText('Repair')).toBeInTheDocument();
  });

  it('shows High Priority badge', () => {
    renderJob();
    expect(screen.getByText(/high priority/i)).toBeInTheDocument();
  });

  it('shows status badge', () => {
    renderJob();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows full address', () => {
    renderJob();
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
    expect(screen.getByText(/Austin/)).toBeInTheDocument();
  });

  it('shows assigned tech name', () => {
    renderJob();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows amount formatted as dollars', () => {
    renderJob();
    expect(screen.getByText('$249.99')).toBeInTheDocument();
  });

  it('shows notes', () => {
    renderJob();
    expect(screen.getByText('Customer notes here.')).toBeInTheDocument();
  });

  it('shows Center Map button when job has coords', () => {
    renderJob();
    expect(screen.getByRole('button', { name: /center map/i })).toBeInTheDocument();
  });

  it('calls onCenterJob when Center Map is clicked', () => {
    const onCenterJob = vi.fn();
    renderJob({ onCenterJob });
    fireEvent.click(screen.getByRole('button', { name: /center map/i }));
    expect(onCenterJob).toHaveBeenCalledWith(JOBS[0]);
  });

  it('shows Open Job link', () => {
    renderJob();
    expect(screen.getByRole('link', { name: /open job/i })).toBeInTheDocument();
  });

  it('shows Unassigned in amber when job has no tech', () => {
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j2' } })} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('does not show Center Map for job without coords', () => {
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j2' } })} />);
    expect(screen.queryByRole('button', { name: /center map/i })).not.toBeInTheDocument();
  });
});

// ── Active job status coverage ────────────────────────────────────────────────

describe('DispatchDrawer — active job uses ACTIVE_STATUSES', () => {
  it('shows current job when status is paused (not just in_progress)', () => {
    const jobs = [{ ...JOBS[0], status: 'paused' }];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, jobs })} />);
    expect(screen.getByText('Current Job')).toBeInTheDocument();
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
  });

  it('shows current job when status is en_route', () => {
    const jobs = [{ ...JOBS[0], status: 'en_route' }];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, jobs })} />);
    expect(screen.getByText('Current Job')).toBeInTheDocument();
  });

  it('shows current job when status is awaiting_client', () => {
    const jobs = [{ ...JOBS[0], status: 'awaiting_client' }];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, jobs })} />);
    expect(screen.getByText('Current Job')).toBeInTheDocument();
  });

  it('does not show completed job as current job', () => {
    const jobs = [{ ...JOBS[0], status: 'complete' }];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, jobs })} />);
    expect(screen.queryByText('Current Job')).not.toBeInTheDocument();
  });

  it('shows next job when tech has scheduled job alongside active job', () => {
    const twoJobs = [
      { ...JOBS[0], id: 'j1', status: 'in_progress', tech_id: 't1', scheduled_at: '2026-07-31T09:00:00Z' },
      { id: 'j5', client_name: 'Next Client', service_type: 'Survey', status: 'scheduled',
        tech_id: 't1', scheduled_at: '2026-07-31T13:00:00Z',
        service_address: null, service_city: null, service_state: null, service_zip: null,
        service_lat: null, service_lng: null, priority: 'normal', amount: null, notes: null },
    ];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, jobs: twoJobs })} />);
    expect(screen.getByText('Next Job')).toBeInTheDocument();
    expect(screen.getByText('Next Client')).toBeInTheDocument();
  });

  it('does not show cancelled job as next job', () => {
    const jobs = [
      { ...JOBS[0], id: 'j1', status: 'in_progress', tech_id: 't1' },
      { id: 'j5', client_name: 'Cancelled Co', service_type: 'X', status: 'cancelled',
        tech_id: 't1', scheduled_at: '2026-07-31T13:00:00Z',
        service_address: null, service_city: null, service_state: null, service_zip: null,
        service_lat: null, service_lng: null, priority: 'normal', amount: null, notes: null },
    ];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' }, jobs })} />);
    expect(screen.queryByText('Cancelled Co')).not.toBeInTheDocument();
  });
});

// ── Geocode status display ────────────────────────────────────────────────────

const JOB_NO_COORDS = {
  id: 'j3', client_name: 'Rule Check Co', service_type: 'Rule Check — Full Detail',
  status: 'scheduled', tech_id: null,
  scheduled_at: '2026-08-02T00:15:00Z',
  service_address: '305 Lincoln Court', service_city: 'Deerfield Beach',
  service_state: 'FL', service_zip: '33442',
  service_lat: null, service_lng: null,
  geocode_status: 'failed',
  priority: 'normal', amount: null, notes: null,
};

describe('DispatchDrawer — geocode status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows geocode pending indicator when address present but no coords', () => {
    const jobPending = { ...JOB_NO_COORDS, geocode_status: 'not_attempted' };
    const jobs = [...JOBS, jobPending];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j3' }, jobs })} />);
    expect(screen.getByText(/map location pending/i)).toBeInTheDocument();
  });

  it('shows geocode failed indicator when geocode_status is failed', () => {
    const jobs = [...JOBS, JOB_NO_COORDS];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j3' }, jobs })} />);
    expect(screen.getByText(/could not be placed on map/i)).toBeInTheDocument();
  });

  it('shows Retry Geocoding button when coords are missing and address is present', () => {
    const jobs = [...JOBS, JOB_NO_COORDS];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j3' }, jobs })} />);
    expect(screen.getByRole('button', { name: /retry geocoding/i })).toBeInTheDocument();
  });

  it('does NOT show Retry Geocoding button when job has valid coords', () => {
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j1' } })} />);
    expect(screen.queryByRole('button', { name: /retry geocoding/i })).not.toBeInTheDocument();
  });

  it('does NOT show geocode status when job has no address at all', () => {
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j2' } })} />);
    expect(screen.queryByText(/map location pending/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry geocoding/i })).not.toBeInTheDocument();
  });

  it('calls onJobGeocoded after successful retry', async () => {
    api.post.mockResolvedValueOnce({
      data: { service_lat: 26.1224, service_lng: -80.1373, service_address: '305 Lincoln Court', geocode_status: 'resolved' },
    });
    const onJobGeocoded = vi.fn();
    const jobs = [...JOBS, JOB_NO_COORDS];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j3' }, jobs, onJobGeocoded })} />);

    fireEvent.click(screen.getByRole('button', { name: /retry geocoding/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/jobs/j3/geocode');
      expect(onJobGeocoded).toHaveBeenCalledWith(expect.objectContaining({
        id: 'j3',
        service_lat: 26.1224,
        service_lng: -80.1373,
        geocode_status: 'resolved',
      }));
    });
  });

  it('shows error message when retry fails', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'Address could not be geocoded.' } },
    });
    const jobs = [...JOBS, JOB_NO_COORDS];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j3' }, jobs })} />);

    fireEvent.click(screen.getByRole('button', { name: /retry geocoding/i }));

    await waitFor(() => {
      expect(screen.getByText('Address could not be geocoded.')).toBeInTheDocument();
    });
  });

  it('shows isValidCoord-based hasCoords — Deerfield Beach coordinate is valid', () => {
    const jobWithCoords = { ...JOB_NO_COORDS, service_lat: 26.1224, service_lng: -80.1373, geocode_status: 'resolved' };
    const jobs = [...JOBS, jobWithCoords];
    render(<DispatchDrawer {...defaultProps({ item: { type: 'job', id: 'j3' }, jobs })} />);
    expect(screen.getByRole('button', { name: /center map/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry geocoding/i })).not.toBeInTheDocument();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('DispatchDrawer — accessibility', () => {
  it('has role="dialog" on the drawer', () => {
    const { container } = render(
      <DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' } })} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeInTheDocument();
  });

  it('has aria-modal="true" when open', () => {
    const { container } = render(
      <DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' } })} />
    );
    expect(container.querySelector('[aria-modal="true"]')).toBeInTheDocument();
  });

  it('close button has aria-label', () => {
    render(<DispatchDrawer {...defaultProps({ item: { type: 'tech', id: 't1' } })} />);
    expect(screen.getByRole('button', { name: /close details panel/i })).toBeInTheDocument();
  });
});
