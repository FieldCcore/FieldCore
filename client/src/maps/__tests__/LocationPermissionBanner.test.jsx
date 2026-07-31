import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LocationPermissionBanner from '../LocationPermissionBanner';

function defaultProps(variant = 'denied', overrides = {}) {
  return {
    variant,
    onEnable:    vi.fn(),
    onSkip:      vi.fn(),
    onTryAgain:  vi.fn(),
    onOpenHelp:  vi.fn(),
    onDismiss:   vi.fn(),
    isEnabling:  false,
    dismissable: true,
    ...overrides,
  };
}

// ── first_visit variant ───────────────────────────────────────────────────────

describe('LocationPermissionBanner — first_visit', () => {
  it('renders Enable Location and Not Now buttons', () => {
    render(<LocationPermissionBanner {...defaultProps('first_visit')} />);
    expect(screen.getByRole('button', { name: /enable location/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /not now/i })).toBeInTheDocument();
  });

  it('calls onEnable when Enable Location is clicked', () => {
    const onEnable = vi.fn();
    render(<LocationPermissionBanner {...defaultProps('first_visit', { onEnable })} />);
    fireEvent.click(screen.getByRole('button', { name: /enable location/i }));
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip when Not Now is clicked', () => {
    const onSkip = vi.fn();
    render(<LocationPermissionBanner {...defaultProps('first_visit', { onSkip })} />);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows Requesting… and disables button when isEnabling is true', () => {
    render(<LocationPermissionBanner {...defaultProps('first_visit', { isEnabling: true })} />);
    const btn = screen.getByRole('button', { name: /requesting/i });
    expect(btn).toBeDisabled();
  });

  it('explains why location is needed', () => {
    render(<LocationPermissionBanner {...defaultProps('first_visit')} />);
    expect(screen.getByText(/FieldCore uses your location/i)).toBeInTheDocument();
  });

  it('does not render denied-specific buttons', () => {
    render(<LocationPermissionBanner {...defaultProps('first_visit')} />);
    expect(screen.queryByRole('button', { name: /open browser/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});

// ── denied variant ────────────────────────────────────────────────────────────

describe('LocationPermissionBanner — denied', () => {
  it('renders Open Browser Instructions and Try Again', () => {
    render(<LocationPermissionBanner {...defaultProps('denied')} />);
    expect(screen.getByRole('button', { name: /open browser instructions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls onOpenHelp when Open Browser Instructions is clicked', () => {
    const onOpenHelp = vi.fn();
    render(<LocationPermissionBanner {...defaultProps('denied', { onOpenHelp })} />);
    fireEvent.click(screen.getByRole('button', { name: /open browser instructions/i }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('calls onTryAgain when Try Again is clicked', () => {
    const onTryAgain = vi.fn();
    render(<LocationPermissionBanner {...defaultProps('denied', { onTryAgain })} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('shows location-access-off message', () => {
    render(<LocationPermissionBanner {...defaultProps('denied')} />);
    expect(screen.getByText(/Location access is off/i)).toBeInTheDocument();
  });

  it('renders dismiss button when dismissable is true', () => {
    render(<LocationPermissionBanner {...defaultProps('denied', { dismissable: true })} />);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('does not render dismiss button when dismissable is false', () => {
    render(<LocationPermissionBanner {...defaultProps('denied', { dismissable: false })} />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('hides itself when dismissed', () => {
    const { container } = render(<LocationPermissionBanner {...defaultProps('denied')} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(container.firstChild).toBeNull();
  });

  it('calls onDismiss when dismissed', () => {
    const onDismiss = vi.fn();
    render(<LocationPermissionBanner {...defaultProps('denied', { onDismiss })} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ── unavailable variant ───────────────────────────────────────────────────────

describe('LocationPermissionBanner — unavailable', () => {
  it('shows unavailable message', () => {
    render(<LocationPermissionBanner {...defaultProps('unavailable')} />);
    expect(screen.getByText(/could not be determined/i)).toBeInTheDocument();
  });

  it('does not render Open Browser Instructions for unavailable', () => {
    render(<LocationPermissionBanner {...defaultProps('unavailable')} />);
    expect(screen.queryByRole('button', { name: /open browser/i })).not.toBeInTheDocument();
  });
});

// ── pointer-events: auto ─────────────────────────────────────────────────────

describe('LocationPermissionBanner — pointer events', () => {
  it('has pointer-events: auto on container', () => {
    const { container } = render(<LocationPermissionBanner {...defaultProps('denied')} />);
    expect(container.firstChild.style.pointerEvents).toBe('auto');
  });
});
