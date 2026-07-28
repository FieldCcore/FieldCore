import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Calendar, Briefcase, FileText, CreditCard, Star,
  Map, Phone, BarChart2, Users, Plus, ChevronRight,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import DashboardBanner from '../components/DashboardBanner';
import KpiCard from '../components/KpiCard';
import DashboardPanel from '../components/DashboardPanel';
import FinancialSnapshot from '../components/FinancialSnapshot';
import TodaysPriorities from '../components/TodaysPriorities';
import RecentActivity from '../components/RecentActivity';
import usePriorities from '../hooks/usePriorities';
import useActivity from '../hooks/useActivity';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getGreeting(name) {
  const hour  = new Date().getHours();
  const first = (name || '').split(' ')[0] || 'there';
  if (hour >= 5  && hour < 12) return `Good morning, ${first}`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function getDateLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
  });
}

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

function weekDateRange() {
  const now = new Date();
  const dow = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(mon)} – ${fmt(sun)}`;
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
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [gbp,        setGbp]        = useState(null);
  const [hoveredBar, setHoveredBar] = useState(null);
  const { priorities, loading: prioritiesLoading } = usePriorities();
  const { activity,   loading: activityLoading }   = useActivity();

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

  const { todayJobs = [], weekRevenue = 0, weekCollected = 0, weekOutstanding = 0,
          weekInvoicesPaid = 0, prevWeekRevenue = 0, activeJobs = 0,
          pendingInvoices = {}, failedInvoiceCount = 0,
          pendingDeposits = [], totalDepositCount = 0,
          team = [], weekBars = [], recentReviews = [],
          scheduledRevenue = 0, scheduledJobCount = 0 } = data || {};

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

  // Revenue This Week — derived metrics
  const dateRange      = weekDateRange();
  const totalWeekJobs  = weekBars.reduce((s, b) => s + parseInt(b.jobs || 0), 0);
  const avgJobValue    = totalWeekJobs > 0 ? weekRevenue / totalWeekJobs : 0;
  const activeDays     = weekBars.filter(b => parseFloat(b.revenue) > 0).length;
  const collectionTotal = weekCollected + weekOutstanding;
  const collectionRate  = collectionTotal > 0 ? Math.round((weekCollected / collectionTotal) * 100) : null;

  const bestBarIdx = weekBars.reduce((bi, b, i) =>
    parseFloat(b.revenue) > parseFloat(weekBars[bi]?.revenue ?? 0) ? i : bi, 0);
  const bestDay = weekBars[bestBarIdx] && parseFloat(weekBars[bestBarIdx].revenue) > 0
    ? { label: DAY_LABELS[bestBarIdx], revenue: weekBars[bestBarIdx].revenue }
    : null;

  // Financial Snapshot metrics — Collected/Outstanding/InvoicesPaid always shown (even as $0/0)
  // AvgJobValue hidden when no jobs this week (can't calculate meaningfully)
  const snapMetrics = [
    { label: 'Collected',     value: fmt$(weekCollected) },
    { label: 'Outstanding',   value: fmt$(weekOutstanding), tone: weekOutstanding > 0 ? 'warning' : undefined },
    { label: 'Invoices Paid', value: String(weekInvoicesPaid) },
    totalWeekJobs > 0 && { label: 'Avg Job Value', value: fmt$(avgJobValue) },
  ].filter(Boolean);

  const snapEmptyMsg = weekRevenue === 0
    ? 'No completed payments have been recorded this week.'
    : null;

  // Footer insight — highest priority available
  let footerInsight = null;
  if (prevWeekRevenue > 0) {
    const pct = Math.round(((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100);
    footerInsight = { type: 'week', pct, prev: prevWeekRevenue };
  } else if (bestDay) {
    footerInsight = { type: 'bestday', label: bestDay.label, revenue: bestDay.revenue };
  } else if (collectionRate !== null) {
    footerInsight = { type: 'collection', rate: collectionRate };
  } else if (weekOutstanding > 0 && weekRevenue > 0) {
    footerInsight = {
      type: 'outstanding',
      amount: weekOutstanding,
      pct: Math.round((weekOutstanding / weekRevenue) * 100),
    };
  } else if (activeDays > 0) {
    footerInsight = { type: 'avgday', avg: weekRevenue / activeDays, days: activeDays };
  }

  return (
    <div>
      {/* ── Greeting ── */}
      <div className="dash-greet" aria-label="Dashboard greeting">
        <div className="dash-greet__date">{getDateLabel()}</div>
        <p className="dash-greet__name">{getGreeting(user?.name)}</p>
      </div>

      {user?.accountName && (
        <div className="dash-entity-bar">
          <span className="dash-entity-eyebrow">Viewing</span>
          <span className="dash-entity-biz">{user.accountName}</span>
        </div>
      )}

      {/* ── KPI Grid ── */}
      {(() => {
        // Deposit badge — overdue first, then pending, then all-paid/none
        const overdueDeposits = pendingDeposits.filter(
          d => d.expires_at && new Date(d.expires_at) < new Date()
        );
        // All pending deposits = critical (money waiting to be collected)
        const depositBadge = pendingDeposits.length > 0
          ? (overdueDeposits.length > 0
              ? { label: 'Action Needed',    tone: 'critical' }
              : { label: 'Awaiting Payment', tone: 'critical' })
          : totalDepositCount > 0
          ? { label: 'All Paid',   tone: 'success' }
          : { label: 'No Deposits', tone: 'neutral' };

        // Outstanding invoices = critical (money owed = business impact)
        const invoiceBadge = (failedInvoiceCount > 0 || (pendingInvoices.count || 0) > 0)
          ? (failedInvoiceCount > 0
              ? { label: 'Action Needed', tone: 'critical' }
              : { label: 'Outstanding',   tone: 'critical' })
          : { label: 'All Paid', tone: 'success' };

        // GBP connection badge (null = API never responded → no badge)
        const gbpBadge = gbp?.status === 'connected'
          ? { label: 'Connected',       tone: 'success'  }
          : gbp?.status === 'syncing'
          ? { label: 'Syncing',         tone: 'warning'  }
          : gbp?.status != null
          ? { label: 'Needs Reconnect', tone: 'critical' }
          : undefined;

        // Rating action — always present; direction based on GBP state
        const ratingAction = gbp?.status === 'connected'
          ? { label: 'View reviews →',   onClick: () => nav('/reviews') }
          : { label: 'Connect Google →', onClick: () => nav('/business-settings?tab=integrations') };

        return (
          <div className="kpi-grid">
            <KpiCard
              icon={TrendingUp}
              title="Today Revenue"
              value={fmt$(todayRevenue)}
              subtitle={`${todayJobs.length} job${todayJobs.length !== 1 ? 's' : ''} today`}
              tone="success"
              action={{ label: 'View today →', onClick: () => nav('/revenue') }}
            />
            <KpiCard
              icon={Calendar}
              title="Scheduled Revenue"
              value={fmt$(scheduledRevenue)}
              subtitle={`${scheduledJobCount} upcoming job${scheduledJobCount !== 1 ? 's' : ''}`}
              tone={scheduledRevenue > 0 ? 'success' : 'neutral'}
              action={{ label: 'View upcoming work →', onClick: () => nav('/revenue?view=scheduled') }}
            />
            <KpiCard
              icon={Briefcase}
              title="Active Jobs"
              value={activeJobs}
              subtitle={activeJobs > 0 ? 'In progress now' : 'None in progress'}
              tone={activeJobs > 0 ? 'success' : 'neutral'}
              badge={activeJobs > 0 ? { label: 'Live', tone: 'success' } : { label: 'Clear', tone: 'success' }}
              action={{ label: 'View active jobs →', onClick: () => nav('/jobs?view=day') }}
            />
            <KpiCard
              icon={FileText}
              title="Pending Invoices"
              value={fmt$(pendingInvoices.total || 0)}
              subtitle={`${pendingInvoices.count || 0} outstanding`}
              tone={(failedInvoiceCount > 0 || (pendingInvoices.count || 0) > 0) ? 'critical' : 'neutral'}
              badge={invoiceBadge}
              action={{ label: 'Collect →', onClick: () => nav('/invoices') }}
            />
            <KpiCard
              icon={CreditCard}
              title="Pending Deposits"
              value={pendingDeposits.length}
              subtitle={pendingDeposits.length > 0 ? `${pendingDeposits.length} awaiting` : 'All clear'}
              tone={pendingDeposits.length > 0 ? 'critical' : 'neutral'}
              badge={depositBadge}
              action={{ label: 'Review deposits →', onClick: () => nav('/deposits') }}
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
              badge={gbpBadge}
              action={ratingAction}
            />
          </div>
        );
      })()}

      <DashboardBanner />

      {/* ── Panel Grid ── flat 3×3 + full-width activity row */}
      <div className="dp-grid">

        {/* Row 1 — Today's Jobs */}
        <DashboardPanel
          title="Today's Jobs"
          action={{ label: 'Calendar →', onClick: () => nav('/jobs?view=day') }}
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
        <DashboardPanel
          title="Revenue This Week"
          action={{ label: 'Revenue Analytics →', onClick: () => nav('/revenue') }}
          footer={footerInsight ? (
            <div className="rv-footer">
              {footerInsight.type === 'week' && (<>
                <span className={footerInsight.pct >= 0 ? 'rv-footer__pos' : 'rv-footer__neg'}>
                  {footerInsight.pct >= 0 ? '↑' : '↓'} {Math.abs(footerInsight.pct)}% vs last week
                </span>
                <span className="rv-footer__sep">·</span>
                <span>{fmt$(footerInsight.prev)} prev week</span>
              </>)}
              {footerInsight.type === 'bestday' && (
                <span>Best day: {footerInsight.label} · {fmt$(footerInsight.revenue)}</span>
              )}
              {footerInsight.type === 'collection' && (
                <span>{footerInsight.rate}% collected this week</span>
              )}
              {footerInsight.type === 'outstanding' && (<>
                <span className="rv-footer__neg">{fmt$(footerInsight.amount)} outstanding</span>
                <span className="rv-footer__sep">·</span>
                <span>{footerInsight.pct}% of total</span>
              </>)}
              {footerInsight.type === 'avgday' && (
                <span>{fmt$(footerInsight.avg)} avg/day · {footerInsight.days} day{footerInsight.days !== 1 ? 's' : ''} active</span>
              )}
            </div>
          ) : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Revenue Summary — primary focus */}
          <div className="rv-snap">
            <div className="rv-snap__date">{dateRange}</div>
            <div className="rv-snap__total">{fmt$(weekRevenue)}</div>
            <div className="rv-snap__total-lbl">Total Revenue This Week</div>
          </div>

          {/* Financial Snapshot — secondary focus */}
          <FinancialSnapshot metrics={snapMetrics} emptyMessage={snapEmptyMsg} />

          {/* Weekly Trend — supporting info */}
          <div className="rv-chart-wrap">
            <div className="rv-chart-area">
              {weekBars.map((b, i) => {
                const rev = parseFloat(b.revenue);
                const h   = maxBar > 0 ? Math.max(4, (rev / maxBar) * 100) : 4;
                const isToday  = i === todayIdx;
                const isFuture = i > todayIdx;
                return (
                  <div
                    key={i}
                    className="dash-bar-wrap"
                    style={{ position: 'relative' }}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {hoveredBar === i && rev > 0 && (
                      <div className="rv-bar-tip">
                        {fmt$(rev)}
                        {parseInt(b.jobs) > 0 && (
                          <div className="rv-bar-tip__sub">{b.jobs} job{b.jobs !== '1' ? 's' : ''}</div>
                        )}
                      </div>
                    )}
                    <div
                      className="dash-bar"
                      style={{
                        height: `${h}%`,
                        background: isToday ? 'var(--navy)' : isFuture ? 'var(--lightgray)' : 'var(--slate)',
                      }}
                    />
                    <div className="dash-bar-lbl">{DAY_LABELS[i]}</div>
                  </div>
                );
              })}
            </div>
          </div>
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

        {/* Row 2 — Today's Priorities */}
        <DashboardPanel
          title="Today's Priorities"
          action={{ label: 'Deposits →', onClick: () => nav('/deposits') }}
        >
          <TodaysPriorities priorities={priorities} loading={prioritiesLoading} />
        </DashboardPanel>

        {/* Row 3 — Recent Activity (full-width) */}
        <DashboardPanel
          title="Recent Activity"
          action={{ label: 'View All →', onClick: () => nav('/jobs') }}
          className="dp-panel--activity"
        >
          <RecentActivity activity={activity} loading={activityLoading} />
        </DashboardPanel>

      </div>
    </div>
  );
}
