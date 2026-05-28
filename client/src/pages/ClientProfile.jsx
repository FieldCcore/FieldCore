import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../api';
import ClientForm from '../components/ClientForm';

const STATUS_COLORS = {
  scheduled: '#3b82f6',
  in_progress: '#f59e0b',
  complete: '#10b981',
  cancelled: '#6b7280',
};

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient]   = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [smsBody, setSmsBody] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsError, setSmsError] = useState('');
  const [noShows, setNoShows] = useState([]);
  const [profileTab, setProfileTab] = useState('overview');

  useEffect(() => {
    api.get(`/clients/${id}`)
      .then(r => setClient(r.data))
      .finally(() => setLoading(false));
    api.get(`/sms/messages?client_id=${id}`)
      .then(r => setMessages(r.data.slice(0, 5)));
    api.get(`/no-show/records?client_id=${id}`)
      .then(r => setNoShows(r.data)).catch(() => {});
  }, [id]);

  async function handleSms(e) {
    e.preventDefault();
    if (!smsBody.trim()) return;
    setSmsSending(true);
    setSmsError('');
    try {
      await api.post('/sms/send', { client_id: id, body: smsBody.trim() });
      setSmsBody('');
      const res = await api.get(`/sms/messages?client_id=${id}`);
      setMessages(res.data.slice(0, 5));
    } catch (err) {
      setSmsError(err.response?.data?.error || err.response?.data?.warning || 'Failed to send.');
    } finally {
      setSmsSending(false);
    }
  }

  function handleUpdated(updated) {
    setClient(prev => ({ ...prev, ...updated }));
    setEditing(false);
  }

  if (loading) return <p className="muted">Loading...</p>;
  if (!client) return <p className="muted">Client not found.</p>;

  return (
    <div>
      <button className="btn-back" onClick={() => navigate('/clients')}>← Back to Clients</button>

      <div className="profile-header">
        <div>
          <h1>{client.name}</h1>
          <span className={`badge badge-${client.tier}`}>{client.tier}</span>
        </div>
        <button className="btn-secondary" onClick={() => setEditing(true)}>Edit Client</button>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Client</h2>
              <button className="btn-close" onClick={() => setEditing(false)}>×</button>
            </div>
            <ClientForm client={client} onSave={handleUpdated} onCancel={() => setEditing(false)} />
          </div>
        </div>
      )}

      <div className="profile-grid">
        <div className="card">
          <h3>Contact Info</h3>
          <p><label>Phone</label> {client.phone || '—'}</p>
          <p><label>Email</label> {client.email || '—'}</p>
          <p><label>Address</label> {client.address || '—'}</p>
          <p><label>Card on File</label> {client.card_on_file ? 'Yes' : 'No'}</p>
        </div>

        <div className="card">
          <h3>Account Summary</h3>
          <p><label>Lifetime Value</label> ${parseFloat(client.ltv || 0).toFixed(2)}</p>
          <p><label>Total Jobs</label> {client.jobs?.length || 0}</p>
          <p><label>Client Since</label> {new Date(client.created_at).toLocaleDateString()}</p>
        </div>

        {client.notes && (
          <div className="card full-width">
            <h3>Notes</h3>
            <p>{client.notes}</p>
          </div>
        )}
      </div>

      <div className="section">
        <h2>Job History</h2>
        {!client.jobs?.length ? (
          <p className="muted">No jobs yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Tech</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {client.jobs.map(j => (
                <tr key={j.id}>
                  <td>{j.service_type}</td>
                  <td>{j.tech_name || '—'}</td>
                  <td>
                    <span className="status-badge" style={{ background: STATUS_COLORS[j.status] }}>
                      {j.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{j.scheduled_at ? new Date(j.scheduled_at).toLocaleDateString() : '—'}</td>
                  <td>{j.amount ? `$${parseFloat(j.amount).toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section" style={{ marginTop: 32 }}>
        <h2>SMS</h2>
        <div className="card" style={{ marginBottom: 16 }}>
          {messages.length === 0
            ? <p className="muted">No messages yet.</p>
            : messages.map(m => (
              <div key={m.id} className={`profile-sms-row ${m.direction}`}>
                <span className="profile-sms-body">{m.body}</span>
                <span className="profile-sms-time">{format(new Date(m.created_at), 'MMM d, h:mm a')}</span>
              </div>
            ))
          }
        </div>
        {client?.phone && (
          <form className="sms-compose" onSubmit={handleSms}>
            {smsError && <p className="form-error">{smsError}</p>}
            <textarea
              className="form-group textarea"
              rows={2}
              placeholder="Send a message..."
              value={smsBody}
              onChange={e => setSmsBody(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'vertical', width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="submit" className="btn-primary" disabled={smsSending || !smsBody.trim()}>
                {smsSending ? 'Sending...' : 'Send SMS'}
              </button>
            </div>
          </form>
        )}
        {!client?.phone && <p className="muted">Add a phone number to this client to enable SMS.</p>}
      </div>

      {/* No-Show History */}
      {noShows.length > 0 && (
        <div className="section" style={{ marginTop: 32 }}>
          <h2 style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>
            No-Show History
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, background: 'rgba(198,40,40,.08)', color: 'var(--red)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
              {noShows.length} record{noShows.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {noShows.map(ns => (
              <div key={ns.id} style={{ background: 'white', border: '1px solid var(--lightgray)', borderLeft: '3px solid var(--red)', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>{ns.service_type}</div>
                    <div style={{ fontSize: 12, color: 'var(--steel)' }}>Scheduled: {ns.scheduled_at ? new Date(ns.scheduled_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--steel)' }}>Declared: {new Date(ns.declared_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    <div style={{ fontSize: 12, color: 'var(--steel)' }}>Tech: {ns.tech_name || 'Unassigned'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>${parseFloat(ns.deposit_retained || 0).toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>Deposit Retained</div>
                    <a href={`/api/no-show/jobs/${ns.job_id}/pdf`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--navy)', textDecoration: 'underline', display: 'inline-block', marginTop: 6 }}>
                      Download PDF
                    </a>
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
