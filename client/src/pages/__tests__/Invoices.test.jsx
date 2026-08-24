import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Invoices from '../Invoices';

vi.mock('../../api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../components/InvoiceDetail', () => ({
  default: ({ onClose }) => (
    <div data-testid="invoice-detail">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import api from '../../api';

// ── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_INVOICES = [
  {
    id: 'ab12cd34-1111-1111-1111-111111111111',
    invoice_number: 'AB12CD34',
    client_name:    'Able Corp',
    client_address: '1 Main St',
    client_email:   'able@corp.com',
    client_phone:   '555-0001',
    amount:         '400.00',
    balance:        '400.00',
    status:         'pending',
    is_past_due:    false,
    service_type:   'HVAC',
    due_date:       '2026-06-15T12:00:00Z',
    created_at:     '2026-06-13T10:00:00Z',
  },
  {
    id: 'ef56gh78-2222-2222-2222-222222222222',
    invoice_number: 'EF56GH78',
    client_name:    'Baker LLC',
    client_address: '2 Elm St',
    client_email:   'baker@llc.com',
    client_phone:   '555-0002',
    amount:         '200.00',
    balance:        '0',
    status:         'paid',
    is_past_due:    false,
    service_type:   'Plumbing',
    due_date:       null,
    created_at:     '2026-05-29T10:00:00Z',
  },
  {
    id: 'ij90kl12-3333-3333-3333-333333333333',
    invoice_number: 'IJ90KL12',
    client_name:    'Charlie Inc',
    client_address: '3 Oak Ave',
    client_email:   'charlie@inc.com',
    client_phone:   '555-0003',
    amount:         '40.00',
    balance:        null,
    status:         'void',
    is_past_due:    false,
    service_type:   'Electrical',
    due_date:       null,
    created_at:     '2026-05-28T10:00:00Z',
  },
];

const MOCK_KPIS = {
  outstanding:  400,
  collected:    200,
  pastDue:      0,
  pastDueCount: 0,
  totalCount:   3,
  counts:       { all: 3, pending: 1, paid: 1, void: 1, past_due: 0 },
};

const MOCK_RESPONSE = {
  rows:     MOCK_INVOICES,
  total:    3,
  page:     1,
  pageSize: 50,
  kpis:     MOCK_KPIS,
};

const EMPTY_RESPONSE = {
  rows:     [],
  total:    0,
  page:     1,
  pageSize: 50,
  kpis:     { outstanding: 0, collected: 0, pastDue: 0, pastDueCount: 0, totalCount: 0, counts: { all: 0, pending: 0, paid: 0, void: 0, past_due: 0 } },
};

function setup(response = MOCK_RESPONSE) {
  api.get.mockResolvedValueOnce({ data: response });
  return render(<MemoryRouter><Invoices /></MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Loading state ──────────────────────────────────────────────────────────────

describe('Invoices — loading state', () => {
  it('shows loading text while fetching', () => {
    api.get.mockReturnValueOnce(new Promise(() => {}));
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

// ── Error state ────────────────────────────────────────────────────────────────

describe('Invoices — error state', () => {
  it('renders error message when API fails', async () => {
    api.get.mockRejectedValueOnce(new Error('network'));
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/could not load invoices/i)).toBeInTheDocument();
    });
  });

  it('does not render table on error', async () => {
    api.get.mockRejectedValueOnce(new Error('network'));
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    await waitFor(() => screen.getByText(/could not load invoices/i));
    expect(screen.queryByRole('table')).toBeNull();
  });
});

// ── Page structure ─────────────────────────────────────────────────────────────

describe('Invoices — page structure', () => {
  it('renders page heading h1 Invoices', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Invoices');
  });

  it('renders section heading above table', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Invoices', { selector: '.inv-section-title' })).toBeInTheDocument();
  });

  it('shows invoice count in section heading from total field', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText(/3 invoices/i)).toBeInTheDocument();
  });

  it('renders New Invoice button', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /new invoice/i })).toBeInTheDocument();
  });

  it('renders search input', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByPlaceholderText(/search invoices/i)).toBeInTheDocument();
  });
});

// ── KPI cards ──────────────────────────────────────────────────────────────────

describe('Invoices — KPI cards', () => {
  it('renders Outstanding KPI with correct value', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[0].querySelector('.stat-value').textContent).toBe('$400.00');
  });

  it('renders Collected KPI with correct value', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Collected')).toBeInTheDocument();
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[1].querySelector('.stat-value').textContent).toBe('$200.00');
  });

  it('renders Past Due KPI with correct value', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[2].querySelector('.stat-label').textContent).toBe('Past Due');
    expect(cards[2].querySelector('.stat-value').textContent).toBe('$0.00');
  });

  it('renders Total Invoices KPI with correct count', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Total Invoices')).toBeInTheDocument();
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[3].querySelector('.stat-value').textContent).toBe('3');
  });

  it('Outstanding card has accent-red class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[0].classList.contains('stat-card--accent-red')).toBe(true);
  });

  it('Collected card has accent-green class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[1].classList.contains('stat-card--accent-green')).toBe(true);
  });

  it('Past Due card has accent-amber class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[2].classList.contains('stat-card--accent-amber')).toBe(true);
  });

  it('Total Invoices card has accent-blue class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[3].classList.contains('stat-card--accent-blue')).toBe(true);
  });

  it('KPI values are zero when no invoices', async () => {
    setup(EMPTY_RESPONSE);
    await waitFor(() => screen.getByText('Outstanding'));
    const statValues = document.querySelectorAll('.stat-value');
    expect(statValues[0].textContent).toBe('$0.00');
    expect(statValues[1].textContent).toBe('$0.00');
    expect(statValues[2].textContent).toBe('$0.00');
    expect(statValues[3].textContent).toBe('0');
  });

  it('Outstanding value has no inline color style', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[0].querySelector('.stat-value').style.color).toBe('');
  });
});

// ── Filters ────────────────────────────────────────────────────────────────────

describe('Invoices — status filters', () => {
  it('renders five filter buttons (All, Pending, Paid, Void, Past Due)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /^all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pending/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^paid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^void/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^past due/i })).toBeInTheDocument();
  });

  it('All filter is active by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /^all/i }).classList.contains('active')).toBe(true);
  });

  it('filter counts come from kpis.counts', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const counts = document.querySelectorAll('.filter-count');
    // All=3, Pending=1, Paid=1, Void=1, Past Due=0
    expect(counts[0].textContent).toBe('3');
    expect(counts[1].textContent).toBe('1');
    expect(counts[2].textContent).toBe('1');
    expect(counts[3].textContent).toBe('1');
    expect(counts[4].textContent).toBe('0');
  });

  it('filters to pending invoices (server-side)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: {
      ...MOCK_RESPONSE, rows: [MOCK_INVOICES[0]], total: 1,
    }});
    fireEvent.click(screen.getByRole('button', { name: /^pending/i }));
    await waitFor(() => {
      expect(screen.getByText('Able Corp')).toBeInTheDocument();
      expect(screen.queryByText('Baker LLC')).toBeNull();
      expect(screen.queryByText('Charlie Inc')).toBeNull();
    });
  });

  it('filters to paid invoices (server-side)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: {
      ...MOCK_RESPONSE, rows: [MOCK_INVOICES[1]], total: 1,
    }});
    fireEvent.click(screen.getByRole('button', { name: /^paid/i }));
    await waitFor(() => {
      expect(screen.getByText('Baker LLC')).toBeInTheDocument();
      expect(screen.queryByText('Able Corp')).toBeNull();
    });
  });

  it('filters to void invoices (server-side)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: {
      ...MOCK_RESPONSE, rows: [MOCK_INVOICES[2]], total: 1,
    }});
    fireEvent.click(screen.getByRole('button', { name: /^void/i }));
    await waitFor(() => {
      expect(screen.getByText('Charlie Inc')).toBeInTheDocument();
      expect(screen.queryByText('Able Corp')).toBeNull();
    });
  });

  it('section count updates when filter changes', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText(/3 invoices/i)).toBeInTheDocument();

    api.get.mockResolvedValueOnce({ data: {
      ...MOCK_RESPONSE, rows: [MOCK_INVOICES[0]], total: 1,
    }});
    fireEvent.click(screen.getByRole('button', { name: /^pending/i }));
    await waitFor(() => {
      expect(screen.getByText(/1 invoice\b/i)).toBeInTheDocument();
    });
  });
});

// ── Table ──────────────────────────────────────────────────────────────────────

describe('Invoices — table', () => {
  it('renders all invoice rows', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Able Corp')).toBeInTheDocument();
    expect(screen.getByText('Baker LLC')).toBeInTheDocument();
    expect(screen.getByText('Charlie Inc')).toBeInTheDocument();
  });

  it('renders column headers: Client, Invoice #, Due Date, Subject, Status, Total, Balance', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Invoice #')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
  });

  it('shows invoice numbers prefixed with #', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('#AB12CD34')).toBeInTheDocument();
    expect(screen.getByText('#EF56GH78')).toBeInTheDocument();
  });

  it('formats due dates as Mon D, YYYY', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Jun 15, 2026')).toBeInTheDocument();
  });

  it('shows dash for missing due date', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const rows = document.querySelectorAll('.inv-table-row');
    // Baker LLC has no due_date → should show —
    const bakerRow = Array.from(rows).find(r => r.textContent.includes('Baker LLC'));
    expect(bakerRow.querySelectorAll('td')[2].textContent).toBe('—');
  });

  it('formats total amounts correctly', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const rows = document.querySelectorAll('.inv-table-row');
    const totals = Array.from(rows).map(r => r.querySelectorAll('td')[5].textContent);
    expect(totals).toContain('$400.00');
    expect(totals).toContain('$200.00');
    expect(totals).toContain('$40.00');
  });

  it('shows balance: amount for pending, $0.00 for paid, dash for void', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const rows = document.querySelectorAll('.inv-table-row');
    const ableRow    = Array.from(rows).find(r => r.textContent.includes('Able Corp'));
    const bakerRow   = Array.from(rows).find(r => r.textContent.includes('Baker LLC'));
    const charlieRow = Array.from(rows).find(r => r.textContent.includes('Charlie Inc'));
    expect(ableRow.querySelectorAll('td')[6].textContent).toBe('$400.00');
    expect(bakerRow.querySelectorAll('td')[6].textContent).toBe('$0.00');
    expect(charlieRow.querySelectorAll('td')[6].textContent).toBe('—');
  });

  it('rows have inv-table-row class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const rows = document.querySelectorAll('.inv-table-row');
    expect(rows.length).toBe(3);
  });

  it('clicking a row opens InvoiceDetail', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByText('Able Corp'));
    expect(screen.getByTestId('invoice-detail')).toBeInTheDocument();
  });

  it('closing modal removes InvoiceDetail', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByText('Able Corp'));
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByTestId('invoice-detail')).toBeNull();
    });
  });

  it('sortable column headers have inv-th-sortable class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const sortableThs = document.querySelectorAll('.inv-th-sortable');
    expect(sortableThs.length).toBeGreaterThanOrEqual(6);
  });

  it('sortable columns have aria-sort="none" by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const clientTh = Array.from(document.querySelectorAll('.inv-th-sortable'))
      .find(th => th.textContent.includes('Client'));
    expect(clientTh.getAttribute('aria-sort')).toBe('none');
  });

  it('clicking a sort column triggers a new API call', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    const clientTh = Array.from(document.querySelectorAll('.inv-th-sortable'))
      .find(th => th.textContent.includes('Client'));
    fireEvent.click(clientTh);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(api.get.mock.calls[1][0]).toContain('sort=client');
    });
  });

  it('clicking same sort column again reverses order', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    const findClientTh = () =>
      Array.from(document.querySelectorAll('.inv-th-sortable')).find(th => th.textContent.includes('Client'));
    fireEvent.click(findClientTh());
    // Wait for loading to complete so the th is back in the DOM
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    fireEvent.click(findClientTh());
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(3);
      expect(api.get.mock.calls[2][0]).toContain('order=DESC');
    });
  });
});

// ── Empty state ────────────────────────────────────────────────────────────────

describe('Invoices — empty state', () => {
  it('renders empty state when no invoices', async () => {
    setup(EMPTY_RESPONSE);
    await waitFor(() => screen.getByText(/no invoices found/i));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders secondary empty message for All filter', async () => {
    setup(EMPTY_RESPONSE);
    await waitFor(() => screen.getByText(/invoices will appear here/i));
  });

  it('renders empty state with no table when filter yields zero results', async () => {
    setup({ ...MOCK_RESPONSE, rows: [MOCK_INVOICES[1]], total: 1 });
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [], total: 0 } });
    fireEvent.click(screen.getByRole('button', { name: /^void/i }));
    await waitFor(() => {
      expect(screen.getByText(/no invoices found/i)).toBeInTheDocument();
      expect(screen.queryByRole('table')).toBeNull();
    });
  });
});

// ── Pagination ─────────────────────────────────────────────────────────────────

describe('Invoices — pagination', () => {
  it('does not show pagination when total <= pageSize', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelector('.inv-pagination')).toBeNull();
  });

  it('shows pagination when total > pageSize', async () => {
    setup({ ...MOCK_RESPONSE, total: 55 });
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelector('.inv-pagination')).not.toBeNull();
    const pageInfo = document.querySelector('.inv-page-info');
    expect(pageInfo).not.toBeNull();
    expect(pageInfo.textContent).toMatch(/page 1 of 2/i);
  });

  it('Prev button is disabled on page 1', async () => {
    setup({ ...MOCK_RESPONSE, total: 55 });
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
  });

  it('Next button triggers page 2 fetch', async () => {
    setup({ ...MOCK_RESPONSE, total: 55 });
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, page: 2, total: 55 } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(api.get.mock.calls[1][0]).toContain('page=2');
    });
  });
});

// ── Single-layer design ────────────────────────────────────────────────────────

describe('Invoices — single-layer design (no nested outer card)', () => {
  it('KPI cards are not wrapped inside an extra card element', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    cards.forEach(card => {
      expect(card.closest('.card')).toBeNull();
      expect(card.closest('[class*="outer"]')).toBeNull();
    });
  });

  it('table is not wrapped inside a card element', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const table = screen.getByRole('table');
    expect(table.closest('.card')).toBeNull();
    expect(table.closest('[class*="panel"]')).toBeNull();
  });
});

// ── Calculation correctness ────────────────────────────────────────────────────

describe('Invoices — calculation correctness', () => {
  it('outstanding sums only pending amounts (from kpis)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[0].querySelector('.stat-value').textContent).toBe('$400.00');
  });

  it('collected sums only paid amounts (from kpis)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[1].querySelector('.stat-value').textContent).toBe('$200.00');
  });

  it('total invoices counts all statuses (from kpis)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[3].querySelector('.stat-value').textContent).toBe('3');
  });

  it('kpi values do not change when filter is changed (kpis are global)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: {
      ...MOCK_RESPONSE,
      rows:  [MOCK_INVOICES[1]],
      total: 1,
      kpis:  MOCK_KPIS, // same global kpis
    }});
    fireEvent.click(screen.getByRole('button', { name: /^paid/i }));
    await waitFor(() => screen.getByText('Baker LLC'));

    const cards = document.querySelectorAll('.stat-card');
    expect(cards[0].querySelector('.stat-value').textContent).toBe('$400.00');
    expect(cards[3].querySelector('.stat-value').textContent).toBe('3');
  });
});
