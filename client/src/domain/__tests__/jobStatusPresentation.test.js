import { describe, it, expect } from 'vitest';
import {
  CAL_STATUS_COLOR,
  SESSION_CAL_COLOR,
  normalizeJobStatus,
  getJobStatusPresentation,
  getJobStatusBadgeStyle,
  getJobMarkerColor,
} from '../jobStatusPresentation';

// ── Color constants ───────────────────────────────────────────────────────────

describe('CAL_STATUS_COLOR', () => {
  it('has correct gold for in_progress (not blue)', () => {
    expect(CAL_STATUS_COLOR.in_progress).toBe('#D4A000');
  });

  it('has correct green for complete', () => {
    expect(CAL_STATUS_COLOR.complete).toBe('#2E7D32');
  });

  it('has correct red for cancelled', () => {
    expect(CAL_STATUS_COLOR.cancelled).toBe('#C62828');
  });

  it('has correct gray for scheduled', () => {
    expect(CAL_STATUS_COLOR.scheduled).toBe('#8A90A2');
  });
});

describe('SESSION_CAL_COLOR', () => {
  it('has in_progress key', () => {
    expect(SESSION_CAL_COLOR.in_progress).toBe('#D4A000');
  });

  it('has completed_for_day key', () => {
    expect(SESSION_CAL_COLOR.completed_for_day).toBe('#2E7D32');
  });
});

// ── normalizeJobStatus ────────────────────────────────────────────────────────

describe('normalizeJobStatus', () => {
  it('passes through canonical statuses unchanged', () => {
    expect(normalizeJobStatus('scheduled')).toBe('scheduled');
    expect(normalizeJobStatus('in_progress')).toBe('in_progress');
    expect(normalizeJobStatus('complete')).toBe('complete');
    expect(normalizeJobStatus('cancelled')).toBe('cancelled');
    expect(normalizeJobStatus('paused')).toBe('paused');
  });

  it('maps "active" alias to "in_progress"', () => {
    expect(normalizeJobStatus('active')).toBe('in_progress');
  });

  it('maps "done" alias to "complete"', () => {
    expect(normalizeJobStatus('done')).toBe('complete');
  });

  it('maps "completed" alias to "complete"', () => {
    expect(normalizeJobStatus('completed')).toBe('complete');
  });

  it('maps "canceled" alias to "cancelled"', () => {
    expect(normalizeJobStatus('canceled')).toBe('cancelled');
  });

  it('handles null gracefully', () => {
    expect(() => normalizeJobStatus(null)).not.toThrow();
  });

  it('handles undefined gracefully', () => {
    expect(() => normalizeJobStatus(undefined)).not.toThrow();
  });

  it('returns unknown status unchanged', () => {
    const result = normalizeJobStatus('some_unknown_status');
    expect(typeof result).toBe('string');
  });
});

// ── getJobStatusPresentation ──────────────────────────────────────────────────

describe('getJobStatusPresentation', () => {
  it('returns an object with label, markerColor, badgeBg, badgeColor, priority', () => {
    const p = getJobStatusPresentation('scheduled');
    expect(p).toHaveProperty('label');
    expect(p).toHaveProperty('markerColor');
    expect(p).toHaveProperty('badgeBg');
    expect(p).toHaveProperty('badgeColor');
    expect(p).toHaveProperty('priority');
  });

  it('returns gold markerColor for in_progress (Calendar source of truth)', () => {
    expect(getJobStatusPresentation('in_progress').markerColor).toBe('#D4A000');
  });

  it('returns green markerColor for complete', () => {
    expect(getJobStatusPresentation('complete').markerColor).toBe('#2E7D32');
  });

  it('returns red markerColor for cancelled', () => {
    expect(getJobStatusPresentation('cancelled').markerColor).toBe('#C62828');
  });

  it('normalizes alias before lookup', () => {
    expect(getJobStatusPresentation('active').markerColor).toBe('#D4A000');
    expect(getJobStatusPresentation('done').markerColor).toBe('#2E7D32');
  });

  it('returns fallback for unknown status without throwing', () => {
    const p = getJobStatusPresentation('totally_unknown_status');
    expect(p).toHaveProperty('markerColor');
    expect(p.markerColor).toBeTruthy();
  });

  it('returns fallback for null without throwing', () => {
    expect(() => getJobStatusPresentation(null)).not.toThrow();
  });

  it('returns fallback for undefined without throwing', () => {
    expect(() => getJobStatusPresentation(undefined)).not.toThrow();
  });

  it('en_route shares color with in_progress', () => {
    expect(getJobStatusPresentation('en_route').markerColor).toBe(
      getJobStatusPresentation('in_progress').markerColor
    );
  });

  it('paused has amber-type markerColor', () => {
    const color = getJobStatusPresentation('paused').markerColor;
    expect(color).toBeTruthy();
    expect(color).not.toBe('#D4A000');
    expect(color).not.toBe('#2E7D32');
  });
});

// ── getJobStatusBadgeStyle ────────────────────────────────────────────────────

describe('getJobStatusBadgeStyle', () => {
  it('returns { background, color } for in_progress', () => {
    const style = getJobStatusBadgeStyle('in_progress');
    expect(style).toHaveProperty('background');
    expect(style).toHaveProperty('color');
  });

  it('returns valid style for cancelled', () => {
    const style = getJobStatusBadgeStyle('cancelled');
    expect(style.background).toBeTruthy();
    expect(style.color).toBeTruthy();
  });

  it('normalizes alias before lookup', () => {
    const s1 = getJobStatusBadgeStyle('done');
    const s2 = getJobStatusBadgeStyle('complete');
    expect(s1).toEqual(s2);
  });
});

// ── getJobMarkerColor ─────────────────────────────────────────────────────────

describe('getJobMarkerColor', () => {
  it('returns gold for in_progress (matches CAL_STATUS_COLOR)', () => {
    expect(getJobMarkerColor('in_progress')).toBe(CAL_STATUS_COLOR.in_progress);
  });

  it('returns green for complete', () => {
    expect(getJobMarkerColor('complete')).toBe(CAL_STATUS_COLOR.complete);
  });

  it('returns red for cancelled', () => {
    expect(getJobMarkerColor('cancelled')).toBe(CAL_STATUS_COLOR.cancelled);
  });

  it('returns gray for scheduled', () => {
    expect(getJobMarkerColor('scheduled')).toBe(CAL_STATUS_COLOR.scheduled);
  });

  it('returns a string for any unknown status (no throw)', () => {
    expect(typeof getJobMarkerColor('unknown_xyz')).toBe('string');
  });

  it('active alias returns same as in_progress', () => {
    expect(getJobMarkerColor('active')).toBe(getJobMarkerColor('in_progress'));
  });
});
