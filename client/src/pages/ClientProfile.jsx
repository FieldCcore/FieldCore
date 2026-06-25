import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../api';
import ClientForm from '../components/ClientForm';

const STATUS_COLORS = {
  scheduled: '#5F667A',
  in_progress: '#D6B58A',
  complete: '#1E6B3C',
  cancelled: '#B52A2A',
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
  const [reviews, setReviews] = useState([]);
  const [profileTab, setProfileTab] = useState('overview');
  const [calling, setCalling] = useState(false);
  const [callModal, setCallModal] = useState(false);
  const [operatorNumber, setOperatorNumber] = useState('');

  useEffect(() => {
    api.get(`/clients/${id}`)
      .then(r => setClient(r.data))
      .finally(() => setLoading(false));
    api.get(`/sms/messages?client_id=${id}`)
      .then(r => setMessages(r.data.slice(0, 5)));
    api.get(`/no-show/records?client_id=${id}`)
      .then(r => setNoShows(r.data)).catch(() => {});
    api.get(`/reviews?client_id=${id}`)
      .then(r => setReviews(r.data)).catch(() => {});
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

  async function handleCall(e) {
    e.preventDefault();
    if (!operatorNumber.trim()) return;
    setCalling(true);
    try {
      await api.post('/phone/calls/outbound', { client_id: id, operator_number: operatorNumber.trim() });
      setCallModal(false);
      setOperatorNumber('');
      alert(`Calling ${client.name}. Your phone (${operatorNumber}) will ring first.`);
    } catch (err) {
      alert(err.response?.data?.error || 'Call failed.');
    } finally {
      setCalling(false);
    }
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
        <div style={{ display: 'flex', gap: 8 }}>
          {client.phone && (
            <button className="btn-secondary" onClick={() => setCallModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6z"/></svg>
              Call
            </button>
          )}
          <button className="btn-secondary" onClick={() => setEditing(true)}>Edit Client</button>
        </div>
      </div>

      {callModal && (
        <div className="modal-overlay" onClick={() => setCallModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Call {client.name}</h2>
              <button className="btn-close" onClick={() => setCallModal(false)}>×</button>
            </div>
            <div style={{ padding: '4px 0 16px' }}>
              <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 16 }}>
                Twilio will call your phone first. When you answer, it connects you to {client.name} ({client.phone}).
              </p>
              <form onSubmit={handleCall}>
                <div className="form-group">
                  <label>Your phone number</label>
                  <input
                    value={operatorNumber}
                    onChange={e => setOperatorNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    required
                  />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setCallModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={calling}>
                    {calling ? 'Connecting…' : 'Start Call'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="section" style={{ marginTop: 32 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Reviews
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, background: 'rgba(214,181,138,.12)', color: 'var(--sand)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
              {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)} avg
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.map(r => (
              <div key={r.id} style={{ background: 'white', border: '1px solid var(--lightgray)', borderRadius: 8, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: r.body ? 8 : 0 }}>
                  <div>
                    <span style={{ color: '#D6B58A', fontSize: 16, letterSpacing: 3 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    <span style={{ fontSize: 12, color: 'var(--steel)', marginLeft: 10 }}>{r.service_type}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--steel)' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.body && <p style={{ margin: 0, fontSize: 13, color: '#475569', fontStyle: 'italic' }}>"{r.body}"</p>}
              </div>
            ))}
          </div>
        </div>
      )}

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
