import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─── Next.js mocks (must precede component imports) ──────────────────────────
vi.mock('next/link', () => ({
  default: ({ href, children, className, style, onClick, ...rest }) => (
    <a href={href} className={className} style={style} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// ─── Component imports ────────────────────────────────────────────────────────
import Hero from '../components/Hero';
import Nav from '../components/Nav';

// ─── matchMedia mock ──────────────────────────────────────────────────────────
function mockMatchMedia(reducedMotion = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  mockMatchMedia(false);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ─── Navigation tests ─────────────────────────────────────────────────────────
describe('Public navigation', () => {
  it('renders the nav element', () => {
    render(<Nav />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('has a Sign in link pointing to /login', () => {
    render(<Nav />);
    const links = screen.getAllByRole('link', { name: /sign in/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/login');
  });

  it('has a Request a demo link pointing to /contact', () => {
    render(<Nav />);
    const links = screen.getAllByRole('link', { name: /request a demo/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/contact');
  });

  it('contains the five expected nav items', () => {
    render(<Nav />);
    expect(screen.getAllByText('Platform').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Solutions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Developers').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Security & Trust/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Resources').length).toBeGreaterThan(0);
  });

  it('does not contain authenticated-only navigation items', () => {
    render(<Nav />);
    expect(screen.queryByText(/dispatch/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invoices/i)).not.toBeInTheDocument();
  });
});

// ─── Hero headline & CTA tests ────────────────────────────────────────────────
describe('Hero headline and CTAs', () => {
  it('renders both headline lines', () => {
    render(<Hero />);
    expect(screen.getByText('Know who is authorized.')).toBeInTheDocument();
    expect(screen.getByText('Before the action happens.')).toBeInTheDocument();
  });

  it('renders the primary CTA linking to /contact', () => {
    render(<Hero />);
    const cta = screen.getByRole('link', { name: /request an enterprise demo/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/contact');
  });

  it('renders the secondary CTA', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /see how fieldcore works/i })).toBeInTheDocument();
  });

  it('renders the Security & Trust tertiary link', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /security.*trust/i })).toBeInTheDocument();
  });
});

// ─── Auth console scenario tests ──────────────────────────────────────────────
describe('Auth console — scenarios', () => {
  it('Banking is the default scenario (tab is selected)', () => {
    render(<Hero />);
    const tab = screen.getByRole('tab', { name: 'Banking' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the Banking human-readable request', () => {
    render(<Hero />);
    // The request text contains Sarah Mitchell and Morrison Family Trust
    expect(screen.getAllByText(/Sarah Mitchell/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Morrison Family Trust/).length).toBeGreaterThan(0);
  });

  it('shows FC-394201 request ID for Banking', () => {
    render(<Hero />);
    // Appears in header and metadata grid — getAllByText is correct
    expect(screen.getAllByText('FC-394201').length).toBeGreaterThan(0);
  });

  it('changing to Trust & Wealth updates the human-readable request', async () => {
    render(<Hero />);
    fireEvent.click(screen.getByRole('tab', { name: 'Trust & Wealth' }));
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.getAllByText(/James Harrington/).length).toBeGreaterThan(0);
  });

  it('changing to Enterprise updates authority and policy', async () => {
    render(<Hero />);
    fireEvent.click(screen.getByRole('tab', { name: 'Enterprise' }));
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.getAllByText('Corporate Authorization Resolution').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Enterprise Procurement Policy').length).toBeGreaterThan(0);
  });

  it('changing to Healthcare updates the request text', async () => {
    render(<Hero />);
    fireEvent.click(screen.getByRole('tab', { name: 'Healthcare' }));
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.getAllByText(/David Sato/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Eleanor Sato/).length).toBeGreaterThan(0);
  });

  it('scenario tabs update the evidence field', async () => {
    render(<Hero />);
    // Banking: evidence is POA §7.2
    expect(screen.getAllByText(/POA §7.2/).length).toBeGreaterThan(0);

    // Switch to Trust & Wealth — §5.3 evidence
    fireEvent.click(screen.getByRole('tab', { name: 'Trust & Wealth' }));
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.getAllByText(/§5.3/).length).toBeGreaterThan(0);
  });

  it('scenario change deselects the previous tab', async () => {
    render(<Hero />);
    const bankingTab = screen.getByRole('tab', { name: 'Banking' });
    expect(bankingTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Enterprise' }));
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(bankingTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Enterprise' })).toHaveAttribute('aria-selected', 'true');
  });
});

// ─── Evaluation trace tests ───────────────────────────────────────────────────
describe('Evaluation trace', () => {
  it('renders trace step labels in the DOM', () => {
    render(<Hero />);
    // Trace items exist in DOM even before revealed
    expect(screen.getByText('Identity established')).toBeInTheDocument();
    expect(screen.getByText('Policy evaluated')).toBeInTheDocument();
  });

  it('reveals the first trace item after 300ms', async () => {
    const { container } = render(<Hero />);
    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(0);

    await act(async () => { vi.advanceTimersByTime(300); });
    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBeGreaterThanOrEqual(1);
  });

  it('reveals all 6 trace items after full evaluation time', async () => {
    const { container } = render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(6);
  });

  it('resets trace when scenario changes', async () => {
    const { container } = render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(6);

    fireEvent.click(screen.getByRole('tab', { name: 'Enterprise' }));
    await act(async () => { vi.advanceTimersByTime(200); });
    // After fade completes (~170ms), activeId changes and trace resets to 0
    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(0);
  });
});

// ─── Final decision tests ─────────────────────────────────────────────────────
describe('Final decision', () => {
  it('renders the decision text node in the DOM', () => {
    render(<Hero />);
    // Text is rendered but block may be dim before decided
    expect(screen.getByText('Review required')).toBeInTheDocument();
  });

  it('decision block becomes ac-decision-visible after evaluation', async () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('.ac-decision.ac-decision-visible')).not.toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(container.querySelector('.ac-decision.ac-decision-visible')).toBeInTheDocument();
  });

  it('decision reason text renders', async () => {
    render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText(/delegate role cannot be resolved deterministically/i)).toBeInTheDocument();
  });

  it('status badge changes to decided text after evaluation', async () => {
    render(<Hero />);
    expect(screen.getByRole('status')).toHaveTextContent('Evaluating');

    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('status')).toHaveTextContent('Decision reached');
  });
});

// ─── No raw internal enum strings ────────────────────────────────────────────
describe('No raw internal enum exposure', () => {
  const BANNED_ENUMS = [
    'MANUAL_REVIEW',
    'UNDEFINED_ROLE_SEMANTICS',
    'PENDING_HUMAN_REVIEW',
    'HUMAN_REVIEW_IN_PROGRESS',
    'NOT_AUTHORIZED',
    'INSUFFICIENT_INFORMATION',
    'EXPLICITLY_GRANTED',
    'DELEGATE_NOT_AGENT',
    'REQUESTING_PARTY_NOT_AGENT',
  ];

  it('does not render any raw system enum values', async () => {
    render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });
    for (const banned of BANNED_ENUMS) {
      expect(screen.queryByText(banned)).not.toBeInTheDocument();
    }
  });

  it('does not render AUTHORIZED as a decision outcome', async () => {
    render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });
    // The product principle contains "FieldCore does not invent authority" — that's fine
    // But the raw enum 'AUTHORIZED' must not appear
    const allText = document.body.textContent;
    expect(allText).not.toMatch(/\bAUTHORIZED\b/);
  });
});

// ─── Interactive panel tests ──────────────────────────────────────────────────
describe('Decision evidence and authority interactions', () => {
  async function renderDecided() {
    render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });
  }

  it('View decision evidence button opens evidence panel', async () => {
    await renderDecided();
    fireEvent.click(screen.getByRole('button', { name: /view decision evidence/i }));
    expect(screen.getByRole('region', { name: 'Decision evidence' })).toBeInTheDocument();
  });

  it('evidence panel contains Evidence source label (unique to panel)', async () => {
    await renderDecided();
    fireEvent.click(screen.getByRole('button', { name: /view decision evidence/i }));
    const panel = screen.getByRole('region', { name: 'Decision evidence' });
    expect(within(panel).getByText('Evidence source')).toBeInTheDocument();
  });

  it('evidence panel shows the reference §7.2', async () => {
    await renderDecided();
    fireEvent.click(screen.getByRole('button', { name: /view decision evidence/i }));
    const panel = screen.getByRole('region', { name: 'Decision evidence' });
    expect(within(panel).getByText('§7.2')).toBeInTheDocument();
  });

  it('View authority button opens authority summary panel', async () => {
    await renderDecided();
    fireEvent.click(screen.getByRole('button', { name: /view authority/i }));
    expect(screen.getByRole('region', { name: 'Authority summary' })).toBeInTheDocument();
  });

  it('authority panel shows Instrument type label (unique to panel)', async () => {
    await renderDecided();
    fireEvent.click(screen.getByRole('button', { name: /view authority/i }));
    const panel = screen.getByRole('region', { name: 'Authority summary' });
    expect(within(panel).getByText('Instrument type')).toBeInTheDocument();
  });

  it('close button dismisses the evidence panel', async () => {
    await renderDecided();
    fireEvent.click(screen.getByRole('button', { name: /view decision evidence/i }));
    expect(screen.getByRole('region', { name: 'Decision evidence' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
    expect(screen.queryByRole('region', { name: 'Decision evidence' })).not.toBeInTheDocument();
  });

  it('Replay evaluation resets the trace to 0 revealed items', async () => {
    const { container } = render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(6);

    fireEvent.click(screen.getByRole('button', { name: /replay evaluation/i }));
    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(0);
  });

  it('Replay evaluation re-runs trace to completion', async () => {
    const { container } = render(<Hero />);
    await act(async () => { vi.advanceTimersByTime(2000); });

    fireEvent.click(screen.getByRole('button', { name: /replay evaluation/i }));
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(6);
  });
});

// ─── Reduced motion ───────────────────────────────────────────────────────────
describe('Prefers-reduced-motion', () => {
  it('shows all trace items and decision immediately without animations', async () => {
    vi.useRealTimers();
    mockMatchMedia(true);

    const { container } = render(<Hero />);

    await waitFor(() => {
      expect(container.querySelectorAll('.ac-trace-item.ac-revealed').length).toBe(6);
    }, { timeout: 2000 });

    expect(screen.getByText('Review required')).toBeInTheDocument();
    expect(container.querySelector('.ac-decision.ac-decision-visible')).toBeInTheDocument();
  });
});
