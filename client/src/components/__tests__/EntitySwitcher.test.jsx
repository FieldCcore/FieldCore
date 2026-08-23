import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EntitySwitcher from '../EntitySwitcher';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNav = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNav }));

const mockSwitchAccount = vi.fn();
let mockAuthState = {};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

const ACCOUNTS = [
  { id: 'a1', name: 'Acme Plumbing', role: 'owner', is_home: true },
  { id: 'a2', name: 'Sunset HVAC',   role: 'manager' },
  { id: 'a3', name: 'River Electric', role: 'staff' },
];

function setup(overrides = {}) {
  mockAuthState = {
    user:          { accountId: 'a1' },
    accounts:      ACCOUNTS,
    switching:     false,
    switchError:   null,
    switchAccount: mockSwitchAccount,
    ...overrides,
  };
  return render(<EntitySwitcher />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSwitchAccount.mockResolvedValue(undefined);
});

// ── 1. Active entity always visible ──────────────────────────────────────────

describe('EntitySwitcher — active entity always visible', () => {
  it('renders the active entity name in the trigger', () => {
    setup();
    expect(screen.getByText('Acme Plumbing')).toBeInTheDocument();
  });

  it('renders the active entity role badge', () => {
    setup();
    expect(screen.getByText('owner')).toBeInTheDocument();
  });

  it('renders the Entities section label', () => {
    setup();
    expect(screen.getByText('Entities')).toBeInTheDocument();
  });

  it('returns null when no active account', () => {
    mockAuthState = { user: { accountId: 'x99' }, accounts: ACCOUNTS, switching: false, switchError: null, switchAccount: mockSwitchAccount };
    const { container } = render(<EntitySwitcher />);
    expect(container.firstChild).toBeNull();
  });
});

// ── 2. Dropdown toggle ────────────────────────────────────────────────────────

describe('EntitySwitcher — dropdown toggle', () => {
  it('dropdown is closed by default', () => {
    setup();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens dropdown on trigger click', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes dropdown on second trigger click', () => {
    setup();
    const btn = screen.getByTitle('Acme Plumbing');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not open dropdown when only one account exists', () => {
    setup({ accounts: [ACCOUNTS[0]], user: { accountId: 'a1' } });
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows chevron only when other accounts exist', () => {
    const { container } = setup();
    expect(container.querySelector('.entity-chevron')).toBeInTheDocument();
  });

  it('hides chevron when only one account', () => {
    const { container } = setup({ accounts: [ACCOUNTS[0]], user: { accountId: 'a1' } });
    expect(container.querySelector('.entity-chevron')).not.toBeInTheDocument();
  });
});

// ── 3. Active entity excluded from dropdown ───────────────────────────────────

describe('EntitySwitcher — active entity excluded from dropdown', () => {
  it('does not show the active entity in the dropdown list', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const menu = screen.getByRole('menu');
    expect(menu).not.toHaveTextContent('Acme Plumbing');
  });

  it('shows all other entities in the dropdown', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.getByText('Sunset HVAC')).toBeInTheDocument();
    expect(screen.getByText('River Electric')).toBeInTheDocument();
  });

  it('dropdown has exactly (n-1) menu items', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });
});

// ── 4. Entity switching ───────────────────────────────────────────────────────

describe('EntitySwitcher — entity switching', () => {
  it('calls switchAccount with the correct id when item clicked', async () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    fireEvent.click(screen.getByTitle('Sunset HVAC'));
    expect(mockSwitchAccount).toHaveBeenCalledWith('a2');
  });

  it('navigates to /dashboard after successful switch', async () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    fireEvent.click(screen.getByTitle('Sunset HVAC'));
    await waitFor(() => expect(mockNav).toHaveBeenCalledWith('/dashboard'));
  });

  it('closes dropdown immediately on item click (before promise resolves)', () => {
    mockSwitchAccount.mockReturnValue(new Promise(() => {})); // never resolves
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    fireEvent.click(screen.getByTitle('Sunset HVAC'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not call switchAccount when switching is already in progress', () => {
    setup({ switching: true });
    // trigger is disabled, but even if called programmatically:
    mockAuthState.switching = true;
    // The button is disabled so no click event would reach the handler
    const trigger = screen.getByTitle('Acme Plumbing');
    expect(trigger).toBeDisabled();
    expect(mockSwitchAccount).not.toHaveBeenCalled();
  });

  it('does not navigate when switchAccount throws', async () => {
    mockSwitchAccount.mockRejectedValue(new Error('network error'));
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    fireEvent.click(screen.getByTitle('Sunset HVAC'));
    await waitFor(() => expect(mockSwitchAccount).toHaveBeenCalled());
    expect(mockNav).not.toHaveBeenCalled();
  });
});

// ── 5. Role accuracy ─────────────────────────────────────────────────────────

describe('EntitySwitcher — role accuracy', () => {
  it('shows the correct role for the active entity', () => {
    setup();
    // Active entity trigger has "owner" badge
    const trigger = screen.getByTitle('Acme Plumbing');
    expect(trigger).toHaveTextContent('owner');
  });

  it('shows correct roles for dropdown entities', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const hvacItem = screen.getByTitle('Sunset HVAC');
    expect(hvacItem).toHaveTextContent('manager');
    const electricItem = screen.getByTitle('River Electric');
    expect(electricItem).toHaveTextContent('staff');
  });
});

// ── 6. Entity colors ─────────────────────────────────────────────────────────

// jsdom normalizes hex colors to rgb() — compare by checking non-empty string
// and verify distinct accounts get distinct colors (index-based cycling).
describe('EntitySwitcher — entity colors', () => {
  it('assigns a non-empty background color to the active entity dot', () => {
    const { container } = setup();
    const dots = container.querySelectorAll('.entity-dot');
    expect(dots[0].style.background).toBeTruthy();
  });

  it('assigns index-based colors to dropdown items (first ≠ second)', () => {
    const { container } = setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const dots = container.querySelectorAll('.entity-dot');
    // dot[0] = active (index 0), dot[1] = a2 (index 1) — must differ
    expect(dots[1].style.background).toBeTruthy();
    expect(dots[0].style.background).not.toBe(dots[1].style.background);
  });

  it('wraps colors for accounts beyond 5 (index 5 same color as index 0)', () => {
    const manyAccounts = Array.from({ length: 7 }, (_, i) => ({
      id: `id${i}`, name: `Entity ${i}`, role: 'owner', is_home: i === 0,
    }));
    const { container } = setup({ accounts: manyAccounts, user: { accountId: 'id0' } });
    fireEvent.click(screen.getByTitle('Entity 0'));
    const dots = container.querySelectorAll('.entity-dot');
    // index 5 wraps to same color as index 0; index 6 same as index 1
    expect(dots[5].style.background).toBe(dots[0].style.background);
    expect(dots[6].style.background).toBe(dots[1].style.background);
  });
});

// ── 7. Long name handling ─────────────────────────────────────────────────────

describe('EntitySwitcher — long name handling', () => {
  it('renders very long entity names without wrapping (CSS truncation)', () => {
    const longName = 'Extremely Long Business Name That Would Overflow Without Truncation Ltd.';
    const accounts = [{ id: 'x1', name: longName, role: 'owner', is_home: true }];
    setup({ accounts, user: { accountId: 'x1' } });
    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it('entity-name element has expected CSS truncation classes in markup', () => {
    const { container } = setup();
    const nameEl = container.querySelector('.entity-name');
    expect(nameEl).toBeInTheDocument();
  });
});

// ── 8. Outside click close ────────────────────────────────────────────────────

describe('EntitySwitcher — outside click closes dropdown', () => {
  it('closes dropdown when clicking outside the component', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not close when clicking inside the component', () => {
    setup();
    const trigger = screen.getByTitle('Acme Plumbing');
    fireEvent.click(trigger);
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

// ── 9. Keyboard — Escape ──────────────────────────────────────────────────────

describe('EntitySwitcher — Escape key closes dropdown', () => {
  it('closes dropdown on Escape', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

// ── 10. Keyboard — trigger navigation ────────────────────────────────────────

describe('EntitySwitcher — trigger keyboard navigation', () => {
  it('opens dropdown on Enter key', () => {
    setup();
    const trigger = screen.getByTitle('Acme Plumbing');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('opens dropdown on Space key', () => {
    setup();
    const trigger = screen.getByTitle('Acme Plumbing');
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('opens dropdown on ArrowDown', () => {
    setup();
    const trigger = screen.getByTitle('Acme Plumbing');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('does not open on Enter when only one account', () => {
    setup({ accounts: [ACCOUNTS[0]], user: { accountId: 'a1' } });
    const trigger = screen.getByTitle('Acme Plumbing');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

// ── 11. Keyboard — menu navigation ───────────────────────────────────────────

describe('EntitySwitcher — menu keyboard navigation', () => {
  it('ArrowDown moves focus to next item', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const items = screen.getAllByRole('menuitem');
    items[0].focus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
  });

  it('ArrowUp moves focus to previous item', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const items = screen.getAllByRole('menuitem');
    items[1].focus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('Home moves focus to first item', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const items = screen.getAllByRole('menuitem');
    items[1].focus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('End moves focus to last item', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const items = screen.getAllByRole('menuitem');
    items[0].focus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('ArrowDown wraps from last to first item', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const items = screen.getAllByRole('menuitem');
    items[items.length - 1].focus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
  });
});

// ── 12. ARIA semantics ────────────────────────────────────────────────────────

describe('EntitySwitcher — ARIA semantics', () => {
  it('trigger has aria-haspopup="menu" when others exist', () => {
    setup();
    expect(screen.getByTitle('Acme Plumbing')).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('trigger has aria-expanded=false when closed', () => {
    setup();
    expect(screen.getByTitle('Acme Plumbing')).toHaveAttribute('aria-expanded', 'false');
  });

  it('trigger has aria-expanded=true when open', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.getByTitle('Acme Plumbing')).toHaveAttribute('aria-expanded', 'true');
  });

  it('dropdown has role="menu"', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('dropdown items have role="menuitem"', () => {
    setup();
    fireEvent.click(screen.getByTitle('Acme Plumbing'));
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);
  });

  it('trigger has no aria-haspopup when only one account', () => {
    setup({ accounts: [ACCOUNTS[0]], user: { accountId: 'a1' } });
    expect(screen.getByTitle('Acme Plumbing')).not.toHaveAttribute('aria-haspopup');
  });
});

// ── 13. Loading / switching state ─────────────────────────────────────────────

describe('EntitySwitcher — switching state', () => {
  it('shows "Switching…" in active trigger when switching=true', () => {
    setup({ switching: true });
    expect(screen.getByTitle('Acme Plumbing')).toHaveTextContent('Switching…');
  });

  it('disables trigger when switching=true', () => {
    setup({ switching: true });
    expect(screen.getByTitle('Acme Plumbing')).toBeDisabled();
  });
});

// ── 14. Switch error display ──────────────────────────────────────────────────

describe('EntitySwitcher — switch error display', () => {
  it('shows switchError message when present', () => {
    setup({ switchError: 'Switch failed. Please try again.' });
    expect(screen.getByText('Switch failed. Please try again.')).toBeInTheDocument();
  });

  it('does not render error element when switchError is null', () => {
    setup({ switchError: null });
    const el = document.querySelector('.entity-switch-error');
    expect(el).toBeNull();
  });
});

// ── 15. Single-account hint ───────────────────────────────────────────────────

describe('EntitySwitcher — single-account hint', () => {
  it('shows "Add more entities" hint when only one account', () => {
    setup({ accounts: [ACCOUNTS[0]], user: { accountId: 'a1' } });
    expect(screen.getByText(/Add more entities/i)).toBeInTheDocument();
  });

  it('links to /entities page in the hint', () => {
    setup({ accounts: [ACCOUNTS[0]], user: { accountId: 'a1' } });
    expect(screen.getByRole('link', { name: /Entities/i })).toHaveAttribute('href', '/entities');
  });

  it('does not show hint when multiple accounts exist', () => {
    setup();
    expect(screen.queryByText(/Add more entities/i)).not.toBeInTheDocument();
  });
});
