import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <div className="footer-brand-name">FIELDCORE<sup>™</sup></div>
          <p className="footer-brand-tag">The operating system for service businesses.</p>
        </div>

        <div>
          <div className="footer-col-title">Product</div>
          <div className="footer-links">
            <Link href="/features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/verticals">Verticals</Link>
            <Link href="/compare">Compare FieldCore</Link>
            <Link href="/updates">Updates</Link>
          </div>
        </div>

        <div>
          <div className="footer-col-title">Company</div>
          <div className="footer-links">
            <Link href="/about">About</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/partners">Partners</Link>
            <Link href="/press">Press</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>

        <div>
          <div className="footer-col-title">Support</div>
          <div className="footer-links">
            <Link href="/faq">FAQ</Link>
            <Link href="/contact">Contact Support</Link>
          </div>
        </div>

        <div>
          <div className="footer-col-title">Legal</div>
          <div className="footer-links">
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/sms-terms">SMS Terms</Link>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span className="footer-copy">© 2026 FieldCore Inc. · Delaware C-Corp · All rights reserved.</span>
        <div className="footer-legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/sms-terms">SMS Terms</Link>
        </div>
      </div>
    </footer>
  );
}
