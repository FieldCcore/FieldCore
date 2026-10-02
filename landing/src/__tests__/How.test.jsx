import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─── Next.js mocks ────────────────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({ href, children, className, ...rest }) => (
    <a href={href} className={className} {...rest}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

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

// ─── IntersectionObserver mock ────────────────────────────────────────────────
beforeEach(() => {
  mockMatchMedia(false);
  window.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Component imports ────────────────────────────────────────────────────────
import How from '../components/How';
import Hero from '../components/Hero';
import Category from '../components/Category';
import Gap from '../components/Gap';

// ─── Section 4 renders ────────────────────────────────────────────────────────
describe('How section (Section 4)', () => {
  it('renders the section with id="how-it-works"', () => {
    const { container } = render(<How />);
    expect(container.querySelector('#how-it-works')).toBeInTheDocument();
  });

  it('renders the eyebrow label', () => {
    render(<How />);
    expect(screen.getByText('How FieldCore works')).toBeInTheDocument();
  });

  it('renders the primary headline', () => {
    render(<How />);
    expect(
      screen.getByText('From authority evidence to an explainable decision.')
    ).toBeInTheDocument();
  });

  it('renders the lead copy', () => {
    render(<How />);
    expect(
      screen.getByText(/FieldCore separates extraction, human verification, structured authority/i)
    ).toBeInTheDocument();
  });

  it('renders the section close transition label', () => {
    render(<How />);
    expect(
      screen.getByText(/One controlled path from evidence to decision/i)
    ).toBeInTheDocument();
  });
});

// ─── All six steps present ────────────────────────────────────────────────────
describe('All six workflow steps are present', () => {
  it('renders Step 01: Intake', () => {
    render(<How />);
    expect(screen.getAllByText('Intake').length).toBeGreaterThan(0);
  });

  it('renders Step 02: Extract', () => {
    render(<How />);
    expect(screen.getAllByText('Extract').length).toBeGreaterThan(0);
  });

  it('renders Step 03: Verify', () => {
    render(<How />);
    expect(screen.getAllByText('Verify').length).toBeGreaterThan(0);
  });

  it('renders Step 04: Canonicalize', () => {
    render(<How />);
    expect(screen.getAllByText('Canonicalize').length).toBeGreaterThan(0);
  });

  it('renders Step 05: Evaluate', () => {
    render(<How />);
    expect(screen.getAllByText('Evaluate').length).toBeGreaterThan(0);
  });

  it('renders Step 06: Prove', () => {
    render(<How />);
    expect(screen.getAllByText('Prove').length).toBeGreaterThan(0);
  });

  it('renders step nav buttons for all six steps', () => {
    render(<How />);
    const nav = screen.getByRole('navigation', { name: /workflow steps/i });
    expect(nav).toBeInTheDocument();
    ['Intake', 'Extract', 'Verify', 'Canonicalize', 'Evaluate', 'Prove'].forEach(title => {
      expect(nav).toHaveTextContent(title);
    });
  });
});

// ─── Scenario continuity ──────────────────────────────────────────────────────
describe('Same scenario (Sarah Mitchell / Morrison Family Trust) persists across steps', () => {
  it('references Sarah Mitchell', () => {
    render(<How />);
    const matches = screen.getAllByText('Sarah Mitchell');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('references Morrison Family Trust', () => {
    render(<How />);
    expect(screen.getByText(/Morrison Family Trust/i)).toBeInTheDocument();
  });

  it('references request ID FC-394201 across multiple steps', () => {
    render(<How />);
    const ids = screen.getAllByText(/FC-394201/);
    expect(ids.length).toBeGreaterThan(1);
  });

  it('references Durable Power of Attorney across steps', () => {
    render(<How />);
    const matches = screen.getAllByText(/Durable [Pp]ower of [Aa]ttorney/i);
    expect(matches.length).toBeGreaterThan(1);
  });

  it('references POA §7.2 as the evidence anchor', () => {
    render(<How />);
    const matches = screen.getAllByText(/§7\.2/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('references Robert Morrison as the principal', () => {
    render(<How />);
    const matches = screen.getAllByText('Robert Morrison');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('references $275,000 as the request amount', () => {
    render(<How />);
    expect(screen.getAllByText(/\$275,000/).length).toBeGreaterThan(0);
  });
});

// ─── Intake step ─────────────────────────────────────────────────────────────
describe('Intake step', () => {
  it('shows the document filename', () => {
    render(<How />);
    expect(screen.getAllByText('Durable Power of Attorney.pdf').length).toBeGreaterThan(0);
  });

  it('shows 42 pages', () => {
    render(<How />);
    expect(screen.getByText(/42 pages/i)).toBeInTheDocument();
  });

  it('shows the evidence notice', () => {
    render(<How />);
    expect(
      screen.getByText(/The document is evidence\. It is not yet a verified authority record\./i)
    ).toBeInTheDocument();
  });
});

// ─── Extract step — candidates, not verified authority ────────────────────────
describe('Extract step — AI candidates, not institutional authority', () => {
  it('shows "Candidate extraction" label', () => {
    render(<How />);
    expect(screen.getByText('Candidate extraction')).toBeInTheDocument();
  });

  it('shows "Not yet verified" badge', () => {
    render(<How />);
    expect(screen.getByText('Not yet verified')).toBeInTheDocument();
  });

  it('shows "Pending review" for at least one candidate', () => {
    render(<How />);
    const pending = screen.getAllByText('Pending review');
    expect(pending.length).toBeGreaterThan(0);
  });

  it('shows "Accepted" status for accepted candidates', () => {
    render(<How />);
    const accepted = screen.getAllByText('Accepted');
    expect(accepted.length).toBeGreaterThan(0);
  });

  it('shows evidence reference Page 18 · §7.2', () => {
    render(<How />);
    expect(screen.getAllByText(/Page 18 · §7\.2/).length).toBeGreaterThan(0);
  });

  it('shows disclaimer that candidates require human review', () => {
    render(<How />);
    expect(
      screen.getByText(/candidates require human review before any authority record is updated/i)
    ).toBeInTheDocument();
  });
});

// ─── Verify step — human institution, not AI ─────────────────────────────────
describe('Verify step — institution verifies, AI only proposes', () => {
  it('shows "AI proposed. Your institution verifies." distinction', () => {
    render(<How />);
    expect(screen.getByText('AI proposed. Your institution verifies.')).toBeInTheDocument();
  });

  it('shows the human control message about authorized review process', () => {
    render(<How />);
    expect(
      screen.getByText(/AI-generated candidates remain separate from canonical authority/i)
    ).toBeInTheDocument();
  });

  it('shows the reviewer name Alex Rivera', () => {
    render(<How />);
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
  });

  it('shows Accept action (real product action)', () => {
    render(<How />);
    expect(screen.getByText('✓ Accepted')).toBeInTheDocument();
  });

  it('shows Reject action (real product action)', () => {
    render(<How />);
    const rejectBtns = screen.getAllByText('Reject');
    expect(rejectBtns.length).toBeGreaterThan(0);
  });

  it('does not show a fabricated "Escalate" action', () => {
    render(<How />);
    expect(screen.queryByText(/^Escalate$/)).not.toBeInTheDocument();
  });

  it('does not show a fabricated "Correct" action', () => {
    render(<How />);
    expect(screen.queryByText(/^Correct$/)).not.toBeInTheDocument();
  });
});

// ─── Canonicalize step — verified instrument, separate from candidates ─────────
describe('Canonicalize step — verified authority record', () => {
  it('shows "Authority instrument" label', () => {
    render(<How />);
    expect(screen.getByText('Authority instrument')).toBeInTheDocument();
  });

  it('shows "Verified" status badge on the instrument', () => {
    render(<How />);
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
  });

  it('shows "Authorized representative" role', () => {
    render(<How />);
    expect(screen.getAllByText('Authorized representative').length).toBeGreaterThan(0);
  });

  it('shows the document-to-instrument transformation note', () => {
    render(<How />);
    expect(
      screen.getByText(/Unstructured document.*candidate extraction.*institutional review.*verified instrument/i)
    ).toBeInTheDocument();
  });
});

// ─── Evaluate step — deterministic, not AI ────────────────────────────────────
describe('Evaluate step — deterministic evaluation', () => {
  it('shows FieldCore evaluation engine label', () => {
    render(<How />);
    expect(screen.getByText('FieldCore evaluation engine')).toBeInTheDocument();
  });

  it('shows "Review required" decision — not the raw enum MANUAL_REVIEW', () => {
    render(<How />);
    const reviewReq = screen.getAllByText('Review required');
    expect(reviewReq.length).toBeGreaterThan(0);
  });

  it('does not expose the raw enum MANUAL_REVIEW as primary text', () => {
    render(<How />);
    expect(screen.queryByText(/^MANUAL_REVIEW$/)).not.toBeInTheDocument();
  });

  it('states AI does not make the runtime authorization decision', () => {
    render(<How />);
    expect(
      screen.getByText(/AI does not make the runtime authorization decision/i)
    ).toBeInTheDocument();
  });

  it('states verified authority enters deterministic evaluation', () => {
    render(<How />);
    expect(
      screen.getByText(/Verified authority enters deterministic evaluation/i)
    ).toBeInTheDocument();
  });

  it('does not claim AI makes the authorization decision', () => {
    render(<How />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/AI (makes|issues|produces|generates) the (authorization|runtime) decision/i);
  });

  it('shows the decision reason text', () => {
    render(<How />);
    expect(
      screen.getAllByText(/delegate role cannot be resolved deterministically/i).length
    ).toBeGreaterThan(0);
  });
});

// ─── Prove step — decision record ────────────────────────────────────────────
describe('Prove step — decision record', () => {
  it('shows decision record label', () => {
    render(<How />);
    expect(screen.getByText('Decision record')).toBeInTheDocument();
  });

  it('shows decision ID FC-D-938293', () => {
    render(<How />);
    expect(screen.getByText('FC-D-938293')).toBeInTheDocument();
  });

  it('shows the request ID FC-394201 in the decision record', () => {
    render(<How />);
    const ids = screen.getAllByText('FC-394201');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('shows the evaluated timestamp', () => {
    render(<How />);
    expect(screen.getByText(/14:23:07 UTC/)).toBeInTheDocument();
  });

  it('shows the reason field in the decision record', () => {
    render(<How />);
    expect(
      screen.getAllByText(/Authority evidence is present/i).length
    ).toBeGreaterThan(0);
  });
});

// ─── No false product claims ──────────────────────────────────────────────────
describe('No false product claims', () => {
  it('does not claim FieldCore executes the transaction', () => {
    render(<How />);
    expect(document.body.textContent).not.toMatch(/FieldCore executes/i);
  });

  it('does not claim AI makes the authorization decision', () => {
    render(<How />);
    expect(document.body.textContent).not.toMatch(/AI (makes|issues) the.*decision/i);
  });

  it('does not expose raw enum values as primary labels', () => {
    render(<How />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/^MANUAL_REVIEW$/m);
    expect(body).not.toMatch(/^NOT_AUTHORIZED$/m);
    expect(body).not.toMatch(/^INSUFFICIENT_INFORMATION$/m);
  });

  it('does not include fabricated confidence claims like 98.7%', () => {
    render(<How />);
    expect(document.body.textContent).not.toMatch(/98\.7%/);
  });

  it('does not claim legal compliance or legal validity', () => {
    render(<How />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/legally valid/i);
    expect(body).not.toMatch(/legally approved/i);
    expect(body).not.toMatch(/SOC 2/i);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────
describe('Accessibility', () => {
  it('section has aria-labelledby pointing to the heading', () => {
    const { container } = render(<How />);
    const section = container.querySelector('#how-it-works');
    expect(section).toHaveAttribute('aria-labelledby', 'how-heading');
  });

  it('heading with id="how-heading" exists', () => {
    render(<How />);
    expect(document.getElementById('how-heading')).toBeInTheDocument();
  });

  it('step nav has an accessible name', () => {
    render(<How />);
    expect(screen.getByRole('navigation', { name: /workflow steps/i })).toBeInTheDocument();
  });

  it('nav buttons are keyboard accessible (have accessible labels)', () => {
    render(<How />);
    const btns = screen.getAllByRole('button', { name: /Go to step/i });
    expect(btns.length).toBe(6);
  });

  it('decorative elements are aria-hidden', () => {
    const { container } = render(<How />);
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
  });
});

// ─── Sections 1–3 are unaffected ─────────────────────────────────────────────
describe('Sections 1–3 are unaffected when Section 4 is present', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('all four sections render together without conflicts', () => {
    render(
      <>
        <Hero />
        <Category />
        <Gap />
        <How />
      </>
    );
    expect(screen.getByText('Know who is authorized.')).toBeInTheDocument();
    expect(screen.getByText('Identity tells you who someone is.')).toBeInTheDocument();
    expect(
      screen.getByText('Critical authority still lives in documents, systems, and institutional knowledge.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('From authority evidence to an explainable decision.')
    ).toBeInTheDocument();
  });
});

// ─── Reduced motion ───────────────────────────────────────────────────────────
describe('Prefers-reduced-motion', () => {
  it('renders completely when reduced motion is preferred', () => {
    mockMatchMedia(true);
    render(<How />);
    expect(
      screen.getByText('From authority evidence to an explainable decision.')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Intake').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prove').length).toBeGreaterThan(0);
  });
});
