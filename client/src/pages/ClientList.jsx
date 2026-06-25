import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import ClientForm from '../components/ClientForm';
import StatusBadge from '../components/StatusBadge';

function fmt$(n) {
  const v = parseFloat(n || 0);
  return v === 0 ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClientList() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/clients')
      .then(r => setClients(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  function handleCreated(client) {
    setClients(prev => [client, ...prev]);
    setShowForm(false);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p style={{ margin: '3px 0 0', color: 'var(--steel)', fontSize: 13 }}>
            {loading ? '' : `${clients.length} client${clients.length !== 1 ? 's' : ''} total`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Client</button>
      </div>

      <input
        className="search-input"
        placeholder="Search by name, email, or phone…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 580, width: '94vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Client</h2>
              <button className="btn-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <ClientForm onSave={handleCreated} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ background: 'var(--white)', borderRadius: 10, padding: '48px 24px', textAlign: 'center', border: '1px solid var(--lightgray)', color: 'var(--steel)', fontSize: 14 }}>
          Loading clients…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--white)', borderRadius: 10, padding: '48px 24px', textAlign: 'center', border: '1px solid var(--lightgray)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>👤</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
            {search ? 'No clients match your search' : 'No clients yet'}
          </div>
          <p style={{ color: 'var(--steel)', fontSize: 13 }}>
            {search ? 'Try a different name, email, or phone number.' : 'Add your first client to get started.'}
          </p>
          {!search && (
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
              + Add Client
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--lightgray)', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 80px 100px 110px 90px', gap: 0, padding: '9px 20px', background: 'var(--navy)', alignItems: 'center' }}>
            {['Name', 'Tier', 'Contact', 'LTV', 'Outstanding', 'Last Invoice', 'Client Since'].map(h => (
              <div key={h} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</div>
            ))}
          </div>

          {filtered.map((c, i) => (
            <div
              key={c.id}
              onClick={() => navigate(`/clients/${c.id}`)}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1.5fr 80px 100px 110px 90px',
                gap: 0,
                padding: '13px 20px',
                borderTop: i === 0 ? 'none' : '1px solid var(--lightgray)',
                cursor: 'pointer',
                alignItems: 'center',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--sand-lt)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              {/* Name */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{c.name}</div>
                {c.notes && (
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{c.notes}</div>
                )}
              </div>

              {/* Tier */}
              <div>
                <span className={`badge badge-${c.tier}`}>{c.tier}</span>
              </div>

              {/* Contact */}
              <div>
                {c.phone && <div style={{ fontSize: 13, color: 'var(--slate)' }}>{c.phone}</div>}
                {c.email && <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 1 }}>{c.email}</div>}
                {!c.phone && !c.email && <span style={{ color: 'var(--steel)', fontSize: 13 }}>—</span>}
              </div>

              {/* LTV */}
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, color: parseFloat(c.ltv || 0) > 0 ? 'var(--navy)' : 'var(--steel)' }}>
                {fmt$(c.ltv)}
              </div>

              {/* Outstanding */}
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: parseFloat(c.outstanding_balance || 0) > 0 ? 700 : 400, color: parseFloat(c.outstanding_balance || 0) > 0 ? '#dc2626' : 'var(--steel)' }}>
                {parseFloat(c.outstanding_balance || 0) > 0 ? fmt$(c.outstanding_balance) : '—'}
              </div>

              {/* Last Invoice */}
              <div>
                {c.last_invoice_at ? (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--slate)' }}>{fmtDate(c.last_invoice_at)}</div>
                    {c.last_invoice_status && (
                      <StatusBadge status={c.last_invoice_status} style={{ fontSize: 9, marginTop: 2 }} />
                    )}
                  </div>
                ) : <span style={{ color: 'var(--steel)', fontSize: 13 }}>—</span>}
              </div>

              {/* Client Since */}
              <div style={{ fontSize: 12, color: 'var(--steel)' }}>
                {c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
