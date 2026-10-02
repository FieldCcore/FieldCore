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
const mockObserve   = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();
beforeEach(() => {
  mockMatchMedia(false);
  window.IntersectionObserver = vi.fn().mockImplementation(cb => ({
    observe: mockObserve,
    unobserve: mockUnobserve,
    disconnect: mockDisconnect,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Component imports ────────────────────────────────────────────────────────
import Category from '../components/Category';
import Hero from '../components/Hero';

// ─── Section 2 renders ───────────────────────────────────────────────────────
describe('Category section (Section 2)', () => {
  it('renders the section with id="deepdive"', () => {
    const { container } = render(<Category />);
    expect(container.querySelector('#deepdive')).toBeInTheDocument();
  });

  it('renders the identity statement', () => {
    render(<Category />);
    expect(screen.getByText('Identity tells you who someone is.')).toBeInTheDocument();
  });

  it('renders the FieldCore authorization statement', () => {
    render(<Category />);
    expect(
      screen.getByText("FieldCore determines whether they're authorized to perform the action.")
    ).toBeInTheDocument();
  });

  it('renders the identity layer eyebrow label', () => {
    render(<Category />);
    expect(screen.getByText('The authorization layer')).toBeInTheDocument();
  });

  it('renders supporting copy for the identity layer', () => {
    render(<Category />);
    expect(
      screen.getByText(/Authentication and identity systems establish who a person is/i)
    ).toBeInTheDocument();
  });

  it('renders the FieldCore supporting body copy', () => {
    render(<Category />);
    expect(
      screen.getByText(/FieldCore evaluates whether that actor has authority/i)
    ).toBeInTheDocument();
  });
});

// ─── Identity concepts ───────────────────────────────────────────────────────
describe('Identity concepts visible in section', () => {
  it('renders SSO in the identity diagram description', () => {
    const { container } = render(<Category />);
    // aria-hidden diagram and screen-reader text both present
    expect(container).toHaveTextContent('SSO');
  });

  it('renders MFA', () => {
    const { container } = render(<Category />);
    expect(container).toHaveTextContent('MFA');
  });

  it('renders IAM', () => {
    const { container } = render(<Category />);
    expect(container).toHaveTextContent('IAM');
  });

  it('renders Identity verification', () => {
    const { container } = render(<Category />);
    expect(container).toHaveTextContent('Identity verification');
  });

  it('renders ACTOR as the convergence point', () => {
    const { container } = render(<Category />);
    expect(container).toHaveTextContent('ACTOR');
  });
});

// ─── Auth model inputs ───────────────────────────────────────────────────────
describe('FieldCore authorization model inputs', () => {
  const INPUTS = ['ACTOR', 'ACTION', 'RESOURCE', 'AUTHORITY', 'CONDITIONS', 'POLICY'];

  for (const input of INPUTS) {
    it(`renders ${input} as an input to FieldCore`, () => {
      const { container } = render(<Category />);
      expect(container).toHaveTextContent(input);
    });
  }

  it('renders FIELDCORE as the authorization engine', () => {
    const { container } = render(<Category />);
    // The cat-auth-fc-name element contains FIELDCORE
    expect(container.querySelector('.cat-auth-fc-name')).toBeInTheDocument();
    expect(container.querySelector('.cat-auth-fc-name')).toHaveTextContent('FIELDCORE');
  });

  it('renders DECISION as the output', () => {
    const { container } = render(<Category />);
    expect(container.querySelector('.cat-auth-decision')).toBeInTheDocument();
    expect(container.querySelector('.cat-auth-decision')).toHaveTextContent('DECISION');
  });
});

// ─── Identity → Authority → Execution pipeline ───────────────────────────────
describe('Identity → FieldCore → Execution pipeline', () => {
  it('renders Identity as the first pipeline node', () => {
    render(<Category />);
    const labels = screen.getAllByText('Identity');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('renders FieldCore authorization as the center pipeline node', () => {
    render(<Category />);
    expect(screen.getByText('FieldCore authorization')).toBeInTheDocument();
  });

  it('renders Execution as the third pipeline node', () => {
    render(<Category />);
    expect(screen.getByText('Execution')).toBeInTheDocument();
  });

  it('execution node clarifies that the customer system performs the action', () => {
    render(<Category />);
    expect(
      screen.getByText(/performed by the customer.s existing system/i)
    ).toBeInTheDocument();
  });

  it('does not claim FieldCore executes the transaction', () => {
    render(<Category />);
    const body = document.body.textContent;
    // The only mention of "FieldCore" + "execute" should be in the denial
    // e.g. "FieldCore does not execute the transaction"
    expect(body).not.toMatch(/FieldCore executes/i);
  });

  it('execution text states FieldCore does not execute the transaction', () => {
    render(<Category />);
    expect(
      screen.getByText(/FieldCore does not execute the transaction/i)
    ).toBeInTheDocument();
  });
});

// ─── Positioning copy ────────────────────────────────────────────────────────
describe('Positioning copy', () => {
  it('renders the "does not replace" claim', () => {
    render(<Category />);
    expect(
      screen.getByText(/FieldCore does not replace identity systems/i)
    ).toBeInTheDocument();
  });

  it('renders the "authorization question they do not" contrast', () => {
    render(<Category />);
    expect(
      screen.getByText(/answers the authorization question they do not/i)
    ).toBeInTheDocument();
  });

  it('renders the "Who is this actor?" identity question', () => {
    render(<Category />);
    expect(screen.getByText('Who is this actor?')).toBeInTheDocument();
  });

  it('renders the "Is this actor authorized" FieldCore question', () => {
    render(<Category />);
    expect(
      screen.getByText(/Is this actor authorized to perform this action\?/i)
    ).toBeInTheDocument();
  });

  it('renders FieldCore source label in questions', () => {
    render(<Category />);
    const labels = screen.getAllByText('FieldCore');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('renders Identity layer source label', () => {
    render(<Category />);
    expect(screen.getByText('Identity layer')).toBeInTheDocument();
  });
});

// ─── Section 1 co-existence ───────────────────────────────────────────────────
describe('Section 1 is unaffected', () => {
  beforeEach(() => {
    // Hero needs fake timers or at least the matchMedia mock
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Hero headline when both components are present', () => {
    render(
      <>
        <Hero />
        <Category />
      </>
    );
    expect(screen.getByText('Know who is authorized.')).toBeInTheDocument();
    expect(screen.getByText('Before the action happens.')).toBeInTheDocument();
  });

  it('Hero CTA href="#deepdive" links to the Section 2 anchor', () => {
    render(
      <>
        <Hero />
        <Category />
      </>
    );
    const cta = screen.getByRole('link', { name: /see how fieldcore works/i });
    expect(cta).toHaveAttribute('href', '#deepdive');
    // Section 2 has id="deepdive"
    expect(document.getElementById('deepdive')).toBeInTheDocument();
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────
describe('Accessibility', () => {
  it('section has aria-labelledby pointing to the heading', () => {
    const { container } = render(<Category />);
    const section = container.querySelector('#deepdive');
    expect(section).toHaveAttribute('aria-labelledby', 'cat-heading');
  });

  it('heading with id="cat-heading" exists', () => {
    render(<Category />);
    expect(document.getElementById('cat-heading')).toBeInTheDocument();
  });

  it('decorative diagram elements are aria-hidden', () => {
    const { container } = render(<Category />);
    // Connectors, arrows, and ≠ separator are aria-hidden
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('screen-reader description for auth model exists in DOM', () => {
    render(<Category />);
    expect(
      screen.getByText(/FieldCore synthesizes six inputs/i)
    ).toBeInTheDocument();
  });
});

// ─── Reduced motion ───────────────────────────────────────────────────────────
describe('Prefers-reduced-motion', () => {
  it('does not break rendering when reduced motion is preferred', () => {
    mockMatchMedia(true);
    const { container } = render(<Category />);
    // Section renders completely regardless of motion preference
    expect(container.querySelector('#deepdive')).toBeInTheDocument();
    expect(container).toHaveTextContent('Identity tells you who someone is.');
    expect(container).toHaveTextContent("FieldCore determines whether they're authorized");
  });
});
