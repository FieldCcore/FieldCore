import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import DashboardBanner from '../components/DashboardBanner';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_DOT = {
  scheduled:   'var(--steel)',
  in_progress: 'var(--green)',
  complete:    'var(--green)',
  cancelled:   'var(--red)',
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
  const { user } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [gbp,     setGbp]     = useState(null);

  useEffect(() => {
    api.get('/analytics/dashboard')
      .then(r => setData(r.data))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
    api.get('/google-reviews/connection')
      .then(r => setGbp(r.data)).catch(() => {});
  }, []);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading dashboard…</div>;
  }

  const { todayJobs = [], weekRevenue = 0, mtdRevenue = 0, activeJobs = 0,
          pendingInvoices = {}, pendingDeposits = [], team = [], weekBars = [],
          recentReviews = [] } = data || {};

  const googleRating  = gbp?.average_rating ? parseFloat(gbp.average_rating).toFixed(1) : null;
  const googleCount   = gbp?.total_reviews  || 0;
  const internalAvg   = recentReviews.length
    ? (recentReviews.reduce((s, r) => s + r.rating, 0) / recentReviews.length).toFixed(1)
    : null;
  const avgRating     = googleRating || internalAvg;
  const reviewCount   = googleCount  || recentReviews.length;
  const ratingSource  = googleRating ? 'Google' : 'Internal';

  const maxBar = Math.max(...weekBars.map(b => parseFloat(b.revenue)), 1);
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  return (
    <div>
      {user?.accountName && (
        <div className="dash-entity-bar">
          <span className="dash-entity-eyebrow">Viewing</span>
          <span className="dash-entity-biz">{user.accountName}</span>
        </div>
      )}
      <div className="dash-stat-grid">
        <div className="dash-sc">
          <div className="dash-sc-header">
            <div className="dash-sc-l">Today Revenue</div>
          </div>
          <div className="dash-sc-v">{fmt$(weekBars[todayIdx]?.revenue || 0)}</div>
          <div className="dash-sc-s">{todayJobs.length} job{todayJobs.length !== 1 ? 's' : ''} today</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-header">
            <div className="dash-sc-l">Month to Date</div>
            {mtdRevenue > 0 && <span className="dash-sc-b bg">Active</span>}
          </div>
          <div className="dash-sc-v">{fmt$(mtdRevenue)}</div>
          <div className="dash-sc-s">Completed jobs</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-header">
            <div className="dash-sc-l">Active Jobs</div>
            {activeJobs > 0 && <span className="dash-sc-b bg">Live</span>}
          </div>
          <div className="dash-sc-v">{activeJobs}</div>
          <div className="dash-sc-s">{activeJobs > 0 ? 'In progress now' : 'None in progress'}</div>
        </div>
        <div className="dash-sc dash-sc--link" onClick={() => nav('/invoices')}>
          <div className="dash-sc-header">
            <div className="dash-sc-l">Pending Invoices</div>
          </div>
          <div className="dash-sc-v">{fmt$(pendingInvoices.total || 0)}</div>
          <div className="dash-sc-s">{pendingInvoices.count || 0} outstanding</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-l">Pending Deposits</div>
          {pendingDeposits.length > 0 && (
            <div className="dash-sc-badge-stack">
              <span className="dash-sc-b br">Action Needed</span>
            </div>
          )}
          <div className="dash-sc-v">{pendingDeposits.length}</div>
          <div className="dash-sc-s">{pendingDeposits.length > 0 ? 'Awaiting payment' : 'All clear'}</div>
        </div>
        <div className="dash-sc">
          <div className="dash-sc-header">
            <div className="dash-sc-l">Avg Rating</div>
            {avgRating >= 4.5 && <span className="dash-sc-b bg">Excellent</span>}
          </div>
          <div className="dash-sc-v">{avgRating ? `${avgRating} ★` : '—'}</div>
          <div className="dash-sc-s">
            {reviewCount > 0
              ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''} · ${ratingSource}`
              : gbp && gbp.status !== 'connected'
                ? <a href="/business-settings?tab=integrations" style={{ color: 'var(--sand)', fontSize: 11, textDecoration: 'none' }}>Connect Google →</a>
                : 'No reviews yet'}
          </div>
        </div>
      </div>

      <DashboardBanner />

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
                    <StatusBadge status={j.status}>{STATUS_LABEL[j.status]}</StatusBadge>
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
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/communications')}>Business Phone</button>
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/revenue')}>Revenue Analytics</button>
              <button className="tb-btn tb-ghost dash-act-btn" onClick={() => nav('/team')}>Team Report</button>
              <button className="tb-btn tb-primary dash-act-btn" onClick={() => nav('/jobs?new=1')}>+ Book New Job</button>
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-ch">
              <span className="dash-cht">Recent Reviews</span>
              {gbp?.status === 'connected' && <span className="dash-sc-b bg" style={{ fontSize: 10 }}>Google</span>}
            </div>
            {recentReviews.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--steel)', fontSize: 13 }}>No reviews yet — requests are sent after job completion.</div>
            ) : (
              recentReviews.map((r, i) => (
                <div key={i} style={{ padding: '12px 16px', borderBottom: i < recentReviews.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{r.client_name}</span>
                    <span style={{ color: '#D6B58A', fontSize: 14, letterSpacing: 2 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginBottom: r.body ? 4 : 0 }}>{r.service_type}</div>
                  {r.body && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>"{r.body}"</div>}
                </div>
              ))
            )}
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
                      <span className="dash-dep-timer" style={{ color: hoursLeft === null ? 'var(--steel)' : hoursLeft < 24 ? 'var(--red)' : 'var(--amber)', fontWeight: hoursLeft !== null && hoursLeft < 24 ? 700 : 400 }}>
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
