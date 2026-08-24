import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InvoiceBuilder from '../InvoiceBuilder';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../../api';

const MOCK_SETTINGS = { next_number: 1042, tax_rate: 0 };

const MOCK_CLIENTS = [
  { id: 'c-111', name: 'Able Corp', email: 'able@corp.com', phone: '555-0001', address: '1 Main St' },
];

const MOCK_JOBS = [
  {
    id: 'j-111', service_type: 'HVAC Repair', amount: '500.00', scheduled_at: '2026-08-01T10:00:00Z',
    client_id: 'c-111', client_name: 'Able Corp', client_email: 'able@corp.com', address: '1 Main St',
  },
];

const MOCK_ESTIMATES = [
  {
    id: 'e-111',
    title: 'HVAC Proposal',
    amount: '650.00',
    tax_amount: '0',
    status: 'signed',
    signed_at: '2026-08-10T10:00:00Z',
    created_at: '2026-08-09T10:00:00Z',
    notes: 'Thank you for choosing us.',
    line_items: [
      { description: 'HVAC Service', amount: 500 },
      { description: 'Parts', amount: 150 },
    ],
    client_id: 'c-111',
    client_name: 'Able Corp',
    client_email: 'able@corp.com',
    client_address: '1 Main St',
    converted_invoice_id: null,
  },
];

const MOCK_CREATED_INVOICE = {
  id: 'inv-999',
  invoice_number: 1042,
  source_type: 'ESTIMATE',
  source_estimate_id: 'e-111',
  client_id: 'c-111',
  subject: 'HVAC Proposal',
  status: 'draft',
  amount: '650.00',
};

function setup(onClose = vi.fn(), onCreated = vi.fn()) {
  api.get.mockImplementation(url => {
    if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
    if (url.includes('/clients/search'))   return Promise.resolve({ data: MOCK_CLIENTS });
    if (url.includes('/invoices/eligible-estimates')) return Promise.resolve({ data: MOCK_ESTIMATES });
    if (url.includes('/invoices/eligible-jobs'))      return Promise.resolve({ data: { rows: MOCK_JOBS } });
    return Promise.resolve({ data: [] });
  });
  return render(<InvoiceBuilder onClose={onClose} onCreated={onCreated} />);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('InvoiceBuilder — rendering', () => {
  it('renders the builder heading', async () => {
    setup();
    expect(screen.getByText('New Invoice')).toBeInTheDocument();
  });

  it('shows preview invoice number from settings', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Preview #1042/i)).toBeInTheDocument();
    });
  });

  it('renders four source buttons', async () => {
    setup();
    expect(screen.getByText('Blank Invoice')).toBeInTheDocument();
    expect(screen.getByText('Completed Job')).toBeInTheDocument();
    expect(screen.getByText('Existing Estimate')).toBeInTheDocument();
    expect(screen.getByText('Recurring Agreement')).toBeInTheDocument();
  });

  it('Existing Estimate button is enabled (not disabled)', async () => {
    setup();
    const btn = screen.getByText('Existing Estimate');
    expect(btn).not.toBeDisabled();
  });

  it('Recurring Agreement button is disabled', async () => {
    setup();
    const btn = screen.getByText('Recurring Agreement');
    expect(btn).toBeDisabled();
  });

  it('Blank Invoice is selected by default', async () => {
    setup();
    expect(screen.getByText('Blank Invoice').className).toContain('active');
  });

  it('renders Cancel, Save Draft, Save & Send buttons', async () => {
    setup();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & send/i })).toBeInTheDocument();
  });
});

// ── Source picker ─────────────────────────────────────────────────────────────

describe('InvoiceBuilder — source picker', () => {
  it('clicking Existing Estimate shows estimate search', async () => {
    setup();
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => {
      expect(screen.getByText('Signed Estimate')).toBeInTheDocument();
    });
  });

  it('clicking Existing Estimate loads eligible estimates on mount', async () => {
    setup();
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/invoices/eligible-estimates'));
    });
  });

  it('switching from estimate back to blank clears estimate', async () => {
    setup();
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => screen.getByText('Signed Estimate'));
    fireEvent.click(screen.getByText('Blank Invoice'));
    expect(screen.queryByText('Signed Estimate')).toBeNull();
  });
});

// ── Estimate search ───────────────────────────────────────────────────────────

describe('InvoiceBuilder — estimate search', () => {
  it('shows estimate results after loading', async () => {
    setup();
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => {
      expect(screen.getByText('HVAC Proposal')).toBeInTheDocument();
      expect(screen.getByText('Able Corp')).toBeInTheDocument();
    });
  });

  it('shows empty state when no estimates available', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/invoices/eligible-estimates')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => {
      expect(screen.getByText(/no signed estimates/i)).toBeInTheDocument();
    });
  });

  it('search input triggers debounced API call', async () => {
    setup();
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => screen.getByPlaceholderText(/search by client/i));
    const input = screen.getByPlaceholderText(/search by client/i);
    fireEvent.change(input, { target: { value: 'HVAC' } });
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => {
      const calls = api.get.mock.calls.filter(c => c[0].includes('/invoices/eligible-estimates'));
      expect(calls.some(c => c[0].includes('q=HVAC'))).toBe(true);
    });
  });
});

// ── Select estimate ───────────────────────────────────────────────────────────

describe('InvoiceBuilder — select estimate', () => {
  async function openAndSelect() {
    setup();
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => screen.getByText('HVAC Proposal'));
    fireEvent.click(screen.getByText('HVAC Proposal'));
  }

  it('selecting estimate shows the estimate card', async () => {
    await openAndSelect();
    await waitFor(() => {
      expect(screen.getByText('HVAC Proposal')).toBeInTheDocument();
      expect(document.querySelector('.ib-est-card')).not.toBeNull();
    });
  });

  it('selecting estimate prefills client', async () => {
    await openAndSelect();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Able Corp')).toBeInTheDocument();
    });
  });

  it('selecting estimate prefills subject from title', async () => {
    await openAndSelect();
    await waitFor(() => {
      expect(screen.getByDisplayValue('HVAC Proposal')).toBeInTheDocument();
    });
  });

  it('selecting estimate populates line items from estimate', async () => {
    await openAndSelect();
    await waitFor(() => {
      expect(screen.getByDisplayValue('HVAC Service')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Parts')).toBeInTheDocument();
    });
  });

  it('estimate total reflects line items', async () => {
    await openAndSelect();
    await waitFor(() => {
      const matches = screen.getAllByText('$650.00');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('X button on estimate card clears selection and shows search again', async () => {
    await openAndSelect();
    await waitFor(() => document.querySelector('.ib-est-card'));
    const clearBtn = document.querySelector('.ib-est-card .ib-client-clear');
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(document.querySelector('.ib-est-card')).toBeNull();
    });
  });
});

// ── Save from estimate ────────────────────────────────────────────────────────

describe('InvoiceBuilder — save from estimate', () => {
  async function openSelectAndSave(action = 'draft') {
    const onCreated = vi.fn();
    const onClose   = vi.fn();
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/invoices/eligible-estimates')) return Promise.resolve({ data: MOCK_ESTIMATES });
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValueOnce({ data: MOCK_CREATED_INVOICE });
    render(<InvoiceBuilder onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => screen.getByText('HVAC Proposal'));
    fireEvent.click(screen.getByText('HVAC Proposal'));
    await waitFor(() => screen.getByDisplayValue('HVAC Proposal'));
    if (action === 'draft') {
      fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    } else {
      api.post.mockResolvedValueOnce({ data: { success: true } });
      fireEvent.click(screen.getByRole('button', { name: /save & send/i }));
    }
    return { onCreated, onClose };
  }

  it('Save Draft posts with source_type=ESTIMATE', async () => {
    await openSelectAndSave('draft');
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/invoices', expect.objectContaining({
        source_type: 'ESTIMATE',
        source_estimate_id: 'e-111',
      }));
    });
  });

  it('Save Draft posts with status=draft', async () => {
    await openSelectAndSave('draft');
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/invoices', expect.objectContaining({
        status: 'draft',
      }));
    });
  });

  it('Save & Send posts with status=pending', async () => {
    await openSelectAndSave('send');
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/invoices', expect.objectContaining({
        status: 'pending',
      }));
    });
  });

  it('successful save calls onCreated', async () => {
    const { onCreated } = await openSelectAndSave('draft');
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(MOCK_CREATED_INVOICE);
    });
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('InvoiceBuilder — estimate error handling', () => {
  it('shows already-invoiced error for 409', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/invoices/eligible-estimates')) return Promise.resolve({ data: MOCK_ESTIMATES });
      return Promise.resolve({ data: [] });
    });
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'This estimate has already been invoiced' } },
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => screen.getByText('HVAC Proposal'));
    fireEvent.click(screen.getByText('HVAC Proposal'));
    await waitFor(() => screen.getByDisplayValue('HVAC Proposal'));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(screen.getByText(/already been converted/i)).toBeInTheDocument();
    });
  });
});
