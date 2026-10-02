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

import Hero from '../components/Hero';
import Category from '../components/Category';
import Gap from '../components/Gap';
import How from '../components/How';
import Layers from '../components/Layers';

function PublicPage() {
  return (
    <>
      <Hero />
      <Category />
      <Gap />
      <How />
      <Layers />
    </>
  );
}

// ─── New sections present ─────────────────────────────────────────────────────
describe('New public landing page — sections present', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders Section 1 headline', () => {
    render(<PublicPage />);
    expect(screen.getByText('Know who is authorized.')).toBeInTheDocument();
  });

  it('renders Section 2 identity/authority distinction', () => {
    render(<PublicPage />);
    expect(screen.getByText('Identity tells you who someone is.')).toBeInTheDocument();
  });

  it('renders Section 3 authority gap headline', () => {
    render(<PublicPage />);
    expect(
      screen.getByText('Critical authority still lives in documents, systems, and institutional knowledge.')
    ).toBeInTheDocument();
  });

  it('renders Section 4 workflow headline', () => {
    render(<PublicPage />);
    expect(
      screen.getByText('From authority evidence to an explainable decision.')
    ).toBeInTheDocument();
  });

  it('renders Section 5 architecture headline', () => {
    render(<PublicPage />);
    expect(
      screen.getByText('AI reads. Humans verify. Rules decide.')
    ).toBeInTheDocument();
  });

  it('renders all five section root elements', () => {
    const { container } = render(<PublicPage />);
    expect(container.querySelector('#deepdive')).toBeInTheDocument();
    expect(container.querySelector('#auth-gap')).toBeInTheDocument();
    expect(container.querySelector('#how-it-works')).toBeInTheDocument();
    expect(container.querySelector('#layers')).toBeInTheDocument();
  });
});

// ─── Old service-business content is absent ───────────────────────────────────
describe('Old service-business landing page content — absent', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not render old service-business headline', () => {
    render(<PublicPage />);
    expect(document.body.textContent).not.toMatch(/Run your entire business/i);
    expect(document.body.textContent).not.toMatch(/from a personal phone/i);
    expect(document.body.textContent).not.toMatch(/You're running a real business/i);
  });

  it('does not render BUILT FOR vertical strip', () => {
    render(<PublicPage />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/Auto Detailing/i);
    expect(body).not.toMatch(/Pressure Washing/i);
    expect(body).not.toMatch(/Pest Control/i);
    expect(body).not.toMatch(/Mobile Mechanic/i);
    expect(body).not.toMatch(/Fleet Washing/i);
  });

  it('does not render old problem card copy', () => {
    render(<PublicPage />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/No-show protection/i);
    expect(body).not.toMatch(/Surprise charge/i);
    expect(body).not.toMatch(/Personal = business/i);
  });

  it('does not render old CRM pricing copy', () => {
    render(<PublicPage />);
    const body = document.body.textContent;
    expect(body).not.toMatch(/Start free trial/i);
    expect(body).not.toMatch(/Apps replaced/i);
    expect(body).not.toMatch(/Service verticals/i);
  });
});
