import React, { useState, useEffect } from 'react';
import api from '../api';

const AVATAR_COLORS = ['var(--green)', 'var(--blue)', 'var(--amber)', 'var(--sand-dark)', 'var(--slate)'];
const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function fmt$(n) {
  const v = parseFloat(n) || 0;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function Team() {
  const [tab,     setTab]     = useState('performance');
  const [techs,   setTechs]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/team')
      .then(r => setTechs(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading team data…</div>;
  }

  const totalRevenue   = techs.reduce((s, t) => s + parseFloat(t.revenue || 0), 0);
  const totalJobs      = techs.reduce((s, t) => s + parseInt(t.jobs || 0), 0);
  const totalCommission = techs.reduce((s, t) => s + parseFloat(t.commission || 0), 0);

  return (
    <div>
      <div className="dash-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="dash-sc">
          <div className="dash-sc-l">Team Size</div>
          <div className="dash-sc-v">{techs.length}</div>
          <div className="dash-sc-s">{techs.filter(t => parseInt(t.active_jobs || t.active) > 0).length > 0 ? 'Active on field' : 'All available'}</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Revenue / Tech</div>
          <div className="dash-sc-v">{techs.length > 0 ? fmt$(totalRevenue / techs.length) : '$0'}</div>
          <div className="dash-sc-s">Avg this week</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Jobs This Week</div>
          <div className="dash-sc-v">{totalJobs}</div>
          <div className="dash-sc-s">{techs.filter(t => parseInt(t.active) > 0).length} in progress</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Est. Commission</div>
          <div className="dash-sc-v">{fmt$(totalCommission)}</div>
          <div className="dash-sc-s">5% of revenue</div>
        </div>
      </div>

      <div className="team-tabs">
        {[
          { key: 'performance', label: 'Performance' },
          { key: 'schedule',    label: 'Schedule'    },
          { key: 'payroll',     label: 'Payroll'     },
        ].map(t => (
          <button
            key={t.key}
            className={`filter-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'performance' && (
        <div className="team-layout">
          <div className="team-main">
            <div className="dash-card">
              <div className="dash-ch">
                <span className="dash-cht">Team Performance — This Week</span>
              </div>
              {techs.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
                  No techs on the team yet. Add team members to see performance data.
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tech</th>
                      <th>Jobs</th>
                      <th>Completed</th>
                      <th>Revenue</th>
                      <th>Commission (5%)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techs.map((t, i) => (
                      <tr key={i} className="clickable-row">
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                              {initials(t.name)}
                            </div>
                            <strong>{t.name}</strong>
                          </div>
                        </td>
                        <td>{t.jobs}</td>
                        <td>{t.completed}</td>
                        <td><strong style={{ color: 'var(--green)' }}>{fmt$(t.revenue)}</strong></td>
                        <td>{fmt$(t.commission)}</td>
                        <td>
                          <span className={`dash-jbadge ${parseInt(t.active) > 0 ? 'js-active' : 'js-pending'}`}>
                            {parseInt(t.active) > 0 ? 'Active' : 'Available'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="team-side">
            <div className="dash-card">
              <div className="dash-ch"><span className="dash-cht">Team Actions</span></div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['+ Add Team Member', 'Export Payroll', 'Performance Report'].map((a, i) => (
                  <button key={i} className="tb-btn tb-ghost dash-act-btn">{a}</button>
                ))}
              </div>
            </div>

            <div className="dash-card" style={{ marginTop: 14 }}>
              <div className="dash-ch"><span className="dash-cht">Week Totals</span></div>
              <div style={{ padding: '14px 16px' }}>
                {[
                  { label: 'Total Revenue',    val: fmt$(totalRevenue) },
                  { label: 'Total Commission', val: fmt$(totalCommission) },
                  { label: 'Total Jobs',        val: String(totalJobs) },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--lightgray)' : 'none', fontSize: 13 }}>
                    <span style={{ color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', alignSelf: 'center' }}>{r.label}</span>
                    <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: 'var(--navy)' }}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'schedule' && (
        <div className="dash-card">
          <div className="dash-ch"><span className="dash-cht">This Week's Schedule</span></div>
          {techs.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>No techs on team yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Tech</th>
                  {DAY_LABELS.map(d => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {techs.map((t, i) => (
                  <tr key={i}>
                    <td><strong>{t.name}</strong></td>
                    {DAYS.map(d => (
                      <td key={d} style={{ textAlign: 'center' }}>
                        <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>✓</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'payroll' && (
        <div className="dash-card">
          <div className="dash-ch">
            <span className="dash-cht">Payroll — This Week</span>
            <span className="dash-cha">Export CSV →</span>
          </div>
          {techs.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>No techs on team yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Tech</th><th>Jobs</th><th>Revenue</th><th>Commission (5%)</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {techs.map((t, i) => (
                  <tr key={i} className="clickable-row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                          {initials(t.name)}
                        </div>
                        <strong>{t.name}</strong>
                      </div>
                    </td>
                    <td>{t.jobs}</td>
                    <td><strong style={{ color: 'var(--green)' }}>{fmt$(t.revenue)}</strong></td>
                    <td><strong style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16 }}>{fmt$(t.commission)}</strong></td>
                    <td><span className="dash-jbadge js-pending">Pending</span></td>
                  </tr>
                ))}
                {totalRevenue > 0 && (
                  <tr style={{ background: 'var(--navy)' }}>
                    <td colSpan={2} style={{ color: 'rgba(255,255,255,.5)', fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase' }}>Total</td>
                    <td style={{ color: 'white', fontWeight: 700 }}>{fmt$(totalRevenue)}</td>
                    <td style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: 'var(--sand)' }}>{fmt$(totalCommission)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
