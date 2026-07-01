import React, { useEffect, useState } from 'react';
import { Truck, MapPin, Navigation, Camera, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';

// ─── Camera tile ─────────────────────────────────────────────────────────────
// Renders one camera position (front / cab / rear) with all possible states.
// Never shows fake video. Live stream only activates when a real stream_url
// is returned by a connected third-party provider (Samsara, Motive, etc.).
const CAM_LABELS = { front: 'Front Camera', cab: 'Cab Camera', rear: 'Rear Camera' };

function CameraTile({ position, camera, providerConnected, loading }) {
  const label = CAM_LABELS[position] || position;

  let state = 'no_camera';
  if (loading)                      state = 'loading';
  else if (!providerConnected)      state = 'setup_required';
  else if (!camera)                 state = 'no_camera';
  else if (camera.status === 'offline') state = 'offline';
  else if (camera.status === 'error')   state = 'error';
  else if (camera.stream_url)           state = 'live';
  else if (camera.snapshot_url)         state = 'snapshot';
  else                                  state = 'offline';

  const badge = {
    live:     <span className="fleet-cam-badge fleet-cam-badge--live">Live</span>,
    snapshot: <span className="fleet-cam-badge fleet-cam-badge--snapshot">Snapshot</span>,
    offline:  <span className="fleet-cam-badge fleet-cam-badge--offline">Offline</span>,
    error:    <span className="fleet-cam-badge fleet-cam-badge--error">Error</span>,
  }[state];

  return (
    <div className="fleet-cam-tile">
      <div className="fleet-cam-tile-header">
        <span className="fleet-cam-label">{label}</span>
        {badge || (
          <span className="fleet-cam-badge fleet-cam-badge--offline">
            {state === 'setup_required' ? 'Setup Required' : state === 'no_camera' ? 'No Camera' : 'Unknown'}
          </span>
        )}
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
            <img src={camera.snapshot_url} alt={`${label} snapshot`} style={{ width: '100%', borderRadius: 4, display: 'block' }} />
            <div style={{ fontSize: 10, color: 'var(--steel)', marginTop: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Snapshot · not live
            </div>
          </div>
        )}
        {/* Live stream — only rendered when stream_url is supplied by a real provider */}
        {state === 'live' && camera?.stream_url && (
          <div className="fleet-cam-stream">
            <video src={camera.stream_url} autoPlay muted playsInline style={{ width: '100%', borderRadius: 4, display: 'block' }} />
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
  const canViewCameras = user?.role === 'owner' || user?.role === 'manager' || user?.role === 'admin';

  const [vehicles,  setVehicles]  = useState([]);
  const [techs,     setTechs]     = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const [camVehicleId, setCamVehicleId] = useState(null);
  const [camData,      setCamData]      = useState({ cameras: [], provider_connected: false, last_updated_at: null });
  const [camLoading,   setCamLoading]   = useState(false);
  const [camError,     setCamError]     = useState('');

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

  useEffect(() => {
    if (vehicles.length > 0 && camVehicleId === null) {
      setCamVehicleId(vehicles[0].id);
    }
  }, [vehicles, camVehicleId]);

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

  const openAdd = () => { setForm({ ...EMPTY }); setError(''); };

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--steel)', marginBottom: 3 }}>Fleet</div>
          <div style={{ fontSize: 13, color: 'var(--slate)' }}>Manage vehicles, GPS locations, and camera feeds</div>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openAdd}>+ Add Vehicle</button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading fleet…</div>
      ) : (
        <>
          {/* ── Overview stat cards ───────────────────────────────────── */}
          <div className="dash-stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="dash-sc">
              <div className="dash-sc-header"><div className="dash-sc-l">Total Vehicles</div></div>
              <div className="dash-sc-v">{vehicles.length}</div>
              <div className="dash-sc-s">In fleet registry</div>
            </div>
            <div className="dash-sc">
              <div className="dash-sc-header"><div className="dash-sc-l">On Job Today</div></div>
              <div className="dash-sc-v" style={{ color: locations.length > 0 ? 'var(--green)' : undefined }}>
                {locations.length}
              </div>
              <div className="dash-sc-s">Tech GPS check-ins</div>
            </div>
            <div className="dash-sc">
              <div className="dash-sc-header"><div className="dash-sc-l">GPS Tracking</div></div>
              <div className="dash-sc-v" style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--steel)', paddingTop: 4 }}>—</div>
              <div className="dash-sc-s">No provider connected</div>
            </div>
            <div className="dash-sc">
              <div className="dash-sc-header"><div className="dash-sc-l">Cameras</div></div>
              <div className="dash-sc-v" style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--steel)', paddingTop: 4 }}>—</div>
              <div className="dash-sc-s">No provider connected</div>
            </div>
          </div>

          {/* ── Fleet Vehicles card ───────────────────────────────────── */}
          <div className="dash-card">
            <div className="dash-ch">
              <span className="dash-cht">Fleet Vehicles</span>
              {vehicles.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--steel)' }}>{vehicles.length} total</span>
              )}
            </div>

            {vehicles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ width: 52, height: 52, background: 'var(--offwhite)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Truck size={26} style={{ color: 'var(--steel)' }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>No vehicles yet</div>
                <div style={{ fontSize: 13, color: 'var(--steel)', lineHeight: 1.65, maxWidth: 340, margin: '0 auto 20px' }}>
                  Add vehicles to enable GPS tracking, camera feeds, and maintenance monitoring.
                </div>
                {canEdit && (
                  <button className="btn-primary" onClick={openAdd}>+ Add Vehicle</button>
                )}
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                <div className="fleet-grid" style={{ marginTop: 0 }}>
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
                            >Edit</button>
                            <button
                              style={{ padding: '4px 10px', fontSize: 12, background: 'none', border: '1px solid var(--lightgray)', borderRadius: 6, color: 'var(--red)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                              onClick={() => handleDelete(v.id)}
                            >×</button>
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
              </div>
            )}
          </div>

          {/* ── Two-column: Live Locations + Fleet Tracking ───────────── */}
          <div className="fleet-2col">

            {/* Live Locations */}
            <div className="dash-card" style={{ marginBottom: 0 }}>
              <div className="dash-ch">
                <div>
                  <div className="dash-cht">Live Locations</div>
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>Tech GPS check-ins today</div>
                </div>
                <Navigation size={14} style={{ color: 'var(--steel)', flexShrink: 0 }} />
              </div>

              {locations.length === 0 ? (
                <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                  <div style={{ width: 44, height: 44, background: 'var(--offwhite)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <MapPin size={20} style={{ color: 'var(--steel)' }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>No live locations yet</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.65, maxWidth: 260, margin: '0 auto' }}>
                    GPS locations appear here once techs check in on a job via the mobile app.
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {locations.map(loc => (
                    <div key={loc.tech_id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: 'var(--off)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{loc.tech_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 1 }}>{loc.service_type || 'On job'}</div>
                          <div style={{ fontSize: 11, color: 'var(--steel)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                            {parseFloat(loc.checkin_lat).toFixed(4)}, {parseFloat(loc.checkin_lng).toFixed(4)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <a
                          href={`https://www.google.com/maps?q=${loc.checkin_lat},${loc.checkin_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--sand)', textDecoration: 'none', fontWeight: 700 }}
                        >
                          <MapPin size={11} />
                          Map
                        </a>
                        {loc.checkin_at && (
                          <span style={{ fontSize: 10, color: 'var(--steel)', fontFamily: 'DM Mono, monospace' }}>
                            {formatDistanceToNow(new Date(loc.checkin_at))} ago
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fleet Tracking Integration */}
            <div className="dash-card" style={{ marginBottom: 0 }}>
              <div className="dash-ch">
                <div>
                  <div className="dash-cht">Fleet Tracking Integration</div>
                  <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>Live GPS, speed, and route history</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--offwhite)', color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', flexShrink: 0 }}>
                  Setup Required
                </span>
              </div>

              <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '12px 14px', background: 'var(--offwhite)', borderRadius: 8 }}>
                  <Radio size={16} style={{ color: 'var(--steel)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>No provider connected</div>
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 1 }}>Connect a GPS provider to enable live tracking</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 14 }}>Supported providers:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 20 }}>
                  {['Samsara', 'Motive', 'Geotab', 'Verizon Connect', 'Azuga', 'Fleetio'].map(p => (
                    <div key={p} style={{ padding: '7px 10px', background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 6, fontSize: 12, color: 'var(--slate)', fontWeight: 500 }}>
                      {p}
                    </div>
                  ))}
                </div>

                <a
                  href="mailto:info@getfieldcore.com?subject=Fleet Tracking Integration"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'var(--navy)', color: 'white', borderRadius: 7, fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}
                >
                  Request Integration →
                </a>
                <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 8, lineHeight: 1.55 }}>
                  Fleet tracking integrations are coming soon. Contact us to request early access for your provider.
                </div>
              </div>
            </div>
          </div>

          {/* ── Live Vehicle Cameras — full width ────────────────────── */}
          <div className="dash-card">
            <div className="dash-ch">
              <div>
                <div className="dash-cht">Live Vehicle Cameras</div>
                <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>
                  Front, cab, and rear views · third-party provider required
                </div>
              </div>
              {!camData.provider_connected && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--offwhite)', color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.08em', flexShrink: 0 }}>
                  Setup Required
                </span>
              )}
            </div>

            <div style={{ padding: '16px 20px 24px' }}>
              {!canViewCameras ? (
                <div style={{ padding: '14px 16px', background: 'var(--offwhite)', borderRadius: 8, fontSize: 13, color: 'var(--slate)' }}>
                  Camera access is restricted to owners and managers.
                </div>
              ) : vehicles.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <div style={{ width: 44, height: 44, background: 'var(--offwhite)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Camera size={20} style={{ color: 'var(--steel)' }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>No vehicles in fleet</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', lineHeight: 1.6 }}>Add vehicles to configure camera feeds.</div>
                </div>
              ) : (
                <>
                  {/* Vehicle selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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
                    <div style={{ padding: '12px 14px', background: 'var(--offwhite)', border: '1px dashed var(--lightgray)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--slate)', lineHeight: 1.65 }}>
                      <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 2 }}>No camera provider connected</strong>
                      Live feeds require a fleet camera provider (Samsara, Motive, Geotab, etc.). Contact support to enable.
                    </div>
                  )}

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
          </div>
        </>
      )}

      {/* Add / Edit Vehicle modal */}
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
