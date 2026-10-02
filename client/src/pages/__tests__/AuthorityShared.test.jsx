import { describe, it, expect } from 'vitest';
import { auStatusLabel } from '../AuthorityShared';

// ── auStatusLabel — centralized status formatter ──────────────────────────────

describe('auStatusLabel — null / missing input', () => {
  it('returns em-dash for null', () => {
    expect(auStatusLabel(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(auStatusLabel(undefined)).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    expect(auStatusLabel('')).toBe('—');
  });
});

describe('auStatusLabel — case lifecycle statuses (uppercase from backend)', () => {
  it('DRAFT → Draft', () => {
    expect(auStatusLabel('DRAFT')).toBe('Draft');
  });

  it('AWAITING_DOCUMENTS → Awaiting documents', () => {
    expect(auStatusLabel('AWAITING_DOCUMENTS')).toBe('Awaiting documents');
  });

  it('PENDING_EXTRACTION → Pending extraction', () => {
    expect(auStatusLabel('PENDING_EXTRACTION')).toBe('Pending extraction');
  });

  it('EXTRACTION_COMPLETE → Extraction complete', () => {
    expect(auStatusLabel('EXTRACTION_COMPLETE')).toBe('Extraction complete');
  });

  it('PENDING_HUMAN_REVIEW → Pending review (not raw enum)', () => {
    expect(auStatusLabel('PENDING_HUMAN_REVIEW')).toBe('Pending review');
    expect(auStatusLabel('PENDING_HUMAN_REVIEW')).not.toBe('PENDING_HUMAN_REVIEW');
    expect(auStatusLabel('PENDING_HUMAN_REVIEW')).not.toBe('PENDING HUMAN REVIEW');
    expect(auStatusLabel('PENDING_HUMAN_REVIEW')).not.toMatch(/PENDING/);
  });

  it('HUMAN_REVIEW_IN_PROGRESS → In progress (not raw enum)', () => {
    expect(auStatusLabel('HUMAN_REVIEW_IN_PROGRESS')).toBe('In progress');
    expect(auStatusLabel('HUMAN_REVIEW_IN_PROGRESS')).not.toBe('HUMAN_REVIEW_IN_PROGRESS');
    expect(auStatusLabel('HUMAN_REVIEW_IN_PROGRESS')).not.toBe('HUMAN REVIEW IN PROGRESS');
    expect(auStatusLabel('HUMAN_REVIEW_IN_PROGRESS')).not.toMatch(/HUMAN/);
  });

  it('COMPLETED → Completed', () => {
    expect(auStatusLabel('COMPLETED')).toBe('Completed');
  });

  it('CANCELLED → Cancelled', () => {
    expect(auStatusLabel('CANCELLED')).toBe('Cancelled');
  });
});

describe('auStatusLabel — instrument statuses (uppercase from backend)', () => {
  it('UNVERIFIED → Unverified', () => {
    expect(auStatusLabel('UNVERIFIED')).toBe('Unverified');
  });

  it('VERIFIED → Verified', () => {
    expect(auStatusLabel('VERIFIED')).toBe('Verified');
  });

  it('PENDING_REVIEW → Pending review', () => {
    expect(auStatusLabel('PENDING_REVIEW')).toBe('Pending review');
  });

  it('REJECTED → Rejected', () => {
    expect(auStatusLabel('REJECTED')).toBe('Rejected');
  });

  it('REVOKED (uppercase) → Revoked', () => {
    expect(auStatusLabel('REVOKED')).toBe('Revoked');
  });

  it('EXPIRED → Expired', () => {
    expect(auStatusLabel('EXPIRED')).toBe('Expired');
  });

  it('SUPERSEDED (uppercase) → Superseded', () => {
    expect(auStatusLabel('SUPERSEDED')).toBe('Superseded');
  });
});

describe('auStatusLabel — party statuses (uppercase from backend)', () => {
  it('ACTIVE (uppercase) → Active', () => {
    expect(auStatusLabel('ACTIVE')).toBe('Active');
  });

  it('INACTIVE → Inactive', () => {
    expect(auStatusLabel('INACTIVE')).toBe('Inactive');
  });
});

describe('auStatusLabel — permission grant types (lowercase from backend)', () => {
  it('granted → Granted', () => {
    expect(auStatusLabel('granted')).toBe('Granted');
  });

  it('denied → Denied', () => {
    expect(auStatusLabel('denied')).toBe('Denied');
  });
});

describe('auStatusLabel — credential statuses (lowercase from backend)', () => {
  it('active → Active', () => {
    expect(auStatusLabel('active')).toBe('Active');
  });

  it('revoked → Revoked', () => {
    expect(auStatusLabel('revoked')).toBe('Revoked');
  });
});

describe('auStatusLabel — extraction run statuses (lowercase from backend)', () => {
  it('pending → Pending', () => {
    expect(auStatusLabel('pending')).toBe('Pending');
  });

  it('running → Running', () => {
    expect(auStatusLabel('running')).toBe('Running');
  });

  it('completed → Completed', () => {
    expect(auStatusLabel('completed')).toBe('Completed');
  });

  it('failed → Failed', () => {
    expect(auStatusLabel('failed')).toBe('Failed');
  });

  it('cancelled (lowercase) → Cancelled', () => {
    expect(auStatusLabel('cancelled')).toBe('Cancelled');
  });
});

describe('auStatusLabel — candidate statuses (lowercase from backend)', () => {
  it('accepted → Accepted', () => {
    expect(auStatusLabel('accepted')).toBe('Accepted');
  });

  it('superseded (lowercase) → Superseded', () => {
    expect(auStatusLabel('superseded')).toBe('Superseded');
  });
});

describe('auStatusLabel — case-insensitive fallback for known uppercase keys', () => {
  it('lowercase of a known uppercase key resolves correctly', () => {
    // 'pending_human_review' is not directly in the map but its uppercase form is
    expect(auStatusLabel('pending_human_review')).toBe('Pending review');
  });

  it('mixed-case of a known uppercase key resolves correctly', () => {
    expect(auStatusLabel('Draft')).toBe('Draft');
  });
});

describe('auStatusLabel — unknown value safe fallback', () => {
  it('unknown underscore key converts to readable form', () => {
    const result = auStatusLabel('SOME_UNKNOWN_STATE');
    // Must not be the raw enum string
    expect(result).not.toBe('SOME_UNKNOWN_STATE');
    // Must not contain underscores
    expect(result).not.toContain('_');
    // Must start with an uppercase letter
    expect(result).toMatch(/^[A-Z]/);
  });

  it('numeric value converts to string without throwing', () => {
    const result = auStatusLabel(42);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
