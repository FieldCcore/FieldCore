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

const MOCK_INVOICES = [
  { id: 'inv-1', client_name: 'Able Corp',   amount: '400.00', status: 'pending', created_at: '2026-06-13T10:00:00Z' },
  { id: 'inv-2', client_name: 'Baker LLC',   amount: '200.00', status: 'paid',    created_at: '2026-05-29T10:00:00Z' },
  { id: 'inv-3', client_name: 'Charlie Inc', amount: '40.00',  status: 'void',    created_at: '2026-05-28T10:00:00Z' },
];

function setup(invoices = MOCK_INVOICES) {
  api.get.mockResolvedValueOnce({ data: invoices });
  return render(<MemoryRouter><Invoices /></MemoryRouter>);
}

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
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Invoices');
  });

  it('renders section heading above table', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Invoices', { selector: '.inv-section-title' })).toBeInTheDocument();
  });

  it('shows invoice count in section heading', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText(/3 invoices/i)).toBeInTheDocument();
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

  it('renders Total Invoices KPI with correct count', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Total Invoices')).toBeInTheDocument();
    // The value "3" appears as stat-value
    const statValues = document.querySelectorAll('.stat-value');
    expect(statValues[2].textContent).toBe('3');
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

  it('Total Invoices card has accent-blue class', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[2].classList.contains('stat-card--accent-blue')).toBe(true);
  });

  it('Outstanding value has no inline color style (accent conveyed by stripe only)', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    const outstandingValue = cards[0].querySelector('.stat-value');
    expect(outstandingValue.style.color).toBe('');
  });

  it('totals are zero when no invoices', async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    await waitFor(() => screen.getByText('Outstanding'));
    const statValues = document.querySelectorAll('.stat-value');
    expect(statValues[0].textContent).toBe('$0.00');
    expect(statValues[1].textContent).toBe('$0.00');
    expect(statValues[2].textContent).toBe('0');
  });
});

// ── Filters ────────────────────────────────────────────────────────────────────

describe('Invoices — status filters', () => {
  it('renders all four filter buttons', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pending/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /paid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /void/i })).toBeInTheDocument();
  });

  it('All filter is active by default', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByRole('button', { name: /all/i }).classList.contains('active')).toBe(true);
  });

  it('filters to pending invoices', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /pending/i }));
    await waitFor(() => {
      expect(screen.getByText('Able Corp')).toBeInTheDocument();
      expect(screen.queryByText('Baker LLC')).toBeNull();
      expect(screen.queryByText('Charlie Inc')).toBeNull();
    });
  });

  it('filters to paid invoices', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /paid/i }));
    await waitFor(() => {
      expect(screen.getByText('Baker LLC')).toBeInTheDocument();
      expect(screen.queryByText('Able Corp')).toBeNull();
    });
  });

  it('filters to void invoices', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /void/i }));
    await waitFor(() => {
      expect(screen.getByText('Charlie Inc')).toBeInTheDocument();
      expect(screen.queryByText('Able Corp')).toBeNull();
    });
  });

  it('filter counts reflect invoice totals', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const counts = document.querySelectorAll('.filter-count');
    // All=3, Pending=1, Paid=1, Void=1
    expect(counts[0].textContent).toBe('3');
    expect(counts[1].textContent).toBe('1');
    expect(counts[2].textContent).toBe('1');
    expect(counts[3].textContent).toBe('1');
  });

  it('section count updates when filter changes', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText(/3 invoices/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /pending/i }));
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

  it('renders column headers: Client, Amount, Status, Created', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('formats amounts correctly', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const rows = document.querySelectorAll('.inv-table-row');
    const amounts = Array.from(rows).map(r => r.querySelectorAll('td')[1].textContent);
    expect(amounts).toContain('$400.00');
    expect(amounts).toContain('$200.00');
    expect(amounts).toContain('$40.00');
  });

  it('formats dates as Mon D, YYYY', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    expect(screen.getByText('Jun 13, 2026')).toBeInTheDocument();
    expect(screen.getByText('May 29, 2026')).toBeInTheDocument();
    expect(screen.getByText('May 28, 2026')).toBeInTheDocument();
  });

  it('rows have inv-table-row class for neutral hover', async () => {
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
});

// ── Empty state ────────────────────────────────────────────────────────────────

describe('Invoices — empty state', () => {
  it('renders empty state when no invoices', async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    await waitFor(() => screen.getByText(/no invoices found/i));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders secondary empty message for All filter', async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    render(<MemoryRouter><Invoices /></MemoryRouter>);
    await waitFor(() => screen.getByText(/invoices will appear here/i));
  });

  it('renders empty state with no table when filter yields zero results', async () => {
    setup([{ id: 'inv-1', client_name: 'A', amount: '100', status: 'paid', created_at: '2026-01-01T00:00:00Z' }]);
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /void/i }));
    await waitFor(() => {
      expect(screen.getByText(/no invoices found/i)).toBeInTheDocument();
      expect(screen.queryByRole('table')).toBeNull();
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

// ── Calculations preserved ─────────────────────────────────────────────────────

describe('Invoices — calculation correctness', () => {
  it('outstanding sums only pending amounts', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    // Only inv-1 (pending $400) should count
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[0].querySelector('.stat-value').textContent).toBe('$400.00');
  });

  it('collected sums only paid amounts', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[1].querySelector('.stat-value').textContent).toBe('$200.00');
  });

  it('total invoices counts all statuses', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[2].querySelector('.stat-value').textContent).toBe('3');
  });

  it('kpi values do not change when filter is changed', async () => {
    setup();
    await waitFor(() => screen.getByRole('table'));
    fireEvent.click(screen.getByRole('button', { name: /paid/i }));
    await waitFor(() => screen.getByText('Baker LLC'));
    // KPIs always reflect all invoices, not filtered set
    const cards = document.querySelectorAll('.stat-card');
    expect(cards[0].querySelector('.stat-value').textContent).toBe('$400.00');
    expect(cards[2].querySelector('.stat-value').textContent).toBe('3');
  });
});
