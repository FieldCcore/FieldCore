import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, CalendarDays, Briefcase, FileText, CreditCard, Star,
  Map, Phone, BarChart2, Users, Plus, ChevronRight, Inbox, Calendar,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import DashboardBanner from '../components/DashboardBanner';
import KpiCard from '../components/KpiCard';
import DashboardPanel from '../components/DashboardPanel';

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

const TONE_BG = {
  success: 'var(--green-lt)',
  info:    'var(--blue-lt)',
  warning: 'var(--amber-lt)',
  danger:  'var(--red-lt)',
  neutral: 'var(--off)',
};
const TONE_COLOR = {
  success: 'var(--green)',
  info:    'var(--blue)',
  warning: 'var(--amber)',
  danger:  'var(--red)',
  neutral: 'var(--steel)',
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

function fmtRelative(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function QaRow({ icon: Icon, label, onClick, primary = false }) {
  return (
    <button
      className={`qa-row${primary ? ' qa-row--primary' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="qa-row__icon">
        <Icon size={14} strokeWidth={2} />
      </div>
      <span className="qa-row__label">{label}</span>
      <div className="qa-row__arrow">
        <ChevronRight size={13} strokeWidth={2} />
      </div>
    </button>
  );
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

  const todayRevenue = weekBars[todayIdx]?.revenue || 0;

  // Activity feed — composed from existing data, no extra fetch
  const activityFeed = [
    ...todayJobs.map(j => ({
      icon: Briefcase,
      tone: j.status === 'in_progress' || j.status === 'complete' ? 'success' : 'neutral',
      text: j.client_name,
      sub:  `${j.service_type} · ${STATUS_LABEL[j.status] || j.status}`,
      time: j.scheduled_at,
    })),
    ...recentReviews.slice(0, 4).map(r => ({
      icon: Star,
      tone: r.rating >= 4 ? 'success' : r.rating >= 3 ? 'warning' : 'danger',
      text: r.client_name,
      sub:  `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} · ${r.service_type}`,
      time: r.created_at,
    })),
    ...pendingDeposits.slice(0, 3).map(d => ({
      icon: CreditCard,
      tone: 'warning',
      text: d.client_name,
      sub:  `Deposit pending · $${d.amount}`,
      time: d.expires_at,
    })),
  ];

  return (
    <div>
      {user?.accountName && (
        <div className="dash-entity-bar">
          <span className="dash-entity-eyebrow">Viewing</span>
          <span className="dash-entity-biz">{user.accountName}</span>
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="kpi-grid">
        <KpiCard
          icon={TrendingUp}
          title="Today Revenue"
          value={fmt$(todayRevenue)}
          subtitle={`${todayJobs.length} job${todayJobs.length !== 1 ? 's' : ''} today`}
          tone="success"
        />
        <KpiCard
          icon={CalendarDays}
          title="Month to Date"
          value={fmt$(mtdRevenue)}
          subtitle="Completed jobs"
          tone={mtdRevenue > 0 ? 'info' : 'neutral'}
          badge={mtdRevenue > 0 ? { label: 'Active', tone: 'info' } : undefined}
        />
        <KpiCard
          icon={Briefcase}
          title="Active Jobs"
          value={activeJobs}
          subtitle={activeJobs > 0 ? 'In progress now' : 'None in progress'}
          tone={activeJobs > 0 ? 'success' : 'neutral'}
          badge={activeJobs > 0 ? { label: 'Live', tone: 'success' } : undefined}
        />
        <KpiCard
          icon={FileText}
          title="Pending Invoices"
          value={fmt$(pendingInvoices.total || 0)}
          subtitle={`${pendingInvoices.count || 0} outstanding`}
          tone={pendingInvoices.count > 0 ? 'warning' : 'neutral'}
          action={pendingInvoices.count > 0
            ? { label: 'Collect →', onClick: () => nav('/invoices') }
            : undefined}
        />
        <KpiCard
          icon={CreditCard}
          title="Pending Deposits"
          value={pendingDeposits.length}
          subtitle={pendingDeposits.length > 0 ? 'Awaiting payment' : 'All clear'}
          tone={pendingDeposits.length > 0 ? 'danger' : 'neutral'}
          statusBadge={pendingDeposits.length > 0 ? { label: 'Action Needed', tone: 'danger' } : undefined}
        />
        <KpiCard
          icon={Star}
          title="Avg Rating"
          value={avgRating ? `${avgRating} ★` : '—'}
          subtitle={
            reviewCount > 0
              ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''} · ${ratingSource}`
              : 'No reviews yet'
          }
          tone={avgRating >= 4.5 ? 'success' : 'neutral'}
          badge={avgRating >= 4.5 ? { label: 'Excellent', tone: 'success' } : undefined}
          action={
            reviewCount > 0
              ? { label: 'View reviews →', onClick: () => nav('/reviews') }
              : gbp?.status !== 'connected'
              ? { label: 'Connect Google →', onClick: () => nav('/business-settings?tab=integrations') }
              : undefined
          }
        />
      </div>

      <DashboardBanner />

      {/* ── Panel Grid ── flat 3×3 + full-width activity row */}
      <div className="dp-grid">

        {/* Row 1 — Today's Jobs */}
        <DashboardPanel
          title="Today's Jobs"
          action={{ label: 'Calendar →', onClick: () => nav('/jobs') }}
        >
          {todayJobs.length === 0 ? (
            <div className="dp-empty">
              <div className="dp-empty__icon"><Calendar size={15} strokeWidth={1.5} /></div>
              <div className="dp-empty__title">No jobs today</div>
              <div className="dp-empty__subtitle">Jobs scheduled for today will appear here.</div>
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
        </DashboardPanel>

        {/* Row 1 — Revenue This Week */}
        <DashboardPanel title="Revenue This Week">
          <div className="dash-chart-area">
            {weekBars.map((b, i) => {
              const h = maxBar > 0 ? Math.max(4, (parseFloat(b.revenue) / maxBar) * 100) : 4;
              const isToday  = i === todayIdx;
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
        </DashboardPanel>

        {/* Row 1 — Quick Actions */}
        <DashboardPanel title="Quick Actions">
          <div className="qa-list">
            <QaRow icon={Map}       label="Dispatch Map"      onClick={() => nav('/dispatch')} />
            <QaRow icon={CreditCard} label="Review Deposits"  onClick={() => nav('/deposits')} />
            <QaRow icon={Phone}     label="Business Phone"    onClick={() => nav('/communications')} />
            <QaRow icon={BarChart2} label="Revenue Analytics" onClick={() => nav('/revenue')} />
            <QaRow icon={Users}     label="Team Report"       onClick={() => nav('/team')} />
            <QaRow icon={Plus}      label="Book New Job"      onClick={() => nav('/jobs?new=1')} primary />
          </div>
        </DashboardPanel>

        {/* Row 2 — Team */}
        <DashboardPanel title="Team">
          {team.length === 0 ? (
            <div className="dp-empty">
              <div className="dp-empty__icon"><Users size={15} strokeWidth={1.5} /></div>
              <div className="dp-empty__title">No team members</div>
              <div className="dp-empty__subtitle">Add technicians in Team settings.</div>
            </div>
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
        </DashboardPanel>

        {/* Row 2 — Recent Reviews */}
        <DashboardPanel
          title="Recent Reviews"
          badge={gbp?.status === 'connected' ? { label: 'Google', tone: 'success' } : undefined}
        >
          {recentReviews.length === 0 ? (
            <div className="dp-empty">
              <div className="dp-empty__icon"><Star size={15} strokeWidth={1.5} /></div>
              <div className="dp-empty__title">No reviews yet</div>
              <div className="dp-empty__subtitle">Requests are sent automatically after job completion.</div>
            </div>
          ) : (
            recentReviews.map((r, i) => (
              <div className="dash-review-row" key={i}>
                <div className="dash-review-top">
                  <span className="dash-review-name">{r.client_name}</span>
                  <span className="dash-review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                <div className="dash-review-service">{r.service_type}</div>
                {r.body && <div className="dash-review-body">"{r.body}"</div>}
              </div>
            ))
          )}
        </DashboardPanel>

        {/* Row 2 — Deposit Alerts */}
        <DashboardPanel
          title="Deposit Alerts"
          scrollable
          footer={
            pendingDeposits.length > 0 ? (
              <button className="dp-panel__action" onClick={() => nav('/deposits')} type="button">
                View All →
              </button>
            ) : undefined
          }
        >
          {pendingDeposits.length === 0 ? (
            <div className="dp-empty">
              <div className="dp-empty__icon"><Inbox size={15} strokeWidth={1.5} /></div>
              <div className="dp-empty__title">All clear</div>
              <div className="dp-empty__subtitle">No pending deposits at this time.</div>
            </div>
          ) : (
            <>
              <div className="dep-table-hdr">
                <span>Client</span><span>Amt</span><span>Status</span><span>Expiry</span>
              </div>
              {pendingDeposits.map((d, i) => {
                const hoursLeft = d.expires_at
                  ? Math.max(0, Math.floor((new Date(d.expires_at) - Date.now()) / 3600000))
                  : null;
                return (
                  <div className="dep-table-row" key={i} onClick={() => nav('/deposits')}>
                    <div>
                      <div className="dep-client__name">{d.client_name}</div>
                      <div className="dep-client__sub">{d.service_type}</div>
                    </div>
                    <div className="dep-amount">${d.amount}</div>
                    <div>
                      <span className="dep-status" style={{ background: 'var(--blue-lt)', color: 'var(--blue)' }}>
                        Pending
                      </span>
                    </div>
                    <div
                      className="dep-expiry"
                      style={{
                        color: hoursLeft === null ? 'var(--steel)' : hoursLeft < 24 ? 'var(--red)' : 'var(--amber)',
                        fontWeight: hoursLeft !== null && hoursLeft < 24 ? 700 : 400,
                      }}
                    >
                      {hoursLeft !== null ? `${hoursLeft}h left` : '—'}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </DashboardPanel>

        {/* Row 3 — Activity Feed (full-width) */}
        <DashboardPanel title="Activity Feed" className="dp-panel--activity">
          {activityFeed.length === 0 ? (
            <div className="dp-empty">
              <div className="dp-empty__icon"><Inbox size={15} strokeWidth={1.5} /></div>
              <div className="dp-empty__title">No recent activity</div>
              <div className="dp-empty__subtitle">Jobs, reviews, and deposits will appear here.</div>
            </div>
          ) : (
            <div className="af-feed">
              {activityFeed.map((item, i) => (
                <div className="af-item" key={i}>
                  <div
                    className="af-item__icon"
                    style={{ background: TONE_BG[item.tone] ?? TONE_BG.neutral, color: TONE_COLOR[item.tone] ?? TONE_COLOR.neutral }}
                  >
                    <item.icon size={14} strokeWidth={2} />
                  </div>
                  <div className="af-item__body">
                    <div className="af-item__text">{item.text}</div>
                    <div className="af-item__sub">{item.sub}</div>
                    {item.time && <div className="af-item__time">{fmtRelative(item.time)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardPanel>

      </div>
    </div>
  );
}
