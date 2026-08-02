import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DispatchDateControl from '../DispatchDateControl';

// Pin today to a fixed date so tests are deterministic.
// 2025-03-15 is a Saturday.
const TODAY_YMD = '2025-03-15';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-03-15T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Label rendering ───────────────────────────────────────────────────────────

describe('DispatchDateControl — label', () => {
  it('shows "Today" when date is null', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('shows day+month for a non-today date', () => {
    render(<DispatchDateControl date="2025-03-10" onDateChange={() => {}} />);
    // The date label button contains the formatted date; scope line also shows it —
    // confirm at least one of the matching elements is the label button.
    const labelBtn = screen.getByLabelText(/selected date.*click to open/i);
    expect(labelBtn.textContent).toMatch(/mon.*mar.*10/i);
  });

  it('scope line says "All jobs · Today" when date is null and no accountName', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} />);
    expect(screen.getByText(/all jobs.*today/i)).toBeInTheDocument();
  });

  it('scope line shows accountName when provided', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} accountName="Apex Electric" />);
    expect(screen.getByText(/apex electric.*today/i)).toBeInTheDocument();
  });

  it('scope line shows formatted date on non-today', () => {
    render(<DispatchDateControl date="2025-03-10" onDateChange={() => {}} />);
    expect(screen.getByText(/all jobs.*mar.*10/i)).toBeInTheDocument();
  });
});

// ── Navigation buttons ────────────────────────────────────────────────────────

describe('DispatchDateControl — navigation', () => {
  it('calls onDateChange with previous date when clicking left chevron', () => {
    const onChange = vi.fn();
    render(<DispatchDateControl date="2025-03-15" onDateChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Previous day'));
    expect(onChange).toHaveBeenCalledWith('2025-03-14');
  });

  it('calls onDateChange with next date when clicking right chevron', () => {
    const onChange = vi.fn();
    // 2025-03-10 + 1 = 2025-03-11 (not today), so result is the date string not null
    render(<DispatchDateControl date="2025-03-10" onDateChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Next day'));
    expect(onChange).toHaveBeenCalledWith('2025-03-11');
  });

  it('passes null when navigating to today', () => {
    const onChange = vi.fn();
    // date is the day before today → next → today → null
    render(<DispatchDateControl date="2025-03-14" onDateChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Next day'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('passes null when navigating back to today via prev from tomorrow', () => {
    const onChange = vi.fn();
    render(<DispatchDateControl date="2025-03-16" onDateChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Previous day'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

// ── Back to Today button ──────────────────────────────────────────────────────

describe('DispatchDateControl — Back to Today', () => {
  it('shows "Back to Today" when not on today', () => {
    render(<DispatchDateControl date="2025-03-10" onDateChange={() => {}} />);
    expect(screen.getByText(/back to today/i)).toBeInTheDocument();
  });

  it('does not show "Back to Today" when on today (date=null)', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} />);
    expect(screen.queryByText(/back to today/i)).not.toBeInTheDocument();
  });

  it('calls onDateChange(null) when "Back to Today" is clicked', () => {
    const onChange = vi.fn();
    render(<DispatchDateControl date="2025-03-10" onDateChange={onChange} />);
    fireEvent.click(screen.getByText(/back to today/i));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('DispatchDateControl — accessibility', () => {
  it('has aria-label on prev button', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} />);
    expect(screen.getByLabelText('Previous day')).toBeInTheDocument();
  });

  it('has aria-label on next button', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} />);
    expect(screen.getByLabelText('Next day')).toBeInTheDocument();
  });

  it('hidden date input has tabIndex=-1 and aria-hidden', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} />);
    const input = document.querySelector('input[type="date"]');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('aria-hidden', 'true');
  });

  it('has aria-live=polite on the scope label', () => {
    render(<DispatchDateControl date={null} onDateChange={() => {}} />);
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });
});
