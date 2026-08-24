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

const MOCK_AGREEMENTS = [
  {
    id: 'a-111',
    name: 'Monthly AC Maintenance',
    service_type: 'HVAC',
    cadence: 'monthly',
    billing_cadence: 'monthly',
    plan_price: '200.00',
    status: 'active',
    payment_status: 'pending',
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    period_already_invoiced: false,
    line_items: [{ name: 'AC Service', amount: 200 }],
    client_id: 'c-111',
    client_name: 'Able Corp',
    client_email: 'able@corp.com',
    client_address: '1 Main St',
  },
];

const MOCK_CREATED_AGR_INVOICE = {
  id: 'inv-998',
  invoice_number: 1043,
  source_type: 'AGREEMENT',
  source_agreement_id: 'a-111',
  client_id: 'c-111',
  subject: 'Monthly AC Maintenance — Aug 1–31, 2026',
  status: 'draft',
  amount: '200.00',
};

function setup(onClose = vi.fn(), onCreated = vi.fn()) {
  api.get.mockImplementation(url => {
    if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
    if (url.includes('/clients/search'))   return Promise.resolve({ data: MOCK_CLIENTS });
    if (url.includes('/invoices/eligible-estimates'))  return Promise.resolve({ data: MOCK_ESTIMATES });
    if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: MOCK_AGREEMENTS });
    if (url.includes('/invoices/eligible-jobs'))       return Promise.resolve({ data: { rows: MOCK_JOBS } });
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

  it('Recurring Agreement button is enabled (not disabled)', async () => {
    setup();
    const btn = screen.getByText('Recurring Agreement');
    expect(btn).not.toBeDisabled();
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

// ── Recurring Agreement source picker ─────────────────────────────────────────

describe('InvoiceBuilder — agreement source picker', () => {
  it('Recurring Agreement button is clickable and activates source', async () => {
    setup();
    const btn = screen.getByText('Recurring Agreement');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(btn.className).toContain('active');
  });

  it('clicking Recurring Agreement loads eligible agreements', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/invoices/eligible-agreements'));
    });
  });

  it('shows agreement results after loading', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByText('Monthly AC Maintenance')).toBeInTheDocument();
    });
  });

  it('shows empty state when no agreements available', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByText(/no active agreements found/i)).toBeInTheDocument();
    });
  });

  it('switching from agreement back to blank clears selection', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => screen.getByText('Monthly AC Maintenance'));
    fireEvent.click(screen.getByText('Blank Invoice'));
    expect(screen.queryByText('Monthly AC Maintenance')).toBeNull();
  });
});

// ── Select agreement ──────────────────────────────────────────────────────────

describe('InvoiceBuilder — select agreement', () => {
  async function openAndSelectAgr() {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => screen.getByText('Monthly AC Maintenance'));
    fireEvent.click(screen.getByText('Monthly AC Maintenance'));
  }

  it('selecting agreement shows agreement card', async () => {
    await openAndSelectAgr();
    await waitFor(() => {
      expect(document.querySelector('.ib-agr-card')).not.toBeNull();
    });
  });

  it('selecting agreement prefills client', async () => {
    await openAndSelectAgr();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Able Corp')).toBeInTheDocument();
    });
  });

  it('selecting agreement prefills subject with name and period', async () => {
    await openAndSelectAgr();
    await waitFor(() => {
      const subjectInput = document.querySelector('input[type="text"][placeholder="For Services Rendered"]');
      expect(subjectInput?.value).toContain('Monthly AC Maintenance');
    });
  });

  it('selecting agreement populates line items', async () => {
    await openAndSelectAgr();
    await waitFor(() => {
      expect(screen.getByDisplayValue('AC Service')).toBeInTheDocument();
    });
  });

  it('X button on agreement card clears selection', async () => {
    await openAndSelectAgr();
    await waitFor(() => document.querySelector('.ib-agr-card'));
    const clearBtn = document.querySelector('.ib-agr-card .ib-client-clear');
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(document.querySelector('.ib-agr-card')).toBeNull();
    });
  });
});

// ── Save from agreement ───────────────────────────────────────────────────────

describe('InvoiceBuilder — save from agreement', () => {
  async function openSelectAndSaveAgr() {
    const onCreated = vi.fn();
    const onClose   = vi.fn();
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: MOCK_AGREEMENTS });
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValueOnce({ data: MOCK_CREATED_AGR_INVOICE });
    render(<InvoiceBuilder onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => screen.getByText('Monthly AC Maintenance'));
    fireEvent.click(screen.getByText('Monthly AC Maintenance'));
    await waitFor(() => document.querySelector('.ib-agr-card'));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    return { onCreated, onClose };
  }

  it('Save Draft posts with source_type=AGREEMENT', async () => {
    await openSelectAndSaveAgr();
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/invoices', expect.objectContaining({
        source_type: 'AGREEMENT',
        source_agreement_id: 'a-111',
      }));
    });
  });

  it('Save Draft posts with period_start and period_end', async () => {
    await openSelectAndSaveAgr();
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/invoices', expect.objectContaining({
        period_start: '2026-08-01',
        period_end:   '2026-08-31',
      }));
    });
  });

  it('successful save calls onCreated', async () => {
    const { onCreated } = await openSelectAndSaveAgr();
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(MOCK_CREATED_AGR_INVOICE);
    });
  });
});

// ── Agreement error handling ──────────────────────────────────────────────────

describe('InvoiceBuilder — agreement error handling', () => {
  it('shows already-invoiced period error for 409', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: MOCK_AGREEMENTS });
      return Promise.resolve({ data: [] });
    });
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'This billing period has already been invoiced' } },
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => screen.getByText('Monthly AC Maintenance'));
    fireEvent.click(screen.getByText('Monthly AC Maintenance'));
    await waitFor(() => document.querySelector('.ib-agr-card'));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(screen.getByText(/billing period has already been invoiced/i)).toBeInTheDocument();
    });
  });
});
