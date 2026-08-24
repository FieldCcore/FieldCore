import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Invoices from '../Invoices';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../components/InvoiceDetail', () => ({
  default: ({ onClose }) => (
    <div data-testid="invoice-detail">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('../../components/NewInvoiceModal', () => ({
  default: ({ onClose, onCreated }) => (
    <div data-testid="new-invoice-modal">
      <button data-testid="ni-close" onClick={onClose}>Cancel</button>
      <button data-testid="ni-create" onClick={() => onCreated({ id: 'new-inv-id' })}>Create Invoice</button>
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

// pending(400) + paid(200) = issued; void excluded
const MOCK_KPIS = {
  outstanding:    400,
  collected:      200,
  pastDue:        0,
  pastDueCount:   0,
  totalCount:     3,
  issuedCount:    2,
  issuedTotal:    600,
  averageInvoice: 300,
  counts:         { all: 3, pending: 1, paid: 1, void: 1, past_due: 0 },
};

const MOCK_RESPONSE = {
  rows:     MOCK_INVOICES,
  total:    3,
  page:     1,
  pageSize: 50,
  kpis:     MOCK_KPIS,
};

const EMPTY_KPIS = {
  outstanding: 0, collected: 0, pastDue: 0, pastDueCount: 0, totalCount: 0,
  issuedCount: 0, issuedTotal: 0, averageInvoice: 0,
  counts: { all: 0, pending: 0, paid: 0, void: 0, past_due: 0 },
};

const EMPTY_RESPONSE = {
  rows: [], total: 0, page: 1, pageSize: 50, kpis: EMPTY_KPIS,
};

function setup(response = MOCK_RESPONSE, url = '/invoices') {
  api.get.mockResolvedValueOnce({ data: response });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Invoices />
    </MemoryRouter>
  );
}

// Helper to get the status filter group (first .inv-filter-group)
function getStatusGroup() {
  return document.querySelectorAll('.inv-filter-group')[0];
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

  it('renders "All Invoices" workspace title', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('All Invoices', { selector: '.inv-workspace-title' })).toBeInTheDocument();
  });

  it('shows result count from total field', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelector('.inv-workspace-count').textContent).toMatch(/3 results/i);
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

// ── Invoice Overview ───────────────────────────────────────────────────────────

describe('Invoices — overview metrics', () => {
  function getMetrics() {
    return document.querySelectorAll('.inv-metric:not(.inv-metric--sep)');
  }

  it('renders Invoice Overview section', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelector('.inv-overview')).not.toBeNull();
    expect(document.querySelector('.inv-overview-title').textContent).toBe('Invoice Overview');
  });

  it('renders four metric groups', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(getMetrics().length).toBe(4);
  });

  it('Past Due metric shows correct value', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[0].querySelector('.inv-metric-label').textContent).toBe('Past Due');
    expect(m[0].querySelector('.inv-metric-value').textContent).toBe('$0.00');
  });

  it('Outstanding metric shows correct value', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[1].querySelector('.inv-metric-label').textContent).toBe('Outstanding');
    expect(m[1].querySelector('.inv-metric-value').textContent).toBe('$400.00');
  });

  it('Issued metric shows total and count', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[2].querySelector('.inv-metric-label').textContent).toBe('Issued');
    expect(m[2].querySelector('.inv-metric-value').textContent).toBe('$600.00');
    expect(m[2].querySelector('.inv-metric-sub').textContent).toBe('2 invoices');
  });

  it('Avg Invoice metric shows correct value', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[3].querySelector('.inv-metric-label').textContent).toBe('Avg Invoice');
    expect(m[3].querySelector('.inv-metric-value').textContent).toBe('$300.00');
  });

  it('Past Due value has --red modifier when > 0', async () => {
    const kpisWithPastDue = { ...MOCK_KPIS, pastDue: 150, pastDueCount: 1 };
    setup({ ...MOCK_RESPONSE, kpis: kpisWithPastDue });
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[0].querySelector('.inv-metric-value').classList.contains('inv-metric-value--red')).toBe(true);
  });

  it('Past Due has no --red modifier when 0', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[0].querySelector('.inv-metric-value').classList.contains('inv-metric-value--red')).toBe(false);
  });

  it('Outstanding has --amber modifier when > 0', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[1].querySelector('.inv-metric-value').classList.contains('inv-metric-value--amber')).toBe(true);
  });

  it('Past Due shows invoice count sub-label when > 0', async () => {
    const kpisWithPastDue = { ...MOCK_KPIS, pastDue: 150, pastDueCount: 2 };
    setup({ ...MOCK_RESPONSE, kpis: kpisWithPastDue });
    await waitFor(() => screen.getByRole('table'));
    const m = getMetrics();
    expect(m[0].querySelector('.inv-metric-sub').textContent).toBe('2 invoices');
  });

  it('overview metrics show zeroes when no invoices', async () => {
    setup(EMPTY_RESPONSE);
    await waitFor(() => screen.getByText(/no invoices yet/i));
    const m = getMetrics();
    expect(m[0].querySelector('.inv-metric-value').textContent).toBe('$0.00');
    expect(m[1].querySelector('.inv-metric-value').textContent).toBe('$0.00');
    expect(m[2].querySelector('.inv-metric-value').textContent).toBe('$0.00');
    expect(m[3].querySelector('.inv-metric-value').textContent).toBe('$0.00');
  });

  it('kpi values do not change when filter is changed (kpis are global)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: {
      ...MOCK_RESPONSE, rows: [MOCK_INVOICES[1]], total: 1, kpis: MOCK_KPIS,
    }});
    const statusGroup = getStatusGroup();
    fireEvent.click(statusGroup.querySelector('.inv-filter-trigger'));
    const paidItem = Array.from(statusGroup.querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Paid'));
    fireEvent.click(paidItem);
    await waitFor(() => screen.getByText('Baker LLC'));

    const m = getMetrics();
    expect(m[1].querySelector('.inv-metric-value').textContent).toBe('$400.00');
    expect(m[2].querySelector('.inv-metric-value').textContent).toBe('$600.00');
  });
});

// ── Status filter dropdown ─────────────────────────────────────────────────────

describe('Invoices — status filter dropdown', () => {
  it('renders Status trigger with "All" by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const trigger = getStatusGroup().querySelector('.inv-filter-trigger');
    expect(trigger.textContent).toContain('Status');
    expect(trigger.textContent).toContain('All');
  });

  it('clicking Status trigger opens dropdown', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    expect(getStatusGroup().querySelector('.inv-filter-dropdown')).not.toBeNull();
  });

  it('dropdown shows five status options', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    expect(getStatusGroup().querySelectorAll('.inv-dropdown-item').length).toBe(5);
  });

  it('dropdown shows counts from kpis.counts', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const counts = getStatusGroup().querySelectorAll('.inv-dropdown-count');
    expect(counts[0].textContent).toBe('3'); // All
    expect(counts[1].textContent).toBe('1'); // Pending
    expect(counts[2].textContent).toBe('1'); // Paid
    expect(counts[3].textContent).toBe('1'); // Void
    expect(counts[4].textContent).toBe('0'); // Past Due
  });

  it('selecting Pending triggers API call with status=pending', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [MOCK_INVOICES[0]], total: 1 } });
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const pendingItem = Array.from(getStatusGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Pending'));
    fireEvent.click(pendingItem);

    await waitFor(() => {
      expect(api.get.mock.calls[1][0]).toContain('status=pending');
    });
  });

  it('selecting Pending shows only pending invoices', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [MOCK_INVOICES[0]], total: 1 } });
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const pendingItem = Array.from(getStatusGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Pending'));
    fireEvent.click(pendingItem);

    await waitFor(() => {
      expect(screen.getByText('Able Corp')).toBeInTheDocument();
      expect(screen.queryByText('Baker LLC')).toBeNull();
      expect(screen.queryByText('Charlie Inc')).toBeNull();
    });
  });

  it('selecting Paid shows only paid invoices', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [MOCK_INVOICES[1]], total: 1 } });
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const paidItem = Array.from(getStatusGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Paid'));
    fireEvent.click(paidItem);

    await waitFor(() => {
      expect(screen.getByText('Baker LLC')).toBeInTheDocument();
      expect(screen.queryByText('Able Corp')).toBeNull();
    });
  });

  it('active filter shows chip with status name', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [MOCK_INVOICES[0]], total: 1 } });
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const pendingItem = Array.from(getStatusGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Pending'));
    fireEvent.click(pendingItem);

    await waitFor(() => {
      const chip = document.querySelector('.inv-chip');
      expect(chip).not.toBeNull();
      expect(chip.textContent).toContain('Status: Pending');
    });
  });

  it('removing status chip via X resets to all', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [MOCK_INVOICES[0]], total: 1 } });
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const pendingItem = Array.from(getStatusGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Pending'));
    fireEvent.click(pendingItem);
    await waitFor(() => screen.getByText('Able Corp'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    fireEvent.click(document.querySelector('.inv-chip-remove'));

    await waitFor(() => {
      expect(api.get.mock.calls[2][0]).toContain('status=all');
    });
  });

  it('result count updates when filter changes', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelector('.inv-workspace-count').textContent).toMatch(/3 results/i);

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [MOCK_INVOICES[0]], total: 1 } });
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const pendingItem = Array.from(getStatusGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Pending'));
    fireEvent.click(pendingItem);

    await waitFor(() => {
      expect(document.querySelector('.inv-workspace-count').textContent).toMatch(/1 result/i);
    });
  });

  it('no chips shown when status is All (default)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelector('.inv-filter-chips')).toBeNull();
  });
});

// ── Date filter dropdown ───────────────────────────────────────────────────────

describe('Invoices — date filter dropdown', () => {
  function getDateGroup() {
    return document.querySelectorAll('.inv-filter-group')[1];
  }

  it('renders Date trigger with "All time" by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const trigger = getDateGroup().querySelector('.inv-filter-trigger');
    expect(trigger.textContent).toContain('Date');
    expect(trigger.textContent).toContain('All time');
  });

  it('clicking Date trigger opens dropdown with 5 options', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(getDateGroup().querySelector('.inv-filter-trigger'));
    expect(getDateGroup().querySelectorAll('.inv-dropdown-item').length).toBe(5);
  });

  it('selecting This month sends start+end params', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    fireEvent.click(getDateGroup().querySelector('.inv-filter-trigger'));
    const monthItem = Array.from(getDateGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('This month'));
    fireEvent.click(monthItem);

    await waitFor(() => {
      const url = api.get.mock.calls[1][0];
      expect(url).toContain('start=');
      expect(url).toContain('end=');
    });
  });

  it('selecting date preset shows chip', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    fireEvent.click(getDateGroup().querySelector('.inv-filter-trigger'));
    const monthItem = Array.from(getDateGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('This month'));
    fireEvent.click(monthItem);

    await waitFor(() => {
      const chip = document.querySelector('.inv-chip');
      expect(chip).not.toBeNull();
      expect(chip.textContent).toContain('Date: This month');
    });
  });
});

// ── Filters dropdown ───────────────────────────────────────────────────────────

describe('Invoices — quick filters dropdown', () => {
  function getFiltersGroup() {
    return document.querySelectorAll('.inv-filter-group')[2];
  }

  it('renders Filters trigger button', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const trigger = getFiltersGroup().querySelector('.inv-filter-trigger');
    expect(trigger.textContent).toContain('Filters');
  });

  it('clicking Filters opens dropdown with Balance > $0 option', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(getFiltersGroup().querySelector('.inv-filter-trigger'));
    const items = getFiltersGroup().querySelectorAll('.inv-dropdown-item');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].textContent).toContain('Balance');
  });

  it('enabling Balance > $0 sends balanceGt0=true', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    fireEvent.click(getFiltersGroup().querySelector('.inv-filter-trigger'));
    fireEvent.click(getFiltersGroup().querySelector('.inv-dropdown-item'));

    await waitFor(() => {
      expect(api.get.mock.calls[1][0]).toContain('balanceGt0=true');
    });
  });

  it('enabling Balance > $0 shows badge on Filters button', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    fireEvent.click(getFiltersGroup().querySelector('.inv-filter-trigger'));
    fireEvent.click(getFiltersGroup().querySelector('.inv-dropdown-item'));

    await waitFor(() => {
      expect(getFiltersGroup().querySelector('.inv-filter-badge')).not.toBeNull();
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
    const ths = Array.from(document.querySelectorAll('th'));
    const thText = ths.map(th => th.textContent.trim());
    expect(thText.some(t => t.startsWith('Client'))).toBe(true);
    expect(thText.some(t => t.startsWith('Invoice #'))).toBe(true);
    expect(thText.some(t => t.startsWith('Due Date'))).toBe(true);
    expect(thText.some(t => t === 'Subject')).toBe(true);
    expect(thText.some(t => t.startsWith('Status'))).toBe(true);
    expect(thText.some(t => t.startsWith('Total'))).toBe(true);
    expect(thText.some(t => t.startsWith('Balance'))).toBe(true);
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

  it('client cell shows secondary address line', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const rows = document.querySelectorAll('.inv-table-row');
    const ableRow = Array.from(rows).find(r => r.textContent.includes('Able Corp'));
    expect(ableRow.querySelector('.inv-client-sub').textContent).toBe('1 Main St');
  });

  it('Total and Balance columns have right-align class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const rows = document.querySelectorAll('.inv-table-row');
    const ableRow = Array.from(rows).find(r => r.textContent.includes('Able Corp'));
    expect(ableRow.querySelectorAll('td')[5].classList.contains('inv-td-r')).toBe(true);
    expect(ableRow.querySelectorAll('td')[6].classList.contains('inv-td-r')).toBe(true);
  });

  it('rows have inv-table-row class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(document.querySelectorAll('.inv-table-row').length).toBe(3);
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
    await waitFor(() => screen.getByText(/no invoices yet/i));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders secondary message to create first invoice', async () => {
    setup(EMPTY_RESPONSE);
    await waitFor(() => screen.getByText(/create your first invoice/i));
  });

  it('renders "no invoices match these filters" when filter active and zero results', async () => {
    setup({ ...MOCK_RESPONSE, rows: [MOCK_INVOICES[1]], total: 1 });
    await waitFor(() => screen.getByRole('table'));

    api.get.mockResolvedValueOnce({ data: { ...MOCK_RESPONSE, rows: [], total: 0 } });
    fireEvent.click(getStatusGroup().querySelector('.inv-filter-trigger'));
    const voidItem = Array.from(getStatusGroup().querySelectorAll('.inv-dropdown-item'))
      .find(el => el.textContent.includes('Void'));
    fireEvent.click(voidItem);

    await waitFor(() => {
      expect(screen.getByText(/no invoices match these filters/i)).toBeInTheDocument();
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

describe('Invoices — single-layer design', () => {
  it('overview section is not wrapped inside an extra card element', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const overview = document.querySelector('.inv-overview');
    expect(overview.closest('.card')).toBeNull();
    expect(overview.closest('[class*="outer"]')).toBeNull();
  });

  it('table is not wrapped inside a card element', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const table = screen.getByRole('table');
    expect(table.closest('.card')).toBeNull();
    expect(table.closest('[class*="panel"]')).toBeNull();
  });
});

// ── New Invoice modal ──────────────────────────────────────────────────────────

describe('Invoices — New Invoice modal', () => {
  it('New Invoice button opens modal', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /\+ new invoice/i }));
    expect(screen.getByTestId('new-invoice-modal')).toBeInTheDocument();
  });

  it('?new=1 URL param opens modal on mount', async () => {
    setup(MOCK_RESPONSE, '/invoices?new=1');
    await waitFor(() => screen.getByTestId('new-invoice-modal'));
    expect(screen.getByTestId('new-invoice-modal')).toBeInTheDocument();
  });

  it('closing modal via Cancel hides it', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /\+ new invoice/i }));
    expect(screen.getByTestId('new-invoice-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ni-close'));
    expect(screen.queryByTestId('new-invoice-modal')).toBeNull();
  });

  it('clicking overlay closes modal', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /\+ new invoice/i }));
    expect(screen.getByTestId('new-invoice-modal')).toBeInTheDocument();
    fireEvent.click(document.querySelector('.modal-overlay'));
    expect(screen.queryByTestId('new-invoice-modal')).toBeNull();
  });

  it('onCreated closes modal and triggers list refresh', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));

    fireEvent.click(screen.getByRole('button', { name: /\+ new invoice/i }));
    expect(screen.getByTestId('new-invoice-modal')).toBeInTheDocument();

    api.get.mockResolvedValueOnce({ data: MOCK_RESPONSE });
    api.get.mockResolvedValueOnce({ data: { id: 'new-inv-id', client_name: 'New Client', amount: '100', status: 'pending' } });
    fireEvent.click(screen.getByTestId('ni-create'));

    await waitFor(() => {
      expect(screen.queryByTestId('new-invoice-modal')).toBeNull();
      expect(api.get).toHaveBeenCalledTimes(2); // initial + refresh
    });
  });

  it('second click on New Invoice does not open a second modal', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const btn = screen.getByRole('button', { name: /\+ new invoice/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(document.querySelectorAll('[data-testid="new-invoice-modal"]').length).toBe(1);
  });
});
