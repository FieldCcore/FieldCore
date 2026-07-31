import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DispatchMapControls from '../DispatchMapControls';

function defaultProps(overrides = {}) {
  return {
    onFitAll:      vi.fn(),
    onCenterOnMe:  vi.fn(),
    onRecenter:    vi.fn(),
    locating:      false,
    hasInteracted: false,
    mapReady:      true,
    permState:     'unknown',
    ...overrides,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

describe('DispatchMapControls — rendering', () => {
  it('renders Fit All button', () => {
    render(<DispatchMapControls {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /fit all/i })).toBeInTheDocument();
  });

  it('renders Center on Me button', () => {
    render(<DispatchMapControls {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /center on me/i })).toBeInTheDocument();
  });

  it('does not render Recenter when hasInteracted is false', () => {
    render(<DispatchMapControls {...defaultProps({ hasInteracted: false })} />);
    expect(screen.queryByRole('button', { name: /recenter/i })).not.toBeInTheDocument();
  });

  it('renders Recenter when hasInteracted is true', () => {
    render(<DispatchMapControls {...defaultProps({ hasInteracted: true })} />);
    expect(screen.getByRole('button', { name: /recenter/i })).toBeInTheDocument();
  });

  it('shows Locating… text when locating is true', () => {
    render(<DispatchMapControls {...defaultProps({ locating: true })} />);
    expect(screen.getByRole('button', { name: /locating/i })).toBeInTheDocument();
  });

  it('shows "Location blocked" status row when permState is denied', () => {
    render(<DispatchMapControls {...defaultProps({ permState: 'denied' })} />);
    expect(screen.getByText(/location blocked/i)).toBeInTheDocument();
  });

  it('shows "Location not enabled" status row when permState is prompt', () => {
    render(<DispatchMapControls {...defaultProps({ permState: 'prompt' })} />);
    expect(screen.getByText(/location not enabled/i)).toBeInTheDocument();
  });

  it('does not show status row when permState is granted', () => {
    render(<DispatchMapControls {...defaultProps({ permState: 'granted' })} />);
    expect(screen.queryByText(/location/i)).not.toBeInTheDocument();
  });

  it('does not show status row when permState is unknown', () => {
    render(<DispatchMapControls {...defaultProps({ permState: 'unknown' })} />);
    expect(screen.queryByText(/location/i)).not.toBeInTheDocument();
  });
});

// ── Click handlers ───────────────────────────────────────────────────────────

describe('DispatchMapControls — click handlers', () => {
  it('calls onFitAll when Fit All is clicked', () => {
    const onFitAll = vi.fn();
    render(<DispatchMapControls {...defaultProps({ onFitAll })} />);
    fireEvent.click(screen.getByRole('button', { name: /fit all/i }));
    expect(onFitAll).toHaveBeenCalledTimes(1);
  });

  it('calls onCenterOnMe when Center on Me is clicked', () => {
    const onCenterOnMe = vi.fn();
    render(<DispatchMapControls {...defaultProps({ onCenterOnMe })} />);
    fireEvent.click(screen.getByRole('button', { name: /center on me/i }));
    expect(onCenterOnMe).toHaveBeenCalledTimes(1);
  });

  it('calls onRecenter when Recenter is clicked', () => {
    const onRecenter = vi.fn();
    render(<DispatchMapControls {...defaultProps({ onRecenter, hasInteracted: true })} />);
    fireEvent.click(screen.getByRole('button', { name: /recenter/i }));
    expect(onRecenter).toHaveBeenCalledTimes(1);
  });

  it('does not call onCenterOnMe when locating (disabled)', () => {
    const onCenterOnMe = vi.fn();
    render(<DispatchMapControls {...defaultProps({ onCenterOnMe, locating: true })} />);
    fireEvent.click(screen.getByRole('button', { name: /locating/i }));
    expect(onCenterOnMe).not.toHaveBeenCalled();
  });

  it('does not call onFitAll when mapReady is false (disabled)', () => {
    const onFitAll = vi.fn();
    render(<DispatchMapControls {...defaultProps({ onFitAll, mapReady: false })} />);
    fireEvent.click(screen.getByRole('button', { name: /fit all/i }));
    expect(onFitAll).not.toHaveBeenCalled();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('DispatchMapControls — accessibility', () => {
  it('all buttons have type="button"', () => {
    render(<DispatchMapControls {...defaultProps({ hasInteracted: true })} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn).toHaveAttribute('type', 'button'));
  });

  it('Fit All button has aria-label', () => {
    render(<DispatchMapControls {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /fit all/i })).toHaveAttribute('aria-label');
  });

  it('Center on Me button has aria-label', () => {
    render(<DispatchMapControls {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /center on me/i })).toHaveAttribute('aria-label');
  });

  it('Fit All is disabled when mapReady is false', () => {
    render(<DispatchMapControls {...defaultProps({ mapReady: false })} />);
    expect(screen.getByRole('button', { name: /fit all/i })).toBeDisabled();
  });

  it('Center on Me is disabled while locating', () => {
    render(<DispatchMapControls {...defaultProps({ locating: true })} />);
    expect(screen.getByRole('button', { name: /locating/i })).toBeDisabled();
  });

  it('control card has pointer-events: auto', () => {
    const { container } = render(<DispatchMapControls {...defaultProps()} />);
    const card = container.firstChild;
    expect(card.style.pointerEvents).toBe('auto');
  });
});

// ── Keyboard activation ──────────────────────────────────────────────────────

describe('DispatchMapControls — keyboard activation', () => {
  it('Fit All activates on Enter key', () => {
    const onFitAll = vi.fn();
    render(<DispatchMapControls {...defaultProps({ onFitAll })} />);
    const btn = screen.getByRole('button', { name: /fit all/i });
    btn.focus();
    fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(btn);
    expect(onFitAll).toHaveBeenCalled();
  });

  it('Center on Me activates on Space key', () => {
    const onCenterOnMe = vi.fn();
    render(<DispatchMapControls {...defaultProps({ onCenterOnMe })} />);
    const btn = screen.getByRole('button', { name: /center on me/i });
    btn.focus();
    fireEvent.keyDown(btn, { key: ' ', code: 'Space' });
    fireEvent.click(btn);
    expect(onCenterOnMe).toHaveBeenCalled();
  });
});
