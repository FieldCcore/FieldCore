import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QBMappingModal from '../QBMappingModal';

vi.mock('../../../api', () => ({
  default: {
    get:  vi.fn(),
    post: vi.fn(),
  },
}));

import api from '../../../api';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_MAPPINGS = [
  // Balance sheet — auto-mapped
  { provider_account_id: 'bs-001', provider_account_name: 'Checking Account',
    provider_account_type: 'Bank', provider_account_subtype: 'Checking',
    fieldcore_category: 'balance_sheet', fieldcore_subcategory: 'cash_bank',
    mapping_confidence: 'deterministic', is_balance_sheet: true, is_ignored: false, is_active: true },
  // High confidence opex
  { provider_account_id: 'opex-001', provider_account_name: 'Advertising',
    provider_account_type: 'Expense', provider_account_subtype: 'Advertising',
    fieldcore_category: 'operating_expenses', fieldcore_subcategory: 'marketing',
    mapping_confidence: 'high_confidence', is_balance_sheet: false, is_ignored: false, is_active: true },
  // Needs review — generic expense, no subcategory
  { provider_account_id: 'rev-001', provider_account_name: 'Miscellaneous',
    provider_account_type: 'Expense', provider_account_subtype: null,
    fieldcore_category: null, fieldcore_subcategory: null,
    mapping_confidence: 'review_required', is_balance_sheet: false, is_ignored: false, is_active: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { mappings: MOCK_MAPPINGS } });
  api.post.mockResolvedValue({ data: { updated: 3 } });
});

// ── Default filter ────────────────────────────────────────────────────────────

describe('QBMappingModal — default filter', () => {
  it('opens with All filter selected by default', async () => {
    render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    const select = screen.getByLabelText('Filter by status');
    expect(select.value).toBe('all');
  });

  it('shows all accounts (not just needs_review) on open', async () => {
    render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    // All three mock accounts should be visible with default 'all' filter
    expect(screen.getByText('Checking Account')).toBeInTheDocument();
    expect(screen.getByText('Advertising')).toBeInTheDocument();
    expect(screen.getByText('Miscellaneous')).toBeInTheDocument();
  });

  it('All option in filter dropdown shows total count', async () => {
    render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    // The All option should include the total count
    expect(screen.getByRole('option', { name: /All \(3\)/ })).toBeInTheDocument();
  });
});

// ── Table structure / no overlap ──────────────────────────────────────────────

describe('QBMappingModal — table structure', () => {
  it('renders table header with correct columns', async () => {
    render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    expect(screen.getByText('Account Name')).toBeInTheDocument();
    expect(screen.getByText('QB Type')).toBeInTheDocument();
    expect(screen.getByText('FieldCore Category')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('thead uses sticky positioning', async () => {
    const { container } = render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    const thead = container.querySelector('thead');
    expect(thead).not.toBeNull();
    expect(thead.style.position).toBe('sticky');
    expect(thead.style.top).toBe('0px');
  });

  it('modal card has maxHeight so table wrapper can scroll', async () => {
    const { container } = render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    // The inner card div should have a maxHeight constraint
    const card = container.querySelector('[role="dialog"] > div');
    expect(card).not.toBeNull();
    expect(card.style.maxHeight).toBeTruthy();
  });

  it('table wrapper has minHeight 0 for proper flex scroll containment', async () => {
    const { container } = render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    const wrapper = table.parentElement;
    expect(wrapper.style.minHeight).toBe('0px');
    expect(wrapper.style.overflowY).toBe('auto');
  });

  it('first data row renders after the header row', async () => {
    const { container } = render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    // First tbody row should contain an account name, not a header
    expect(rows[0].textContent).not.toContain('Account Name');
  });
});

// ── Filter switching ──────────────────────────────────────────────────────────

describe('QBMappingModal — filter switching', () => {
  it('switching to needs_review shows only unmapped P&L accounts', async () => {
    render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    const select = screen.getByLabelText('Filter by status');
    fireEvent.change(select, { target: { value: 'needs_review' } });

    // Only Miscellaneous is needs_review
    expect(screen.getByText('Miscellaneous')).toBeInTheDocument();
    expect(screen.queryByText('Checking Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Advertising')).not.toBeInTheDocument();
  });

  it('switching to balance_sheet shows only balance sheet accounts', async () => {
    render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    const select = screen.getByLabelText('Filter by status');
    fireEvent.change(select, { target: { value: 'balance_sheet' } });

    expect(screen.getByText('Checking Account')).toBeInTheDocument();
    expect(screen.queryByText('Miscellaneous')).not.toBeInTheDocument();
  });
});

// ── Footer counts ─────────────────────────────────────────────────────────────

describe('QBMappingModal — footer counts', () => {
  it('footer shows correct total and balance sheet count', async () => {
    render(<QBMappingModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    // Footer: "3 total · 1 balance sheet · N need review"
    const footer = screen.getByText(/total/);
    expect(footer.textContent).toContain('3 total');
    expect(footer.textContent).toContain('1 balance sheet');
  });
});

// ── Close / Escape ────────────────────────────────────────────────────────────

describe('QBMappingModal — close behavior', () => {
  it('calls onClose when × button is clicked', async () => {
    const onClose = vi.fn();
    render(<QBMappingModal onClose={onClose} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn();
    render(<QBMappingModal onClose={onClose} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
