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
import { AuthorityGate } from '../../App';

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
