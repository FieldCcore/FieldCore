import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Invoices from '../Invoices';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../components/InvoiceDetail', () => ({
  default: ({ onClose }) => <div data-testid="invoice-detail"><button onClick={onClose}>Close</button></div>,
}));

vi.mock('../../components/InvoiceBuilder', () => ({
  default: ({ onClose }) => <div data-testid="invoice-builder"><button onClick={onClose}>Cancel</button></div>,
}));

import api from '../../api';

const MOCK_KPIS = {
  outstanding: 400, collected: 200, pastDue: 0, pastDueCount: 0, totalCount: 3,
  issuedCount: 2, issuedTotal: 600, averageInvoice: 300,
  counts: { all: 3, draft: 0, pending: 1, paid: 1, void: 1, past_due: 0 },
};

const MOCK_RESPONSE = {
  rows: [
    { id: 'inv-1', invoice_number: '1001', client_name: 'Able Corp', amount: '400.00',
      balance: '400.00', status: 'pending', is_past_due: false, due_date: null,
      created_at: '2026-08-01T10:00:00Z', source_type: 'MANUAL' },
    { id: 'inv-2', invoice_number: '1002', client_name: 'Baker LLC', amount: '200.00',
      balance: '0', status: 'paid', is_past_due: false, due_date: null,
      created_at: '2026-08-02T10:00:00Z', source_type: 'AGREEMENT' },
  ],
  total: 2, page: 1, pageSize: 50, kpis: MOCK_KPIS,
};

function setup(response = MOCK_RESPONSE) {
  api.get.mockResolvedValue({ data: response });
  return render(
    <MemoryRouter initialEntries={['/invoices']}>
      <Invoices />
    </MemoryRouter>
  );
}

beforeEach(() => { vi.resetAllMocks(); });

// ── Filters button ─────────────────────────────────────────────────────────────

describe('Filters button — INV-FILTER-001', () => {
  it('renders a Filters button in the toolbar', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
  });

  it('Filters button has aria-expanded=false by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /filters/i }).getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking Filters opens the panel with role=dialog', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

// ── Filter panel sections ─────────────────────────────────────────────────────

describe('Filter panel sections — INV-FILTER-002', () => {
  async function openPanel() {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    return document.querySelector('.inv-filter-panel');
  }

  it('panel has Balance section', async () => {
    const panel = await openPanel();
    expect(panel.textContent).toMatch(/Balance/i);
  });

  it('panel has Due Date section', async () => {
    const panel = await openPanel();
    expect(panel.textContent).toMatch(/Due Date/i);
  });

  it('panel has Client section', async () => {
    const panel = await openPanel();
    expect(panel.textContent).toMatch(/Client/i);
  });

  it('panel has Invoice Source section', async () => {
    const panel = await openPanel();
    expect(panel.textContent).toMatch(/Invoice Source/i);
  });

  it('panel has Amount section', async () => {
    const panel = await openPanel();
    expect(panel.textContent).toMatch(/Amount/i);
  });

  it('panel has Service section', async () => {
    const panel = await openPanel();
    expect(panel.textContent).toMatch(/Service/i);
  });
});

// ── Balance filter ─────────────────────────────────────────────────────────────

describe('Balance filter — INV-FILTER-003', () => {
  it('has All balances, Balance > $0, Balance = $0, Custom range options', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(screen.getByLabelText('All balances')).toBeInTheDocument();
    expect(screen.getByLabelText('Balance > $0')).toBeInTheDocument();
    expect(screen.getByLabelText('Balance = $0')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom range')).toBeInTheDocument();
  });

  it('selecting Balance > $0 creates an active chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Balance > $0'));
    await waitFor(() => {
      const chips = document.querySelector('.inv-filter-chips');
      expect(chips).not.toBeNull();
      expect(chips.textContent).toMatch(/Balance > \$0/);
    });
  });

  it('selecting Balance = $0 creates an active chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Balance = $0'));
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-chips').textContent).toMatch(/Balance = \$0/);
    });
  });

  it('Custom range shows min/max inputs', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Custom range'));
    const mins = screen.getAllByPlaceholderText('Min');
    const maxs = screen.getAllByPlaceholderText('Max');
    expect(mins.length).toBeGreaterThan(0);
    expect(maxs.length).toBeGreaterThan(0);
  });

  it('chip remove button clears balance filter', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Balance > $0'));
    await waitFor(() => document.querySelector('.inv-chip'));
    const chip = document.querySelector('.inv-chip');
    fireEvent.click(chip.querySelector('.inv-chip-remove'));
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-chips')).toBeNull();
    });
  });
});

// ── Invoice Source filter ──────────────────────────────────────────────────────

describe('Invoice Source filter — INV-FILTER-004', () => {
  it('shows all four source type options', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(screen.getByLabelText('Blank / Standard')).toBeInTheDocument();
    expect(screen.getByLabelText('Completed Job')).toBeInTheDocument();
    expect(screen.getByLabelText('Existing Estimate')).toBeInTheDocument();
    expect(screen.getByLabelText('Recurring Agreement')).toBeInTheDocument();
  });

  it('selecting Recurring Agreement shows chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Recurring Agreement'));
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-chips').textContent).toMatch(/Recurring Agreement/);
    });
  });

  it('selecting Completed Job shows chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Completed Job'));
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-chips').textContent).toMatch(/Completed Job/);
    });
  });

  it('source chip has a remove button', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Existing Estimate'));
    await waitFor(() => document.querySelector('.inv-chip'));
    expect(document.querySelector('.inv-chip .inv-chip-remove')).not.toBeNull();
  });
});

// ── Amount filter ──────────────────────────────────────────────────────────────

describe('Amount filter — INV-FILTER-005', () => {
  it('amount min/max inputs present in filter panel', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    const mins = screen.getAllByPlaceholderText('Min');
    const maxs = screen.getAllByPlaceholderText('Max');
    expect(mins.length).toBeGreaterThan(0);
    expect(maxs.length).toBeGreaterThan(0);
  });

  it('entering amount min creates a chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    // Amount min is the last group's Min input
    const mins = screen.getAllByPlaceholderText('Min');
    const amountMin = mins[mins.length - 1];
    fireEvent.change(amountMin, { target: { value: '100' } });
    await waitFor(() => {
      const chips = document.querySelector('.inv-filter-chips');
      expect(chips).not.toBeNull();
      expect(chips.textContent).toMatch(/Amount.*100/);
    });
  });
});

// ── Service filter ─────────────────────────────────────────────────────────────

describe('Service filter — INV-FILTER-006', () => {
  it('service filter input is present in filter panel', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(screen.getByPlaceholderText(/filter by service type/i)).toBeInTheDocument();
  });

  it('entering service type creates a chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.change(screen.getByPlaceholderText(/filter by service type/i), { target: { value: 'HVAC' } });
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-chips').textContent).toMatch(/Service: HVAC/);
    });
  });
});

// ── Active filter count badge ──────────────────────────────────────────────────

describe('Filter badge count — INV-FILTER-007', () => {
  it('no badge shown when no advanced filters active', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelector('.inv-filter-badge')).toBeNull();
  });

  it('badge shows 1 when one advanced filter is active', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Completed Job'));
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-badge')).not.toBeNull();
      expect(document.querySelector('.inv-filter-badge').textContent).toBe('1');
    });
  });

  it('badge shows 2 when two advanced filters are active', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Completed Job'));
    fireEvent.click(screen.getByLabelText('Balance > $0'));
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-badge').textContent).toBe('2');
    });
  });
});

// ── Clear All ─────────────────────────────────────────────────────────────────

describe('Clear All — INV-FILTER-008', () => {
  it('Clear All button appears when any filter is active', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Recurring Agreement'));
    await waitFor(() => screen.getByText('Clear All'));
    expect(screen.getByText('Clear All')).toBeInTheDocument();
  });

  it('Clear All removes all active chips', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Balance > $0'));
    fireEvent.click(screen.getByLabelText('Recurring Agreement'));
    await waitFor(() => screen.getByText('Clear All'));
    fireEvent.click(screen.getByText('Clear All'));
    await waitFor(() => {
      expect(document.querySelector('.inv-filter-chips')).toBeNull();
    });
  });
});

// ── Due Date filter ────────────────────────────────────────────────────────────

describe('Due Date filter — INV-FILTER-009', () => {
  it('due date From/To inputs are in the filter panel', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    const panel = document.querySelector('.inv-filter-panel');
    const dateInputs = panel.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('setting due date From creates a chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    const panel = document.querySelector('.inv-filter-panel');
    const dateInputs = panel.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-09-01' } });
    await waitFor(() => {
      const chips = document.querySelector('.inv-filter-chips');
      expect(chips).not.toBeNull();
      expect(chips.textContent).toMatch(/Due/);
    });
  });
});

// ── Combined filters + chips ───────────────────────────────────────────────────

describe('Combined filters — INV-FILTER-010', () => {
  it('multiple active filters each show a separate chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    // Activate status filter
    const statusTrigger = document.querySelectorAll('.inv-filter-trigger')[0];
    fireEvent.click(statusTrigger);
    await waitFor(() => document.querySelector('.inv-dropdown-item'));
    const pendingItem = Array.from(document.querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Pending') && !el.textContent.includes('Past'));
    fireEvent.click(pendingItem);
    // Activate source filter
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(screen.getByLabelText('Completed Job'));
    await waitFor(() => {
      const chips = document.querySelectorAll('.inv-chip');
      expect(chips.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ── INV-008 regression — default sort visible ─────────────────────────────────

describe('INV-008 regression — default sort', () => {
  it('Invoice # column has aria-sort descending by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const ths = document.querySelectorAll('.inv-th-sortable');
    const invoiceNumTh = Array.from(ths).find(th => th.textContent.includes('Invoice #'));
    expect(invoiceNumTh).toBeDefined();
    expect(invoiceNumTh.getAttribute('aria-sort')).toBe('descending');
  });

  it('other sortable columns have aria-sort=none by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const ths = document.querySelectorAll('.inv-th-sortable');
    const inactive = Array.from(ths).filter(th => !th.textContent.includes('Invoice #'));
    inactive.forEach(th => expect(th.getAttribute('aria-sort')).toBe('none'));
  });
});
