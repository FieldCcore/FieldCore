import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';

const SEVERITY_STYLES = {
  info:     { bg: 'var(--navy)',    color: '#fff',          border: 'none' },
  success:  { bg: '#1a4731',        color: '#fff',          border: 'none' },
  warning:  { bg: '#7a4f00',        color: '#fff',          border: 'none' },
  critical: { bg: '#7a1f1f',        color: '#fff',          border: 'none' },
};

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  );
}

function BannerItem({ banner, onDismiss }) {
  const style = SEVERITY_STYLES[banner.severity] || SEVERITY_STYLES.info;

  return (
    <div style={{
      background: style.bg,
      color: style.color,
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      border: style.border,
      boxSizing: 'border-box',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: banner.message ? 3 : 0 }}>
          {banner.title}
        </div>
        {banner.message && (
          <div style={{ fontSize: 12, opacity: 0.82, lineHeight: 1.5 }}>{banner.message}</div>
        )}
        {(banner.primary_action_label || banner.secondary_action_label) && (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {banner.primary_action_label && (
              <a
                href={banner.primary_action_url || '#'}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--sand)', textDecoration: 'none',
                  border: '1px solid var(--sand)', borderRadius: 6, padding: '5px 14px', display: 'inline-block' }}
              >
                {banner.primary_action_label}
              </a>
            )}
            {banner.secondary_action_label && (
              <a
                href={banner.secondary_action_url || '#'}
                style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', textDecoration: 'none',
                  padding: '5px 0', display: 'inline-block' }}
              >
                {banner.secondary_action_label}
              </a>
            )}
          </div>
        )}
      </div>

      {banner.dismissible && (
        <button
          onClick={() => onDismiss(banner.id)}
          aria-label="Dismiss"
          style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 6,
            cursor: 'pointer', padding: 6, color: 'rgba(255,255,255,.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}

export default function DashboardBanner() {
  const [banners, setBanners] = useState([]);

  const load = useCallback(() => {
    api.get('/banners').then(r => setBanners(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  function dismiss(id) {
    setBanners(b => b.filter(x => x.id !== id));
    api.post(`/banners/${id}/dismiss`).catch(() => {});
  }

  if (!banners.length) return null;

  return (
    <div style={{ marginBottom: 4 }}>
      {banners.map(b => (
        <BannerItem key={b.id} banner={b} onDismiss={dismiss} />
      ))}
    </div>
  );
}
