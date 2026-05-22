import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_DOT = {
  scheduled:   'var(--steel)',
  in_progress: 'var(--green)',
  complete:    'var(--green)',
  cancelled:   'var(--red)',
};
const STATUS_CLS = {
  scheduled:   'js-pending',
  in_progress: 'js-active',
  complete:    'js-done',
  cancelled:   'js-noshow',
};
const STATUS_LABEL = {
  scheduled:   'Scheduled',
  in_progress: 'Active',
  complete:    'Paid ✓',
  cancelled:   'Cancelled',
};

function fmt$(n) {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Number(n).toFixed(0)}`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function Dashboard() {
  const nav = useNavigate();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/dashboard')
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading dashboard…</div>;
  }

  const { todayJobs = [], weekRevenue = 0, mtdRevenue = 0, activeJobs = 0,
          pendingInvoices = {}, pendingDeposits = [], team = [], weekBars = [] } = data || {};

  const maxBar = Math.max(...weekBars.map(b => parseFloat(b.revenue)), 1);
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  return (
    <div>
      <div className="dash-stat-grid">
        <div className="dash-sc">
          <div className="dash-sc-l">Today Revenue</div>
          <div className="dash-sc-v">{fmt$(weekBars[todayIdx]?.revenue || 0)}</div>
          <div className="dash-sc-s">{todayJobs.length} job{todayJobs.length !== 1 ? 's' : ''} today</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Month to Date</div>
          <div className="dash-sc-v">{fmt$(mtdRevenue)}</div>
          <div className="dash-sc-s">Completed jobs</div>
          {mtdRevenue > 0 && <span className="dash-sc-b bg">Active</span>}
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Active Jobs</div>
          <div className="dash-sc-v">{activeJobs}</div>
          <div className="dash-sc-s">{activeJobs > 0 ? 'In progress now' : 'None in progress'}</div>
          {activeJobs > 0 && <span className="dash-sc-b bg">Live</span>}
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Pending Invoices</div>
          <div className="dash-sc-v">{fmt$(pendingInvoices.total || 0)}</div>
          <div className="dash-sc-s">{pendingInvoices.count || 0} outstanding</div>
          {pendingInvoices.count > 0 && <span className="dash-sc-b ba">Collect</span>}
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Pending Deposits</div>
          <div className="dash-sc-v">{pendingDeposits.length}</div>
          <div className="dash-sc-s">{pendingDeposits.length > 0 ? 'Awaiting payment' : 'All clear'}</div>
          {pendingDeposits.length > 0 && <span className="dash-sc-b ba">Action needed</span>}
        </div>
      </div>

      <div className="dash-3col">
        {/* Col 1 — Today's Jobs */}
        <div>
          <div className="dash-card">
            <div className="dash-ch">
              <span className="dash-cht">Today's Jobs</span>
              <span className="dash-cha" style={{ cursor: 'pointer' }} onClick={() => nav('/jobs')}>Calendar →</span>
            </div>
            {todayJobs.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
                No jobs scheduled for today.
              </div>
            ) : (
              todayJobs.map((j, i) => (
                <div className="dash-jrow" key={i}>
                  <div className="dash-jdot" style={{ background: STATUS_DOT[j.status] }} />
                  <div className="dash-ji">
                    <div className="dash-jname">{j.client_name} — {j.service_type}</div>
                    <div className="dash-jsub">{j.tech_name ? `${j.tech_name} · ` : ''}{j.amount ? `$${j.amount}` : 'No amount set'}</div>
                  </div>
                  <div className="dash-jmeta">
                    <div className="dash-jtime">{fmtTime(j.scheduled_at)}</div>
                    <span className={`dash-jbadge ${STATUS_CLS[j.status]}`}>{STATUS_LABEL[j.status]}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Col 2 — Revenue Chart + Team */}
        <div>
          <div className="dash-card">
            <div className="dash-ch"><span className="dash-cht">Revenue This Week</span></div>
            <div className="dash-chart-area">
              {weekBars.map((b, i) => {
                const h = maxBar > 0 ? Math.max(4, (parseFloat(b.revenue) / maxBar) * 100) : 4;
                const isToday = i === todayIdx;
                const isFuture = i > todayIdx;
                return (
                  <div className="dash-bar-wrap" key={i}>
                    <div
                      className="dash-bar"
                      style={{
                        height: `${h}%`,
                        background: isToday ? 'var(--navy)' : isFuture ? 'var(--lightgray)' : 'var(--slate)',
                      }}
                    />
                    <div className="dash-bar-lbl">{DAY_LABELS[i]}</div>
                    <div className="dash-bar-val">{parseFloat(b.revenue) > 0 ? fmt$(b.revenue) : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-ch"><span className="dash-cht">Team</span></div>
            {team.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--steel)', fontSize: 13 }}>No techs on team yet.</div>
            ) : (
              team.map((t, i) => (
                <div className="dash-tech" key={i}>
                  <div className="dash-tech-row">
                    <div className="dash-tech-dot" style={{ background: parseInt(t.active_jobs) > 0 ? 'var(--green)' : 'var(--steel)' }} />
                    <div className="dash-tech-name">{t.name}</div>
                    <div className="dash-tech-acc">{parseInt(t.active_jobs) > 0 ? 'Active' : 'Available'}</div>
                  </div>
                  <div className="dash-tech-job">
                    {parseInt(t.jobs) > 0 ? `${t.jobs} job${t.jobs !== '1' ? 's' : ''} this week` : 'No jobs scheduled this week'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Col 3 — Quick Actions + Deposit Alerts */}
        <div>
          <div className="dash-card">
            <div className="dash-ch"><span className="dash-cht">Quick Actions</span></div>
            <div className="dash-actions">
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/dispatch')}>Dispatch Map</button>
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/deposits')}>Review Deposits</button>
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/messages')}>Business Phone</button>
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/revenue')}>Revenue Analytics</button>
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/team')}>Team Report</button>
              <button className="tb-btn tb-primary dash-act-btn">+ Book New Job</button>
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-ch"><span className="dash-cht">Deposit Alerts</span></div>
            {pendingDeposits.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--steel)', fontSize: 13 }}>No pending deposits.</div>
            ) : (
              <>
                <div className="dash-dep-hdr">
                  <span>Client</span><span>Amt</span><span>Status</span><span>Expiry</span>
                </div>
                {pendingDeposits.map((d, i) => {
                  const hoursLeft = d.expires_at
                    ? Math.max(0, Math.floor((new Date(d.expires_at) - Date.now()) / 3600000))
                    : null;
                  return (
                    <div className="dash-dep-row" key={i} onClick={() => nav('/deposits')} style={{ cursor: 'pointer' }}>
                      <div>
                        <strong>{d.client_name}</strong>
                        <div className="dash-dep-sub">{d.service_type}</div>
                      </div>
                      <strong>${d.amount}</strong>
                      <span className="dash-dep-badge" style={{ background: 'var(--blue-lt)', color: 'var(--blue)' }}>Pending</span>
                      <span className="dash-dep-timer" style={{ color: hoursLeft !== null && hoursLeft < 24 ? 'var(--red)' : 'var(--amber)', fontWeight: hoursLeft !== null && hoursLeft < 24 ? 700 : 400 }}>
                        {hoursLeft !== null ? `${hoursLeft}h left` : '—'}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
