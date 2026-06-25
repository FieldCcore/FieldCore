import React, { useState, useEffect } from 'react';
import api from '../api';
import StatusBadge from '../components/StatusBadge';

function fmtTimer(expiresAt) {
  const diff = new Date(expiresAt) - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

const STATUS_STYLE = {
  pending:   { background: 'var(--blue-lt)',  color: 'var(--blue)'  },
  collected: { background: 'var(--green-lt)', color: 'var(--green)' },
  refunded:  { background: 'var(--offwhite)', color: 'var(--slate)' },
};
const STATUS_LABEL = {
  pending: 'Pending', collected: '✓ Collected', refunded: 'Refunded',
};

export default function Deposits() {
  const [deposits, setDeposits] = useState([]);
  const [settings, setSettings] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [tick,     setTick]     = useState(0);
  const [acting,   setActing]   = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/deposits'),
      api.get('/booking-settings'),
    ]).then(([dep, cfg]) => {
      setDeposits(dep.data);
      setSettings(cfg.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleAction(depositId, action) {
    setActing(depositId);
    try {
      await api.patch(`/deposits/${depositId}/${action}`);
      setDeposits(prev => prev.map(d =>
        d.id === depositId
          ? { ...d, status: action === 'retain' ? 'collected' : 'refunded' }
          : d
      ));
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${action} deposit.`);
    } finally {
      setActing(null);
    }
  }

  const collected = deposits.filter(d => d.status === 'collected').reduce((s, d) => s + parseFloat(d.amount), 0);
  const pending   = deposits.filter(d => d.status === 'pending').reduce((s, d) => s + parseFloat(d.amount), 0);
  const serviceRules = Array.isArray(settings?.deposit_rules) ? settings.deposit_rules : [];
  const globalDeposit = parseFloat(settings?.deposit_amount || 0);
  const rulesCount = serviceRules.length + 2 + (globalDeposit > 0 ? 1 : 0);

  return (
    <div>
      <div className="dash-stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="dash-sc">
          <div className="dash-sc-l">Collected</div>
          <div className="dash-sc-v">${collected.toFixed(0)}</div>
          <div className="dash-sc-s">{deposits.filter(d => d.status === 'collected').length} deposits</div>
          {collected > 0 && <span className="dash-sc-b bg">Received</span>}
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Pending Collection</div>
          <div className="dash-sc-v">${pending.toFixed(0)}</div>
          <div className="dash-sc-s">{deposits.filter(d => d.status === 'pending').length} open</div>
          {pending > 0 && <StatusBadge status="action needed" style={{ position: 'absolute', top: 13, right: 13 }} />}
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Total Deposits</div>
          <div className="dash-sc-v">{deposits.length}</div>
          <div className="dash-sc-s">All time</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Rules Active</div>
          <div className="dash-sc-v">{rulesCount}</div>
          <div className="dash-sc-s">Deposit policies</div>
        </div>
      </div>

      <div className="dep-layout">
        <div className="dep-main">
          <div className="dash-card dep-card">
            <div className="dash-ch">
              <span className="dash-cht">All Deposits</span>
              <a href="/booking" className="dash-cha">Configure Rules →</a>
            </div>

            {loading ? (
              <div style={{ padding: '24px 16px', color: 'var(--steel)', fontSize: 13 }}>Loading…</div>
            ) : deposits.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
                No deposits yet. Deposits are created automatically when clients book online and pay via Stripe.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Client · Service</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Grace Period / Timer</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d, i) => (
                    <React.Fragment key={i}>
                      <tr
                        className="clickable-row"
                        onClick={() => setExpanded(expanded === i ? null : i)}
                      >
                        <td>
                          <strong>{d.client_name}</strong>
                          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>{d.service_type}</div>
                        </td>
                        <td><strong>${parseFloat(d.amount).toFixed(0)}</strong></td>
                        <td>
                          <StatusBadge status={d.status}>
                            {STATUS_LABEL[d.status]}
                          </StatusBadge>
                        </td>
                        <td>
                          {d.expires_at && d.status === 'pending' ? (
                            <span className="dep-timer" style={{
                              color: (new Date(d.expires_at) - Date.now()) < 3600000 ? 'var(--red)' : 'var(--amber)',
                              fontWeight: (new Date(d.expires_at) - Date.now()) < 3600000 ? 700 : 400,
                            }}>
                              {fmtTimer(d.expires_at)} left
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--steel)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--sand-dark)' }}>
                          {expanded === i ? '▲' : '▼'}
                        </td>
                      </tr>
                      {expanded === i && (
                        <tr>
                          <td colSpan={5} style={{ background: 'var(--sand-lt)', padding: '12px 16px', fontSize: 12, color: 'var(--slate)', borderTop: 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                              <div style={{ lineHeight: 1.8 }}>
                                <span style={{ color: 'var(--steel)' }}>ID:</span> <code style={{ fontSize: 11 }}>{d.id}</code>
                                <br />
                                <span style={{ color: 'var(--steel)' }}>Created:</span> {new Date(d.created_at).toLocaleDateString()}
                                {d.expires_at && (
                                  <><br /><span style={{ color: 'var(--steel)' }}>Expires:</span> {new Date(d.expires_at).toLocaleString()}</>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                {d.status === 'pending' && (
                                  <button
                                    className="btn-primary"
                                    style={{ fontSize: 12, padding: '5px 14px' }}
                                    disabled={acting === d.id}
                                    onClick={e => { e.stopPropagation(); handleAction(d.id, 'retain'); }}
                                  >
                                    {acting === d.id ? '…' : 'Retain Deposit'}
                                  </button>
                                )}
                                {d.status === 'collected' && (
                                  <button
                                    className="btn-secondary"
                                    style={{ fontSize: 12, padding: '5px 14px', color: 'var(--red)', borderColor: 'var(--red)' }}
                                    disabled={acting === d.id}
                                    onClick={e => { e.stopPropagation(); handleAction(d.id, 'refund'); }}
                                  >
                                    {acting === d.id ? '…' : 'Refund'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="dep-side">
          <div className="dash-card">
            <div className="dash-ch">
              <span className="dash-cht">Deposit Rules</span>
              <a href="/booking" className="dash-cha">Configure →</a>
            </div>

            {globalDeposit > 0 && (
              <div className="dep-rule-row">
                <div>
                  <div className="dep-rule-service">All Services</div>
                  <div className="dep-rule-detail">${globalDeposit.toFixed(2)} flat · Default</div>
                </div>
                <span style={{ fontSize: 11, background: 'var(--blue-lt)', color: 'var(--blue)', padding: '2px 7px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>default</span>
              </div>
            )}

            {serviceRules.map((r, i) => (
              <div key={i} className="dep-rule-row">
                <div>
                  <div className="dep-rule-service">{r.service}</div>
                  <div className="dep-rule-detail">
                    {r.type === 'percent' ? `${r.amount}%` : `$${parseFloat(r.amount).toFixed(2)}`} · Override
                  </div>
                </div>
                <span style={{ fontSize: 11, background: 'var(--offwhite)', color: 'var(--slate)', padding: '2px 7px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>per-service</span>
              </div>
            ))}

            <div style={{ margin: '12px 16px 4px', padding: '10px 12px', background: 'var(--sand-lt)', borderRadius: 8, fontSize: 12, color: 'var(--slate)', borderLeft: '3px solid var(--sand)' }}>
              <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Automatic Tier Overrides</div>
              <div style={{ marginBottom: 3 }}>VIP clients — deposit waived on all services</div>
              <div>At-risk clients — global minimum always enforced</div>
            </div>

            {globalDeposit === 0 && serviceRules.length === 0 && (
              <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--steel)' }}>
                No deposit rules configured. Set a default amount or per-service rules in <a href="/booking" style={{ color: 'var(--navy)' }}>Settings</a>.
              </div>
            )}
          </div>

          <div className="dash-card">
            <div className="dash-ch"><span className="dash-cht">Grace Period Policy</span></div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { t: 'Booking confirmed',  d: 'Deposit link sent via SMS + email' },
                { t: '+24 hours',          d: 'First reminder — SMS to client' },
                { t: '+48 hours',          d: 'Final reminder — urgent tone' },
                { t: '+72 hours',          d: 'Auto-cancel · Slot released · Client notified' },
              ].map((step, i) => (
                <div key={i} className="dep-step">
                  <div className="dep-step-dot" style={{ background: i === 3 ? 'var(--red)' : 'var(--sand)' }} />
                  <div>
                    <div className="dep-step-t">{step.t}</div>
                    <div className="dep-step-d">{step.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
