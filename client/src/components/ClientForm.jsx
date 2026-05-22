import React, { useState } from 'react';
import api from '../api';

export default function ClientForm({ client, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: client?.name || '',
    email: client?.email || '',
    phone: client?.phone || '',
    address: client?.address || '',
    tier: client?.tier || 'standard',
    notes: client?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    setSaving(true);
    setError('');
    try {
      const res = client
        ? await api.patch(`/clients/${client.id}`, form)
        : await api.post('/clients', form);
      onSave(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="client-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-row">
        <div className="form-group">
          <label>Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="Full name" />
        </div>
        <div className="form-group">
          <label>Tier</label>
          <select value={form.tier} onChange={set('tier')}>
            <option value="standard">Standard</option>
            <option value="vip">VIP</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Phone</label>
          <input value={form.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" />
        </div>
      </div>

      <div className="form-group">
        <label>Address</label>
        <input value={form.address} onChange={set('address')} placeholder="Street address" />
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Any notes about this client..." />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : client ? 'Save Changes' : 'Add Client'}
        </button>
      </div>
    </form>
  );
}
