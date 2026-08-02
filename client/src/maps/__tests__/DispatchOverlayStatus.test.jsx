import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DispatchOverlayStatus from '../DispatchOverlayStatus';

// ── Null render ───────────────────────────────────────────────────────────────

describe('DispatchOverlayStatus — null states', () => {
  it('renders nothing when all flags are false', () => {
    const { container } = render(
      <DispatchOverlayStatus loading={false} error={false} stale={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no props are passed', () => {
    const { container } = render(<DispatchOverlayStatus />);
    expect(container.firstChild).toBeNull();
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('DispatchOverlayStatus — loading', () => {
  it('shows loading message when loading=true', () => {
    render(<DispatchOverlayStatus loading={true} />);
    expect(screen.getByText(/loading dispatch data/i)).toBeInTheDocument();
  });

  it('has role=status with aria-live=polite', () => {
    render(<DispatchOverlayStatus loading={true} />);
    const el = screen.getByRole('status');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('has --loading modifier class', () => {
    const { container } = render(<DispatchOverlayStatus loading={true} />);
    expect(container.firstChild).toHaveClass('dispatch-overlay-status--loading');
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('DispatchOverlayStatus — error', () => {
  it('shows error message when error=true', () => {
    render(<DispatchOverlayStatus loading={false} error={true} />);
    expect(screen.getByText(/dispatch data temporarily unavailable/i)).toBeInTheDocument();
  });

  it('has role=alert', () => {
    render(<DispatchOverlayStatus loading={false} error={true} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has --error modifier class', () => {
    const { container } = render(<DispatchOverlayStatus loading={false} error={true} />);
    expect(container.firstChild).toHaveClass('dispatch-overlay-status--error');
  });

  it('shows Retry button when onRetry is provided', () => {
    render(
      <DispatchOverlayStatus loading={false} error={true} onRetry={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('does not show Retry button when onRetry is not provided', () => {
    render(<DispatchOverlayStatus loading={false} error={true} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('calls onRetry when Retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<DispatchOverlayStatus loading={false} error={true} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('loading takes precedence over error', () => {
    render(<DispatchOverlayStatus loading={true} error={true} />);
    expect(screen.getByText(/loading dispatch data/i)).toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });
});

// ── Stale state ───────────────────────────────────────────────────────────────

describe('DispatchOverlayStatus — stale', () => {
  it('shows stale message when stale=true', () => {
    render(<DispatchOverlayStatus loading={false} error={false} stale={true} />);
    expect(screen.getByText(/showing last known data/i)).toBeInTheDocument();
  });

  it('has role=status with aria-live=polite', () => {
    render(<DispatchOverlayStatus loading={false} error={false} stale={true} />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('has --stale modifier class', () => {
    const { container } = render(
      <DispatchOverlayStatus loading={false} error={false} stale={true} />,
    );
    expect(container.firstChild).toHaveClass('dispatch-overlay-status--stale');
  });

  it('loading takes precedence over stale', () => {
    render(<DispatchOverlayStatus loading={true} stale={true} />);
    expect(screen.getByText(/loading dispatch data/i)).toBeInTheDocument();
    expect(screen.queryByText(/last known data/i)).not.toBeInTheDocument();
  });
});
