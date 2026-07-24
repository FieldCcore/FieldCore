import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, CreditCard, FileText, Briefcase,
  MessageSquare, AlertCircle, Star, CheckCircle,
} from 'lucide-react';

const ICONS = {
  failed_payments: AlertCircle,
  deposits:        CreditCard,
  unassigned:      Briefcase,
  messages:        MessageSquare,
  estimates:       FileText,
  reviews:         Star,
};

export default function TodaysPriorities({ priorities = [], loading = false }) {
  const nav = useNavigate();

  if (loading) {
    return <div className="dp-panel__loading" aria-live="polite">Loading…</div>;
  }

  if (priorities.length === 0) {
    return (
      <div className="tp-empty">
        <div className="tp-empty__icon" aria-hidden="true">
          <CheckCircle size={22} strokeWidth={1.5} />
        </div>
        <div className="tp-empty__title">All caught up</div>
        <div className="tp-empty__sub">You're in great shape today.</div>
        <button
          className="tp-empty__link"
          onClick={() => nav('/revenue')}
          type="button"
        >
          View Revenue Analytics →
        </button>
      </div>
    );
  }

  return (
    <div className="tp-list" role="list">
      {priorities.map((p) => {
        const Icon = ICONS[p.type] || Briefcase;
        return (
          <button
            key={p.type}
            className={`tp-row tp-row--${p.tone ?? 'neutral'}`}
            onClick={() => nav(p.route)}
            type="button"
            role="listitem"
            aria-label={`${p.label}: ${p.sub}`}
          >
            <div className="tp-row__icon" aria-hidden="true">
              <Icon size={14} strokeWidth={2} />
            </div>
            <div className="tp-row__body">
              <div className="tp-row__label">{p.label}</div>
              <div className="tp-row__sub">{p.sub}</div>
            </div>
            <div className="tp-row__count" aria-hidden="true">{p.count}</div>
            <ChevronRight size={13} strokeWidth={2} className="tp-row__chevron" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
