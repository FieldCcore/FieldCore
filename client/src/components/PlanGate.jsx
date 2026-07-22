import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ORDER = ['starter', 'solo', 'pro', 'scale'];
const NAMES = { starter: 'Starter', solo: 'Solo', pro: 'Pro', scale: 'Scale' };

const IcoLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 28, height: 28, color: 'var(--sand-dark)' }}>
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

export default function PlanGate({ requires, children }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const currentIdx  = ORDER.indexOf(user?.plan || 'starter');
  const requiredIdx = ORDER.indexOf(requires);

  if (currentIdx >= requiredIdx) return children;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, gap: 14, padding: 48, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, background: 'var(--sand-lt)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IcoLock />
      </div>
      <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: 'var(--navy)', marginTop: 4 }}>
        {NAMES[requires]} plan required
      </div>
      <div style={{ fontSize: 13, color: 'var(--steel)', maxWidth: 300, lineHeight: 1.6 }}>
        This feature is available on the {NAMES[requires]} plan and above.
        You're currently on the <strong>{NAMES[user?.plan || 'starter']}</strong> plan.
      </div>
      <button
        onClick={() => nav('/billing')}
        style={{ marginTop: 6, padding: '10px 28px', background: 'var(--navy)', color: 'var(--sand)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '.02em' }}
      >
        View Plans →
      </button>
    </div>
  );
}
