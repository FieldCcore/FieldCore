import React, { useState, useEffect } from 'react';
import { Phone } from 'lucide-react';
import { Routes, Route, NavLink, Navigate, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from './api';

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
import BookingSettings from './pages/BookingSettings';
import BookingWidget  from './pages/BookingWidget';
import Dispatch       from './pages/Dispatch';
import Revenue        from './pages/Revenue';
import Deposits       from './pages/Deposits';
import Team           from './pages/Team';
import Login           from './pages/Login';
import ForgotPassword  from './pages/ForgotPassword';
import ResetPassword   from './pages/ResetPassword';
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
import EstimatesPage     from './pages/Estimates';
import SignEstimate      from './pages/SignEstimate';
import ReviewPage       from './pages/ReviewPage';
import TechApp         from './pages/TechApp';
import MobileDemo      from './pages/MobileDemo';
import Account         from './pages/Account';
import Communications  from './pages/Communications';
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
  '/estimates':          'Estimates',
  '/clients':            'Client Database',
  '/communications':     'Communications',
  '/team':               'Team Management',
  '/fleet':              'Fleet',
  '/booking':            'Settings & Rules',
  '/billing':            'Billing & Plan',
  '/entities':           'Entities',
  '/account':            'Settings',
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
  const { user, logout, accounts, switching, switchError, switchAccount } = useAuth();
  const nav = useNavigate();
  const isPublicBook = pathname.startsWith('/book/');
  const [dateStr,    setDateStr]    = useState('');
  const [callerOpen, setCallerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const touchStartX = React.useRef(null);
  const touchStartY = React.useRef(null);

  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  }

  function handleTouchEnd(e) {
    const startX = touchStartX.current;
    if (startX === null) return;
    touchStartX.current = null;
    if (window.innerWidth >= 769) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = Math.abs(t.clientY - touchStartY.current);
    // Ignore mostly-vertical gestures (scrolling)
    if (dy > Math.abs(dx) * 0.9) return;
    if (dx > 60 && startX <= 40) {
      // Swipe right from left edge → open
      setSidebarOpen(true);
    } else if (dx < -60 && sidebarOpen) {
      // Swipe left → close
      setSidebarOpen(false);
    }
  }

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    const d = new Date();
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    setDateStr(`${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`);
  }, []);



  // Auto-show CallerID on live inbound calls
  const lastCallIdRef = React.useRef(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function pollInbound() {
      try {
        const { data } = await api.get('/phone/calls/latest-inbound');
        if (!cancelled && data && data.id !== lastCallIdRef.current) {
          lastCallIdRef.current = data.id;
          setCallerOpen(true);
        }
      } catch {}
    }
    const iv = setInterval(pollInbound, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user]);

  // Onboarding gate — owners who haven't completed setup
  if (pathname === '/onboarding') {
    return <Routes><Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} /></Routes>;
  }
  // Only gate on the user's home account — sub-entities skip onboarding.
  // Require homeAccountId to be defined (accounts loaded) to avoid a false
  // redirect during the brief moment between a switch and accounts reloading.
  const homeAccountId = accounts.find(a => a.is_home)?.id;
  if (user && user.role === 'owner' && user.onboarded === false && homeAccountId && homeAccountId === user?.accountId) {
    return <Navigate to="/onboarding" replace />;
  }

  // Tech app — full-screen mobile UI, bypasses the desktop-only shell and screen-size gate
  if (pathname === '/tech') {
    return (
      <Routes>
        <Route path="/tech" element={<ProtectedRoute><TechApp /></ProtectedRoute>} />
      </Routes>
    );
  }

  // Demo — full-screen mobile UI prototype, no auth required
  if (pathname === '/demo') {
    return (
      <Routes>
        <Route path="/demo" element={<MobileDemo />} />
      </Routes>
    );
  }

  if (isPublicBook) {
    return (
      <Routes>
        <Route path="/book/:accountId" element={<BookingWidget />} />
      </Routes>
    );
  }

  const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/tablet', '/book-confirm', '/about', '/blog', '/careers', '/contact', '/press', '/faq', '/updates', '/partners', '/terms', '/privacy', '/sms-terms', '/client'];
  if (pathname === '/' || PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/book-confirm') || pathname.startsWith('/pay/') || pathname.startsWith('/sign/') || pathname.startsWith('/review/')) {
    return (
      <Routes>
        <Route path="/"                 element={<Landing />} />
        <Route path="/login"            element={<Login />} />
        <Route path="/forgot-password"  element={<ForgotPassword />} />
        <Route path="/reset-password"   element={<ResetPassword />} />
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
        <Route path="/sign/:token"      element={<SignEstimate />} />
        <Route path="/review/:token"   element={<ReviewPage />} />
      </Routes>
    );
  }

  const isClientProfile = pathname.startsWith('/clients/');
  const pageTitle = isClientProfile ? 'Client Profile' : (PAGE_TITLES[pathname] || 'FieldCore');

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
    <div className="app" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <aside className={'sb' + (sidebarOpen ? ' sb-open' : '')}>
        <Link to="/dashboard" className="sb-logo" style={{ textDecoration: 'none', display: 'block' }}>
          <div className="sb-word">FIELD<span>CORE</span><sup className="sb-tm">™</sup></div>
        </Link>

        <div className="entity-panel">
          <div className="entity-section-label">Entities</div>
          {accounts.map((a, i) => {
            const isActive = a.id === user?.accountId;
            const dotColors = ['#D6B58A', '#7B9EC9', '#82C9A0', '#C98282', '#C9B882'];
            const isSwitchingToThis = switching && !isActive;
            return (
              <button
                key={a.id}
                onClick={async () => { if (!isActive && !switching) { try { await switchAccount(a.id); nav('/dashboard'); } catch {} } }}
                className={'entity-opt' + (isActive ? ' active' : '')}
                disabled={switching}
                title={isActive ? 'Current entity' : `Switch to ${a.name}`}
                style={{ opacity: switching && !isActive ? 0.6 : 1, cursor: switching ? 'wait' : (isActive ? 'default' : 'pointer') }}
              >
                <span className="entity-dot" style={{ background: isSwitchingToThis ? '#8A90A2' : (isActive ? '#D6B58A' : dotColors[i % dotColors.length]) }} />
                <span className={'entity-name' + (isActive ? ' active' : '')} style={{ fontSize: 11.5 }}>
                  {switching && !isActive ? 'Switching…' : a.name}
                </span>
                <span className={'entity-badge' + (isActive ? ' active' : '')}>{isActive ? (switching ? '…' : a.role) : a.role}</span>
              </button>
            );
          })}
          {switchError && (
            <div style={{ fontSize: 10.5, color: '#ff8a80', padding: '4px 12px 6px', lineHeight: 1.4 }}>
              {switchError}
            </div>
          )}
          {accounts.length <= 1 && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.22)', padding: '4px 12px', fontStyle: 'italic' }}>
              Add more entities in <a href="/entities" style={{ color: 'rgba(214,181,138,.55)', textDecoration: 'none' }}>Entities</a>
            </div>
          )}
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
                {ni('/jobs',      false, IcoCalendar, 'Calendar',  null)}
                {(isOwner || isManager) && ni('/dispatch', false, IcoDispatch, 'Dispatch', null)}

                {/* Finance — owner + manager see all; staff sees invoices only */}
                {(isOwner || isManager || isStaff) && (
                  <>
                    <div className="nav-section">Finance</div>
                    {(isOwner || isManager) && ni('/revenue',   false, IcoRevenue,  'Revenue',   null)}
                    {ni('/invoices',  false, IcoInvoice,  'Invoices',  null)}
                    {(isOwner || isManager) && ni('/estimates', false, IcoInvoice,  'Estimates', null)}
                    {(isOwner || isManager) && ni('/deposits',  false, IcoDeposits, 'Deposits',  null)}
                    {isOwner && ni('/billing', false, IcoBilling,  'Billing',  null)}
                  </>
                )}

                {/* CRM — owner + manager + staff see clients; phone hidden from staff */}
                {(isOwner || isManager || isStaff) && (
                  <>
                    <div className="nav-section">CRM</div>
                    {ni('/clients',        false, IcoClients, 'Clients',        null)}
                    {(isOwner || isManager) && ni('/communications', false, IcoPhone, 'Communications', null)}
                  </>
                )}

                {/* Tech mobile app — techs only */}
                {isTech && (
                  <>
                    <div className="nav-section">Mobile</div>
                    {ni('/tech', false, IcoDispatch, 'My Jobs', null)}
                  </>
                )}

                {/* Admin — owner only */}
                {isOwner && (
                  <>
                    <div className="nav-section">Admin</div>
                    {ni('/team',     false, IcoTeam,     'Team',     null)}
                    {ni('/fleet',    false, IcoDispatch, 'Fleet',    null)}
                    {ni('/entities', false, IcoTeam,     'Entities', null)}
                    {ni('/account',  false, IcoSettings, 'Settings', null)}
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
          <a href="/account" style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
            <div className="su-name">{(typeof user?.name === 'string' ? user.name : null) || '—'}</div>
            <div className="su-role">{user && typeof user.role === 'string' ? `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} · ${user.accountName || user.account_name || 'FieldCore'}` : ''}</div>
          </a>
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
          <div className="tb-title-wrap">
            <div className="tb-title">{pageTitle}</div>
            {user?.accountName && (
              <div className="tb-entity-label">{user.accountName}</div>
            )}
          </div>
          <div className="tb-date">{dateStr}</div>
          <NotificationBell />
          <button className="tb-btn tb-ghost" onClick={() => setCallerOpen(true)}><Phone size={13} /> Simulate Call</button>
          <button className="tb-btn tb-primary" onClick={() => nav('/jobs?new=1')}>+ New Job</button>
        </div>

        <div className="content" key={user?.accountId}>
          <Routes>
            <Route path="/dashboard"   element={<ProtectedRoute><Dashboard /></ProtectedRoute>}      />
            <Route path="/dispatch"    element={<ProtectedRoute><Dispatch /></ProtectedRoute>}       />
            <Route path="/jobs"        element={<ProtectedRoute><Jobs /></ProtectedRoute>}           />
            <Route path="/revenue"     element={<ProtectedRoute><PlanGate requires="pro"><Revenue /></PlanGate></ProtectedRoute>}   />
            <Route path="/deposits"    element={<ProtectedRoute><PlanGate requires="pro"><Deposits /></PlanGate></ProtectedRoute>}  />
            <Route path="/invoices"    element={<ProtectedRoute><Invoices /></ProtectedRoute>}       />
            <Route path="/estimates"   element={<ProtectedRoute><PlanGate requires="solo"><EstimatesPage /></PlanGate></ProtectedRoute>} />
            <Route path="/clients"     element={<ProtectedRoute><ClientList /></ProtectedRoute>}     />
            <Route path="/clients/:id" element={<ProtectedRoute><ClientProfile /></ProtectedRoute>}  />
            <Route path="/communications" element={<ProtectedRoute><Communications /></ProtectedRoute>} />
            <Route path="/messages"    element={<Navigate to="/communications" replace />} />
            <Route path="/phone"       element={<Navigate to="/communications" replace />} />
            <Route path="/team"        element={<ProtectedRoute><Team /></ProtectedRoute>}           />
            <Route path="/fleet"       element={<ProtectedRoute><Fleet /></ProtectedRoute>}          />
            <Route path="/booking"     element={<ProtectedRoute><BookingSettings /></ProtectedRoute>}/>
            <Route path="/billing"             element={<ProtectedRoute><Billing /></ProtectedRoute>}              />
            <Route path="/business-settings"  element={<ProtectedRoute><BusinessSettings /></ProtectedRoute>}  />
            <Route path="/entities"           element={<ProtectedRoute><Entities /></ProtectedRoute>}           />
            <Route path="/account"            element={<ProtectedRoute><Account /></ProtectedRoute>}            />
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
