import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InvoiceBuilder from '../InvoiceBuilder';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../../api';

const MOCK_SETTINGS = {
  next_number: 1042,
  tax_rate: 0,
  accept_card: true,
  accept_ach: false,
  allow_partial_payments: false,
  default_terms: null,
};

const MOCK_SETTINGS_WITH_TAX = { ...MOCK_SETTINGS, tax_rate: 0.08 };

const MOCK_SERVICES = [
  { id: 'svc-1', name: 'Premium Mobile Detail', description: 'Exterior + Interior', price: '200.00', category: 'Detailing', sku: 'PMD-001', duration_minutes: 120 },
  { id: 'svc-2', name: 'Basic Wash', description: 'Exterior only', price: '50.00', category: null, sku: null, duration_minutes: 30 },
];

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

function setup(onClose = vi.fn(), onCreated = vi.fn(), settingsOverride = MOCK_SETTINGS) {
  api.get.mockImplementation(url => {
    if (url.includes('/invoices/settings')) return Promise.resolve({ data: settingsOverride });
    if (url.includes('/clients/search'))   return Promise.resolve({ data: MOCK_CLIENTS });
    if (url.includes('/services/search'))  return Promise.resolve({ data: MOCK_SERVICES });
    if (url.includes('/invoices/eligible-estimates'))  return Promise.resolve({ data: MOCK_ESTIMATES });
    if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: MOCK_AGREEMENTS });
    if (url.includes('/invoices/eligible-jobs'))       return Promise.resolve({ data: { rows: MOCK_JOBS } });
    return Promise.resolve({ data: [] });
  });
  return render(<InvoiceBuilder onClose={onClose} onCreated={onCreated} />);
}

// Shared helper: type a client name, wait for dropdown, select first result
async function pickClient() {
  const input = screen.getByPlaceholderText(/search by name, company/i);
  fireEvent.change(input, { target: { value: 'Able' } });
  await act(async () => { vi.advanceTimersByTime(300); });
  await waitFor(() => expect(document.querySelector('.ac-drop-item')).not.toBeNull());
  fireEvent.mouseDown(document.querySelector('.ac-drop-item'));
  await waitFor(() => screen.getByDisplayValue('Able Corp'));
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

  it('shows hint to select client when no client is selected', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByText(/select a client above/i)).toBeInTheDocument();
    });
  });

  it('does not call eligible-agreements API before client is selected', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await act(async () => { vi.advanceTimersByTime(300); });
    const agrCalls = api.get.mock.calls.filter(c => c[0].includes('/invoices/eligible-agreements'));
    expect(agrCalls).toHaveLength(0);
  });

  it('loads agreements after client is selected', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/invoices/eligible-agreements'));
    });
  });

  it('shows agreement results after client is selected', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => {
      expect(screen.getByText('Monthly AC Maintenance')).toBeInTheDocument();
    });
  });

  it('shows empty state with Create button when no agreements available', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => {
      expect(screen.getByText(/no active recurring agreements/i)).toBeInTheDocument();
      expect(screen.getByText('Create Recurring Agreement')).toBeInTheDocument();
    });
  });

  it('switching from agreement back to blank clears agreement list', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
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
    await pickClient();
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
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: MOCK_AGREEMENTS });
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValueOnce({ data: MOCK_CREATED_AGR_INVOICE });
    render(<InvoiceBuilder onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
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
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: MOCK_AGREEMENTS });
      return Promise.resolve({ data: [] });
    });
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'This billing period has already been invoiced' } },
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => screen.getByText('Monthly AC Maintenance'));
    fireEvent.click(screen.getByText('Monthly AC Maintenance'));
    await waitFor(() => document.querySelector('.ib-agr-card'));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(screen.getByText(/billing period has already been invoiced/i)).toBeInTheDocument();
    });
  });
});

// ── Inline agreement form ─────────────────────────────────────────────────────

describe('InvoiceBuilder — inline agreement form', () => {
  async function openEmptyAgreementState() {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => screen.getByText('Create Recurring Agreement'));
  }

  it('shows Create Recurring Agreement button in empty state', async () => {
    await openEmptyAgreementState();
    expect(screen.getByText('Create Recurring Agreement')).toBeInTheDocument();
  });

  it('clicking Create Recurring Agreement expands inline form', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByText('New Recurring Agreement')).toBeInTheDocument();
    });
  });

  it('inline form has service cadence selector', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByTestId('agr-cadence')).toBeInTheDocument();
    });
  });

  it('inline form has billing cadence selector', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByTestId('agr-billing-cadence')).toBeInTheDocument();
    });
  });

  it('inline form has extra occurrence policy selector', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByTestId('agr-extra-policy')).toBeInTheDocument();
    });
  });

  it('inline form has missed service policy selector', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByTestId('agr-missed-policy')).toBeInTheDocument();
    });
  });

  it('service type autocomplete field is present in inline form', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/services/search'))   return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => screen.getByText('Create Recurring Agreement'));
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByTestId('agr-service-type')).toBeInTheDocument();
    });
  });

  it('service type search shows catalog results', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/services/search'))   return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => screen.getByText('Create Recurring Agreement'));
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => screen.getByTestId('agr-service-type'));
    const svcInput = screen.getByTestId('agr-service-type');
    fireEvent.focus(svcInput);
    fireEvent.change(svcInput, { target: { value: 'Lawn' } });
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => {
      expect(screen.getByText('Premium Mobile Detail')).toBeInTheDocument();
    });
  });

  it('selecting a catalog service pre-fills plan price when price is empty', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/services/search'))   return Promise.resolve({ data: MOCK_SERVICES });
      if (url.includes('/invoices/eligible-agreements')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => screen.getByText('Create Recurring Agreement'));
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => screen.getByTestId('agr-service-type'));
    const svcInput = screen.getByTestId('agr-service-type');
    fireEvent.focus(svcInput);
    fireEvent.change(svcInput, { target: { value: '' } });
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => screen.getByText('Premium Mobile Detail'));
    fireEvent.mouseDown(screen.getByText('Premium Mobile Detail'));
    await waitFor(() => {
      const priceInput = screen.getByTestId('agr-plan-price');
      expect(priceInput.value).toBe('200.00');
    });
  });

  it('end date toggle shows end date field when "Specific end date" selected', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => screen.getByTestId('agr-end-condition'));
    fireEvent.change(screen.getByTestId('agr-end-condition'), { target: { value: 'date' } });
    await waitFor(() => {
      expect(screen.getByTestId('agr-end-date')).toBeInTheDocument();
    });
  });

  it('end date field hides again when condition switched back to "No end date"', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => screen.getByTestId('agr-end-condition'));
    fireEvent.change(screen.getByTestId('agr-end-condition'), { target: { value: 'date' } });
    await waitFor(() => screen.getByTestId('agr-end-date'));
    fireEvent.change(screen.getByTestId('agr-end-condition'), { target: { value: 'none' } });
    await waitFor(() => {
      expect(screen.queryByTestId('agr-end-date')).toBeNull();
    });
  });

  it('schedule preview appears when start date is set', async () => {
    await openEmptyAgreementState();
    fireEvent.click(screen.getByText('Create Recurring Agreement'));
    await waitFor(() => screen.getByTestId('agr-cadence'));
    // Start date defaults to TODAY so preview should appear immediately
    await waitFor(() => {
      expect(screen.getByTestId('agr-schedule-preview')).toBeInTheDocument();
    });
  });

  it('saving inline form auto-selects newly created agreement', async () => {
    const NEW_AGR = {
      id: 'a-new',
      name: 'Weekly Pool Service',
      service_type: 'Pool',
      cadence: 'weekly',
      billing_cadence: 'monthly',
      plan_price: '150.00',
      status: 'active',
      payment_status: 'pending',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      period_already_invoiced: false,
      line_items: [],
      client_id: 'c-111',
      client_name: 'Able Corp',
      client_email: 'able@corp.com',
      client_address: '1 Main St',
    };

    let agrCallCount = 0;
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/clients/search'))    return Promise.resolve({ data: MOCK_CLIENTS });
      if (url.includes('/invoices/eligible-agreements')) {
        agrCallCount++;
        return Promise.resolve({ data: agrCallCount === 1 ? [] : [NEW_AGR] });
      }
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValueOnce({ data: NEW_AGR });

    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await pickClient();
    await waitFor(() => screen.getByText('Create Recurring Agreement'));
    fireEvent.click(screen.getByText('Create Recurring Agreement'));

    await waitFor(() => screen.getByTestId('agr-name'));
    fireEvent.change(screen.getByTestId('agr-name'), { target: { value: 'Weekly Pool Service' } });
    fireEvent.change(screen.getByTestId('agr-plan-price'), { target: { value: '150' } });

    fireEvent.click(screen.getByText('Create Agreement'));

    await waitFor(() => {
      expect(document.querySelector('.ib-agr-card')).not.toBeNull();
    });
  });
});

// ── V2: Client autocomplete ───────────────────────────────────────────────────

describe('InvoiceBuilder V2 — client autocomplete', () => {
  it('shows client search input with correct placeholder', async () => {
    setup();
    expect(screen.getByPlaceholderText(/search by name, company/i)).toBeInTheDocument();
  });

  it('typing triggers client search API call after debounce', async () => {
    setup();
    const input = screen.getByPlaceholderText(/search by name, company/i);
    fireEvent.change(input, { target: { value: 'Able' } });
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('/clients/search?q=Able'),
        expect.any(Object)
      );
    });
  });

  it('shows client result in dropdown', async () => {
    setup();
    const input = screen.getByPlaceholderText(/search by name, company/i);
    fireEvent.change(input, { target: { value: 'Able' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    await waitFor(() => {
      const item = document.querySelector('.ac-drop-item');
      expect(item).not.toBeNull();
      expect(item.textContent).toMatch(/able corp/i);
    });
  });

  it('clicking a client result selects the client', async () => {
    setup();
    const input = screen.getByPlaceholderText(/search by name, company/i);
    fireEvent.change(input, { target: { value: 'Able' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(document.querySelector('.ac-drop-item')).not.toBeNull());
    fireEvent.mouseDown(document.querySelector('.ac-drop-item'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Able Corp')).toBeInTheDocument();
    });
  });

  it('shows client card after selection', async () => {
    setup();
    const input = screen.getByPlaceholderText(/search by name, company/i);
    fireEvent.change(input, { target: { value: 'Able' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(document.querySelector('.ac-drop-item')).not.toBeNull());
    fireEvent.mouseDown(document.querySelector('.ac-drop-item'));
    await waitFor(() => {
      expect(document.querySelector('.ib-client-card')).not.toBeNull();
    });
  });

  it('clear button removes selected client', async () => {
    setup();
    const input = screen.getByPlaceholderText(/search by name, company/i);
    fireEvent.change(input, { target: { value: 'Able' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(document.querySelector('.ac-drop-item')).not.toBeNull());
    fireEvent.mouseDown(document.querySelector('.ac-drop-item'));
    await waitFor(() => screen.getByDisplayValue('Able Corp'));
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    await waitFor(() => {
      expect(document.querySelector('.ib-client-card')).toBeNull();
    });
  });
});

// ── V2: Service catalog in line items ─────────────────────────────────────────

describe('InvoiceBuilder V2 — service catalog', () => {
  it('focusing line item name input fetches services', async () => {
    setup();
    const nameInput = screen.getByPlaceholderText('Service name');
    fireEvent.focus(nameInput);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('/services/search'),
        expect.any(Object)
      );
    });
  });

  it('shows service results dropdown when focused', async () => {
    setup();
    const nameInput = screen.getByPlaceholderText('Service name');
    fireEvent.focus(nameInput);
    await waitFor(() => {
      expect(screen.getByText('Premium Mobile Detail')).toBeInTheDocument();
    });
  });

  it('selecting a service populates name and price', async () => {
    setup();
    const nameInput = screen.getByPlaceholderText('Service name');
    fireEvent.focus(nameInput);
    await waitFor(() => screen.getByText('Premium Mobile Detail'));
    fireEvent.mouseDown(screen.getByText('Premium Mobile Detail'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Premium Mobile Detail')).toBeInTheDocument();
    });
  });

  it('shows "+ Custom line item" option in dropdown', async () => {
    setup();
    const nameInput = screen.getByPlaceholderText('Service name');
    fireEvent.focus(nameInput);
    await waitFor(() => {
      expect(screen.getByText(/custom line item/i)).toBeInTheDocument();
    });
  });
});

// ── V2: Discount label ────────────────────────────────────────────────────────

describe('InvoiceBuilder V2 — discount label', () => {
  it('discount label input not shown when no discount', async () => {
    setup();
    expect(screen.queryByPlaceholderText(/discount reason/i)).toBeNull();
  });

  it('discount label input appears when discount type is fixed', async () => {
    setup();
    const select = screen.getByDisplayValue('No discount');
    fireEvent.change(select, { target: { value: 'fixed' } });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/discount reason/i)).toBeInTheDocument();
    });
  });

  it('discount label appears when discount type is percent', async () => {
    setup();
    const select = screen.getByDisplayValue('No discount');
    fireEvent.change(select, { target: { value: 'percent' } });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/discount reason/i)).toBeInTheDocument();
    });
  });

  it('discount label value is included in save payload', async () => {
    const onCreated = vi.fn();
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.resolve({ data: MOCK_SETTINGS });
      if (url.includes('/clients/search')) return Promise.resolve({ data: MOCK_CLIENTS });
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValueOnce({ data: { id: 'inv-1', status: 'draft' } });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={onCreated} />);

    // Select client
    const clientInput = screen.getByPlaceholderText(/search by name, company/i);
    fireEvent.change(clientInput, { target: { value: 'Able' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(document.querySelector('.ac-drop-item')).not.toBeNull());
    fireEvent.mouseDown(document.querySelector('.ac-drop-item'));
    await waitFor(() => screen.getByDisplayValue('Able Corp'));

    // Add a line item
    const nameInput = screen.getByPlaceholderText('Service name');
    fireEvent.change(nameInput, { target: { value: 'Test Service' } });
    const priceInput = screen.getAllByPlaceholderText('0.00')[0];
    fireEvent.change(priceInput, { target: { value: '100' } });

    // Add discount with label
    const discountSelect = screen.getByDisplayValue('No discount');
    fireEvent.change(discountSelect, { target: { value: 'percent' } });
    const labelInput = screen.getByPlaceholderText(/discount reason/i);
    fireEvent.change(labelInput, { target: { value: 'New Client Discount' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/invoices', expect.objectContaining({
        discount_label: 'New Client Discount',
        discount_type: 'percent',
      }));
    });
  });
});

// ── V2: Payment options ───────────────────────────────────────────────────────

describe('InvoiceBuilder V2 — payment options', () => {
  it('shows payment options section when accept_card is true', async () => {
    setup(vi.fn(), vi.fn(), { ...MOCK_SETTINGS, accept_card: true });
    await waitFor(() => {
      expect(screen.getByText('Payment Options')).toBeInTheDocument();
    });
  });

  it('payment options section not shown when all are false', async () => {
    setup(vi.fn(), vi.fn(), {
      ...MOCK_SETTINGS,
      accept_card: false,
      accept_ach: false,
      allow_partial_payments: false,
    });
    await waitFor(() => {
      expect(screen.queryByText('Payment Options')).toBeNull();
    });
  });

  it('Accept Card checkbox is visible when configured', async () => {
    setup(vi.fn(), vi.fn(), { ...MOCK_SETTINGS, accept_card: true });
    await waitFor(() => {
      expect(screen.getByText('Accept Card')).toBeInTheDocument();
    });
  });

  it('ACH option only shows when business has it configured', async () => {
    setup(vi.fn(), vi.fn(), { ...MOCK_SETTINGS, accept_card: true, accept_ach: true });
    await waitFor(() => {
      expect(screen.getByText(/accept ach/i)).toBeInTheDocument();
    });
  });
});

// ── V2: Tax state ─────────────────────────────────────────────────────────────

describe('InvoiceBuilder V2 — tax display', () => {
  it('shows "Not configured" when tax_rate is 0', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });
  });

  it('shows tax rate when configured', async () => {
    setup(vi.fn(), vi.fn(), MOCK_SETTINGS_WITH_TAX);
    await waitFor(() => {
      expect(screen.getByText(/tax \(8\.0%\)/i)).toBeInTheDocument();
    });
  });
});

// ── V2: Save actions dropdown ─────────────────────────────────────────────────

describe('InvoiceBuilder V2 — save actions', () => {
  it('renders the dropdown arrow button when accept_card is true', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /more save options/i })).toBeInTheDocument();
    });
  });

  it('clicking dropdown arrow opens save options', async () => {
    setup();
    await waitFor(() => screen.getByRole('button', { name: /more save options/i }));
    fireEvent.click(screen.getByRole('button', { name: /more save options/i }));
    await waitFor(() => {
      expect(screen.getByText(/save & collect payment/i)).toBeInTheDocument();
    });
  });

  it('dropdown arrow not shown when no payment methods configured', async () => {
    setup(vi.fn(), vi.fn(), {
      ...MOCK_SETTINGS,
      accept_card: false,
      accept_ach: false,
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /more save options/i })).toBeNull();
    });
  });
});

// ── V2: Invoice totals ────────────────────────────────────────────────────────

describe('InvoiceBuilder V2 — totals panel', () => {
  it('shows Payments Applied row', async () => {
    setup();
    expect(screen.getByText('Payments Applied')).toBeInTheDocument();
  });

  it('shows Balance Due row', async () => {
    setup();
    expect(screen.getByText('Balance Due')).toBeInTheDocument();
  });

  it('shows Subtotal row', async () => {
    setup();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
  });
});

// ── V2: Multiple line items ───────────────────────────────────────────────────

describe('InvoiceBuilder V2 — multiple line items', () => {
  it('Add Line Item button adds a new row', async () => {
    setup();
    expect(screen.getAllByPlaceholderText('Service name')).toHaveLength(1);
    fireEvent.click(screen.getByText(/add line item/i));
    expect(screen.getAllByPlaceholderText('Service name')).toHaveLength(2);
  });

  it('remove button is disabled when only one row', async () => {
    setup();
    const removeBtn = screen.getByRole('button', { name: /remove line/i });
    expect(removeBtn).toBeDisabled();
  });

  it('remove button removes a row when multiple exist', async () => {
    setup();
    fireEvent.click(screen.getByText(/add line item/i));
    expect(screen.getAllByPlaceholderText('Service name')).toHaveLength(2);
    const removeBtns = screen.getAllByRole('button', { name: /remove line/i });
    fireEvent.click(removeBtns[0]);
    expect(screen.getAllByPlaceholderText('Service name')).toHaveLength(1);
  });
});

// ── V2: Source regression — all four sources still work ───────────────────────

describe('InvoiceBuilder V2 — source regression', () => {
  it('Blank Invoice source still works', async () => {
    setup();
    expect(screen.getByText('Blank Invoice').className).toContain('active');
    expect(screen.getByPlaceholderText(/search by name, company/i)).toBeInTheDocument();
  });

  it('Completed Job source still works', async () => {
    setup();
    fireEvent.click(screen.getByText('Completed Job'));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/invoices/eligible-jobs'));
    });
  });

  it('Existing Estimate source still works', async () => {
    setup();
    fireEvent.click(screen.getByText('Existing Estimate'));
    await waitFor(() => {
      expect(screen.getByText('Signed Estimate')).toBeInTheDocument();
    });
  });

  it('Recurring Agreement source still works', async () => {
    setup();
    fireEvent.click(screen.getByText('Recurring Agreement'));
    await waitFor(() => {
      expect(screen.getByText(/active recurring agreement/i)).toBeInTheDocument();
    });
  });
});

// ── Invoice number preview ────────────────────────────────────────────────────

describe('InvoiceBuilder — invoice number preview', () => {
  it('shows preview number loaded from API (not hardcoded 1001)', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Preview #1042/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Preview #1001/i)).not.toBeInTheDocument();
  });

  it('shows no preview number before API resolves', () => {
    // API mock never resolves during this synchronous check
    api.get.mockImplementation(() => new Promise(() => {}));
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText(/Preview #/i)).not.toBeInTheDocument();
  });

  it('shows "Unavailable" when settings API fails', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings')) return Promise.reject(new Error('500'));
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Preview # Unavailable/i)).toBeInTheDocument();
    });
  });

  it('does not show a hardcoded fallback number when API returns null next_number', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('/invoices/settings'))
        return Promise.resolve({ data: { ...MOCK_SETTINGS, next_number: null } });
      return Promise.resolve({ data: [] });
    });
    render(<InvoiceBuilder onClose={vi.fn()} onCreated={vi.fn()} />);
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(screen.queryByText(/Preview #/i)).not.toBeInTheDocument();
  });
});
