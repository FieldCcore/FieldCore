import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate:    () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';
import Login from '../Login';

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

async function submitForm(email = 'test@test.com', password = 'password') {
  fireEvent.change(screen.getByPlaceholderText('you@business.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
}

describe('Login routing', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('routes field_service account to /dashboard', async () => {
    const loginFn = vi.fn().mockResolvedValue({
      role: 'owner',
      account_type: 'field_service',
      authority_enabled: false,
    });
    useAuth.mockReturnValue({ login: loginFn });

    renderLogin();
    await submitForm();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('routes institution account to /authority/cases', async () => {
    const loginFn = vi.fn().mockResolvedValue({
      role: 'owner',
      account_type: 'institution',
      authority_enabled: true,
    });
    useAuth.mockReturnValue({ login: loginFn });

    renderLogin();
    await submitForm();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/authority/cases', { replace: true }));
  });

  it('routes tech role to /tech regardless of account_type', async () => {
    const loginFn = vi.fn().mockResolvedValue({
      role: 'tech',
      account_type: 'field_service',
      authority_enabled: false,
    });
    useAuth.mockReturnValue({ login: loginFn });

    renderLogin();
    await submitForm();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/tech', { replace: true }));
  });
});
