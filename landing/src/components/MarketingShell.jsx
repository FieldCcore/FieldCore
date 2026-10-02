import Nav from './Nav';
import Footer from './Footer';

export default function MarketingShell({ children }) {
  return (
    <>
      <Nav />
      <main className="mkt-page">{children}</main>
      <Footer />
    </>
  );
}
