import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, FileText, Briefcase, Star, Users, CheckCircle, Inbox,
} from 'lucide-react';

const ICONS = {
  payment_received: CreditCard,
  invoice_sent:     FileText,
  job_created:      Briefcase,
  job_completed:    CheckCircle,
  estimate_signed:  FileText,
  estimate_sent:    FileText,
  client_created:   Users,
  review_received:  Star,
  deposit_paid:     CreditCard,
  deposit_refunded: CreditCard,
};

function fmtRelative(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function RecentActivity({ activity = [], loading = false }) {
  const nav   = useNavigate();
  const items = activity.slice(0, 5);

  if (loading) {
    return <div className="dp-panel__loading" aria-live="polite">Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="dp-empty">
        <div className="dp-empty__icon" aria-hidden="true">
          <Inbox size={15} strokeWidth={1.5} />
        </div>
        <div className="dp-empty__title">No recent activity</div>
        <div className="dp-empty__subtitle">
          New jobs, payments, invoices, reviews, and other business updates will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="ra-list" role="list">
      {items.map((item, i) => {
        const Icon = ICONS[item.type] || Briefcase;
        return (
          <button
            key={i}
            className={`ra-row ra-row--${item.tone ?? 'neutral'}`}
            onClick={() => item.route && nav(item.route)}
            type="button"
            role="listitem"
            aria-label={item.label}
          >
            <div className="ra-row__icon" aria-hidden="true">
              <Icon size={14} strokeWidth={2} />
            </div>
            <div className="ra-row__body">
              <div className="ra-row__label">{item.label}</div>
              <div className="ra-row__meta">
                <span className={`ra-badge ra-badge--${item.tone ?? 'neutral'}`}>
                  {item.sub_type}
                </span>
                {item.event_time && (
                  <span className="ra-row__time">{fmtRelative(item.event_time)}</span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
