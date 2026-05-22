import React, { useState, useEffect } from 'react';
import api from '../api';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt$(n) {
  const v = parseFloat(n) || 0;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function weekLabel(iso) {
  const d = new Date(iso);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function monthLabel(iso) {
  const d = new Date(iso);
  return MONTH_NAMES[d.getMonth()];
}

export default function Revenue() {
  const [data,    setData]    = useState(null);
  const [hovered, setHovered] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/revenue')
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading revenue data…</div>;
  }

  const { weekly = [], byService = [], monthly = [] } = data || {};

  const maxWeekRev = Math.max(...weekly.map(w => parseFloat(w.revenue)), 1);
  const maxServiceRev = Math.max(...byService.map(s => parseFloat(s.revenue)), 1);

  const mtdRevenue = parseFloat(monthly[monthly.length - 1]?.revenue || 0);
  const totalJobs  = monthly.reduce((s, m) => s + parseInt(m.jobs || 0), 0);

  return (
    <div>
      <div className="dash-stat-grid">
        <div className="dash-sc">
          <div className="dash-sc-l">Month to Date</div>
          <div className="dash-sc-v">{fmt$(mtdRevenue)}</div>
          <div className="dash-sc-s">{parseInt(monthly[monthly.length - 1]?.jobs || 0)} jobs this month</div>
          {mtdRevenue > 0 && <span className="dash-sc-b bg">Active</span>}
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Total Jobs</div>
          <div className="dash-sc-v">{totalJobs}</div>
          <div className="dash-sc-s">Last 6 months</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Services</div>
          <div className="dash-sc-v">{byService.length}</div>
          <div className="dash-sc-s">Service types billed</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Avg per Job</div>
          <div className="dash-sc-v">{totalJobs > 0 ? fmt$(monthly.reduce((s,m) => s + parseFloat(m.revenue||0), 0) / totalJobs) : '$0'}</div>
          <div className="dash-sc-s">All time average</div>
        </div>
      </div>

      <div className="rev-layout">
        <div className="rev-main">
          <div className="dash-card rev-chart-card">
            <div className="dash-ch">
              <span className="dash-cht">Revenue by Week — Last 8 Weeks</span>
            </div>
            {weekly.every(w => parseFloat(w.revenue) === 0) ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
                No completed jobs with revenue yet.
              </div>
            ) : (
              <div className="rev-chart-area">
                {weekly.map((w, i) => {
                  const h = Math.max(4, (parseFloat(w.revenue) / maxWeekRev) * 100);
                  const isCurrent = i === weekly.length - 1;
                  return (
                    <div
                      key={i}
                      className="rev-bar-wrap"
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <div className="rev-bar-tooltip" style={{ opacity: hovered === i ? 1 : 0 }}>
                        {fmt$(w.revenue)} · {w.jobs} job{w.jobs !== '1' ? 's' : ''}
                      </div>
                      <div
                        className="rev-bar"
                        style={{
                          height: `${h}%`,
                          background: isCurrent ? 'var(--sand)' : hovered === i ? 'var(--navy)' : 'var(--slate)',
                        }}
                      />
                      <div className="rev-bar-lbl">{weekLabel(w.week_start)}</div>
                      <div className="rev-bar-val">{parseFloat(w.revenue) > 0 ? fmt$(w.revenue) : '—'}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="dash-card">
            <div className="dash-ch">
              <span className="dash-cht">Revenue by Service — All Time</span>
            </div>
            {byService.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
                No completed jobs yet.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Jobs</th>
                    <th>Revenue</th>
                    <th>Avg per Job</th>
                    <th style={{ width: 120 }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {byService.map((s, i) => (
                    <tr key={i} className="clickable-row">
                      <td><strong>{s.service_type}</strong></td>
                      <td>{s.jobs}</td>
                      <td><strong>{fmt$(s.revenue)}</strong></td>
                      <td>{fmt$(s.avg_amount)}</td>
                      <td>
                        <div className="rev-pct-bar">
                          <div className="rev-pct-fill" style={{ width: `${(parseFloat(s.revenue) / maxServiceRev) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rev-side">
          <div className="dash-card">
            <div className="dash-ch"><span className="dash-cht">Monthly Summary</span></div>
            {monthly.map((m, i) => {
              const isCurrent = i === monthly.length - 1;
              const prev = monthly[i - 1];
              const growth = prev && parseFloat(prev.revenue) > 0
                ? Math.round(((parseFloat(m.revenue) - parseFloat(prev.revenue)) / parseFloat(prev.revenue)) * 100)
                : null;
              return (
                <div key={i} className="rev-month-row" style={isCurrent ? { background: 'var(--sand-lt)' } : {}}>
                  <div className="rev-month-lbl">{monthLabel(m.month_start)}{isCurrent ? ' (MTD)' : ''}</div>
                  <div className="rev-month-rev">{fmt$(m.revenue)}</div>
                  <div className="rev-month-jobs">{m.jobs} jobs</div>
                  {growth !== null && (
                    <span className="rev-month-growth" style={{ color: growth >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {growth >= 0 ? '+' : ''}{growth}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="dash-card">
            <div className="dash-ch"><span className="dash-cht">Top Services</span></div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byService.slice(0, 3).length === 0 ? (
                <div style={{ color: 'var(--steel)', fontSize: 13 }}>No data yet.</div>
              ) : byService.slice(0, 3).map((s, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                    <span style={{ color: 'var(--slate)', fontWeight: 600 }}>{s.service_type}</span>
                    <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 14, color: 'var(--navy)' }}>{fmt$(s.revenue)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--lightgray)', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${(parseFloat(s.revenue) / maxServiceRev) * 100}%`, background: i === 0 ? 'var(--navy)' : 'var(--sand)', borderRadius: 99 }} />
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
