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

  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/authority/parties')
      .then(r => { setParties(r.data); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'Failed to load parties.'))
      .finally(() => setLoading(false));
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
          <div className="au-page-subtitle">Directory of people and organizations participating in Authority relationships</div>
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

      <div className="au-toolbar" style={{ marginBottom: 12 }}>
        <input
          className="au-input"
          style={{ width: 240, marginBottom: 0 }}
          placeholder="Filter by name or reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ fontSize: 12, color: 'var(--steel)' }}>
          {parties.filter(p => filterParty(p, search)).length} part{parties.filter(p => filterParty(p, search)).length !== 1 ? 'ies' : 'y'}
        </div>
      </div>

      {loading ? <AuLoading /> : (
        <div className="au-table-card">
          {!parties.length ? (
            <AuEmpty text="No parties yet. Create a party above." />
          ) : (
            <table className="au-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parties.filter(p => filterParty(p, search)).map(p => (
                  <tr key={p.id}>
                    <td>
                      {editing === p.id ? (
                        <EditNameInline
                          initial={p.display_name || ''}
                          onSave={name => handleUpdateName(p.id, name)}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <span>{p.display_name || <em style={{ color: 'var(--steel)' }}>encrypted</em>}</span>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{p.party_type}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {p.external_reference || '—'}
                    </td>
                    <td><AuBadge status={p.status} /></td>
                    <td style={{ fontSize: 12, color: 'var(--steel)' }}>{fmtDate(p.created_at)}</td>
                    <td>
                      {editing !== p.id && (
                        <button className="au-btn au-btn--sm" onClick={() => setEditing(p.id)}>
                          Rename
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function filterParty(party, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    (party.display_name || '').toLowerCase().includes(q) ||
    (party.external_reference || '').toLowerCase().includes(q)
  );
}

function EditNameInline({ initial, onSave, onCancel }) {
  const [val, setVal] = useState(initial);
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        className="au-input"
        style={{ width: 180, marginBottom: 0 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        autoFocus
      />
      <button className="au-btn au-btn--sm au-btn--primary" onClick={() => onSave(val)} disabled={!val.trim()}>Save</button>
      <button className="au-btn au-btn--sm" onClick={onCancel}>Cancel</button>
    </span>
  );
}
