import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import DispatchMapLegend from '../DispatchMapLegend';

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

  it('shows tech GPS Stale entry', () => {
    expect(screen.getByText(/gps stale/i)).toBeInTheDocument();
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

  it('shows job Cancelled entry matching Calendar status', () => {
    expect(screen.getByText(/job.*cancelled/i)).toBeInTheDocument();
  });

  it('does not show "Job — Active" (not a Calendar canonical status)', () => {
    expect(screen.queryByText(/job.*active$/i)).not.toBeInTheDocument();
  });
});
