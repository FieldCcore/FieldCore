import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { AuLoading, AuError, AuBadge, AuEmpty, fmtDate } from './AuthorityShared';

export default function AuthorityParties() {
  const [parties,  setParties]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [creating, setCreating] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form, setForm] = useState({ partyType: 'person', displayName: '', externalReference: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    // Authority has no list-parties endpoint yet; we'll show an info message
    setParties([]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/authority/parties', form);
      setCreating(false);
      setForm({ partyType: 'person', displayName: '', externalReference: '' });
      setError('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create party.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateName(partyId, newName) {
    try {
      await api.patch(`/authority/parties/${partyId}/display-name`, { displayName: newName });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update party name.');
    }
  }

  return (
    <div className="au-page">
      <div className="au-page-header">
        <div>
          <div className="au-page-title">Parties</div>
          <div className="au-page-subtitle">Persons and organizations in Authority instruments</div>
        </div>
        <button className="au-btn au-btn--primary" onClick={() => setCreating(c => !c)}>
          {creating ? 'Cancel' : '+ New Party'}
        </button>
      </div>

      {creating && (
        <div className="au-card" style={{ marginBottom: 20 }}>
          <div className="au-card-header"><span className="au-card-title">Create Party</span></div>
          <div className="au-card-body">
            <form onSubmit={handleCreate}>
              <div className="au-field">
                <label className="au-label">Party Type</label>
                <select className="au-select" value={form.partyType}
                  onChange={e => setForm(f => ({ ...f, partyType: e.target.value }))}>
                  <option value="person">Person</option>
                  <option value="organization">Organization</option>
                </select>
              </div>
              <div className="au-field">
                <label className="au-label">Display Name *</label>
                <input className="au-input" required value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="Full legal name or organization name" />
              </div>
              <div className="au-field">
                <label className="au-label">External Reference (optional)</label>
                <input className="au-input" value={form.externalReference}
                  onChange={e => setForm(f => ({ ...f, externalReference: e.target.value }))}
                  placeholder="Internal ID or reference" />
              </div>
              <AuError msg={error} />
              <button className="au-btn au-btn--primary" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create Party'}
              </button>
            </form>
          </div>
        </div>
      )}

      <AuError msg={error} />

      {loading ? <AuLoading /> : (
        <div className="au-card">
          <div className="au-card-body">
            <div className="au-info">
              Party list endpoint is not yet available. Use the Review Workspace to view parties associated with instruments.
              Use the form above to create new parties.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
