import React, { useEffect, useState } from 'react';
import { Truck, MapPin, Navigation, Camera } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';

// ─── Camera tile ─────────────────────────────────────────────────────────────
// Renders one camera view (front / cab / rear) with all possible states.
// IMPORTANT: This component never shows fake video as real.
// Live stream rendering is prepared but only activates when a real stream_url
// is supplied by a connected third-party provider (Samsara, Motive, etc.).
const CAM_LABELS = { front: 'Front Camera', cab: 'Cab Camera', rear: 'Rear Camera' };

function CameraTile({ position, camera, providerConnected, loading }) {
  const label = CAM_LABELS[position] || position;

  // Derive display state
  let state = 'no_camera';
  if (loading)               state = 'loading';
  else if (!providerConnected) state = 'setup_required';
  else if (!camera)            state = 'no_camera';
  else if (camera.status === 'offline') state = 'offline';
  else if (camera.status === 'error')   state = 'error';
  else if (camera.stream_url)           state = 'live';
  else if (camera.snapshot_url)         state = 'snapshot';
  else                                  state = 'offline';

  const badge = {
    live:      <span className="fleet-cam-badge fleet-cam-badge--live">Live</span>,
    snapshot:  <span className="fleet-cam-badge fleet-cam-badge--snapshot">Snapshot</span>,
    offline:   <span className="fleet-cam-badge fleet-cam-badge--offline">Offline</span>,
    error:     <span className="fleet-cam-badge fleet-cam-badge--error">Error</span>,
  }[state];

  return (
    <div className="fleet-cam-tile">
      <div className="fleet-cam-tile-header">
        <span className="fleet-cam-label">{label}</span>
        {badge}
      </div>
      <div className="fleet-cam-body">
        {state === 'loading' && (
          <div className="fleet-cam-state" style={{ color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
            Loading…
          </div>
        )}
        {state === 'setup_required' && (
          <div className="fleet-cam-state fleet-cam-state--setup">
            <div className="fleet-cam-state-icon">
              <Camera size={28} strokeWidth={1.2} style={{ color: 'var(--lightgray)' }} />
            </div>
            <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 2 }}>Setup required</div>
            <div>Connect a camera provider</div>
          </div>
        )}
        {state === 'no_camera' && (
          <div className="fleet-cam-state fleet-cam-state--none">
            <div className="fleet-cam-state-icon">
              <Camera size={26} strokeWidth={1.2} style={{ color: 'var(--lightgray)', opacity: .5 }} />
            </div>
            <div>No camera installed</div>
          </div>
        )}
        {state === 'offline' && (
          <div className="fleet-cam-state fleet-cam-state--offline">
            <div className="fleet-cam-state-icon">
              <Camera size={26} strokeWidth={1.2} style={{ color: 'var(--lightgray)' }} />
            </div>
            <div style={{ fontWeight: 600 }}>Camera offline</div>
            {camera?.last_online_at && (
              <div style={{ fontSize: 11, marginTop: 4 }}>
                Last online {formatDistanceToNow(new Date(camera.last_online_at))} ago
              </div>
            )}
          </div>
        )}
        {state === 'error' && (
          <div className="fleet-cam-state fleet-cam-state--error">
            <div style={{ fontWeight: 600, color: 'var(--red)' }}>Camera error</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Check provider dashboard</div>
          </div>
        )}
        {state === 'snapshot' && camera?.snapshot_url && (
          <div className="fleet-cam-snapshot">
            <img
              src={camera.snapshot_url}
              alt={`${label} snapshot`}
              style={{ width: '100%', borderRadius: 4, display: 'block' }}
            />
            <div style={{ fontSize: 10, color: 'var(--steel)', marginTop: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Snapshot · not live
            </div>
          </div>
        )}
        {/* Live stream — only rendered when stream_url is supplied by a real provider */}
        {state === 'live' && camera?.stream_url && (
          <div className="fleet-cam-stream">
            <video
              src={camera.stream_url}
              autoPlay muted playsInline
              style={{ width: '100%', borderRadius: 4, display: 'block' }}
            />
            <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              ● Live
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY = { make: '', model: '', year: '', plate: '', tech_id: '' };

export default function Fleet() {
  const { user } = useAuth();
  const canEdit        = user?.role === 'owner' || user?.role === 'manager';
  // fleet.camera.view — owners, managers, and admins only.
  // NOTE: 'admin' is a future role; currently active roles are owner/manager/tech/staff.
  // When an admin role is formally added to the system, include it here.
  const canViewCameras = user?.role === 'owner' || user?.role === 'manager' || user?.role === 'admin';

  const [vehicles,  setVehicles]  = useState([]);
  const [techs,     setTechs]     = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState(null);  // null | EMPTY | vehicle obj
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  // Camera state
  const [camVehicleId,      setCamVehicleId]      = useState(null);
  const [camData,           setCamData]           = useState({ cameras: [], provider_connected: false, last_updated_at: null });
  const [camLoading,        setCamLoading]        = useState(false);
  const [camError,          setCamError]          = useState('');

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

  // Default camera vehicle to the first vehicle once fleet loads
  useEffect(() => {
    if (vehicles.length > 0 && camVehicleId === null) {
      setCamVehicleId(vehicles[0].id);
    }
  }, [vehicles, camVehicleId]);

  // Fetch camera data whenever selected vehicle changes
  useEffect(() => {
    if (!camVehicleId || !canViewCameras) return;
    setCamLoading(true);
    setCamError('');
    api.get(`/fleet/cameras/${camVehicleId}`)
      .then(r => setCamData(r.data))
      .catch(err => setCamError(err.response?.data?.error || 'Could not load camera data.'))
      .finally(() => setCamLoading(false));
  }, [camVehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {canEdit && (
        <div className="page-header" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY }); setError(''); }}>
            + Add Vehicle
          </button>
        </div>
      )}

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
              <div key={loc.tech_id} style={{ background: 'var(--white)', border: '1px solid var(--lightgray)', borderRadius: 12, padding: '14px 16px' }}>
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

      {/* ── Live Vehicle Cameras ──────────────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Camera size={18} style={{ color: 'var(--sand)' }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Live Vehicle Cameras</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 16, marginTop: 4 }}>
          Front, cab, and rear views via connected fleet camera provider. FieldCore does not host camera hardware.
        </p>

        {!canViewCameras ? (
          <div style={{ padding: '16px 20px', background: 'var(--offwhite)', border: '1px solid var(--lightgray)', borderRadius: 10, fontSize: 13, color: 'var(--slate)' }}>
            Camera access is restricted to owners and managers.{/* fleet.camera.view permission */}
          </div>
        ) : vehicles.length === 0 ? (
          <div style={{ color: 'var(--steel)', fontSize: 13, padding: '12px 0' }}>
            Add vehicles to your fleet before configuring cameras.
          </div>
        ) : (
          <>
            {/* Vehicle selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <select
                value={camVehicleId || ''}
                onChange={e => setCamVehicleId(e.target.value)}
                style={{ padding: '7px 12px', border: '1.5px solid var(--lightgray)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--navy)', background: 'var(--white)', cursor: 'pointer' }}
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unnamed Vehicle'}
                    {v.plate ? ` · ${v.plate}` : ''}
                  </option>
                ))}
              </select>
              {camData.last_updated_at && !camLoading && (
                <span style={{ fontSize: 11, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>
                  Updated {formatDistanceToNow(new Date(camData.last_updated_at))} ago
                </span>
              )}
            </div>

            {/* Setup required notice */}
            {!camLoading && !camData.provider_connected && !camError && (
              <div style={{ padding: '14px 18px', background: 'var(--offwhite)', border: '1px dashed var(--lightgray)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--slate)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 3 }}>
                  No camera provider connected
                </strong>
                Live camera feeds require a connected fleet camera provider. Supported integrations: Samsara, Motive, Geotab, Verizon Connect, Azuga, Fleetio.
                Stream URLs may require short-lived tokens from the provider — contact support to enable.
              </div>
            )}

            {/* API error */}
            {camError && (
              <div style={{ padding: '10px 14px', background: 'rgba(198,40,40,.06)', border: '1px solid rgba(198,40,40,.2)', borderRadius: 8, fontSize: 13, color: 'var(--red)', marginBottom: 14 }}>
                {camError}
              </div>
            )}

            {/* Camera tiles — front / cab / rear */}
            <div className="fleet-cam-grid">
              {['front', 'cab', 'rear'].map(pos => (
                <CameraTile
                  key={pos}
                  position={pos}
                  camera={(camData.cameras || []).find(c => c.camera_position === pos) || null}
                  providerConnected={camData.provider_connected}
                  loading={camLoading}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{form.id ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
              <button className="btn-close" onClick={() => setForm(null)}>×</button>
            </div>
            <div className="modal-body">
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
        </div>
      )}
    </div>
  );
}
