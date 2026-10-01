import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock all page-level imports used by AuthorityGate's dependencies
vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { useAuth } from '../../context/AuthContext';
import { AuthorityGate, getNavSections } from '../../App';

function renderGate(user) {
  useAuth.mockReturnValue({ user });
  return render(
    <MemoryRouter>
      <AuthorityGate>
        <div data-testid="authority-content">Authority Content</div>
      </AuthorityGate>
    </MemoryRouter>
  );
}

describe('Authority nav gating (AuthorityGate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks field_service account — shows Authority Unavailable', () => {
    renderGate({ role: 'owner', account_type: 'field_service', authority_enabled: false });

    expect(screen.getByText('Authority Unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('authority-content')).not.toBeInTheDocument();
  });

  it('passes institution account with authority_enabled=true — shows content', () => {
    renderGate({ role: 'owner', account_type: 'institution', authority_enabled: true });

    expect(screen.getByTestId('authority-content')).toBeInTheDocument();
    expect(screen.queryByText('Authority Unavailable')).not.toBeInTheDocument();
  });

  it('blocks institution account with authority_enabled=false — shows Authority Unavailable', () => {
    renderGate({ role: 'owner', account_type: 'institution', authority_enabled: false });

    expect(screen.getByText('Authority Unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('authority-content')).not.toBeInTheDocument();
  });
});

// ── Nav section isolation (getNavSections pure-function tests) ────────────────
// These tests verify the sidebar section visibility logic directly, without
// rendering the full App, so they stay fast and dependency-free.

describe('Sidebar nav section isolation', () => {

  it('institution owner with authority_enabled=true — authority section visible', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.authority).toBe(true);
  });

  it('institution owner with authority_enabled=true — operations section hidden', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.operations).toBe(false);
  });

  it('institution owner with authority_enabled=true — finance section hidden', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.finance).toBe(false);
  });

  it('institution owner with authority_enabled=true — crm section hidden', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.crm).toBe(false);
  });

  it('institution owner with authority_enabled=true — team/fleet/entities admin links hidden', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.adminTeamFleet).toBe(false);
  });

  it('institution owner with authority_enabled=true — settings admin link visible', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.adminSettings).toBe(true);
  });

  it('field_service owner — operations visible, authority hidden', () => {
    const s = getNavSections({ role: 'owner', account_type: 'field_service', authority_enabled: false });
    expect(s.operations).toBe(true);
    expect(s.authority).toBe(false);
    expect(s.finance).toBe(true);
    expect(s.crm).toBe(true);
    expect(s.adminTeamFleet).toBe(true);
  });

  it('institution owner with authority_enabled=false — falls back to field_service nav', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: false });
    expect(s.authority).toBe(false);
    expect(s.operations).toBe(true);
    expect(s.finance).toBe(true);
  });

  it('institution manager with authority_enabled=true — same isolation applies', () => {
    const s = getNavSections({ role: 'manager', account_type: 'institution', authority_enabled: true });
    expect(s.authority).toBe(true);
    expect(s.operations).toBe(false);
    expect(s.finance).toBe(false);
    expect(s.crm).toBe(false);
    expect(s.adminSettings).toBe(false);
  });
});

// ── Problem 5: Entity switcher isolation ──────────────────────────────────────

describe('Entity switcher isolation (Problem 5)', () => {

  it('institution with authority_enabled=true — entitySwitcher is false', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.entitySwitcher).toBe(false);
  });

  it('institution with authority_enabled=true — institutionCtx is true', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.institutionCtx).toBe(true);
  });

  it('field_service owner — entitySwitcher is true', () => {
    const s = getNavSections({ role: 'owner', account_type: 'field_service', authority_enabled: false });
    expect(s.entitySwitcher).toBe(true);
  });

  it('field_service owner — institutionCtx is false', () => {
    const s = getNavSections({ role: 'owner', account_type: 'field_service', authority_enabled: false });
    expect(s.institutionCtx).toBe(false);
  });

  it('institution with authority_enabled=false falls back — entitySwitcher is true', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: false });
    expect(s.entitySwitcher).toBe(true);
    expect(s.institutionCtx).toBe(false);
  });
});

// ── Batch 1 — Problem 1: institution app class / topbar suppression ──────────

describe('Batch1-P1: institution app class and empty header suppression', () => {

  it('institution+authority_enabled → isInstitution=true, applying app--institution CSS class', () => {
    // isInstitution drives both the app--institution class on the root div
    // (CSS: .app--institution .topbar { display: none }) and nav isolation.
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.institutionCtx).toBe(true);
    expect(s.headerPhone).toBe(false);
    expect(s.headerCreateMenu).toBe(false);
    expect(s.authority).toBe(true);
    expect(s.operations).toBe(false);
  });

  it('field_service → isInstitution=false, topbar remains visible (no app--institution class)', () => {
    const s = getNavSections({ role: 'owner', account_type: 'field_service', authority_enabled: false });
    expect(s.institutionCtx).toBe(false);
    expect(s.headerPhone).toBe(true);
    expect(s.headerCreateMenu).toBe(true);
    expect(s.authority).toBe(false);
    expect(s.operations).toBe(true);
  });

  it('institution with authority_enabled=false does NOT enter institution mode', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: false });
    expect(s.institutionCtx).toBe(false);
    expect(s.headerPhone).toBe(true);
  });
});

// ── Problem 7: Header CRM control isolation ───────────────────────────────────

describe('Header CRM control isolation (Problem 7)', () => {

  it('institution owner — headerPhone is false', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.headerPhone).toBe(false);
  });

  it('institution owner — headerCreateMenu is false', () => {
    const s = getNavSections({ role: 'owner', account_type: 'institution', authority_enabled: true });
    expect(s.headerCreateMenu).toBe(false);
  });

  it('institution manager — headerPhone and headerCreateMenu are both false', () => {
    const s = getNavSections({ role: 'manager', account_type: 'institution', authority_enabled: true });
    expect(s.headerPhone).toBe(false);
    expect(s.headerCreateMenu).toBe(false);
  });

  it('field_service owner — headerPhone is true', () => {
    const s = getNavSections({ role: 'owner', account_type: 'field_service', authority_enabled: false });
    expect(s.headerPhone).toBe(true);
  });

  it('field_service owner — headerCreateMenu is true', () => {
    const s = getNavSections({ role: 'owner', account_type: 'field_service', authority_enabled: false });
    expect(s.headerCreateMenu).toBe(true);
  });

  it('field_service staff — headerPhone is true, headerCreateMenu is false', () => {
    const s = getNavSections({ role: 'staff', account_type: 'field_service', authority_enabled: false });
    expect(s.headerPhone).toBe(true);
    expect(s.headerCreateMenu).toBe(false);
  });
});
