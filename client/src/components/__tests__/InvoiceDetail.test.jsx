import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InvoiceDetail from '../InvoiceDetail';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => null) }));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => children,
  CardElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}));

import api from '../../api';

// ── Shared mock data ───────────────────────────────────────────────────────────

function makeInvoice(overrides = {}) {
  return {
    id:             'inv-001',
    invoice_number:  1042,
    invoice_number_display: '1042',
    client_id:       'c-001',
    client_name:     'Able Corp',
    client_email:    'able@corp.com',
    service_type:    'HVAC',
    status:          'pending',
    payment_terms:   'net_30',
    amount:          '500.00',
    subtotal:        '500.00',
    tax_amount:      '0.00',
    discount_amount: '0.00',
    discount_type:   'none',
    discount_value:  null,
    discount_name:   null,
    balance:         '500.00',
    payment_link:    null,
    card_on_file:    false,
    stripe_payment_method_id: null,
    created_at:      '2026-08-01T10:00:00Z',
    sent_at:         null,
    due_date:        '2026-08-31',
    line_items:      [{ name: 'AC Service', amount: 500 }],
    ...overrides,
  };
}

function setup(invoice, detailOverrides = {}) {
  const inv = makeInvoice(invoice);
  api.get.mockResolvedValueOnce({ data: { ...inv, ...detailOverrides } });
  const onClose  = vi.fn();
  const onUpdate = vi.fn();
  render(<InvoiceDetail invoice={inv} onClose={onClose} onUpdate={onUpdate} />);
  return { onClose, onUpdate };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── INV-007 — Invoice number in modal header ───────────────────────────────────

describe('Regression INV-007 — invoice number in modal header', () => {
  it('modal heading includes the invoice number', async () => {
    setup();
    await waitFor(() => screen.getByText('Invoice #1042'));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Invoice #1042');
  });

  it('modal heading does not read as a generic duplicate of the page title', async () => {
    setup();
    await waitFor(() => screen.getByText('Invoice #1042'));
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).not.toBe('Invoice');
  });

  it('uses invoice_number_display when available', async () => {
    setup({ invoice_number_display: '2001' });
    await waitFor(() => screen.getByText('Invoice #2001'));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Invoice #2001');
  });
});

// ── INV-004 — Net 7 payment terms label ───────────────────────────────────────

describe('Regression INV-004 — net_7 payment terms label', () => {
  it('renders "Net 7" for payment_terms=net_7', async () => {
    setup({ payment_terms: 'net_7' });
    await waitFor(() => screen.getByText('Net 7'));
    expect(screen.getByText('Net 7')).toBeInTheDocument();
  });

  it('does not expose raw "net_7" string to users', async () => {
    setup({ payment_terms: 'net_7' });
    await waitFor(() => screen.getByText('Net 7'));
    expect(screen.queryByText('net_7')).toBeNull();
  });

  it('renders "Net 30" for payment_terms=net_30', async () => {
    setup({ payment_terms: 'net_30' });
    await waitFor(() => screen.getByText('Net 30'));
    expect(screen.getByText('Net 30')).toBeInTheDocument();
  });

  it('renders "Due on Receipt" for payment_terms=due_on_receipt', async () => {
    setup({ payment_terms: 'due_on_receipt' });
    await waitFor(() => screen.getByText('Due on Receipt'));
    expect(screen.getByText('Due on Receipt')).toBeInTheDocument();
  });
});

// ── INV-006 — Subtotal breakdown with discount and tax ────────────────────────

describe('Regression INV-006 — subtotal display uses canonical stored values', () => {
  it('shows no breakdown rows when no discount and no tax', async () => {
    setup({}, { subtotal: '400.00', discount_amount: '0.00', tax_amount: '0.00', amount: '400.00' });
    await waitFor(() => screen.getByText('Total Due'));
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.queryByText('Discount')).toBeNull();
    expect(screen.queryByText('Tax')).toBeNull();
    expect(screen.getByText('Total Due')).toBeInTheDocument();
  });

  it('shows Subtotal and Tax rows when tax > 0', async () => {
    setup({}, { subtotal: '400.00', discount_amount: '0.00', tax_amount: '32.00', amount: '432.00' });
    await waitFor(() => screen.getByText('Subtotal'));
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Tax')).toBeInTheDocument();
    expect(screen.queryByText('Discount')).toBeNull();
  });

  it('subtotal row uses stored invoice.subtotal, not amount minus tax', async () => {
    // discount=40, tax=32 → subtotal=400, amount=392; amount-tax=360 which is WRONG
    setup({}, { subtotal: '400.00', discount_amount: '40.00', tax_amount: '32.00', amount: '392.00' });
    await waitFor(() => screen.getByText('Subtotal'));
    // Should show stored subtotal ($400), not reverse-calculated amount-tax ($360)
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.queryByText('$360.00')).toBeNull();
  });

  it('shows Discount row when discount_amount > 0', async () => {
    setup({}, { subtotal: '500.00', discount_amount: '50.00', tax_amount: '0.00', amount: '450.00' });
    await waitFor(() => screen.getByText('Discount'));
    expect(screen.getByText('Discount')).toBeInTheDocument();
    expect(screen.getByText('−$50.00')).toBeInTheDocument();
  });

  it('uses discount_name as the discount label when provided', async () => {
    setup({}, { subtotal: '500.00', discount_amount: '50.00', discount_name: 'Loyalty', tax_amount: '0.00', amount: '450.00' });
    await waitFor(() => screen.getByText('Loyalty'));
    expect(screen.getByText('Loyalty')).toBeInTheDocument();
    expect(screen.queryByText('Discount')).toBeNull();
  });

  it('shows all three breakdown rows for discount + tax invoice', async () => {
    setup({}, { subtotal: '500.00', discount_amount: '50.00', tax_amount: '36.00', amount: '486.00' });
    await waitFor(() => screen.getByText('Subtotal'));
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Discount')).toBeInTheDocument();
    expect(screen.getByText('Tax')).toBeInTheDocument();
    expect(screen.getByText('Total Due')).toBeInTheDocument();
  });

  it('Total Due always shows invoice.amount regardless of breakdown', async () => {
    setup({}, { subtotal: '500.00', discount_amount: '50.00', tax_amount: '0.00', amount: '450.00' });
    await waitFor(() => screen.getByText('Total Due'));
    expect(screen.getByText('$450.00')).toBeInTheDocument();
  });
});

// ── INV-009 — Item name placeholder ───────────────────────────────────────────

describe('Regression INV-009 — add line item input placeholder', () => {
  it('add-line-item input has placeholder "Item name"', async () => {
    setup();
    await waitFor(() => screen.getByPlaceholderText('Item name'));
    expect(screen.getByPlaceholderText('Item name')).toBeInTheDocument();
  });

  it('does not use "Description" as the item name placeholder', async () => {
    setup();
    await waitFor(() => screen.getByPlaceholderText('Item name'));
    expect(screen.queryByPlaceholderText('Description')).toBeNull();
  });
});

// ── INV-010 — Add Line Item button label ──────────────────────────────────────

describe('Regression INV-010 — add line item button label', () => {
  it('button reads "Add Line Item" in idle state', async () => {
    setup();
    await waitFor(() => screen.getByText('Add Line Item'));
    expect(screen.getByText('Add Line Item')).toBeInTheDocument();
  });

  it('button does not read the terse "+ Add"', async () => {
    setup();
    await waitFor(() => screen.getByText('Add Line Item'));
    expect(screen.queryByText('+ Add')).toBeNull();
  });
});
