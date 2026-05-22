import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function BookingSettings() {
  const { user } = useAuth();
  const accountId = user?.accountId;
  const widgetUrl  = accountId ? `${window.location.origin}/book/${accountId}` : '';
  const embedCode  = widgetUrl ? `<iframe src="${widgetUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;"></iframe>` : '';

  const [settings, setSettings] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [newService, setNewService] = useState('');
  const [copied, setCopied]     = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get('/booking-settings').then(r => setSettings(r.data)).finally(() => setLoading(false));
  }, []);

  function set(field) {
    return e => setSettings(s => ({ ...s, [field]: e.target.value }));
  }

  function addService() {
    const svc = newService.trim();
    if (!svc || settings.services.includes(svc)) return;
    setSettings(s => ({ ...s, services: [...s.services, svc] }));
    setNewService('');
  }

  function removeService(svc) {
    setSettings(s => ({ ...s, services: s.services.filter(x => x !== svc) }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.put('/booking-settings', settings);
      setSettings(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function copyEmbed() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (loading) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Online Booking</h1>
        {widgetUrl && <a href={widgetUrl} target="_blank" rel="noreferrer" className="btn-secondary">
          Preview Booking Page ↗
        </a>}
      </div>

      {/* Embed code */}
      <div className="card" style={{ marginBottom: 28 }}>
        <h3 style={{ marginBottom: 12 }}>Embed on Your Website</h3>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 14 }}>
          Paste this code anywhere on your website to embed the booking form.
        </p>
        <div className="embed-box">
          <code className="embed-code">{embedCode || 'Loading…'}</code>
          <button className="btn-primary" onClick={copyEmbed} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            {copied ? '✓ Copied!' : 'Copy Embed Code'}
          </button>
        </div>
        <p style={{ color: '#64748b', fontSize: 12, marginTop: 10 }}>
          Direct link: {widgetUrl && <a href={widgetUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>{widgetUrl}</a>}
        </p>
      </div>

      {/* Settings form */}
      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Widget Settings</h3>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Business Name</label>
            <input value={settings.business_name || ''} onChange={set('business_name')} placeholder="Your Business Name" />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Deposit Amount ($0 = no deposit)</label>
            <input type="number" step="0.01" min="0" value={settings.deposit_amount || 0} onChange={set('deposit_amount')} placeholder="0.00" />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Agreement / Terms Text</label>
            <textarea rows={3} value={settings.agreement_text || ''} onChange={set('agreement_text')} />
          </div>

          {/* Services list */}
          <div className="form-group">
            <label>Services Offered</label>
            <div className="services-list">
              {settings.services.map(svc => (
                <div key={svc} className="service-tag">
                  <span>{svc}</span>
                  <button type="button" onClick={() => removeService(svc)} className="service-remove">×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={newService}
                onChange={e => setNewService(e.target.value)}
                placeholder="Add a service..."
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addService())}
                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
              />
              <button type="button" className="btn-secondary" onClick={addService}>Add</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </form>
    </div>
  );
}
