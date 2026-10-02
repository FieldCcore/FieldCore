import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api', () => ({
  default: {
    get:    vi.fn(),
    post:   vi.fn(),
    delete: vi.fn(),
    patch:  vi.fn(),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, Link: ({ children, to }) => <a href={to}>{children}</a> };
});

vi.mock('../BusinessSettings', () => ({
  default: () => <div data-testid="business-settings-stub" />,
}));

import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import Account from '../Account';

function setupUser(overrides = {}) {
  useAuth.mockReturnValue({
    user: {
      id: 'user-1', name: 'Morgan Chen', email: 'morgan@example.com',
      role: 'owner', plan: 'pro', account_type: 'business',
      authority_enabled: false,
      ...overrides,
    },
    logout: vi.fn(),
  });
}

function renderAccount() {
  return render(<MemoryRouter><Account /></MemoryRouter>);
}

// ── Screenshot corrections — Settings / Account sentence-case copy ────────────

describe('Screenshot corrections — Settings account tab labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUser();
    api.get.mockResolvedValue({ data: [] });
  });

  it('tab label is "My account" (sentence case), not "My Account"', () => {
    renderAccount();
    expect(screen.getByRole('button', { name: 'My account' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'My Account' })).toBeNull();
  });

  it('section heading is "Change password" (sentence case), not "Change Password"', () => {
    renderAccount();
    expect(screen.getByText('Change password')).toBeTruthy();
    expect(screen.queryByText('Change Password')).toBeNull();
  });

  it('form label is "Current password" (sentence case), not "Current Password"', () => {
    renderAccount();
    expect(screen.getByText('Current password')).toBeTruthy();
    expect(screen.queryByText('Current Password')).toBeNull();
  });

  it('form label is "New password" (sentence case), not "New Password"', () => {
    renderAccount();
    expect(screen.getByText('New password')).toBeTruthy();
    expect(screen.queryByText('New Password')).toBeNull();
  });

  it('form label is "Confirm new password" (sentence case), not "Confirm New Password"', () => {
    renderAccount();
    expect(screen.getByText('Confirm new password')).toBeTruthy();
    expect(screen.queryByText('Confirm New Password')).toBeNull();
  });

  it('submit button reads "Update password" (sentence case), not "Update Password"', () => {
    renderAccount();
    expect(screen.getByRole('button', { name: 'Update password' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Update Password' })).toBeNull();
  });

  it('section heading is "Active sessions" (sentence case), not "Active Sessions"', async () => {
    renderAccount();
    await waitFor(() => expect(screen.getByText('Active sessions')).toBeTruthy());
    expect(screen.queryByText('Active Sessions')).toBeNull();
  });
});

// ── Password helper text accurately describes validator ───────────────────────

describe('Screenshot corrections — password helper text matches validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUser();
    api.get.mockResolvedValue({ data: [] });
  });

  it('new password field placeholder mentions minimum 8 characters', () => {
    renderAccount();
    const input = screen.getByPlaceholderText(/Minimum 8 characters/i);
    expect(input).toBeTruthy();
  });

  it('new password field placeholder mentions mixed case', () => {
    renderAccount();
    const input = screen.getByPlaceholderText(/mixed case/i);
    expect(input).toBeTruthy();
  });

  it('new password field placeholder mentions a number', () => {
    renderAccount();
    const input = screen.getByPlaceholderText(/a number/i);
    expect(input).toBeTruthy();
  });

  it('new password field placeholder mentions a special character', () => {
    renderAccount();
    const input = screen.getByPlaceholderText(/a special character/i);
    expect(input).toBeTruthy();
  });

  it('placeholder does not use old shorthand "Min. 8 chars"', () => {
    renderAccount();
    const inputs = screen.queryAllByPlaceholderText(/Min\. 8 chars/i);
    expect(inputs.length).toBe(0);
  });
});
