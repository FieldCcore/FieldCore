import { describe, it, expect } from 'vitest';
import { resolveDispatchKpiSet, SUPPORTED_METRICS } from '../resolveDispatchKpiSet';

const DEFAULT_FOUR = ['liveTechnicians', 'activeJobs', 'todaysJobs', 'completedToday'];
const DEFAULT_FIVE = ['liveTechnicians', 'activeJobs', 'todaysJobs', 'completedToday', 'averageResponse'];

// ── Basic contract ────────────────────────────────────────────────────────────

describe('resolveDispatchKpiSet — basic contract', () => {
  it('returns an array of strings', () => {
    const result = resolveDispatchKpiSet();
    expect(Array.isArray(result)).toBe(true);
    result.forEach(k => expect(typeof k).toBe('string'));
  });

  it('returns at most 5 items', () => {
    expect(resolveDispatchKpiSet().length).toBeLessThanOrEqual(5);
  });

  it('has no duplicate keys', () => {
    const result = resolveDispatchKpiSet();
    expect(new Set(result).size).toBe(result.length);
  });

  it('contains only SUPPORTED_METRICS keys', () => {
    const result = resolveDispatchKpiSet();
    result.forEach(k => expect(SUPPORTED_METRICS.has(k)).toBe(true));
  });

  it('returns 4 default cards with no settings (averageResponse is opt-in)', () => {
    expect(resolveDispatchKpiSet()).toEqual(DEFAULT_FOUR);
  });

  it('averageResponse not included by default', () => {
    expect(resolveDispatchKpiSet()).not.toContain('averageResponse');
  });

  it('averageResponse included when explicitly enabled', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_show_avg_response: true } });
    expect(result).toContain('averageResponse');
  });
});

// ── Fixed layout mode ─────────────────────────────────────────────────────────

describe('resolveDispatchKpiSet — fixed layout', () => {
  it('respects fixed layout when kpi_fixed_layout=true (4 default cards)', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_fixed_layout: true } });
    expect(result).toEqual(DEFAULT_FOUR);
  });

  it('hides liveTechnicians when kpi_show_live_techs=false in fixed mode', () => {
    const result = resolveDispatchKpiSet({
      settings: { kpi_fixed_layout: true, kpi_show_live_techs: false },
    });
    expect(result).not.toContain('liveTechnicians');
  });

  it('hides averageResponse when kpi_show_avg_response=false in fixed mode', () => {
    const result = resolveDispatchKpiSet({
      settings: { kpi_fixed_layout: true, kpi_show_avg_response: false },
    });
    expect(result).not.toContain('averageResponse');
  });

  it('returns max 5 items even when many are enabled', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_fixed_layout: true } });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns no duplicates in fixed mode when something is hidden', () => {
    const result = resolveDispatchKpiSet({
      settings: { kpi_fixed_layout: true, kpi_show_completed_today: false },
    });
    expect(new Set(result).size).toBe(result.length);
  });
});

// ── Adaptive mode ─────────────────────────────────────────────────────────────

describe('resolveDispatchKpiSet — adaptive mode', () => {
  it('solo operator (technicianCount=1) moves todaysJobs to front', () => {
    const result = resolveDispatchKpiSet({
      settings: { kpi_adaptive_kpis_enabled: true },
      technicianCount: 1,
    });
    expect(result[0]).toBe('todaysJobs');
  });

  it('multi-tech keeps liveTechnicians in normal position', () => {
    const result = resolveDispatchKpiSet({
      settings: { kpi_adaptive_kpis_enabled: true },
      technicianCount: 3,
    });
    expect(result[0]).toBe('liveTechnicians');
  });

  it('adaptive disabled: solo operator keeps normal order', () => {
    const result = resolveDispatchKpiSet({
      settings: { kpi_adaptive_kpis_enabled: false },
      technicianCount: 1,
    });
    expect(result[0]).toBe('liveTechnicians');
  });

  it('no duplicate todaysJobs after solo-operator substitution', () => {
    const result = resolveDispatchKpiSet({
      settings: { kpi_adaptive_kpis_enabled: true },
      technicianCount: 1,
    });
    expect(new Set(result).size).toBe(result.length);
  });
});

// ── Visibility toggles ────────────────────────────────────────────────────────

describe('resolveDispatchKpiSet — visibility settings', () => {
  it('excludes liveTechnicians when hidden', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_show_live_techs: false } });
    expect(result).not.toContain('liveTechnicians');
  });

  it('excludes activeJobs when hidden', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_show_active_jobs: false } });
    expect(result).not.toContain('activeJobs');
  });

  it('excludes todaysJobs when hidden', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_show_todays_jobs: false } });
    expect(result).not.toContain('todaysJobs');
  });

  it('excludes completedToday when hidden', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_show_completed_today: false } });
    expect(result).not.toContain('completedToday');
  });

  it('excludes averageResponse when hidden', () => {
    const result = resolveDispatchKpiSet({ settings: { kpi_show_avg_response: false } });
    expect(result).not.toContain('averageResponse');
  });

  it('all visible including averageResponse: returns default five', () => {
    const result = resolveDispatchKpiSet({
      settings: {
        kpi_show_live_techs:      true,
        kpi_show_active_jobs:     true,
        kpi_show_todays_jobs:     true,
        kpi_show_completed_today: true,
        kpi_show_avg_response:    true,
      },
    });
    expect(result).toEqual(DEFAULT_FIVE);
  });
});

// ── SUPPORTED_METRICS export ──────────────────────────────────────────────────

describe('SUPPORTED_METRICS', () => {
  it('is a Set', () => {
    expect(SUPPORTED_METRICS instanceof Set).toBe(true);
  });

  it('contains all 5 known keys including averageResponse', () => {
    DEFAULT_FIVE.forEach(k => expect(SUPPORTED_METRICS.has(k)).toBe(true));
  });
});
