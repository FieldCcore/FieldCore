'use strict';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NewInvoicePage from '../NewInvoicePage';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

import api from '../../api';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_SETTINGS = { next_number: 101, tax_rate: 0, default_terms: null };

const CLIENT_A = { id: 'c-aaa', name: 'Alpha Corp', email: 'alpha@corp.com', phone: '555-0001', address: '1 Alpha Rd' };
const CLIENT_B = { id: 'c-bbb', name: 'Beta Ltd',   email: 'beta@ltd.com',   phone: '555-0002', address: '2 Beta Ave' };

const JOB_A = {
  id: 'j-aaa', service_type: 'HVAC Repair', amount: '500.00',
  scheduled_at: '2026-08-01T10:00:00Z', client_id: 'c-aaa',
  client_name: 'Alpha Corp', address: '1 Alpha Rd',
};

const CREATED_INVOICE = {
  id: 'inv-new-1', invoice_number: 101, source_type: 'JOB', job_id: 'j-aaa',
  client_id: 'c-aaa', status: 'draft', amount: '500.00',
};

function setupMocks({ eligibleJobs = [JOB_A] } = {}) {
  api.get.mockImplementation(url => {
    if (url.includes('/invoices/settings'))     return Promise.resolve({ data: MOCK_SETTINGS });
    if (url.includes('/clients/search'))         return Promise.resolve({ data: [CLIENT_A, CLIENT_B] });
    if (url.includes('/services/search'))        return Promise.resolve({ data: [] });
    if (url.includes('/invoices/eligible-jobs')) return Promise.resolve({ data: { rows: eligibleJobs } });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: CREATED_INVOICE });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NewInvoicePage />
    </MemoryRouter>
  );
}

// Selects Client A via the autocomplete (type → advance timers → click first result)
async function pickClientA() {
  const input = screen.getByPlaceholderText(/search by name, company/i);
  fireEvent.change(input, { target: { value: 'Alpha' } });
  await act(async () => { vi.advanceTimersByTime(300); });
  await waitFor(() => expect(document.querySelector('.ac-drop-item')).not.toBeNull());
  fireEvent.mouseDown(document.querySelector('.ac-drop-item'));
  await waitFor(() => screen.getByDisplayValue('Alpha Corp'));
}

// Opens the job picker and waits for the search input to appear
async function openJobPicker() {
  const linkBtn = screen.getByRole('button', { name: /link job/i });
  fireEvent.click(linkBtn);
  await waitFor(() => screen.getByPlaceholderText(/search by service type/i));
}

// Selects the first job in the picker list
async function selectFirstJob() {
  await waitFor(() => document.querySelector('.niw-job-row'));
  fireEvent.click(document.querySelector('.niw-job-row'));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Control visibility ─────────────────────────────────────────────────────────

describe('NewInvoicePage — Link to Job control visibility', () => {
  it('Link Job button is disabled when no client selected', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /link job/i }));
    expect(screen.getByRole('button', { name: /link job/i })).toBeDisabled();
  });

  it('Link Job button is enabled after selecting a client', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    expect(screen.getByRole('button', { name: /link job/i })).not.toBeDisabled();
  });
});

// ── Eligible job fetch ─────────────────────────────────────────────────────────

describe('NewInvoicePage — eligible job fetch', () => {
  it('calls eligible-jobs API with client_id when Link Job clicked', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    const eligibleCalls = api.get.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('eligible-jobs'));
    expect(eligibleCalls.length).toBeGreaterThanOrEqual(1);
    expect(eligibleCalls[0][0]).toContain('client_id=c-aaa');
  });

  it('displays eligible jobs in the picker', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    await waitFor(() => screen.getByText('HVAC Repair'));
    expect(screen.getByText('HVAC Repair')).toBeInTheDocument();
  });

  it('shows empty state when no eligible jobs for client', async () => {
    setupMocks({ eligibleJobs: [] });
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    await waitFor(() => screen.getByText(/no completed.*uninvoiced/i));
    expect(screen.getByText(/no completed.*uninvoiced/i)).toBeInTheDocument();
  });
});

// ── Job selection and canonical ID ────────────────────────────────────────────

describe('NewInvoicePage — job selection and canonical job_id', () => {
  it('selecting a job shows the job card (client name visible)', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    await selectFirstJob();
    await waitFor(() => screen.getByText('Alpha Corp'));
    expect(screen.getByText('Alpha Corp')).toBeInTheDocument();
  });

  it('selecting a job pre-fills the subject field with service_type', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    await selectFirstJob();
    // Both the subject input and line-item name input will show 'HVAC Repair'
    await waitFor(() => screen.getAllByDisplayValue('HVAC Repair'));
    expect(screen.getAllByDisplayValue('HVAC Repair').length).toBeGreaterThanOrEqual(1);
  });

  it('Save Draft posts source_type=JOB and canonical job_id — not client name text', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    await selectFirstJob();

    // Two Save Draft buttons exist (header + mobile); wait for either to be enabled
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /save draft/i });
      expect(btns.some(b => !b.disabled)).toBe(true);
    });
    const draftBtn = screen.getAllByRole('button', { name: /save draft/i })[0];
    fireEvent.click(draftBtn);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, payload] = api.post.mock.calls[0];
    expect(payload.source_type).toBe('JOB');
    expect(payload.job_id).toBe('j-aaa');   // canonical UUID, not text
    expect(payload.client_id).toBeUndefined();  // derived server-side from job
  });
});

// ── Cross-client filtering ─────────────────────────────────────────────────────

describe('NewInvoicePage — cross-client job filtering', () => {
  it('eligible-jobs request scopes to selected client_id — not all clients', async () => {
    setupMocks({ eligibleJobs: [JOB_A] });
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    const calls = api.get.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('eligible-jobs'));
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toContain('client_id=c-aaa');
    expect(calls[0][0]).not.toContain('client_id=c-bbb');
  });

  it('client B jobs are absent when client A is selected (server returns only A jobs)', async () => {
    setupMocks({ eligibleJobs: [JOB_A] });
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    await waitFor(() => screen.getByText('HVAC Repair'));
    expect(screen.queryByText('Plumbing Fix')).toBeNull();
    expect(screen.queryByText('Beta Ltd')).toBeNull();
  });
});

// ── Job unlink ────────────────────────────────────────────────────────────────

describe('NewInvoicePage — unlinking a job', () => {
  it('unlink button clears the job card and restores the Link Job control', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/search by name, company/i));
    await pickClientA();
    await openJobPicker();
    await selectFirstJob();
    await waitFor(() => screen.getByLabelText('Unlink job'));
    fireEvent.click(screen.getByLabelText('Unlink job'));
    await waitFor(() => screen.getByRole('button', { name: /link job/i }));
    expect(screen.getByRole('button', { name: /link job/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link job/i })).not.toBeDisabled();
  });
});
