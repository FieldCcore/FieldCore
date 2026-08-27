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

  it('does NOT show Payment Method section when both are disabled', async () => {
    setup({ accept_card: false, accept_ach: false });
    await waitFor(() => screen.getByText(/pay \$350\.00/i));
    expect(screen.queryByText('Payment Method')).toBeNull();
    expect(screen.queryByText('Credit / Debit Card')).toBeNull();
    expect(screen.queryByText('Bank Payment (ACH)')).toBeNull();
  });

  it('shows Payment Method section label when at least one method is enabled', async () => {
    setup({ accept_card: true, accept_ach: false });
    await waitFor(() => {
      expect(screen.getByText('Payment Method')).toBeInTheDocument();
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
});
