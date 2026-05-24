import React, { useState, useEffect } from 'react';
import api from '../api';

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

  useEffect(() => {
    Promise.all([
      api.get('/deposits'),
      api.get('/booking-settings'),
    ]).then(([dep, cfg]) => {
      setDeposits(dep.data);
      setSettings(cfg.data);
    }).finally(() => setLoading(false));
  }, []);

  // Re-render timers every second
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const collected = deposits.filter(d => d.status === 'collected').reduce((s, d) => s + parseFloat(d.amount), 0);
  const pending   = deposits.filter(d => d.status === 'pending').reduce((s, d) => s + parseFloat(d.amount), 0);
  const serviceRules = Array.isArray(settings?.deposit_rules) ? settings.deposit_rules : [];
  const globalDeposit = parseFloat(settings?.deposit_amount || 0);
  // 2 system rules (VIP waiver + at-risk enforcement) always active; plus each configured service rule
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
          {pending > 0 && <span className="dash-sc-b ba">Action needed</span>}
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
              <span className="dash-cha">Configure Rules →</span>
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
                          <span className="dash-jbadge" style={STATUS_STYLE[d.status]}>
                            {STATUS_LABEL[d.status]}
                          </span>
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
                          <td colSpan={5} style={{ background: 'var(--sand-lt)', padding: '10px 16px', fontSize: 12, color: 'var(--slate)', borderTop: 'none' }}>
                            Deposit ID: {d.id} · Created: {new Date(d.created_at).toLocaleDateString()}
                            {d.expires_at && ` · Expires: ${new Date(d.expires_at).toLocaleString()}`}
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

            {/* Global default */}
            {globalDeposit > 0 && (
              <div className="dep-rule-row">
                <div>
                  <div className="dep-rule-service">All Services (default)</div>
                  <div className="dep-rule-detail">${globalDeposit.toFixed(2)} flat · At booking</div>
                </div>
                <div className="dep-toggle" style={{ background: 'var(--navy)' }}>
                  <div className="dep-toggle-knob" style={{ right: 3 }} />
                </div>
              </div>
            )}

            {/* Per-service rules from settings */}
            {serviceRules.map((r, i) => (
              <div key={i} className="dep-rule-row">
                <div>
                  <div className="dep-rule-service">{r.service}</div>
                  <div className="dep-rule-detail">
                    {r.type === 'percent' ? `${r.amount}%` : `$${parseFloat(r.amount).toFixed(2)}`} · At booking
                  </div>
                </div>
                <div className="dep-toggle" style={{ background: 'var(--navy)' }}>
                  <div className="dep-toggle-knob" style={{ right: 3 }} />
                </div>
              </div>
            ))}

            {/* System tier rules — always enforced */}
            <div className="dep-rule-row">
              <div>
                <div className="dep-rule-service">VIP Clients</div>
                <div className="dep-rule-detail">Deposit waived · All services</div>
              </div>
              <div className="dep-toggle" style={{ background: 'var(--navy)' }}>
                <div className="dep-toggle-knob" style={{ right: 3 }} />
              </div>
            </div>
            <div className="dep-rule-row">
              <div>
                <div className="dep-rule-service">At-Risk Clients</div>
                <div className="dep-rule-detail">Global minimum enforced · Always</div>
              </div>
              <div className="dep-toggle" style={{ background: 'var(--navy)' }}>
                <div className="dep-toggle-knob" style={{ right: 3 }} />
              </div>
            </div>

            {globalDeposit === 0 && serviceRules.length === 0 && (
              <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--steel)' }}>
                No deposit rules configured. Set a default amount or per-service rules in Settings.
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
