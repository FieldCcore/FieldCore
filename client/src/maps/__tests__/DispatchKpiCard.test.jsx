import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DispatchKpiCard from '../DispatchKpiCard';

function makeMetric(overrides = {}) {
  return {
    key:           'liveTechnicians',
    label:         'Live Techs',
    status:        'active',
    value:         3,
    displayValue:  '3',
    supportingText: '2 online · 1 stale',
    enabled:       true,
    configured:    true,
    sampleSize:    null,
    reasonCode:    null,
    configurePath: null,
    ...overrides,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('DispatchKpiCard — rendering', () => {
  it('renders nothing when metric is null', () => {
    const { container } = render(<DispatchKpiCard metric={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a button element', () => {
    render(<DispatchKpiCard metric={makeMetric()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has type="button"', () => {
    render(<DispatchKpiCard metric={makeMetric()} />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('has aria-label containing label and value', () => {
    render(<DispatchKpiCard metric={makeMetric()} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Live Techs: 3');
  });

  it('has title tooltip', () => {
    render(<DispatchKpiCard metric={makeMetric()} />);
    expect(screen.getByRole('button')).toHaveAttribute('title');
  });
});

// ── Status: active ────────────────────────────────────────────────────────────

describe('DispatchKpiCard — active status', () => {
  it('shows displayValue', () => {
    render(<DispatchKpiCard metric={makeMetric({ displayValue: '42' })} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows supportingText', () => {
    render(<DispatchKpiCard metric={makeMetric()} />);
    expect(screen.getByText('2 online · 1 stale')).toBeInTheDocument();
  });

  it('shows zero value as "0" (not dash, not blank)', () => {
    render(<DispatchKpiCard metric={makeMetric({ value: 0, displayValue: '0' })} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('never shows undefined', () => {
    render(<DispatchKpiCard metric={makeMetric({ displayValue: undefined, value: 5 })} />);
    expect(screen.getByRole('button').textContent).not.toContain('undefined');
  });

  it('never shows NaN', () => {
    render(<DispatchKpiCard metric={makeMetric({ displayValue: NaN })} />);
    expect(screen.getByRole('button').textContent).not.toContain('NaN');
  });

  it('falls back to value when displayValue is null', () => {
    render(<DispatchKpiCard metric={makeMetric({ displayValue: null, value: 7 })} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

// ── Status: no_data ───────────────────────────────────────────────────────────

describe('DispatchKpiCard — no_data status', () => {
  const metric = makeMetric({ status: 'no_data', value: null, displayValue: '—', supportingText: 'No data yet', key: 'averageResponse' });

  it('shows dash', () => {
    render(<DispatchKpiCard metric={metric} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows no data sub text', () => {
    render(<DispatchKpiCard metric={metric} />);
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });
});

// ── Status: not_configured ────────────────────────────────────────────────────

describe('DispatchKpiCard — not_configured status', () => {
  const metric = makeMetric({ status: 'not_configured', value: null, displayValue: null, configured: false });

  it('shows "Set up" value', () => {
    render(<DispatchKpiCard metric={metric} userRole="owner" />);
    expect(screen.getByText('Set up')).toBeInTheDocument();
  });

  it('shows "Configure →" sub for owner', () => {
    render(<DispatchKpiCard metric={metric} userRole="owner" />);
    expect(screen.getByText('Configure →')).toBeInTheDocument();
  });

  it('shows "Contact admin" sub for tech', () => {
    render(<DispatchKpiCard metric={metric} userRole="tech" />);
    expect(screen.getByText('Contact admin')).toBeInTheDocument();
  });

  it('calls onConfigure when owner clicks not_configured card', () => {
    const onConfigure = vi.fn();
    const onClick = vi.fn();
    render(<DispatchKpiCard metric={metric} userRole="owner" onClick={onClick} onConfigure={onConfigure} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onConfigure).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('calls onClick with key when tech clicks not_configured card', () => {
    const onConfigure = vi.fn();
    const onClick = vi.fn();
    render(<DispatchKpiCard metric={metric} userRole="tech" onClick={onClick} onConfigure={onConfigure} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(metric.key);
    expect(onConfigure).not.toHaveBeenCalled();
  });
});

// ── Status: disabled ──────────────────────────────────────────────────────────

describe('DispatchKpiCard — disabled status', () => {
  const metric = makeMetric({ status: 'disabled', value: null, displayValue: null, enabled: false });

  it('shows "Off" value', () => {
    render(<DispatchKpiCard metric={metric} />);
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('shows "Enable in Settings" sub for owner', () => {
    render(<DispatchKpiCard metric={metric} userRole="owner" />);
    expect(screen.getByText('Enable in Settings')).toBeInTheDocument();
  });

  it('shows "Feature disabled" sub for tech', () => {
    render(<DispatchKpiCard metric={metric} userRole="tech" />);
    expect(screen.getByText('Feature disabled')).toBeInTheDocument();
  });
});

// ── Status: unavailable ───────────────────────────────────────────────────────

describe('DispatchKpiCard — unavailable status', () => {
  const metric = makeMetric({ status: 'unavailable', value: null, displayValue: null });

  it('shows dash', () => {
    render(<DispatchKpiCard metric={metric} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows "Temporarily unavailable" sub', () => {
    render(<DispatchKpiCard metric={metric} />);
    expect(screen.getByText('Temporarily unavailable')).toBeInTheDocument();
  });
});

// ── Status: stale ─────────────────────────────────────────────────────────────

describe('DispatchKpiCard — stale status', () => {
  const metric = makeMetric({ status: 'stale', displayValue: '3' });

  it('shows last known value', () => {
    render(<DispatchKpiCard metric={metric} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders stale indicator dot', () => {
    const { container } = render(<DispatchKpiCard metric={metric} />);
    expect(container.querySelector('.dispatch-kpi-stale')).toBeInTheDocument();
  });

  it('does not render stale dot on active status', () => {
    const { container } = render(<DispatchKpiCard metric={makeMetric({ status: 'active' })} />);
    expect(container.querySelector('.dispatch-kpi-stale')).not.toBeInTheDocument();
  });
});

// ── Click behavior ────────────────────────────────────────────────────────────

describe('DispatchKpiCard — click behavior', () => {
  it('calls onClick with metric key on click', () => {
    const onClick = vi.fn();
    render(<DispatchKpiCard metric={makeMetric({ key: 'activeJobs' })} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('activeJobs');
  });

  it('does not throw when onClick is not provided', () => {
    render(<DispatchKpiCard metric={makeMetric()} />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('DispatchKpiCard — accessibility', () => {
  it('is a button with a label', () => {
    render(<DispatchKpiCard metric={makeMetric()} />);
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('aria-label');
  });

  it('dimmed statuses have reduced opacity', () => {
    render(<DispatchKpiCard metric={makeMetric({ status: 'unavailable', displayValue: null })} />);
    const btn = screen.getByRole('button');
    expect(btn.style.opacity).not.toBe('1');
  });

  it('active status has full opacity', () => {
    render(<DispatchKpiCard metric={makeMetric({ status: 'active' })} />);
    const btn = screen.getByRole('button');
    expect(btn.style.opacity).toBe('1');
  });
});
