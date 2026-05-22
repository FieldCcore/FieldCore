import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

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
import BookConfirm    from './pages/BookConfirm';
import NoShowStrip    from './components/NoShowStrip';
import CallerID       from './components/CallerID';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';

const PAGE_TITLES = {
  '/':          'Dashboard',
  '/dispatch':  'Dispatch',
  '/jobs':      'Calendar',
  '/revenue':   'Revenue Analytics',
  '/deposits':  'Deposits & Payment Protection',
  '/invoices':  'Invoices',
  '/clients':   'Client Database',
  '/messages':  'Business Phone',
  '/team':      'Team Management',
  '/fleet':     'Fleet',
  '/booking':   'Settings & Rules',
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

function AppShell() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isPublicBook = pathname.startsWith('/book/');
  const [dateStr,   setDateStr]   = useState('');
  const [callerOpen, setCallerOpen] = useState(false);

  useEffect(() => {
    const d = new Date();
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    setDateStr(`${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`);
  }, []);

  if (isPublicBook) {
    return (
      <Routes>
        <Route path="/book/:accountId" element={<BookingWidget />} />
      </Routes>
    );
  }

  if (['/login', '/forgot-password', '/reset-password', '/demo', '/tablet', '/book-confirm'].includes(pathname) || pathname.startsWith('/book-confirm')) {
    return (
      <Routes>
        <Route path="/login"            element={<Login />} />
        <Route path="/forgot-password"  element={<ForgotPassword />} />
        <Route path="/reset-password"   element={<ResetPassword />} />
        <Route path="/demo"             element={<MobileDemo />} />
        <Route path="/tablet"           element={<ManagerTablet />} />
        <Route path="/book-confirm"     element={<BookConfirm />} />
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
    <div className="app">
      <aside className="sb">
        <div className="sb-logo">
          <div className="sb-word">FIELD<span>CORE</span><sup className="sb-tm">™</sup></div>
          <div className="sb-entity">{user?.accountName || user?.account_name || 'FieldCore'}</div>
        </div>

        <nav className="sb-nav">
          <div className="nav-section">Operations</div>
          {ni('/',         true,  IcoDash,     'Dashboard', null)}
          {ni('/dispatch', false, IcoDispatch, 'Dispatch',  null)}
          {ni('/jobs',     false, IcoCalendar, 'Calendar',  null)}

          <div className="nav-section">Finance</div>
          {ni('/revenue',  false, IcoRevenue,  'Revenue',   null)}
          {ni('/deposits', false, IcoDeposits, 'Deposits',  null)}
          {ni('/invoices', false, IcoInvoice,  'Invoices',  null)}

          <div className="nav-section">CRM</div>
          {ni('/clients',  false, IcoClients,  'Clients',   null)}
          {ni('/messages', false, IcoPhone,    'Phone',     null)}

          {user?.role !== 'tech' && (
            <>
              <div className="nav-section">Admin</div>
              {ni('/team',    false, IcoTeam,     'Team',     null)}
              {ni('/fleet',   false, IcoDispatch, 'Fleet',    null)}
              {ni('/booking', false, IcoSettings, 'Settings', null)}
            </>
          )}
        </nav>

        <div className="sb-user" style={{ cursor: 'default' }}>
          <div className="su-avatar">
            {user ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="su-name">{user?.name || '—'}</div>
            <div className="su-role">{user ? `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} · ${user.accountName || user.account_name || 'FieldCore'}` : ''}</div>
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
          <div className="tb-title">{pageTitle}</div>
          <div className="tb-date">{dateStr}</div>
          <button className="tb-btn tb-ghost" onClick={() => setCallerOpen(true)}>📞 Simulate Call</button>
          <button className="tb-btn tb-primary" onClick={() => nav('/jobs?new=1')}>+ New Job</button>
        </div>

        <NoShowStrip />

        <div className="content">
          <Routes>
            <Route path="/"            element={<ProtectedRoute><Dashboard /></ProtectedRoute>}      />
            <Route path="/dispatch"    element={<ProtectedRoute><Dispatch /></ProtectedRoute>}       />
            <Route path="/jobs"        element={<ProtectedRoute><Jobs /></ProtectedRoute>}           />
            <Route path="/revenue"     element={<ProtectedRoute><Revenue /></ProtectedRoute>}        />
            <Route path="/deposits"    element={<ProtectedRoute><Deposits /></ProtectedRoute>}       />
            <Route path="/invoices"    element={<ProtectedRoute><Invoices /></ProtectedRoute>}       />
            <Route path="/clients"     element={<ProtectedRoute><ClientList /></ProtectedRoute>}     />
            <Route path="/clients/:id" element={<ProtectedRoute><ClientProfile /></ProtectedRoute>}  />
            <Route path="/messages"    element={<ProtectedRoute><Messages /></ProtectedRoute>}       />
            <Route path="/team"        element={<ProtectedRoute><Team /></ProtectedRoute>}           />
            <Route path="/fleet"       element={<ProtectedRoute><Fleet /></ProtectedRoute>}          />
            <Route path="/booking"     element={<ProtectedRoute><BookingSettings /></ProtectedRoute>}/>
          </Routes>
        </div>
      </div>

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
