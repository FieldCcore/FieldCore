import React, { useState, useEffect } from 'react';
import { Phone } from 'lucide-react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ componentStack: info?.componentStack || null });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui', color: '#333', gap: 12, padding: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>FIELDCORE™</div>
          <div style={{ fontSize: 16, color: '#666' }}>Something went wrong loading this page.</div>
          <pre style={{ fontSize: 12, color: '#e53e3e', maxWidth: 600, whiteSpace: 'pre-wrap', background: '#fff5f5', padding: 12, borderRadius: 6, border: '1px solid #fed7d7' }}>{this.state.error?.message || String(this.state.error)}</pre>
          {this.state.componentStack && (
            <pre style={{ fontSize: 11, color: '#999', maxWidth: 600, whiteSpace: 'pre-wrap', background: '#f7fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'left' }}>{this.state.componentStack}</pre>
          )}
          <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '8px 20px', background: '#222', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import Dashboard      from './pages/Dashboard';
import ClientList     from './pages/ClientList';
import ClientProfile  from './pages/ClientProfile';
import Jobs           from './pages/Jobs';
import Invoices       from './pages/Invoices';
import Messages       from './pages/Messages';
import BookingSettings from './pages/BookingSettings';
import BookingWidget  from './pages/BookingWidget';
import Dispatch       from './pages/Dispatch';
import Revenue        from './pages/Revenue';
import Deposits       from './pages/Deposits';
import Team           from './pages/Team';
import Login           from './pages/Login';
import ForgotPassword  from './pages/ForgotPassword';
import ResetPassword   from './pages/ResetPassword';
import MobileDemo      from './pages/MobileDemo';
import ManagerTablet  from './pages/ManagerTablet';
import Fleet          from './pages/Fleet';
import Billing        from './pages/Billing';
import BookConfirm    from './pages/BookConfirm';
import Landing          from './pages/Landing';
import PayInvoice       from './pages/PayInvoice';
import Onboarding      from './pages/Onboarding';
import About           from './pages/About';
import Blog            from './pages/Blog';
import Careers         from './pages/Careers';
import Contact         from './pages/Contact';
import Press           from './pages/Press';
import Faq             from './pages/Faq';
import Updates         from './pages/Updates';
import Partners        from './pages/Partners';
import Terms           from './pages/Terms';
import Privacy         from './pages/Privacy';
import SmsTerms           from './pages/SmsTerms';
import BusinessSettings   from './pages/BusinessSettings';
import Entities          from './pages/Entities';
import ClientPortal       from './pages/ClientPortal';
import NoShowStrip      from './components/NoShowStrip';
import PlanGate         from './components/PlanGate';
import NotificationBell from './components/NotificationBell';
import CallerID         from './components/CallerID';
import ProtectedRoute   from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';

const PAGE_TITLES = {
  '/dashboard':          'Dashboard',
  '/dispatch':           'Dispatch',
  '/jobs':               'Calendar',
  '/revenue':            'Revenue Analytics',
  '/deposits':           'Deposits & Payment Protection',
  '/invoices':           'Invoices',
  '/clients':            'Client Database',
  '/messages':           'Business Phone',
  '/team':               'Team Management',
  '/fleet':              'Fleet',
  '/booking':            'Settings & Rules',
  '/billing':            'Billing & Plan',
  '/business-settings':  'Business Settings',
  '/entities':           'Entities',
};

const IcoDash     = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
const IcoDispatch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>;
const IcoCalendar = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
const IcoRevenue  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IcoDeposits = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
const IcoInvoice  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/></svg>;
const IcoClients  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>;
const IcoPhone    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6z"/></svg>;
const IcoTeam     = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IcoSettings = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const IcoBilling  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 14h.01M10 14h4"/></svg>;

function AppShell() {
  const { pathname } = useLocation();
  const { user, logout, accounts, switchAccount } = useAuth();
  const nav = useNavigate();
  const isPublicBook = pathname.startsWith('/book/');
  const [dateStr,    setDateStr]    = useState('');
  const [callerOpen, setCallerOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    const d = new Date();
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    setDateStr(`${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`);
  }, []);

  useEffect(() => {
    if (!entityOpen) return;
    const close = () => setEntityOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [entityOpen]);

  const [isPhone, setIsPhone] = useState(window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Onboarding gate — owners who haven't completed setup
  if (pathname === '/onboarding') {
    return <Routes><Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} /></Routes>;
  }
  if (user && user.role === 'owner' && user.onboarded === false) {
    return <Navigate to="/onboarding" replace />;
  }

  if (isPublicBook) {
    return (
      <Routes>
        <Route path="/book/:accountId" element={<BookingWidget />} />
      </Routes>
    );
  }

  const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/demo', '/tablet', '/book-confirm', '/about', '/blog', '/careers', '/contact', '/press', '/faq', '/updates', '/partners', '/terms', '/privacy', '/sms-terms', '/client'];
  if (pathname === '/' || PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/book-confirm') || pathname.startsWith('/pay/')) {
    return (
      <Routes>
        <Route path="/"                 element={<Landing />} />
        <Route path="/login"            element={<Login />} />
        <Route path="/forgot-password"  element={<ForgotPassword />} />
        <Route path="/reset-password"   element={<ResetPassword />} />
        <Route path="/demo"             element={<MobileDemo />} />
        <Route path="/tablet"           element={<ManagerTablet />} />
        <Route path="/book-confirm"     element={<BookConfirm />} />
        <Route path="/pay/:invoiceId"   element={<PayInvoice />} />
        <Route path="/about"            element={<About />} />
        <Route path="/blog"             element={<Blog />} />
        <Route path="/careers"          element={<Careers />} />
        <Route path="/contact"          element={<Contact />} />
        <Route path="/press"            element={<Press />} />
        <Route path="/faq"              element={<Faq />} />
        <Route path="/updates"          element={<Updates />} />
        <Route path="/partners"         element={<Partners />} />
        <Route path="/terms"            element={<Terms />} />
        <Route path="/privacy"          element={<Privacy />} />
        <Route path="/sms-terms"        element={<SmsTerms />} />
        <Route path="/client"           element={<ClientPortal />} />
      </Routes>
    );
  }

  const isClientProfile = pathname.startsWith('/clients/');
  const pageTitle = isClientProfile ? 'Client Profile' : (PAGE_TITLES[pathname] || 'FieldCore');

  if (isPhone) {
    return (
      <div style={{ minHeight: '100vh', background: '#1C2333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center', gap: 20 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '.12em', fontSize: 15, color: '#fff' }}>
          FIELD<span style={{ color: '#D6B58A' }}>CORE</span><sup style={{ fontSize: 8, color: '#D6B58A', verticalAlign: 'super' }}>™</sup>
        </div>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 28, color: '#fff', fontWeight: 400, lineHeight: 1.2 }}>
          Better on a<br />bigger screen
        </div>
        <p style={{ color: 'rgba(255,255,255,.42)', fontSize: 14, lineHeight: 1.7, maxWidth: 270 }}>
          FieldCore is built for tablets and desktops. Open this page on a tablet, laptop, or desktop for the full experience.
        </p>
        <a href="/" style={{ marginTop: 4, padding: '12px 30px', background: '#D6B58A', color: '#1C2333', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>
          Back to Homepage
        </a>
      </div>
    );
  }

  const ni = (to, end, Icon, label, badge) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        isActive || (to === '/clients' && isClientProfile) ? 'ni active' : 'ni'
      }
    >
      <Icon />{label}
      {badge && <span className="ni-badge">{badge}</span>}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className={'sb' + (sidebarOpen ? ' sb-open' : '')}>
        <div className="sb-logo" style={{ position: 'relative' }}>
          <div className="sb-word">FIELD<span>CORE</span><sup className="sb-tm">™</sup></div>
          {(() => {
            const canSwitch = accounts.length > 1;
            return (
              <>
                <div
                  className="sb-entity"
                  onClick={() => canSwitch && setEntityOpen(o => !o)}
                  style={{ cursor: canSwitch ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 5, userSelect: 'none' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(typeof user?.accountName === 'string' ? user.accountName : null) || (typeof user?.account_name === 'string' ? user.account_name : null) || 'FieldCore'}
                  </span>
                  {canSwitch && (
                    <svg viewBox="0 0 10 6" style={{ width: 9, height: 9, flexShrink: 0, opacity: 0.5, transform: entityOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l4 4 4-4"/></svg>
                  )}
                </div>
                {entityOpen && canSwitch && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#2D3748', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, overflow: 'hidden', zIndex: 100, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                    {accounts.map(a => (
                      <button
                        key={a.id}
                        onClick={() => { setEntityOpen(false); if (a.id !== user?.accountId) switchAccount(a.id); }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: a.id === user?.accountId ? 'rgba(214,181,138,.12)' : 'none', border: 'none', color: a.id === user?.accountId ? '#D6B58A' : 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: a.id === user?.accountId ? 600 : 400, cursor: 'pointer', textAlign: 'left', gap: 8 }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.06em' }}>{a.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <nav className="sb-nav">
          {(() => {
            const role      = user?.role || 'tech';
            const isOwner   = role === 'owner';
            const isManager = role === 'manager';
            const isStaff   = role === 'staff';
            const isTech    = role === 'tech';

            return (
              <>
                {/* Operations — all roles see Dashboard + Calendar; Dispatch hidden from tech/staff */}
                <div className="nav-section">Operations</div>
                {ni('/dashboard', true,  IcoDash,     'Dashboard', null)}
                {(isOwner || isManager) && ni('/dispatch', false, IcoDispatch, 'Dispatch', null)}
                {ni('/jobs',     false, IcoCalendar, 'Calendar',  null)}

                {/* Finance — owner + manager see all; staff sees invoices only */}
                {(isOwner || isManager || isStaff) && (
                  <>
                    <div className="nav-section">Finance</div>
                    {(isOwner || isManager) && ni('/revenue',  false, IcoRevenue,  'Revenue',  null)}
                    {(isOwner || isManager) && ni('/deposits', false, IcoDeposits, 'Deposits', null)}
                    {ni('/invoices', false, IcoInvoice, 'Invoices', null)}
                  </>
                )}

                {/* CRM — owner + manager + staff see clients; phone hidden from staff */}
                {(isOwner || isManager || isStaff) && (
                  <>
                    <div className="nav-section">CRM</div>
                    {ni('/clients', false, IcoClients, 'Clients', null)}
                    {(isOwner || isManager) && ni('/messages', false, IcoPhone, 'Phone', null)}
                  </>
                )}

                {/* Admin — owner only */}
                {isOwner && (
                  <>
                    <div className="nav-section">Admin</div>
                    {ni('/team',             false, IcoTeam,     'Team',     null)}
                    {ni('/fleet',            false, IcoDispatch, 'Fleet',    null)}
                    {ni('/booking',          false, IcoSettings, 'Settings', null)}
                    {ni('/business-settings',false, IcoSettings, 'Business', null)}
                    {ni('/entities',         false, IcoTeam,     'Entities', null)}
                    {ni('/billing',          false, IcoBilling,  'Billing',  null)}
                  </>
                )}
              </>
            );
          })()}
        </nav>

        <div className="sb-user" style={{ cursor: 'default' }}>
          <div className="su-avatar">
            {user ? String(user.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?' : '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="su-name">{(typeof user?.name === 'string' ? user.name : null) || '—'}</div>
            <div className="su-role">{user && typeof user.role === 'string' ? `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} · ${user.accountName || user.account_name || 'FieldCore'}` : ''}</div>
          </div>
          <button
            onClick={() => { logout(); nav('/login'); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}
            title="Sign out"
          >⎋</button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="tb-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Open menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="tb-title">{pageTitle}</div>
          <div className="tb-date">{dateStr}</div>
          <NotificationBell />
          <button className="tb-btn tb-ghost" onClick={() => setCallerOpen(true)}><Phone size={13} /> Simulate Call</button>
          <button className="tb-btn tb-primary" onClick={() => nav('/jobs?new=1')}>+ New Job</button>
        </div>

        <NoShowStrip />

        <div className="content">
          <Routes>
            <Route path="/dashboard"   element={<ProtectedRoute><Dashboard /></ProtectedRoute>}      />
            <Route path="/dispatch"    element={<ProtectedRoute><Dispatch /></ProtectedRoute>}       />
            <Route path="/jobs"        element={<ProtectedRoute><Jobs /></ProtectedRoute>}           />
            <Route path="/revenue"     element={<ProtectedRoute><PlanGate requires="pro"><Revenue /></PlanGate></ProtectedRoute>}   />
            <Route path="/deposits"    element={<ProtectedRoute><PlanGate requires="pro"><Deposits /></PlanGate></ProtectedRoute>}  />
            <Route path="/invoices"    element={<ProtectedRoute><Invoices /></ProtectedRoute>}       />
            <Route path="/clients"     element={<ProtectedRoute><ClientList /></ProtectedRoute>}     />
            <Route path="/clients/:id" element={<ProtectedRoute><ClientProfile /></ProtectedRoute>}  />
            <Route path="/messages"    element={<ProtectedRoute><Messages /></ProtectedRoute>}       />
            <Route path="/team"        element={<ProtectedRoute><Team /></ProtectedRoute>}           />
            <Route path="/fleet"       element={<ProtectedRoute><Fleet /></ProtectedRoute>}          />
            <Route path="/booking"     element={<ProtectedRoute><BookingSettings /></ProtectedRoute>}/>
            <Route path="/billing"             element={<ProtectedRoute><Billing /></ProtectedRoute>}              />
            <Route path="/business-settings"  element={<ProtectedRoute><BusinessSettings /></ProtectedRoute>}  />
            <Route path="/entities"           element={<ProtectedRoute><Entities /></ProtectedRoute>}           />
          </Routes>
        </div>

        <nav className="mobile-bottom-nav">
          <NavLink to="/dashboard" end className={({isActive}) => 'mbn-item' + (isActive ? ' active' : '')}>
            <IcoDash /><span>Home</span>
          </NavLink>
          <NavLink to="/dispatch" className={({isActive}) => 'mbn-item' + (isActive ? ' active' : '')}>
            <IcoDispatch /><span>Dispatch</span>
          </NavLink>
          <NavLink to="/jobs" className={({isActive}) => 'mbn-item' + (isActive ? ' active' : '')}>
            <IcoCalendar /><span>Calendar</span>
          </NavLink>
          <NavLink to="/clients" className={({isActive}) => 'mbn-item' + (isActive ? ' active' : '')}>
            <IcoClients /><span>Clients</span>
          </NavLink>
          <button className="mbn-item" onClick={() => setSidebarOpen(o => !o)}>
            <IcoSettings /><span>More</span>
          </button>
        </nav>
      </div>

      {sidebarOpen && <div className="sb-overlay" onClick={() => setSidebarOpen(false)} />}
      {callerOpen && <CallerID onClose={() => setCallerOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
