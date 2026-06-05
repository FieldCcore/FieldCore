import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import api from '../api';

async function triggerCsvDownload(url) {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.data);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {
    alert('Export failed. Please try again.');
  }
}

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
  const [data,       setData]       = useState(null);
  const [hovered,    setHovered]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('revenue');
  const [nsData,     setNsData]     = useState([]);
  const [nsLoading,  setNsLoading]  = useState(false);
  const [nsRecords,  setNsRecords]  = useState([]);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo,   setExportTo]   = useState('');

  useEffect(() => {
    api.get('/analytics/revenue')
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'noshows') return;
    setNsLoading(true);
    Promise.all([
      api.get('/no-show/report'),
      api.get('/no-show/records'),
    ]).then(([rep, rec]) => {
      setNsData(rep.data);
      setNsRecords(rec.data);
    }).catch(() => {}).finally(() => setNsLoading(false));
  }, [tab]);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading revenue data…</div>;
  }

  const { weekly = [], byService = [], monthly = [] } = data || {};

  const maxWeekRev = Math.max(...weekly.map(w => parseFloat(w.revenue)), 1);
  const maxServiceRev = Math.max(...byService.map(s => parseFloat(s.revenue)), 1);

  const mtdRevenue = parseFloat(monthly[monthly.length - 1]?.revenue || 0);
  const totalJobs  = monthly.reduce((s, m) => s + parseInt(m.jobs || 0), 0);

  const totalNsRetained = nsData.reduce((s, r) => s + parseFloat(r.total_retained || 0), 0);
  const totalNsCount    = nsData.reduce((s, r) => s + parseInt(r.total_no_shows || 0), 0);

  const exportParams = `${exportFrom ? `&from=${exportFrom}` : ''}${exportTo ? `&to=${exportTo}` : ''}`;

  return (
    <div>
      {/* Export bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)' }}>Export</span>
        <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
          style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #e5e0d8', borderRadius: 6, color: 'var(--navy)', background: '#fff' }} />
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>to</span>
        <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
          style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #e5e0d8', borderRadius: 6, color: 'var(--navy)', background: '#fff' }} />
        <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
          onClick={() => triggerCsvDownload(`/analytics/export?type=jobs${exportParams}`)}>
          <Download size={11} />Jobs
        </button>
        <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
          onClick={() => triggerCsvDownload(`/analytics/export?type=revenue${exportParams}`)}>
          <Download size={11} />Invoices
        </button>
        <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
          onClick={() => triggerCsvDownload(`/analytics/export?type=clients`)}>
          <Download size={11} />Clients
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--lightgray)' }}>
        {[{ key: 'revenue', label: 'Revenue' }, { key: 'noshows', label: 'No-Show Report' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--navy)' : '2px solid transparent', marginBottom: -2, fontSize: 13, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? 'var(--navy)' : 'var(--steel)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'noshows' && (
        nsLoading ? <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading no-show data…</div> : (
          <div>
            <div className="dash-stat-grid" style={{ marginBottom: 20 }}>
              <div className="dash-sc">
                <div className="dash-sc-l">Total No-Shows</div>
                <div className="dash-sc-v">{totalNsCount}</div>
              </div>
              <div className="dash-sc">
                <div className="dash-sc-l">Deposits Retained</div>
                <div className="dash-sc-v">{fmt$(totalNsRetained)}</div>
              </div>
              <div className="dash-sc">
                <div className="dash-sc-l">Avg Retained</div>
                <div className="dash-sc-v">{totalNsCount > 0 ? fmt$(totalNsRetained / totalNsCount) : '$0'}</div>
              </div>
            </div>

            <div className="dash-card" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 16, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10 }}>Monthly Breakdown</div>
              {nsData.length === 0 ? (
                <div style={{ color: 'var(--steel)', fontSize: 13, padding: '12px 0' }}>No no-show records yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--lightgray)' }}>
                      {['Month', 'No-Shows', 'Deposits Retained', 'Avg'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nsData.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--lightgray)' }}>
                        <td style={{ padding: '12px', color: 'var(--slate)' }}>{new Date(r.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                        <td style={{ padding: '12px', color: 'var(--navy)', fontWeight: 600 }}>{r.total_no_shows}</td>
                        <td style={{ padding: '12px', color: 'var(--red)', fontWeight: 700 }}>{fmt$(r.total_retained)}</td>
                        <td style={{ padding: '12px', color: 'var(--slate)' }}>{fmt$(r.avg_retained)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {nsRecords.length > 0 && (
              <div className="dash-card" style={{ padding: 24 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--steel)', marginBottom: 16 }}>All Records</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {nsRecords.map(ns => (
                    <div key={ns.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--lightgray)', borderLeft: '3px solid var(--red)', borderRadius: 8, gap: 16, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{ns.client_name} — {ns.service_type}</div>
                        <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>
                          {new Date(ns.declared_at).toLocaleDateString('en-US', { dateStyle: 'medium' })} · Tech: {ns.tech_name || 'Unassigned'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--red)' }}>${parseFloat(ns.deposit_retained || 0).toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: 'var(--steel)' }}>retained</div>
                        </div>
                        <a href={`/api/no-show/jobs/${ns.job_id}/pdf`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: 'var(--navy)', textDecoration: 'underline' }}>PDF</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {tab === 'revenue' && <div>
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
      </div>} {/* end revenue tab */}
    </div>
  );
}
