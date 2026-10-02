import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

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
  window.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

import Layers from '../components/Layers';

// ─── Section renders ──────────────────────────────────────────────────────────
describe('Layers section (Section 5)', () => {
  it('renders with id="layers"', () => {
    const { container } = render(<Layers />);
    expect(container.querySelector('#layers')).toBeInTheDocument();
  });

  it('renders the section headline', () => {
    render(<Layers />);
    expect(screen.getByText('AI reads. Humans verify. Rules decide.')).toBeInTheDocument();
  });

  it('renders the architecture eyebrow', () => {
    render(<Layers />);
    expect(screen.getByText(/the architecture/i)).toBeInTheDocument();
  });

  it('renders the lead paragraph about three-layer separation', () => {
    render(<Layers />);
    expect(
      screen.getByText(/FieldCore keeps three things permanently separate/i)
    ).toBeInTheDocument();
  });
});

// ─── Three layers present ────────────────────────────────────────────────────
describe('Three architectural layers are present', () => {
  it('renders Layer 1: AI Extraction', () => {
    render(<Layers />);
    expect(screen.getByText('AI Extraction')).toBeInTheDocument();
  });

  it('renders Layer 2: Institutional Verification', () => {
    render(<Layers />);
    expect(screen.getByText('Institutional Verification')).toBeInTheDocument();
  });

  it('renders Layer 3: Deterministic Evaluation', () => {
    render(<Layers />);
    expect(screen.getByText('Deterministic Evaluation')).toBeInTheDocument();
  });

  it('renders layer eyebrow labels Layer 1, Layer 2, Layer 3', () => {
    render(<Layers />);
    expect(screen.getByText('Layer 1')).toBeInTheDocument();
    expect(screen.getByText('Layer 2')).toBeInTheDocument();
    expect(screen.getByText('Layer 3')).toBeInTheDocument();
  });
});

// ─── Verification boundary ────────────────────────────────────────────────────
describe('Verification boundary is present and correctly labeled', () => {
  it('renders the verification boundary', () => {
    render(<Layers />);
    expect(screen.getByText('Institutional Verification Boundary')).toBeInTheDocument();
  });

  it('states that AI output does not become authority until verified', () => {
    render(<Layers />);
    expect(
      screen.getByText(/AI output does not become authority until your institution accepts it/i)
    ).toBeInTheDocument();
  });

  it('states candidates remain separate until a reviewer confirms', () => {
    render(<Layers />);
    expect(
      screen.getByText(/Candidates remain separate from canonical records/i)
    ).toBeInTheDocument();
  });
});

// ─── AI candidates — unverified state ────────────────────────────────────────
describe('AI candidate state — unverified output, not authority', () => {
  it('shows instrument_type candidate', () => {
    render(<Layers />);
    expect(screen.getAllByText('instrument_type').length).toBeGreaterThan(0);
  });

  it('shows agent_name candidate pointing to Sarah Mitchell', () => {
    render(<Layers />);
    const agentRows = screen.getAllByText('agent_name');
    const candidateRow = agentRows.map(el => el.closest('.ly-candidate')).find(Boolean);
    expect(candidateRow).toHaveTextContent('Sarah Mitchell');
  });

  it('shows unverified candidates notice', () => {
    render(<Layers />);
    expect(screen.getByText(/Unverified candidates/i)).toBeInTheDocument();
  });

  it('shows confidence percentages for candidates', () => {
    render(<Layers />);
    expect(screen.getByText('97%')).toBeInTheDocument();
    expect(screen.getByText('84%')).toBeInTheDocument();
  });
});

// ─── Verified state — institution confirms ───────────────────────────────────
describe('Verified canonical authority record', () => {
  it('shows all four verified fields with checkmarks', () => {
    render(<Layers />);
    const checks = screen.getAllByText('✓');
    expect(checks.length).toBe(4);
  });

  it('shows the verified canonical authority note', () => {
    render(<Layers />);
    expect(screen.getByText(/Verified canonical authority record/i)).toBeInTheDocument();
  });

  it('shows Sarah Mitchell in the verified record', () => {
    render(<Layers />);
    const mitchellItems = screen.getAllByText('Sarah Mitchell');
    expect(mitchellItems.length).toBeGreaterThan(0);
  });
});

// ─── Deterministic evaluation — no AI in runtime decision ────────────────────
describe('Deterministic evaluation — no AI in runtime decision', () => {
  it('shows FieldCore evaluation engine label', () => {
    render(<Layers />);
    expect(screen.getByText('FieldCore evaluation engine')).toBeInTheDocument();
  });

  it('states no AI involvement in runtime decision', () => {
    render(<Layers />);
    expect(
      screen.getByText(/No AI involvement in the runtime decision/i)
    ).toBeInTheDocument();
  });

  it('shows evaluation inputs (ACTOR, AUTHORITY, POLICY, ACTION)', () => {
    render(<Layers />);
    expect(screen.getByText('ACTOR')).toBeInTheDocument();
    expect(screen.getByText('AUTHORITY')).toBeInTheDocument();
    expect(screen.getByText('POLICY')).toBeInTheDocument();
    expect(screen.getByText('ACTION')).toBeInTheDocument();
  });
});

// ─── Fail-safe behavior ───────────────────────────────────────────────────────
describe('Fail-safe behavior is documented', () => {
  it('shows the fail-safe label', () => {
    render(<Layers />);
    expect(screen.getByText('Fail-safe behavior')).toBeInTheDocument();
  });

  it('states engine returns MANUAL_REVIEW not a guess', () => {
    render(<Layers />);
    expect(
      screen.getByText(/the engine returns MANUAL_REVIEW — not a guess/i)
    ).toBeInTheDocument();
  });

  it('states FieldCore does not invent authority', () => {
    render(<Layers />);
    expect(
      screen.getByText(/FieldCore does not invent authority when evidence or rules are incomplete/i)
    ).toBeInTheDocument();
  });
});

// ─── Decision output ──────────────────────────────────────────────────────────
describe('Decision output', () => {
  it('shows "Review required" as the decision', () => {
    render(<Layers />);
    expect(screen.getByText('Review required')).toBeInTheDocument();
  });

  it('shows MANUAL_REVIEW label in decision badge', () => {
    render(<Layers />);
    expect(screen.getAllByText(/MANUAL_REVIEW/).length).toBeGreaterThan(0);
  });

  it('does not expose AUTHORIZED as a decision for this scenario', () => {
    render(<Layers />);
    expect(screen.queryByText(/^AUTHORIZED$/)).not.toBeInTheDocument();
  });

  it('does not claim AI makes the decision', () => {
    render(<Layers />);
    expect(document.body.textContent).not.toMatch(/AI (makes|issues|produces) the.*decision/i);
  });
});

// ─── Scenario continuity ─────────────────────────────────────────────────────
describe('Fictional scenario continuity', () => {
  it('references Sarah Mitchell', () => {
    render(<Layers />);
    expect(screen.getAllByText('Sarah Mitchell').length).toBeGreaterThan(0);
  });

  it('references Robert Morrison', () => {
    render(<Layers />);
    expect(screen.getAllByText('Robert Morrison').length).toBeGreaterThan(0);
  });

  it('references the Durable Power of Attorney', () => {
    render(<Layers />);
    expect(screen.getAllByText(/Durable [Pp]ower of [Aa]ttorney/i).length).toBeGreaterThan(0);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────
describe('Accessibility', () => {
  it('section has aria-labelledby pointing to the heading', () => {
    const { container } = render(<Layers />);
    const section = container.querySelector('#layers');
    expect(section).toHaveAttribute('aria-labelledby', 'ly-heading');
  });

  it('heading with id="ly-heading" exists', () => {
    render(<Layers />);
    expect(document.getElementById('ly-heading')).toBeInTheDocument();
  });
});

// ─── Reduced motion ───────────────────────────────────────────────────────────
describe('Prefers-reduced-motion', () => {
  it('renders completely when reduced motion is preferred', () => {
    mockMatchMedia(true);
    render(<Layers />);
    expect(screen.getByText('AI reads. Humans verify. Rules decide.')).toBeInTheDocument();
    expect(screen.getByText('AI Extraction')).toBeInTheDocument();
    expect(screen.getByText('Institutional Verification')).toBeInTheDocument();
    expect(screen.getByText('Deterministic Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Review required')).toBeInTheDocument();
  });
});
