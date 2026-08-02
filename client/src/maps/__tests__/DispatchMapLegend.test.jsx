import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import DispatchMapLegend from '../DispatchMapLegend';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeStaleLocForTech(techId) {
  return {
    user_id:    techId,
    updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),  // 15 min → stale
    lat:        25.7617,
    lng:        -80.1918,
  };
}

const TECH      = { id: 'tech1', is_available: true };
const STALE_LOC = makeStaleLocForTech('tech1');

// ── Visibility ────────────────────────────────────────────────────────────────

describe('DispatchMapLegend — visibility', () => {
  it('renders when visible=true', () => {
    const { container } = render(<DispatchMapLegend visible={true} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders by default (visible defaults to true)', () => {
    const { container } = render(<DispatchMapLegend />);
    expect(container.firstChild).not.toBeNull();
  });

  it('does not render when visible=false', () => {
    const { container } = render(<DispatchMapLegend visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('has role=region with accessible label', () => {
    render(<DispatchMapLegend visible={true} />);
    expect(screen.getByRole('region', { name: /map legend/i })).toBeInTheDocument();
  });

  it('has dispatch-map-legend CSS class', () => {
    const { container } = render(<DispatchMapLegend visible={true} />);
    expect(container.firstChild).toHaveClass('dispatch-map-legend');
  });
});

// ── Content ───────────────────────────────────────────────────────────────────

describe('DispatchMapLegend — content', () => {
  beforeEach(() => {
    render(<DispatchMapLegend visible={true} />);
  });

  it('shows "Legend" heading', () => {
    expect(screen.getByRole('region').textContent).toContain('Legend');
  });

  it('shows tech Live GPS entry', () => {
    expect(screen.getByText(/live gps/i)).toBeInTheDocument();
  });

  it('shows job Scheduled entry matching Calendar status', () => {
    expect(screen.getByText(/job.*scheduled/i)).toBeInTheDocument();
  });

  it('shows job In Progress entry matching Calendar status', () => {
    expect(screen.getByText(/job.*in progress/i)).toBeInTheDocument();
  });

  it('shows job Completed entry matching Calendar status', () => {
    expect(screen.getByText(/job.*completed/i)).toBeInTheDocument();
  });

  it('does not show job Cancelled entry (terminal state excluded from map)', () => {
    expect(screen.queryByText(/job.*cancelled/i)).not.toBeInTheDocument();
  });

  it('does not show "Job — Active" (not a Calendar canonical status)', () => {
    expect(screen.queryByText(/job.*active$/i)).not.toBeInTheDocument();
  });
});

// ── Conditional stale entry ───────────────────────────────────────────────────

describe('DispatchMapLegend — conditional stale entry', () => {
  it('does not show Location Stale entry when no stale techs', () => {
    render(<DispatchMapLegend visible={true} techs={[]} techLocs={[]} jobs={[]} />);
    expect(screen.queryByText(/location stale/i)).not.toBeInTheDocument();
  });

  it('shows Tech — Location Stale entry when a stale tech exists', () => {
    render(
      <DispatchMapLegend
        visible={true}
        techs={[TECH]}
        techLocs={[STALE_LOC]}
        jobs={[]}
      />,
    );
    expect(screen.getByText(/location stale/i)).toBeInTheDocument();
  });

  it('does not show GPS Stale (old label) — label is now Location Stale', () => {
    render(
      <DispatchMapLegend
        visible={true}
        techs={[TECH]}
        techLocs={[STALE_LOC]}
        jobs={[]}
      />,
    );
    expect(screen.queryByText(/gps stale/i)).not.toBeInTheDocument();
    expect(screen.getByText(/location stale/i)).toBeInTheDocument();
  });

  it('still shows Live GPS even when stale tech is present', () => {
    render(
      <DispatchMapLegend
        visible={true}
        techs={[TECH]}
        techLocs={[STALE_LOC]}
        jobs={[]}
      />,
    );
    expect(screen.getByText(/live gps/i)).toBeInTheDocument();
  });
});

// ── layers prop ───────────────────────────────────────────────────────────────

describe('DispatchMapLegend — layers prop', () => {
  it('hides all tech entries when layers.techs is false', () => {
    render(
      <DispatchMapLegend
        visible={true}
        layers={{ techs: false, jobs: true }}
      />,
    );
    expect(screen.queryByText(/live gps/i)).not.toBeInTheDocument();
  });

  it('hides all job entries when layers.jobs is false', () => {
    render(
      <DispatchMapLegend
        visible={true}
        layers={{ techs: true, jobs: false }}
      />,
    );
    expect(screen.queryByText(/job.*scheduled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/job.*in progress/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/job.*completed/i)).not.toBeInTheDocument();
  });

  it('shows tech entries when layers.techs is true', () => {
    render(
      <DispatchMapLegend
        visible={true}
        layers={{ techs: true, jobs: false }}
      />,
    );
    expect(screen.getByText(/live gps/i)).toBeInTheDocument();
  });

  it('shows job entries when layers.jobs is true', () => {
    render(
      <DispatchMapLegend
        visible={true}
        layers={{ techs: false, jobs: true }}
      />,
    );
    expect(screen.getByText(/job.*scheduled/i)).toBeInTheDocument();
  });

  it('hides stale tech entry when layers.techs is false, even with stale tech', () => {
    render(
      <DispatchMapLegend
        visible={true}
        techs={[TECH]}
        techLocs={[STALE_LOC]}
        jobs={[]}
        layers={{ techs: false, jobs: true }}
      />,
    );
    expect(screen.queryByText(/location stale/i)).not.toBeInTheDocument();
  });
});
