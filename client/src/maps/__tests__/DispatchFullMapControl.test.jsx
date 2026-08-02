import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DispatchFullMapControl from '../DispatchFullMapControl';

describe('DispatchFullMapControl — Open Panel button', () => {
  it('renders a real button element', () => {
    render(<DispatchFullMapControl onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: /open dispatch panel/i })).toBeInTheDocument();
  });

  it('shows visible "Open Panel" text', () => {
    render(<DispatchFullMapControl onOpen={vi.fn()} />);
    expect(screen.getByText('Open Panel')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<DispatchFullMapControl onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /open dispatch panel/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen when activated via keyboard', () => {
    const onOpen = vi.fn();
    render(<DispatchFullMapControl onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: /open dispatch panel/i });
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalled();
  });

  it('has correct aria-label', () => {
    render(<DispatchFullMapControl onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Open dispatch panel' })).toBeInTheDocument();
  });

  it('does not have a title attribute', () => {
    render(<DispatchFullMapControl onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: /open dispatch panel/i })).not.toHaveAttribute('title');
  });

  it('button type is "button" (not submit)', () => {
    render(<DispatchFullMapControl onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: /open dispatch panel/i })).toHaveAttribute('type', 'button');
  });

  it('container has pointer-events: auto to override overlay none', () => {
    const { container } = render(<DispatchFullMapControl onOpen={vi.fn()} />);
    const control = container.querySelector('.dispatch-fullmap-control');
    // Inline style must not set pointer-events: none — the CSS class handles auto
    expect(control?.style?.pointerEvents).not.toBe('none');
  });
});
