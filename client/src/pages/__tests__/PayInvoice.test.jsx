import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import PayInvoice from '../PayInvoice';

const BASE_INVOICE = {
  id: 'inv-001',
  amount: '350.00',
  tax_amount: '0',
  status: 'pending',
  client_name: 'Jane Smith',
  service_type: 'Full Detail',
  business_name: 'KMC Auto Spa',
  accept_card: true,
  accept_ach: false,
};

function setup(invoiceOverride = {}, paid = false) {
  useParams.mockReturnValue({ invoiceId: 'inv-001' });
  useSearchParams.mockReturnValue([new URLSearchParams(paid ? 'paid=1' : ''), vi.fn()]);
  axios.get.mockResolvedValue({ data: { ...BASE_INVOICE, ...invoiceOverride } });
  return render(<MemoryRouter><PayInvoice /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PayInvoice — payment method display', () => {
  it('shows Credit / Debit Card when accept_card is true', async () => {
    setup({ accept_card: true, accept_ach: false });
    await waitFor(() => {
      expect(screen.getByText('Credit / Debit Card')).toBeInTheDocument();
    });
  });

  it('shows Bank Payment (ACH) when accept_ach is true', async () => {
    setup({ accept_card: true, accept_ach: true });
    await waitFor(() => {
      expect(screen.getByText('Bank Payment (ACH)')).toBeInTheDocument();
    });
  });

  it('does NOT show Bank Payment (ACH) when accept_ach is false', async () => {
    setup({ accept_card: true, accept_ach: false });
    await waitFor(() => screen.getByText('Credit / Debit Card'));
    expect(screen.queryByText('Bank Payment (ACH)')).toBeNull();
  });

  it('does NOT show Card when accept_card is false', async () => {
    setup({ accept_card: false, accept_ach: true });
    await waitFor(() => screen.getByText('Bank Payment (ACH)'));
    expect(screen.queryByText('Credit / Debit Card')).toBeNull();
  });

  it('does NOT show Accepted Online section when both are disabled', async () => {
    setup({ accept_card: false, accept_ach: false });
    await waitFor(() => screen.getByText(/pay \$350\.00/i));
    expect(screen.queryByText('Accepted Online')).toBeNull();
    expect(screen.queryByText('Credit / Debit Card')).toBeNull();
    expect(screen.queryByText('Bank Payment (ACH)')).toBeNull();
  });

  it('shows "Accepted Online" section label when at least one method is enabled', async () => {
    setup({ accept_card: true, accept_ach: false });
    await waitFor(() => {
      expect(screen.getByText('Accepted Online')).toBeInTheDocument();
    });
  });
});

describe('PayInvoice — invoice display', () => {
  it('shows the invoice amount', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('$350.00')).toBeInTheDocument();
    });
  });

  it('shows the client name', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  it('shows the business name in the header', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('KMC Auto Spa')).toBeInTheDocument();
    });
  });

  it('shows paid confirmation when status is paid', async () => {
    setup({ status: 'paid' });
    await waitFor(() => {
      expect(screen.getByText('Payment Received')).toBeInTheDocument();
    });
  });

  it('shows paid confirmation when ?paid=1 query param is present', async () => {
    setup({}, true);
    await waitFor(() => {
      expect(screen.getByText('Payment Received')).toBeInTheDocument();
    });
  });

  it('shows voided message when status is void', async () => {
    setup({ status: 'void' });
    await waitFor(() => {
      expect(screen.getByText('This invoice has been voided.')).toBeInTheDocument();
    });
  });

  it('shows error when API returns 404', async () => {
    useParams.mockReturnValue({ invoiceId: 'bad-id' });
    useSearchParams.mockReturnValue([new URLSearchParams(''), vi.fn()]);
    axios.get.mockRejectedValue({ response: { data: { error: 'Invoice not found.' } } });
    render(<MemoryRouter><PayInvoice /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Invoice not found.')).toBeInTheDocument();
    });
  });

  it('shows invoice number in header', async () => {
    setup({ invoice_number: 1042 });
    await waitFor(() => {
      expect(screen.getByText('#1042')).toBeInTheDocument();
    });
  });

  it('shows invoice subject when populated', async () => {
    setup({ subject: 'Monthly AC Maintenance — Aug 1–31' });
    await waitFor(() => {
      expect(screen.getByText('Monthly AC Maintenance — Aug 1–31')).toBeInTheDocument();
    });
  });

  it('shows billing address when client_address is present', async () => {
    setup({ client_address: '1 Main St', client_city: 'Miami', client_state: 'FL', client_zip: '33139' });
    await waitFor(() => {
      expect(screen.getByText(/1 Main St/)).toBeInTheDocument();
    });
  });
});

describe('PayInvoice — line items', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders line items when present', async () => {
    setup({ line_items: [{ description: 'HVAC Service', amount: 300 }, { description: 'Parts', amount: 50 }] });
    await waitFor(() => {
      expect(screen.getByText('HVAC Service')).toBeInTheDocument();
      expect(screen.getByText('Parts')).toBeInTheDocument();
    });
  });

  it('renders no line items section when line_items is empty', async () => {
    setup({ line_items: [] });
    await waitFor(() => screen.getByText('Jane Smith'));
    expect(screen.queryByText('Services')).toBeNull();
  });

  it('shows subtotal and tax rows when tax is present', async () => {
    setup({ amount: '378.00', tax_amount: '28.00', subtotal: '350.00' });
    await waitFor(() => {
      expect(screen.getByText('Subtotal')).toBeInTheDocument();
      expect(screen.getByText('Tax')).toBeInTheDocument();
    });
  });

  it('hides subtotal/tax rows when no tax', async () => {
    setup({ amount: '350.00', tax_amount: '0', subtotal: '350.00' });
    await waitFor(() => screen.getByText('Jane Smith'));
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.queryByText('Tax')).toBeNull();
  });
});

describe('PayInvoice — agreement invoice', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const AGR_INVOICE = {
    ...BASE_INVOICE,
    source_agreement_id: 'agr-111',
    agreement_name: 'Weekly Vehicle Maintenance',
    agreement_billing_cadence: 'monthly',
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    service_schedules: [
      { service_type: 'Full Detail', asset_label: 'Range Rover', cadence: 'weekly', preferred_weekday: 5, service_address: null },
      { service_type: 'Full Detail', asset_label: 'F-150', cadence: 'every_2_weeks', preferred_weekday: 5, service_address: null },
    ],
  };

  it('shows agreement name as subject', async () => {
    setup(AGR_INVOICE);
    await waitFor(() => {
      expect(screen.getByText('Weekly Vehicle Maintenance')).toBeInTheDocument();
    });
  });

  it('shows Covered Services section for agreement invoices', async () => {
    setup(AGR_INVOICE);
    await waitFor(() => {
      expect(screen.getByText('Covered Services')).toBeInTheDocument();
    });
  });

  it('shows schedule asset labels in covered services', async () => {
    setup(AGR_INVOICE);
    await waitFor(() => {
      expect(screen.getByText(/Range Rover/)).toBeInTheDocument();
      expect(screen.getByText(/F-150/)).toBeInTheDocument();
    });
  });

  it('shows coverage period when period_start and period_end are set', async () => {
    setup(AGR_INVOICE);
    await waitFor(() => {
      expect(screen.getByText(/Coverage period:/)).toBeInTheDocument();
    });
  });
});

describe('PayInvoice — business branding', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows business logo when logo_url is set', async () => {
    setup({ business_logo_url: 'https://cdn.example.com/logo.png' });
    await waitFor(() => {
      const img = document.querySelector('img[alt="logo"]');
      expect(img).not.toBeNull();
      expect(img.src).toContain('logo.png');
    });
  });

  it('shows business initial when no logo_url', async () => {
    setup({ business_logo_url: null });
    await waitFor(() => {
      expect(screen.getByText('K')).toBeInTheDocument(); // First letter of "KMC Auto Spa"
    });
  });

  it('shows business phone when present', async () => {
    setup({ business_phone: '(305) 555-1234' });
    await waitFor(() => {
      expect(screen.getByText('(305) 555-1234')).toBeInTheDocument();
    });
  });
});

describe('PayInvoice — pay button', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('pay button shows balance due when balance is set', async () => {
    setup({ balance: '175.00', amount: '350.00' });
    await waitFor(() => {
      expect(screen.getByText(/Pay \$175\.00/)).toBeInTheDocument();
    });
  });

  it('pay button has data-testid="pay-button"', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByTestId('pay-button')).toBeInTheDocument();
    });
  });

  it('terms are shown when populated', async () => {
    setup({ terms: 'Net 30 payment required.' });
    await waitFor(() => {
      expect(screen.getByText('Terms & Conditions')).toBeInTheDocument();
      expect(screen.getByText('Net 30 payment required.')).toBeInTheDocument();
    });
  });

  it('client message is shown when populated', async () => {
    setup({ client_message: 'Thank you for your business!' });
    await waitFor(() => {
      expect(screen.getByText('Message')).toBeInTheDocument();
      expect(screen.getByText('Thank you for your business!')).toBeInTheDocument();
    });
  });
});
