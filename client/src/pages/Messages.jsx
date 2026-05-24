import React, { useEffect, useState, useRef } from 'react';
import { Mail, Bell } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';

export default function Messages() {
  const [clients, setClients]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [clientJobs, setClientJobs] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected.id);
    api.get(`/jobs?client_id=${selected.id}&limit=5`)
      .then(r => setClientJobs((r.data?.jobs || r.data || []).filter(j => ['scheduled', 'in_progress'].includes(j.status))))
      .catch(() => setClientJobs([]));
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages(clientId) {
    const res = await api.get(`/sms/messages?client_id=${clientId}`);
    setMessages(res.data.reverse()); // oldest first for chat view
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim() || !selected) return;
    setSending(true);
    setError('');
    try {
      await api.post('/sms/send', { client_id: selected.id, body: body.trim() });
      setBody('');
      await loadMessages(selected.id);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.warning || 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  async function sendTemplate(template, jobId) {
    setSending(true);
    setError('');
    try {
      await api.post('/sms/send-template', { client_id: selected.id, template, job_id: jobId });
      await loadMessages(selected.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Template send failed.');
    } finally {
      setSending(false);
    }
  }

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  return (
    <div className="messages-layout">
      {/* Client sidebar */}
      <div className="client-list-panel">
        <div className="panel-header">
          <h2>Messages</h2>
          <input
            className="search-input"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 0, fontSize: 13 }}
          />
        </div>
        <div className="client-list-scroll">
          {filteredClients.map(c => (
            <div
              key={c.id}
              className={`client-list-item ${selected?.id === c.id ? 'active' : ''}`}
              onClick={() => { setSelected(c); setError(''); }}
            >
              <div className="client-list-name">{c.name}</div>
              <div className="client-list-phone">{c.phone || 'No phone'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className="chat-panel">
        {!selected ? (
          <div className="chat-empty">
            <p>Select a client to view messages</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div style={{ flex: 1 }}>
                <div className="chat-name">{selected.name}</div>
                <div className="chat-phone">{selected.phone || 'No phone number on file'}</div>
              </div>
              {clientJobs.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    disabled={sending}
                    onClick={() => sendTemplate('confirmation', clientJobs[0].id)}
                    title={`Confirm: ${clientJobs[0].service_type}`}
                  >
                    <Mail size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Confirmation
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    disabled={sending}
                    onClick={() => sendTemplate('reminder', clientJobs[0].id)}
                    title={`Remind: ${clientJobs[0].service_type}`}
                  >
                    <Bell size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Reminder
                  </button>
                </div>
              )}
            </div>

            <div className="chat-messages">
              {messages.length === 0 && (
                <p className="muted" style={{ textAlign: 'center', padding: 24 }}>No messages yet.</p>
              )}
              {messages.map(m => (
                <div key={m.id} className={`message-bubble ${m.direction}`}>
                  <div className="bubble-body">{m.body}</div>
                  <div className="bubble-time">
                    {format(new Date(m.created_at), 'MMM d, h:mm a')}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {error && <p className="form-error" style={{ margin: '0 16px 8px' }}>{error}</p>}

            <form className="chat-input-row" onSubmit={handleSend}>
              <textarea
                className="chat-textarea"
                placeholder="Type a message..."
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              />
              <button type="submit" className="btn-primary" disabled={sending || !body.trim()}>
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
