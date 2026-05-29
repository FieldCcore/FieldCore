import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const IcoBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);


export default function NotificationBell() {
  const [open,  setOpen]  = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const nav = useNavigate();

  const unread = items.filter(n => !n.read).length;

  async function load() {
    try {
      const { data } = await api.get('/notifications');
      setItems(data);
    } catch {}
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function markRead(id) {
    await api.post(`/notifications/${id}/read`).catch(() => {});
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await api.post('/notifications/read-all').catch(() => {});
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  }

  function handleClick(n) {
    markRead(n.id);
    if (n.link) nav(n.link);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="tb-btn tb-ghost"
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        style={{ position: 'relative', padding: '4px 10px' }}
      >
        <IcoBell />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 1, right: 3, minWidth: 14, height: 14, background: '#C62828', borderRadius: 7, fontSize: 8, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, padding: '0 3px' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, background: 'white', border: '1px solid var(--lightgray)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.12)', zIndex: 300, overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--lightgray)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--steel)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
                No notifications yet
              </div>
            ) : items.map(n => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                style={{ padding: '11px 16px', borderBottom: '1px solid var(--lightgray)', cursor: n.link ? 'pointer' : 'default', background: n.read ? 'white' : 'var(--sand-lt)', display: 'flex', gap: 10, alignItems: 'flex-start' }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: n.read ? 'transparent' : 'var(--sand-dark)', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 2 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: 'var(--steel)' }}>{n.body}</div>}
                  <div style={{ fontSize: 10, color: 'var(--lightgray)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
                    {new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
