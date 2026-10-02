'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  {
    label: 'Platform',
    type: 'dropdown',
    paths: ['/features', '/pricing', '/compare', '/updates'],
    items: [
      { href: '/features', label: 'Features',  desc: 'Capabilities, modules, and the Authority Engine.' },
      { href: '/pricing',  label: 'Pricing',   desc: 'Plans for every stage of growth.'              },
      { href: '/compare',  label: 'Compare',   desc: 'FieldCore vs. alternatives.'                   },
      { href: '/updates',  label: 'Updates',   desc: 'Release history and upcoming improvements.'     },
    ],
  },
  {
    label: 'Solutions',
    type: 'link',
    href: '/verticals',
    paths: ['/verticals'],
  },
  {
    label: 'Developers',
    type: 'link',
    href: '/contact',
    paths: [],
  },
  {
    label: 'Security & Trust',
    type: 'link',
    href: '/contact',
    paths: [],
  },
  {
    label: 'Resources',
    type: 'dropdown',
    paths: ['/blog', '/faq', '/about', '/careers', '/partners', '/press', '/contact'],
    items: [
      { href: '/blog',    label: 'Blog',    desc: 'Insights on authority, policy, and operations.'   },
      { href: '/faq',     label: 'FAQ',     desc: 'Answers to common questions.'                     },
      { href: '/about',   label: 'About',   desc: 'Our mission, team, and values.'                   },
      { href: '/contact', label: 'Contact', desc: 'Talk with the FieldCore team.'                    },
    ],
  },
];

export default function Nav() {
  const [scrolled, setScrolled]         = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(null);
  const navRef = useRef(null);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') { setOpenDropdown(null); setMobileOpen(false); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      <nav
        className={`site-nav${scrolled ? ' scrolled' : ''}`}
        ref={navRef}
        aria-label="Main navigation"
      >
        <Link href="/" className="nav-logo">FIELDCORE<sup>™</sup></Link>

        {/* Desktop links */}
        <div className="nav-links-desktop" role="menubar">
          {NAV_ITEMS.map((item) => {
            const isActive = item.paths.some(p => pathname?.startsWith(p));

            if (item.type === 'link') {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`nav-direct${isActive ? ' section-active' : ''}`}
                >
                  {item.label}
                </Link>
              );
            }

            const isOpen = openDropdown === item.label;
            return (
              <div key={item.label} className="nav-group">
                <button
                  className={`nav-group-btn${isOpen ? ' active' : ''}${isActive ? ' section-active' : ''}`}
                  onClick={() => setOpenDropdown(isOpen ? null : item.label)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                >
                  {item.label}
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="nav-chevron" aria-hidden="true">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="nav-dropdown" role="menu">
                    {item.items.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`nav-dropdown-item${pathname === sub.href ? ' current' : ''}`}
                        role="menuitem"
                        onClick={() => setOpenDropdown(null)}
                      >
                        <div className="ndi-label">{sub.label}</div>
                        <div className="ndi-desc">{sub.desc}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="nav-ctas">
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
          <Link href="/contact" className="btn btn-sand">Request a demo</Link>
        </div>

        {/* Hamburger */}
        <button
          className={`nav-hamburger${mobileOpen ? ' open' : ''}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="nav-mobile" id="mobile-nav" aria-label="Mobile navigation">
          <div className="nav-mobile-inner">
            {NAV_ITEMS.map((item) => {
              if (item.type === 'link') {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="nm-direct"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              }

              return (
                <div key={item.label} className="nm-group">
                  <button
                    className="nm-group-btn"
                    onClick={() => setMobileExpanded(mobileExpanded === item.label ? null : item.label)}
                    aria-expanded={mobileExpanded === item.label}
                  >
                    {item.label}
                    <svg
                      width="10" height="6" viewBox="0 0 10 6" fill="none"
                      className={`nm-chevron${mobileExpanded === item.label ? ' open' : ''}`}
                      aria-hidden="true"
                    >
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>

                  {mobileExpanded === item.label && (
                    <div className="nm-items">
                      {item.items.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="nm-item"
                          onClick={() => setMobileOpen(false)}
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="nm-ctas">
              <Link
                href="/login"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/contact"
                className="btn btn-sand"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setMobileOpen(false)}
              >
                Request a demo
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
