import React, { useEffect, useState } from 'react';
import { Truck, MapPin, Navigation } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const EMPTY = { make: '', model: '', year: '', plate: '', tech_id: '' };

export default function Fleet() {
  const { user } = useAuth();
  const canEdit  = user?.role === 'owner' || user?.role === 'manager';

  const [vehicles,  setVehicles]  = useState([]);
  const [techs,     setTechs]     = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState(null);  // null | EMPTY | vehicle obj
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/fleet'),
      api.get('/users'),
      api.get('/fleet/tech-locations'),
    ]).then(([vRes, uRes, locRes]) => {
      setVehicles(vRes.data);
      setTechs((uRes.data || []).filter(u => u.role === 'tech'));
      setLocations(locRes.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function setField(f) {
    return e => setForm(prev => ({ ...prev, [f]: e.target.value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        make:    form.make    || null,
        model:   form.model   || null,
        year:    form.year    ? parseInt(form.year) : null,
        plate:   form.plate   || null,
        tech_id: form.tech_id || null,
      };
      if (form.id) {
        const res = await api.patch(`/fleet/${form.id}`, payload);
        setVehicles(prev => prev.map(v => v.id === form.id ? res.data : v));
      } else {
        const res = await api.post('/fleet', payload);
        setVehicles(prev => [res.data, ...prev]);
      }
      setForm(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this vehicle from your fleet?')) return;
    try {
      await api.delete(`/fleet/${id}`);
      setVehicles(prev => prev.filter(v => v.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed.');
    }
  }

  const techName = (techId) => techs.find(t => t.id === techId)?.name || '—';

  return (
    <div>
      <div className="page-header">
        <h1>Fleet</h1>
        {canEdit && (
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY }); setError(''); }}>
            + Add Vehicle
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted">Loading fleet…</p>
      ) : vehicles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--steel)', fontSize: 14 }}>
          No vehicles in your fleet yet.{canEdit && ' Click "+ Add Vehicle" to get started.'}
        </div>
      ) : (
        <div className="fleet-grid">
          {vehicles.map(v => (
            <div key={v.id} className="fleet-card">
              <div className="fleet-card-top">
                <div className="fleet-icon" style={{ color: 'var(--sand)' }}><Truck size={26} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fleet-name">{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unnamed Vehicle'}</div>
                  <div className="fleet-plate">{v.plate || 'No plate'}</div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => { setForm({ ...v, tech_id: v.tech_id || '' }); setError(''); }}
                    >
                      Edit
                    </button>
                    <button
                      style={{ padding: '4px 10px', fontSize: 12, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, color: '#e53e3e', cursor: 'pointer' }}
                      onClick={() => handleDelete(v.id)}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <div className="fleet-card-meta">
                <div className="fleet-meta-row">
                  <span className="fleet-meta-label">Assigned Tech</span>
                  <span>{v.tech_name || techName(v.tech_id)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live Locations */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Navigation size={18} style={{ color: 'var(--sand)' }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Live Locations</h2>
          <span style={{ fontSize: 12, color: 'var(--steel)', marginLeft: 4 }}>Today's check-ins</span>
        </div>
        {locations.length === 0 ? (
          <p style={{ color: 'var(--steel)', fontSize: 14 }}>No GPS check-ins recorded today. Techs check in when they start a job on mobile.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {locations.map(loc => (
              <div key={loc.tech_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginTop: 3 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{loc.tech_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{loc.service_type || 'On job'}</div>
                    </div>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${loc.checkin_lat},${loc.checkin_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--sand)', textDecoration: 'none', flexShrink: 0 }}
                  >
                    <MapPin size={13} />
                    View Map
                  </a>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)', fontFamily: 'monospace' }}>
                  {parseFloat(loc.checkin_lat).toFixed(5)}, {parseFloat(loc.checkin_lng).toFixed(5)}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                  {loc.checkin_at ? `${formatDistanceToNow(new Date(loc.checkin_at))} ago` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{form.id ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
              <button className="btn-close" onClick={() => setForm(null)}>×</button>
            </div>
            <form onSubmit={handleSave}>
              {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Make</label>
                  <input value={form.make} onChange={setField('make')} placeholder="e.g. Ford" />
                </div>
                <div className="form-group">
                  <label>Model</label>
                  <input value={form.model} onChange={setField('model')} placeholder="e.g. Transit" />
                </div>
                <div className="form-group">
                  <label>Year</label>
                  <input type="number" min="1990" max="2099" value={form.year} onChange={setField('year')} placeholder="e.g. 2022" />
                </div>
                <div className="form-group">
                  <label>License Plate</label>
                  <input value={form.plate} onChange={setField('plate')} placeholder="e.g. ABC-1234" />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label>Assigned Tech</label>
                <select value={form.tech_id} onChange={setField('tech_id')}>
                  <option value="">Unassigned</option>
                  {techs.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-actions" style={{ marginTop: 20 }}>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Vehicle'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
