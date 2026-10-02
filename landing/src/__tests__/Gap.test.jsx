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

// IntersectionObserver mock
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
import Gap from '../components/Gap';
import Hero from '../components/Hero';
import Category from '../components/Category';

// ─── Section 3 renders ───────────────────────────────────────────────────────
describe('Gap section (Section 3)', () => {
  it('renders the section with id="auth-gap"', () => {
    const { container } = render(<Gap />);
    expect(container.querySelector('#auth-gap')).toBeInTheDocument();
  });

  it('renders the primary headline', () => {
    render(<Gap />);
    expect(
      screen.getByText('Critical authority still lives in documents, systems, and institutional knowledge.')
    ).toBeInTheDocument();
  });

  it('renders the eyebrow label', () => {
    render(<Gap />);
    expect(screen.getByText('The authorization gap')).toBeInTheDocument();
  });

  it('renders the lead copy', () => {
    render(<Gap />);
    expect(
      screen.getByText(/Organizations can verify identity, manage access, and route approvals/i)
    ).toBeInTheDocument();
  });
});

// ─── Authority document context ───────────────────────────────────────────────
describe('Authority document source', () => {
  it('renders the Durable Power of Attorney card', () => {
    render(<Gap />);
    expect(screen.getByText('Durable Power of Attorney')).toBeInTheDocument();
  });

  it('shows authority document type label', () => {
    render(<Gap />);
    expect(screen.getByText('Authority document')).toBeInTheDocument();
  });

  it('shows the relevant authority reference §7.2', () => {
    render(<Gap />);
    expect(screen.getByText('§7.2 Financial powers')).toBeInTheDocument();
  });

  it('shows what the authority document knows', () => {
    render(<Gap />);
    expect(screen.getByText('What authority exists')).toBeInTheDocument();
  });
});

// ─── Corporate Resolution context ─────────────────────────────────────────────
describe('Organizational authority source', () => {
  it('renders the Corporate Resolution card', () => {
    render(<Gap />);
    expect(screen.getByText('Corporate Resolution')).toBeInTheDocument();
  });

  it('renders Northstar Holdings as the entity', () => {
    render(<Gap />);
    expect(screen.getByText('Northstar Holdings, Inc.')).toBeInTheDocument();
  });
});

// ─── Institutional policy context ─────────────────────────────────────────────
describe('Institutional policy source', () => {
  it('renders the Private Wealth Transfer Policy card', () => {
    render(<Gap />);
    expect(screen.getByText('Private Wealth Transfer Policy')).toBeInTheDocument();
  });

  it('renders the institutional policy type label', () => {
    render(<Gap />);
    expect(screen.getByText('Institutional policy')).toBeInTheDocument();
  });

  it('shows what the policy knows', () => {
    render(<Gap />);
    expect(screen.getByText('Institutional conditions')).toBeInTheDocument();
  });
});

// ─── Identity context ─────────────────────────────────────────────────────────
describe('Identity directory source', () => {
  it('renders Sarah Mitchell as the identity', () => {
    render(<Gap />);
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
  });

  it('renders the identity directory type label', () => {
    render(<Gap />);
    expect(screen.getByText('Identity directory')).toBeInTheDocument();
  });

  it('shows authorized representative role', () => {
    render(<Gap />);
    expect(screen.getByText('Authorized representative')).toBeInTheDocument();
  });

  it('shows what the identity source knows', () => {
    render(<Gap />);
    expect(screen.getByText('Who the actor is')).toBeInTheDocument();
  });
});

// ─── Request context ──────────────────────────────────────────────────────────
describe('Transaction request source', () => {
  it('renders the transaction request card', () => {
    render(<Gap />);
    expect(screen.getByText('Wire transfer — $275,000')).toBeInTheDocument();
  });

  it('renders Morrison Family Trust as the resource', () => {
    render(<Gap />);
    // Morrison Family Trust appears in both this section and Section 1 data
    const matches = screen.getAllByText('Morrison Family Trust');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders the transaction request type label', () => {
    render(<Gap />);
    expect(screen.getByText('Transaction request')).toBeInTheDocument();
  });

  it('shows what the request system knows', () => {
    render(<Gap />);
    expect(screen.getByText('What is being requested')).toBeInTheDocument();
  });
});

// ─── Approval workflow context ────────────────────────────────────────────────
describe('Approval workflow source', () => {
  it('renders the transfer approval workflow card', () => {
    render(<Gap />);
    expect(screen.getByText('Transfer approval')).toBeInTheDocument();
  });

  it('renders the approval workflow type label', () => {
    render(<Gap />);
    expect(screen.getByText('Approval workflow')).toBeInTheDocument();
  });

  it('renders Private Wealth Operations as the approver', () => {
    render(<Gap />);
    expect(screen.getByText('Private Wealth Operations')).toBeInTheDocument();
  });

  it('notes that the workflow knows who reviews, not whether authority is valid', () => {
    render(<Gap />);
    expect(
      screen.getByText(/Who currently reviews it — not whether the underlying authority is valid/i)
    ).toBeInTheDocument();
  });
});

// ─── WHO/WHAT/WHERE → WHY ─────────────────────────────────────────────────────
describe('"WHY are they authorized?" emphasis', () => {
  it('renders "Your systems may know:" intro', () => {
    render(<Gap />);
    expect(screen.getByText('Your systems may know:')).toBeInTheDocument();
  });

  it('renders WHO column', () => {
    render(<Gap />);
    expect(screen.getByText('WHO')).toBeInTheDocument();
  });

  it('renders WHAT column', () => {
    render(<Gap />);
    expect(screen.getByText('WHAT')).toBeInTheDocument();
  });

  it('renders WHERE column', () => {
    render(<Gap />);
    expect(screen.getByText('WHERE')).toBeInTheDocument();
  });

  it('renders "But the missing question is:" transition', () => {
    render(<Gap />);
    expect(screen.getByText('But the missing question is:')).toBeInTheDocument();
  });

  it('renders "WHY are they authorized?" as the central question', () => {
    render(<Gap />);
    // "WHY" is in an <em> and the rest follows; the full text includes both
    const missingQ = document.querySelector('.gap-missing-question');
    expect(missingQ).toBeInTheDocument();
    expect(missingQ.textContent).toMatch(/WHY.*are they authorized\?/i);
  });
});

// ─── Final problem statement ──────────────────────────────────────────────────
describe('Final problem statement', () => {
  it('renders "A document is not an enforceable authorization model."', () => {
    render(<Gap />);
    expect(
      screen.getByText('A document is not an enforceable authorization model.')
    ).toBeInTheDocument();
  });

  it('renders the closing body copy', () => {
    render(<Gap />);
    expect(
      screen.getByText(/Until authority, restrictions, policy, identity, and request context/i)
    ).toBeInTheDocument();
  });

  it('renders the Section 4 transition label', () => {
    render(<Gap />);
    expect(
      screen.getByText(/How FieldCore closes the gap/i)
    ).toBeInTheDocument();
  });
});

// ─── Correct positioning claims ───────────────────────────────────────────────
describe('Correct product positioning', () => {
  it('does not claim FieldCore replaces IAM', () => {
    render(<Gap />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/FieldCore replaces IAM/i);
    expect(body).not.toMatch(/replaces identity systems/i);
  });

  it('does not claim FieldCore executes transactions', () => {
    render(<Gap />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/FieldCore executes/i);
  });

  it('does not contain fake customer metrics', () => {
    render(<Gap />);
    const body = document.body.textContent;
    // No "$XM saved", "X customers", "X% reduction" claims
    expect(body).not.toMatch(/\$\d+[MB] (saved|prevented|recovered)/i);
    expect(body).not.toMatch(/\d+,?\d+ (customers|clients|enterprises)/i);
  });

  it('does not name fake customer logos or brand names', () => {
    render(<Gap />);
    const body = document.body.textContent;
    // Northstar Holdings is fictional placeholder, not a real customer claim
    // The section shouldn't claim real customers or certifications
    expect(body).not.toMatch(/SOC 2 Type II/i);
    expect(body).not.toMatch(/ISO 27001/i);
  });
});

// ─── Sections 1 and 2 co-existence ───────────────────────────────────────────
describe('Sections 1 and 2 are unaffected', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all three sections together without conflicts', () => {
    render(
      <>
        <Hero />
        <Category />
        <Gap />
      </>
    );
    // Section 1
    expect(screen.getByText('Know who is authorized.')).toBeInTheDocument();
    // Section 2
    expect(screen.getByText('Identity tells you who someone is.')).toBeInTheDocument();
    // Section 3
    expect(
      screen.getByText('Critical authority still lives in documents, systems, and institutional knowledge.')
    ).toBeInTheDocument();
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────
describe('Accessibility', () => {
  it('section has aria-labelledby pointing to the heading', () => {
    const { container } = render(<Gap />);
    const section = container.querySelector('#auth-gap');
    expect(section).toHaveAttribute('aria-labelledby', 'gap-heading');
  });

  it('heading with id="gap-heading" exists', () => {
    render(<Gap />);
    expect(document.getElementById('gap-heading')).toBeInTheDocument();
  });

  it('sources container has an aria-label', () => {
    const { container } = render(<Gap />);
    expect(
      container.querySelector('[aria-label="Six disconnected authority sources"]')
    ).toBeInTheDocument();
  });

  it('decorative connector elements are aria-hidden', () => {
    const { container } = render(<Gap />);
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
  });
});

// ─── Reduced motion ───────────────────────────────────────────────────────────
describe('Prefers-reduced-motion', () => {
  it('renders completely when reduced motion is preferred', () => {
    mockMatchMedia(true);
    render(<Gap />);
    expect(
      screen.getByText('Critical authority still lives in documents, systems, and institutional knowledge.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('A document is not an enforceable authorization model.')
    ).toBeInTheDocument();
  });
});
