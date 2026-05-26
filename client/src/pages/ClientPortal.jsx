import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import '../landing.css';

const BACKEND = import.meta.env.VITE_API_URL || '';

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtAmt(n) {
  if (n == null) return '—';
  return `$${parseFloat(n).toFixed(2)}`;
}

const statusColor = {
  pending:     { bg:'#FFF7ED', color:'#C2410C' },
  paid:        { bg:'#F0FDF4', color:'#15803D' },
  void:        { bg:'#F8F7F5', color:'#8A90A2' },
  scheduled:   { bg:'#EEF2FF', color:'#3730A3' },
  in_progress: { bg:'#FFF7ED', color:'#C2410C' },
  complete:    { bg:'#F0FDF4', color:'#15803D' },
  cancelled:   { bg:'#F8F7F5', color:'#8A90A2' },
};

// ─── Magic link request screen ────────────────────────────────────────────────
function RequestAccess({ accountId }) {
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!email) return;
    setBusy(true); setErr('');
    try {
      await axios.post(`${BACKEND}/api/portal/request-access`, { email, account_id: accountId });
      setSent(true);
    } catch { setErr('Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#EDEBE7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '40px 36px', maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '.04em', color: '#1C2333', marginBottom: 24 }}>
          FIELDCORE<sup style={{ fontSize: 10 }}>™</sup>
          <div style={{ fontSize: 12, fontWeight: 400, color: '#8A90A2', letterSpacing: 0, marginTop: 2 }}>Client Portal</div>
        </div>
        {sent ? (
          <div>
            <div style={{ fontSize: 28, marginBottom: 12 }}>✉️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 14, color: '#5F667A', lineHeight: 1.65 }}>
              If your email is on file, we sent a magic link. It expires in 30 minutes.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>Access your portal</div>
            <div style={{ fontSize: 14, color: '#5F667A', marginBottom: 24, lineHeight: 1.6 }}>
              Enter the email address on your account. We'll send a secure login link — no password needed.
            </div>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ padding: '12px 14px', border: '1.5px solid #E6E6E6', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', color: '#1C2333' }}
              />
              {err && <div style={{ fontSize: 13, color: '#C62828' }}>{err}</div>}
              <button type="submit" disabled={busy} style={{ padding: '12px 0', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Sending…' : 'Send magic link →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Authenticated portal ─────────────────────────────────────────────────────
function Portal({ token }) {
  const [tab, setTab]             = useState('invoices');
  const [me, setMe]               = useState(null);
  const [invoices, setInvoices]   = useState([]);
  const [appts, setAppts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editContact, setEditContact] = useState(false);
  const [contact, setContact]     = useState({ phone:'', address:'' });
  const [savingContact, setSavingContact] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    Promise.all([
      axios.get(`${BACKEND}/api/portal/me`,           { headers }),
      axios.get(`${BACKEND}/api/portal/invoices`,     { headers }),
      axios.get(`${BACKEND}/api/portal/appointments`, { headers }),
    ]).then(([meRes, invRes, apptRes]) => {
      setMe(meRes.data);
      setContact({ phone: meRes.data.phone || '', address: meRes.data.address || '' });
      setInvoices(invRes.data);
      setAppts(apptRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function saveContact() {
    setSavingContact(true);
    try {
      const r = await axios.put(`${BACKEND}/api/portal/me`, contact, { headers });
      setMe(m => ({...m, ...r.data}));
      setEditContact(false);
    } catch {}
    finally { setSavingContact(false); }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDEBE7' }}>
      <div style={{ fontSize: 14, color: '#8A90A2' }}>Loading your portal…</div>
    </div>
  );

  const inputStyle = { width:'100%', padding:'10px 12px', border:'1.5px solid #E6E6E6', borderRadius:8, fontSize:14, color:'#1C2333', outline:'none', fontFamily:'Inter,sans-serif', boxSizing:'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: '#EDEBE7', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1C2333', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '.04em', color: '#D6B58A' }}>FIELDCORE<sup style={{ fontSize: 8 }}>™</sup> <span style={{ color: 'rgba(255,255,255,.3)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>Client Portal</span></div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>Hi, {me?.name?.split(' ')[0]}</div>
      </div>

      <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'white', borderRadius: 10, padding: 4, border: '1px solid #E6E6E6', width: 'fit-content' }}>
          {[['invoices','Invoices'],['appointments','Appointments'],['account','My Account']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: tab===k ? '#1C2333' : 'none', color: tab===k ? '#D6B58A' : '#5F667A', fontSize: 13, fontWeight: tab===k ? 700 : 400, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>

        {/* Invoices */}
        {tab === 'invoices' && (
          <div>
            {invoices.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E6E6E6', padding: 40, textAlign: 'center', color: '#8A90A2', fontSize: 14 }}>No invoices yet.</div>
            ) : invoices.map(inv => {
              const sc = statusColor[inv.status] || statusColor.pending;
              return (
                <div key={inv.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #E6E6E6', padding: '18px 20px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1C2333', marginBottom: 4 }}>{inv.service_type}</div>
                    <div style={{ fontSize: 12, color: '#8A90A2' }}>{fmt(inv.created_at)} · #{inv.id.slice(-6).toUpperCase()}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2333', minWidth: 70, textAlign: 'right' }}>{fmtAmt(inv.amount)}</div>
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{inv.status}</span>
                  {inv.status === 'pending' && inv.payment_link && (
                    <a href={inv.payment_link} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', background: '#1C2333', color: '#D6B58A', borderRadius: 7, fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Pay →</a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Appointments */}
        {tab === 'appointments' && (
          <div>
            {appts.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E6E6E6', padding: 40, textAlign: 'center', color: '#8A90A2', fontSize: 14 }}>No appointments yet.</div>
            ) : appts.map(a => {
              const sc = statusColor[a.status] || statusColor.scheduled;
              return (
                <div key={a.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #E6E6E6', padding: '18px 20px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1C2333', marginBottom: 4 }}>{a.service_type}</div>
                    <div style={{ fontSize: 12, color: '#8A90A2' }}>{fmtTime(a.scheduled_at)}{a.tech_name ? ` · ${a.tech_name}` : ''}</div>
                  </div>
                  {a.amount && <div style={{ fontSize: 14, fontWeight: 700, color: '#1C2333' }}>{fmtAmt(a.amount)}</div>}
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{a.status.replace('_',' ')}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Account */}
        {tab === 'account' && me && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E6E6E6', padding: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1C2333', marginBottom: 20 }}>Contact Information</div>
            {editContact ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8A90A2', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Phone</div>
                  <input style={inputStyle} value={contact.phone} onChange={e => setContact(c => ({...c, phone: e.target.value}))} placeholder="(555) 000-0000" />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8A90A2', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Address</div>
                  <input style={inputStyle} value={contact.address} onChange={e => setContact(c => ({...c, address: e.target.value}))} placeholder="123 Main St" />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={saveContact} disabled={savingContact} style={{ padding: '9px 20px', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{savingContact ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditContact(false)} style={{ padding: '9px 20px', background: 'none', border: '1px solid #E6E6E6', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#5F667A' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[['Name', me.name],['Email', me.email],['Phone', me.phone || '—'],['Address', me.address || '—'],['Client since', fmt(me.created_at)]].map(([l,v]) => (
                  <div key={l} style={{ display: 'flex', gap: 16 }}>
                    <div style={{ width: 100, fontSize: 12, fontWeight: 600, color: '#8A90A2', textTransform: 'uppercase', letterSpacing: '.06em', paddingTop: 1 }}>{l}</div>
                    <div style={{ fontSize: 14, color: '#1C2333' }}>{v}</div>
                  </div>
                ))}
                <button onClick={() => setEditContact(true)} style={{ padding: '9px 20px', background: 'none', border: '1.5px solid #E6E6E6', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1C2333', alignSelf: 'flex-start', marginTop: 4 }}>Update contact info</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export: detects token in URL, authenticates, then shows portal ──────
export default function ClientPortal() {
  const [params]   = useSearchParams();
  const [state, setState]  = useState('loading'); // loading | request | portal | error
  const [portalToken, setPortalToken] = useState(null);
  const [accountId, setAccountId]     = useState(null);

  useEffect(() => {
    const token   = params.get('token');
    const account = params.get('account');

    if (!account) { setState('error'); return; }
    setAccountId(account);

    if (!token) { setState('request'); return; }

    // Exchange magic link for portal JWT
    axios.get(`${BACKEND}/api/portal/auth`, { params: { token, account } })
      .then(r => { setPortalToken(r.data.token); setState('portal'); })
      .catch(() => setState('error'));
  }, []);

  if (state === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDEBE7' }}>
      <div style={{ fontSize: 14, color: '#8A90A2' }}>Loading…</div>
    </div>
  );

  if (state === 'error') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDEBE7', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '40px 36px', maxWidth: 400, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1C2333', marginBottom: 8 }}>Link expired or invalid</div>
        <div style={{ fontSize: 14, color: '#5F667A', marginBottom: 20 }}>This link has expired or already been used. Please request a new one.</div>
        <a href="/client" style={{ padding: '11px 22px', background: '#1C2333', color: '#D6B58A', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Request new link →</a>
      </div>
    </div>
  );

  if (state === 'request') return <RequestAccess accountId={accountId} />;

  return <Portal token={portalToken} />;
}
