import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { TIMEZONES } from '../utils/timezones';

const DELAY_OPTIONS = [
  { value: 0,      label: 'Immediately' },
  { value: 1800,   label: '30 minutes' },
  { value: 3600,   label: '1 hour' },
  { value: 7200,   label: '2 hours' },
  { value: 14400,  label: '4 hours' },
  { value: 43200,  label: '12 hours' },
  { value: 86400,  label: '24 hours' },
  { value: 172800, label: '2 days' },
  { value: 259200, label: '3 days' },
  { value: 604800, label: '7 days' },
];

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const VERTICALS = ['Auto Detailing','Pressure Washing','Landscaping','HVAC','Plumbing','Electrical','Pest Control','Pool Cleaning','Mobile Mechanic','Junk Removal','Window Tint / PPF','Appliance Repair','Garage Door','Flooring / Epoxy','Commercial Fleet Wash','Other'];

function Section({ title, children }) {
  return (
    <div className="bss-section">
      <div className="bss-section-head">{title}</div>
      <div className="bss-section-body">{children}</div>
    </div>
  );
}

function SaveBar({ saving, saved, onSave, label = 'Save changes' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
      <button
        onClick={onSave}
        disabled={saving}
        className="btn-primary"
        style={{ opacity: saving ? .6 : 1 }}
      >
        {saving ? 'Saving…' : label}
      </button>
      {saved && (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13 }}>
            <path d="M3 8l3.5 3.5 6.5-7" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Saved
        </span>
      )}
    </div>
  );
}

export default function BusinessSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'settings';

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const [profile, setProfile] = useState({ business_name:'', phone:'', address:'', city:'', state:'', zip:'', website:'', description:'', timezone:'America/New_York', vertical:'', ein:'' });
  const [hours, setHours] = useState([]);
  const [closures, setClosures] = useState([]);
  const [newClosure, setNewClosure] = useState({ closure_date:'', name:'', is_emergency: false });
  const [services, setServices] = useState([]);
  const [newSvc, setNewSvc] = useState({ name:'', duration_minutes:60, buffer_minutes:15, price:'', description:'' });
  const [editingSvc, setEditingSvc] = useState(null);
  const [nsSettings, setNsSettings] = useState({
    grace_period_minutes: 15,
    require_arrival_photo: false,
    auto_declare: true,
    client_sms_template: '',
    tech_sms_template: '',
  });

  // Integrations tab state
  const [gbp, setGbp]                   = useState(null);
  const [gbpLoading, setGbpLoading]     = useState(false);
  const [gbpSyncing, setGbpSyncing]     = useState(false);
  const [gbpError, setGbpError]         = useState('');
  const [gbpLocations, setGbpLocations] = useState(null);   // null = not loaded
  const [gbpLocLoading, setGbpLocLoading] = useState(false);
  const [gbpLocSaving, setGbpLocSaving] = useState(false);
  const [rvSettings, setRvSettings] = useState({ enabled: true, delay_seconds: 3600, require_invoice_paid: false, exclude_cancelled: true });
  const [rvSaving, setRvSaving]     = useState(false);
  const [rvSaved, setRvSaved]       = useState(false);

  useEffect(() => {
    api.get('/no-show/settings').then(r => {
      const s = r.data;
      setNsSettings({
        grace_period_minutes:  s.grace_period_minutes ?? 15,
        require_arrival_photo: !!s.require_arrival_photo,
        auto_declare:          s.auto_declare !== false,
        client_sms_template:   s.client_sms_template || '',
        tech_sms_template:     s.tech_sms_template || '',
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setGbpLoading(true);
    api.get('/google-reviews/connection').then(r => setGbp(r.data)).catch(() => {}).finally(() => setGbpLoading(false));
    api.get('/review-settings').then(r => {
      const s = r.data;
      setRvSettings({
        enabled:              s.enabled !== false,
        delay_seconds:        s.delay_seconds ?? 3600,
        require_invoice_paid: !!s.require_invoice_paid,
        exclude_cancelled:    s.exclude_cancelled !== false,
      });
    }).catch(() => {});
  }, []);

  async function connectGoogle() {
    try {
      const r = await api.get('/google-reviews/auth');
      window.location.href = r.data.url;
    } catch { setGbpError('Could not start Google connection.'); }
  }

  async function disconnectGoogle() {
    if (!window.confirm('Disconnect Google Business Profile?')) return;
    try {
      await api.delete('/google-reviews/connection');
      setGbp(prev => ({ ...prev, status: 'disconnected' }));
    } catch { setGbpError('Failed to disconnect.'); }
  }

  async function syncNow() {
    setGbpSyncing(true);
    setGbpError('');
    try {
      await api.post('/google-reviews/sync');
      setGbp(prev => ({ ...prev, last_sync_at: new Date().toISOString(), last_sync_error: null }));
    } catch (err) { setGbpError(err?.response?.data?.error || 'Sync failed.'); }
    finally { setGbpSyncing(false); }
  }

  async function loadAvailableLocations() {
    setGbpLocLoading(true);
    setGbpError('');
    try {
      const r = await api.get('/google-reviews/locations/available');
      setGbpLocations(r.data.locations || []);
    } catch (err) {
      setGbpError(err?.response?.data?.error || 'Could not load locations.');
    } finally { setGbpLocLoading(false); }
  }

  async function selectLocation(loc) {
    setGbpLocSaving(true);
    setGbpError('');
    try {
      await api.post('/google-reviews/locations', {
        location_id:     loc.id,
        location_name:   loc.name,
        display_address: loc.address || null,
      });
      setGbp(prev => ({ ...prev, location_id: loc.id, location_name: loc.name }));
      setGbpLocations(null);
    } catch (err) {
      setGbpError(err?.response?.data?.error || 'Failed to select location.');
    } finally { setGbpLocSaving(false); }
  }

  async function saveReviewSettings() {
    setRvSaving(true);
    try {
      await api.put('/review-settings', rvSettings);
      setRvSaved(true);
      setTimeout(() => setRvSaved(false), 2500);
    } catch { setError('Failed to save review request settings.'); }
    finally { setRvSaving(false); }
  }

  useEffect(() => {
    api.get('/business-settings').then(r => {
      const d = r.data;
      if (d.profile) setProfile(p => ({ ...p, ...d.profile }));
      if (d.hours?.length) setHours(d.hours);
      setClosures(d.closures || []);
      setServices(d.services || []);
    }).catch(() => setError('Failed to load settings.'));
  }, []);

  function flashSaved(key) {
    setSaved(key);
    setTimeout(() => setSaved(''), 2500);
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await api.put('/business-settings/profile', profile);
      flashSaved('profile');
    } catch { setError('Failed to save profile.'); }
    finally { setSaving(false); }
  }

  async function saveHours() {
    setSaving(true);
    try {
      await api.put('/business-settings/hours', { hours });
      flashSaved('hours');
    } catch { setError('Failed to save hours.'); }
    finally { setSaving(false); }
  }

  async function addClosure() {
    if (!newClosure.closure_date || !newClosure.name) return;
    try {
      const r = await api.post('/business-settings/closures', newClosure);
      setClosures(c => [...c, r.data]);
      setNewClosure({ closure_date:'', name:'', is_emergency: false });
    } catch { setError('Failed to add closure.'); }
  }

  async function deleteClosure(id) {
    try {
      await api.delete(`/business-settings/closures/${id}`);
      setClosures(c => c.filter(x => x.id !== id));
    } catch { setError('Failed to delete.'); }
  }

  async function addService() {
    if (!newSvc.name) return;
    try {
      const r = await api.post('/business-settings/services', newSvc);
      setServices(s => [...s, r.data]);
      setNewSvc({ name:'', duration_minutes:60, buffer_minutes:15, price:'', description:'' });
    } catch { setError('Failed to create service.'); }
  }

  async function saveService(svc) {
    try {
      const r = await api.put(`/business-settings/services/${svc.id}`, svc);
      setServices(s => s.map(x => x.id === svc.id ? r.data : x));
      setEditingSvc(null);
    } catch { setError('Failed to save service.'); }
  }

  async function deleteService(id) {
    try {
      await api.delete(`/business-settings/services/${id}`);
      setServices(s => s.filter(x => x.id !== id));
    } catch { setError('Failed to delete service.'); }
  }

  async function saveNsSettings() {
    setSaving(true);
    try {
      await api.put('/no-show/settings', {
        ...nsSettings,
        grace_period_minutes: parseInt(nsSettings.grace_period_minutes) || 15,
        client_sms_template: nsSettings.client_sms_template || null,
        tech_sms_template:   nsSettings.tech_sms_template || null,
      });
      flashSaved('noshow');
    } catch { setError('Failed to save no-show settings.'); }
    finally { setSaving(false); }
  }

  // ── Dispatch / service-area settings ─────────────────────────────────────
  const [dispatchSettings, setDispatchSettings] = useState({
    dispatch_service_area_type:     'business_address',
    dispatch_center_lat:            '',
    dispatch_center_lng:            '',
    dispatch_default_zoom:          11,
    dispatch_service_radius_miles:  '',
    dispatch_preferred_postal_codes: '',
    dispatch_auto_fit_live_techs:   true,
    dispatch_auto_fit_today_jobs:   true,
    dispatch_include_scheduled:     true,
    dispatch_include_completed:     false,
    dispatch_include_cancelled:     false,
  });
  const [dsSaving, setDsSaving] = useState(false);
  const [dsSaved,  setDsSaved]  = useState(false);

  // KPI card settings (stored in dispatch_settings table)
  const [kpiSettings, setKpiSettings] = useState({
    kpi_show_live_techs:           true,
    kpi_show_active_jobs:          true,
    kpi_show_todays_jobs:          true,
    kpi_show_completed_today:      true,
    kpi_show_avg_response:         true,
    kpi_response_tracking_enabled: false,
    kpi_response_start_event:      'scheduled_at',
    kpi_response_end_event:        'checkin_at',
    kpi_response_outlier_minutes:  1440,
    kpi_response_min_sample_size:  1,
    kpi_adaptive_kpis_enabled:     true,
    kpi_fixed_layout:              false,
    kpi_fifth_preference:          'average_response',
  });
  const [kpiSaving, setKpiSaving] = useState(false);
  const [kpiSaved,  setKpiSaved]  = useState(false);

  useEffect(() => {
    if (tab !== 'dispatch') return;
    api.get('/dispatch-settings').then(r => {
      const s = r.data.settings || {};
      setDispatchSettings({
        dispatch_service_area_type:     s.dispatch_service_area_type     || 'business_address',
        dispatch_center_lat:            s.dispatch_center_lat            != null ? String(s.dispatch_center_lat) : '',
        dispatch_center_lng:            s.dispatch_center_lng            != null ? String(s.dispatch_center_lng) : '',
        dispatch_default_zoom:          s.dispatch_default_zoom          ?? 11,
        dispatch_service_radius_miles:  s.dispatch_service_radius_miles  != null ? String(s.dispatch_service_radius_miles) : '',
        dispatch_preferred_postal_codes: Array.isArray(s.dispatch_preferred_postal_codes)
          ? s.dispatch_preferred_postal_codes.join('\n')
          : (s.dispatch_preferred_postal_codes || ''),
        dispatch_auto_fit_live_techs:   s.dispatch_auto_fit_live_techs  !== false,
        dispatch_auto_fit_today_jobs:   s.dispatch_auto_fit_today_jobs  !== false,
        dispatch_include_scheduled:     s.dispatch_include_scheduled    !== false,
        dispatch_include_completed:     !!s.dispatch_include_completed,
        dispatch_include_cancelled:     !!s.dispatch_include_cancelled,
      });
      setKpiSettings({
        kpi_show_live_techs:           s.kpi_show_live_techs           !== false,
        kpi_show_active_jobs:          s.kpi_show_active_jobs          !== false,
        kpi_show_todays_jobs:          s.kpi_show_todays_jobs          !== false,
        kpi_show_completed_today:      s.kpi_show_completed_today      !== false,
        kpi_show_avg_response:         s.kpi_show_avg_response         !== false,
        kpi_response_tracking_enabled: !!s.kpi_response_tracking_enabled,
        kpi_response_start_event:      s.kpi_response_start_event      || 'scheduled_at',
        kpi_response_end_event:        s.kpi_response_end_event        || 'checkin_at',
        kpi_response_outlier_minutes:  s.kpi_response_outlier_minutes  ?? 1440,
        kpi_response_min_sample_size:  s.kpi_response_min_sample_size  ?? 1,
        kpi_adaptive_kpis_enabled:     s.kpi_adaptive_kpis_enabled     !== false,
        kpi_fixed_layout:              !!s.kpi_fixed_layout,
        kpi_fifth_preference:          s.kpi_fifth_preference          || 'average_response',
      });
    }).catch(() => {});
  }, [tab]);

  async function saveKpiSettings() {
    setKpiSaving(true);
    try {
      await api.put('/dispatch-settings', {
        ...kpiSettings,
        kpi_response_outlier_minutes: parseInt(kpiSettings.kpi_response_outlier_minutes, 10) || 1440,
        kpi_response_min_sample_size: parseInt(kpiSettings.kpi_response_min_sample_size, 10) || 1,
      });
      setKpiSaved(true);
      setTimeout(() => setKpiSaved(false), 2500);
    } catch { setError('Failed to save KPI settings.'); }
    finally { setKpiSaving(false); }
  }

  async function saveDispatchSettings() {
    setDsSaving(true);
    try {
      const postalCodes = dispatchSettings.dispatch_preferred_postal_codes
        ? dispatchSettings.dispatch_preferred_postal_codes
            .split(/[\n,]+/)
            .map(p => p.trim())
            .filter(Boolean)
        : null;

      await api.put('/dispatch-settings', {
        dispatch_service_area_type:    dispatchSettings.dispatch_service_area_type,
        dispatch_center_lat:           dispatchSettings.dispatch_center_lat !== '' ? parseFloat(dispatchSettings.dispatch_center_lat) : null,
        dispatch_center_lng:           dispatchSettings.dispatch_center_lng !== '' ? parseFloat(dispatchSettings.dispatch_center_lng) : null,
        dispatch_default_zoom:         parseInt(dispatchSettings.dispatch_default_zoom, 10) || 11,
        dispatch_service_radius_miles: dispatchSettings.dispatch_service_radius_miles !== '' ? parseFloat(dispatchSettings.dispatch_service_radius_miles) : null,
        dispatch_preferred_postal_codes: postalCodes,
        dispatch_auto_fit_live_techs:  dispatchSettings.dispatch_auto_fit_live_techs,
        dispatch_auto_fit_today_jobs:  dispatchSettings.dispatch_auto_fit_today_jobs,
        dispatch_include_scheduled:    dispatchSettings.dispatch_include_scheduled,
        dispatch_include_completed:    dispatchSettings.dispatch_include_completed,
        dispatch_include_cancelled:    dispatchSettings.dispatch_include_cancelled,
      });
      setDsSaved(true);
      setTimeout(() => setDsSaved(false), 2500);
    } catch { setError('Failed to save dispatch settings.'); }
    finally { setDsSaving(false); }
  }

  const bssInput = { width: '100%', padding: '8px 10px', border: '1px solid var(--lightgray)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: 'var(--white)', color: 'var(--navy)', boxSizing: 'border-box' };
  const bssLabel = { fontSize: 11, fontWeight: 600, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 4 };

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--lightgray)', marginBottom: 24 }}>
        {[['settings','Settings'],['integrations','Integrations'],['dispatch','Service Area']].map(([key, label]) => (
          <button key={key}
            onClick={() => setSearchParams({ tab: key })}
            style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: tab === key ? '2px solid var(--navy)' : '2px solid transparent',
              marginBottom: -2, fontWeight: 700, fontSize: 13, color: tab === key ? 'var(--navy)' : 'var(--steel)', cursor: 'pointer', transition: 'color .12s' }}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'var(--red-lt)', border: '1px solid #FFCDD2', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── INTEGRATIONS TAB ── */}
      {tab === 'integrations' && (
        <div>
          {/* Google Business Profile */}
          <Section title="Google Business Profile">
            {gbpLoading ? (
              <div style={{ color: 'var(--steel)', fontSize: 13 }}>Loading…</div>
            ) : gbp?.status === 'connected' ? (
              <div>
                {/* Status row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>
                      {gbp.location_name || 'Google Business Profile'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>
                      Last synced: {gbp.last_sync_at ? new Date(gbp.last_sync_at).toLocaleString() : 'Never'}
                      {gbp.average_rating != null && (
                        <span style={{ marginLeft: 12 }}>Rating: {parseFloat(gbp.average_rating).toFixed(1)} / 5 ({gbp.total_reviews} review{gbp.total_reviews !== 1 ? 's' : ''})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* No location selected — prompt user to pick one */}
                {!gbp.location_id && (
                  <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e', marginBottom: 14 }}>
                    No location selected — choose your business location to start syncing reviews.
                  </div>
                )}

                {/* Location picker (loaded on demand) */}
                {gbpLocations !== null && (
                  <div style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--offwhite)', borderRadius: 8, border: '1px solid var(--lightgray)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', marginBottom: 10 }}>Select your business location</div>
                    {gbpLocLoading ? (
                      <div style={{ fontSize: 13, color: 'var(--steel)' }}>Loading locations…</div>
                    ) : gbpLocations.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--steel)' }}>No locations found. Make sure your Google account has a Business Profile.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {gbpLocations.map(loc => (
                          <button
                            key={loc.id}
                            onClick={() => selectLocation(loc)}
                            disabled={gbpLocSaving}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                              background: loc.is_active ? 'var(--green-lt)' : 'var(--white)',
                              border: `1px solid ${loc.is_active ? 'var(--green)' : 'var(--lightgray)'}`,
                              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: loc.is_active ? 'var(--green)' : 'var(--lightgray)', marginTop: 4, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{loc.name}</div>
                              {loc.address && <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>{loc.address}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => setGbpLocations(null)}
                      style={{ marginTop: 10, fontSize: 12, color: 'var(--steel)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {gbp.last_sync_error && (
                  <div style={{ padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, fontSize: 12, color: '#9a3412', marginBottom: 12 }}>
                    Last sync error: {gbp.last_sync_error}
                  </div>
                )}
                {gbpError && <div style={{ padding: '8px 12px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>{gbpError}</div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {gbp.location_id && (
                    <button className="btn-primary" style={{ fontSize: 13 }} onClick={syncNow} disabled={gbpSyncing}>
                      {gbpSyncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                  )}
                  <button className="bss-btn-ghost" onClick={() => { loadAvailableLocations(); }} disabled={gbpLocLoading}>
                    {gbp.location_id ? 'Change Location' : 'Select Location'}
                  </button>
                  <button className="bss-btn-ghost" onClick={disconnectGoogle}>Disconnect</button>
                </div>
              </div>
            ) : gbp?.status === 'expired' ? (
              <div>
                <div style={{ padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 13, color: '#9a3412', marginBottom: 14 }}>
                  Your Google connection has expired. Reconnect to resume syncing reviews.
                </div>
                {gbpError && <div style={{ padding: '8px 12px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>{gbpError}</div>}
                <button className="btn-primary" style={{ fontSize: 13 }} onClick={connectGoogle}>Reconnect Google</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.6, marginBottom: 16 }}>
                  Connect your Google Business Profile to automatically sync reviews, display your rating on the Dashboard, and send review request links to clients after completed jobs.
                </div>
                {gbpError && <div style={{ padding: '8px 12px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>{gbpError}</div>}
                <button className="btn-primary" style={{ fontSize: 13 }} onClick={connectGoogle}>Connect Google Business Profile</button>
              </div>
            )}
          </Section>

          {/* Review Request Settings */}
          <Section title="Review Request Settings">
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
                <input type="checkbox" checked={rvSettings.enabled}
                  onChange={e => setRvSettings(s => ({ ...s, enabled: e.target.checked }))} />
                <div>
                  <div style={{ fontWeight: 600 }}>Enable review requests</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>Send a review link to clients after their job is completed.</div>
                </div>
              </label>
            </div>
            <div style={{ opacity: rvSettings.enabled ? 1 : 0.45, pointerEvents: rvSettings.enabled ? 'auto' : 'none' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={bssLabel}>Send review request</label>
                <select style={bssInput} value={rvSettings.delay_seconds}
                  onChange={e => setRvSettings(s => ({ ...s, delay_seconds: parseInt(e.target.value) }))}>
                  {DELAY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} after job completion</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
                  <input type="checkbox" checked={rvSettings.require_invoice_paid}
                    onChange={e => setRvSettings(s => ({ ...s, require_invoice_paid: e.target.checked }))} />
                  Only send after invoice is paid
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
                  <input type="checkbox" checked={rvSettings.exclude_cancelled}
                    onChange={e => setRvSettings(s => ({ ...s, exclude_cancelled: e.target.checked }))} />
                  Skip cancelled jobs
                </label>
              </div>
            </div>
            <SaveBar saving={rvSaving} saved={rvSaved} onSave={saveReviewSettings} label="Save review settings" />
          </Section>
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === 'settings' && (
        <div>
      {/* ── Business Information ── */}
      <Section title="Business Information">
        <div className="bss-grid-2">
          <div className="bss-field">
            <label className="bss-label mt0">Business Name</label>
            <input className="bss-input" value={profile.business_name || ''} onChange={e => setProfile(p => ({...p, business_name: e.target.value}))} placeholder="KMC Auto Spa" />
          </div>
          <div className="bss-field">
            <label className="bss-label mt0">Business Phone</label>
            <input className="bss-input" value={profile.phone || ''} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} placeholder="(813) 555-0100" />
          </div>
          <div className="bss-field bss-span2">
            <label className="bss-label">Street Address</label>
            <AddressAutocomplete
              value={profile.address || ''}
              onChange={v => setProfile(p => ({ ...p, address: v }))}
              onPlace={({ street, city, state, zip, lat, lng }) =>
                setProfile(p => ({ ...p, address: street, city, state, zip, lat: lat || p.lat, lng: lng || p.lng }))
              }
              placeholder="123 Main St"
              className="bss-input"
            />
          </div>
          <div className="bss-field">
            <label className="bss-label">City</label>
            <input className="bss-input" value={profile.city || ''} onChange={e => setProfile(p => ({...p, city: e.target.value}))} placeholder="Tampa" />
          </div>
          <div className="bss-field">
            <div className="bss-grid-2-2">
              <div>
                <label className="bss-label">State</label>
                <input className="bss-input" value={profile.state || ''} onChange={e => setProfile(p => ({...p, state: e.target.value}))} placeholder="FL" maxLength={2} />
              </div>
              <div>
                <label className="bss-label">ZIP</label>
                <input className="bss-input" value={profile.zip || ''} onChange={e => setProfile(p => ({...p, zip: e.target.value}))} placeholder="33601" />
              </div>
            </div>
          </div>
          <div className="bss-field">
            <label className="bss-label">Website</label>
            <input className="bss-input" value={profile.website || ''} onChange={e => setProfile(p => ({...p, website: e.target.value}))} placeholder="https://kmcautospa.com" />
          </div>
          <div className="bss-field">
            <label className="bss-label">Service Vertical</label>
            <select className="bss-input" value={profile.vertical || ''} onChange={e => setProfile(p => ({...p, vertical: e.target.value}))}>
              <option value="">Select vertical…</option>
              {VERTICALS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="bss-field">
            <label className="bss-label">Timezone</label>
            <select className="bss-input" value={profile.timezone || 'America/New_York'} onChange={e => setProfile(p => ({...p, timezone: e.target.value}))}>
              {TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
            </select>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--steel)', lineHeight: 1.4 }}>
              Used to schedule and display job times across your team. Changing this affects <em>future</em> scheduling only — existing jobs are stored in UTC and are not shifted.
            </p>
          </div>
          <div className="bss-field bss-span2">
            <label className="bss-label">Business Description <span style={{ fontFamily: 'Inter', textTransform: 'none', letterSpacing: 0, fontSize: 11, color: 'var(--steel)' }}>(optional)</span></label>
            <textarea className="bss-input" style={{ height: 84, resize: 'vertical' }} value={profile.description || ''} onChange={e => setProfile(p => ({...p, description: e.target.value}))} placeholder="Brief description for your booking page…" />
          </div>
        </div>
        <SaveBar saving={saving} saved={saved === 'profile'} onSave={saveProfile} />
      </Section>

      {/* ── Hours of Operation ── */}
      <Section title="Hours of Operation">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(hours.length ? hours : [0,1,2,3,4,5,6].map(d => ({ day_of_week:d, open_time:'08:00', close_time:'17:00', is_closed: d===0||d===6 }))).map((h, i) => (
            <div key={h.day_of_week} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 120px', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{DAYS[h.day_of_week]}</div>
              <input type="time" className="bss-input" style={{ opacity: h.is_closed ? .35 : 1 }} value={h.open_time || '08:00'} disabled={h.is_closed}
                onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, open_time: e.target.value} : x))} />
              <input type="time" className="bss-input" style={{ opacity: h.is_closed ? .35 : 1 }} value={h.close_time || '17:00'} disabled={h.is_closed}
                onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, close_time: e.target.value} : x))} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--slate)' }}>
                <input type="checkbox" checked={!!h.is_closed} onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, is_closed: e.target.checked} : x))} />
                Closed
              </label>
            </div>
          ))}
        </div>
        <SaveBar saving={saving} saved={saved === 'hours'} onSave={saveHours} />
      </Section>

      {/* ── Closures & Holidays ── */}
      <Section title="Closures &amp; Holidays">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {closures.length === 0 && <div style={{ fontSize: 13, color: 'var(--steel)' }}>No closures added yet.</div>}
          {closures.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: c.is_emergency ? 'var(--red-lt)' : 'var(--off)',
              border: `1px solid ${c.is_emergency ? '#FFCDD2' : 'var(--lightgray)'}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--steel)' }}>{c.closure_date}{c.is_emergency ? ' · Emergency closure' : ''}</div>
              </div>
              <button onClick={() => deleteClosure(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 100px', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="bss-label mt0">Date</label>
            <input type="date" className="bss-input" value={newClosure.closure_date} onChange={e => setNewClosure(c => ({...c, closure_date: e.target.value}))} />
          </div>
          <div>
            <label className="bss-label mt0">Name</label>
            <input className="bss-input" value={newClosure.name} onChange={e => setNewClosure(c => ({...c, name: e.target.value}))} placeholder="Memorial Day" />
          </div>
          <div style={{ paddingTop: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--slate)' }}>
              <input type="checkbox" checked={newClosure.is_emergency} onChange={e => setNewClosure(c => ({...c, is_emergency: e.target.checked}))} />
              Emergency
            </label>
          </div>
          <button onClick={addClosure} className="btn-primary" style={{ padding: '9px 0' }}>Add</button>
        </div>
      </Section>

      {/* ── Service Templates ── */}
      <Section title="Service Templates">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {services.length === 0 && <div style={{ fontSize: 13, color: 'var(--steel)' }}>No service templates yet. Add your first one below.</div>}
          {services.map(svc => (
            <div key={svc.id}>
              {editingSvc?.id === svc.id ? (
                <div style={{ background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label className="bss-label mt0">Name</label>
                      <input className="bss-input" value={editingSvc.name} onChange={e => setEditingSvc(s => ({...s, name: e.target.value}))} />
                    </div>
                    <div>
                      <label className="bss-label mt0">Duration (min)</label>
                      <input type="number" className="bss-input" value={editingSvc.duration_minutes} onChange={e => setEditingSvc(s => ({...s, duration_minutes: parseInt(e.target.value)||60}))} />
                    </div>
                    <div>
                      <label className="bss-label mt0">Buffer (min)</label>
                      <input type="number" className="bss-input" value={editingSvc.buffer_minutes} onChange={e => setEditingSvc(s => ({...s, buffer_minutes: parseInt(e.target.value)||0}))} />
                    </div>
                    <div>
                      <label className="bss-label mt0">Price ($)</label>
                      <input type="number" className="bss-input" value={editingSvc.price || ''} onChange={e => setEditingSvc(s => ({...s, price: e.target.value}))} placeholder="0.00" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveService(editingSvc)} className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }}>Save</button>
                    <button onClick={() => setEditingSvc(null)} className="btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{svc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>
                      {svc.duration_minutes}min + {svc.buffer_minutes}min buffer
                      {svc.price ? ` · $${parseFloat(svc.price).toFixed(2)}` : ''}
                    </div>
                  </div>
                  <button onClick={() => setEditingSvc({...svc})} className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>Edit</button>
                  <button onClick={() => deleteService(svc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add service form */}
        <div style={{ background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--navy)', marginBottom: 12 }}>
            Add Service Template
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label className="bss-label mt0">Name</label>
              <input className="bss-input" value={newSvc.name} onChange={e => setNewSvc(s => ({...s, name: e.target.value}))} placeholder="Full Detail" />
            </div>
            <div>
              <label className="bss-label mt0">Duration (min)</label>
              <input type="number" className="bss-input" value={newSvc.duration_minutes} onChange={e => setNewSvc(s => ({...s, duration_minutes: parseInt(e.target.value)||60}))} />
            </div>
            <div>
              <label className="bss-label mt0">Buffer (min)</label>
              <input type="number" className="bss-input" value={newSvc.buffer_minutes} onChange={e => setNewSvc(s => ({...s, buffer_minutes: parseInt(e.target.value)||0}))} />
            </div>
            <div>
              <label className="bss-label mt0">Price ($)</label>
              <input type="number" className="bss-input" value={newSvc.price} onChange={e => setNewSvc(s => ({...s, price: e.target.value}))} placeholder="150.00" />
            </div>
          </div>
          <button onClick={addService} className="btn-primary" style={{ fontSize: 13 }}>Add service</button>
        </div>
      </Section>

      {/* ── Tax & Legal ── */}
      <Section title="Tax &amp; Legal">
        <div className="bss-grid-2">
          <div className="bss-field">
            <label className="bss-label mt0">EIN / Employer ID Number</label>
            <input className="bss-input" value={profile.ein || ''} onChange={e => setProfile(p => ({...p, ein: e.target.value}))} placeholder="XX-XXXXXXX" />
            <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 5 }}>Used for 1099 reporting and payment processing setup.</div>
          </div>
          <div className="bss-field">
            <label className="bss-label mt0">Business Legal Name</label>
            <input className="bss-input" value={profile.business_name || ''} onChange={e => setProfile(p => ({...p, business_name: e.target.value}))} placeholder="KMC Auto Spa LLC" />
          </div>
          <div className="bss-field">
            <label className="bss-label">State of Incorporation</label>
            <input className="bss-input" value={profile.state || ''} onChange={e => setProfile(p => ({...p, state: e.target.value}))} placeholder="DE" maxLength={2} />
          </div>
        </div>

        <div style={{ background: 'var(--sand-lt)', border: '1px solid #E8D5B8', borderRadius: 8, padding: '12px 14px', marginTop: 16, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>1099 Contractor Settings</div>
          <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            Contractor tax classification is managed per technician in the <strong>Team</strong> section. Mark each technician as Employee or 1099 Contractor and enter their Tax ID for year-end reporting.
          </div>
        </div>
        <div style={{ background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Platform Fee</div>
          <div style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            FieldCore charges a <strong>1% platform fee</strong> on all payments processed through the platform. This is deducted before funds are transferred to your Stripe account. Standard Stripe fees (2.9% + 30¢) also apply.
          </div>
        </div>
        <SaveBar saving={saving} saved={saved === 'profile'} onSave={saveProfile} label="Save tax settings" />
      </Section>

      {/* ── No-Show Clock ── */}
      <Section title="No-Show Clock">
        <div className="bss-grid-2" style={{ marginBottom: 16 }}>
          <div className="bss-field">
            <label className="bss-label mt0">Grace Period</label>
            <select className="bss-input" value={nsSettings.grace_period_minutes}
              onChange={e => setNsSettings(s => ({ ...s, grace_period_minutes: parseInt(e.target.value) }))}>
              {[5, 10, 15, 20, 30].map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 5 }}>How long the tech waits before a no-show can be declared.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', paddingTop: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
              <input type="checkbox" checked={nsSettings.auto_declare}
                onChange={e => setNsSettings(s => ({ ...s, auto_declare: e.target.checked }))} />
              Auto-declare no-show when timer expires
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
              <input type="checkbox" checked={nsSettings.require_arrival_photo}
                onChange={e => setNsSettings(s => ({ ...s, require_arrival_photo: e.target.checked }))} />
              Require photo proof of arrival to start clock
            </label>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="bss-label mt0">Custom Client SMS Template</label>
          <textarea
            className="bss-input"
            style={{ height: 72, resize: 'vertical' }}
            value={nsSettings.client_sms_template}
            onChange={e => setNsSettings(s => ({ ...s, client_sms_template: e.target.value }))}
            placeholder="Leave blank to use default. Use {minutes} and {amount} as placeholders."
          />
          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>Variables: <code>{'{minutes}'}</code> = grace period, <code>{'{amount}'}</code> = deposit amount</div>
        </div>
        <div style={{ marginBottom: 4 }}>
          <label className="bss-label mt0">Custom Technician SMS Template</label>
          <textarea
            className="bss-input"
            style={{ height: 72, resize: 'vertical' }}
            value={nsSettings.tech_sms_template}
            onChange={e => setNsSettings(s => ({ ...s, tech_sms_template: e.target.value }))}
            placeholder="Leave blank to use default. Use {client_name}, {address}, {amount} as placeholders."
          />
          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>Variables: <code>{'{client_name}'}</code>, <code>{'{address}'}</code>, <code>{'{amount}'}</code></div>
        </div>
        <SaveBar saving={saving} saved={saved === 'noshow'} onSave={saveNsSettings} label="Save no-show settings" />
      </Section>
        </div>
      )}

      {/* ── DISPATCH / SERVICE AREA TAB ── */}
      {tab === 'dispatch' && (
        <div>
          <Section title="Default Map Viewport">
            <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 14, lineHeight: 1.5 }}>
              Controls where the Dispatch map opens when there are no active technicians or jobs.
              When live data exists, the map always fits to your active field.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={bssLabel}>Service Area Type</label>
              <select
                style={bssInput}
                value={dispatchSettings.dispatch_service_area_type}
                onChange={e => setDispatchSettings(s => ({ ...s, dispatch_service_area_type: e.target.value }))}
              >
                <option value="business_address">Business Address (default)</option>
                <option value="radius">Radius around a point</option>
                <option value="postal_codes">Postal / ZIP codes</option>
                <option value="custom_center">Custom center + zoom</option>
              </select>
            </div>

            {/* Radius and Custom Center: show lat/lng */}
            {(dispatchSettings.dispatch_service_area_type === 'radius' ||
              dispatchSettings.dispatch_service_area_type === 'custom_center') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={bssLabel}>Center Latitude</label>
                  <input
                    type="number" step="0.000001" min="-90" max="90"
                    style={bssInput}
                    placeholder="e.g. 25.7617"
                    value={dispatchSettings.dispatch_center_lat}
                    onChange={e => setDispatchSettings(s => ({ ...s, dispatch_center_lat: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={bssLabel}>Center Longitude</label>
                  <input
                    type="number" step="0.000001" min="-180" max="180"
                    style={bssInput}
                    placeholder="e.g. -80.1918"
                    value={dispatchSettings.dispatch_center_lng}
                    onChange={e => setDispatchSettings(s => ({ ...s, dispatch_center_lng: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Radius */}
            {dispatchSettings.dispatch_service_area_type === 'radius' && (
              <div style={{ marginBottom: 14 }}>
                <label style={bssLabel}>Service Radius (miles)</label>
                <input
                  type="number" min="1" max="5000" step="1"
                  style={{ ...bssInput, maxWidth: 160 }}
                  placeholder="e.g. 50"
                  value={dispatchSettings.dispatch_service_radius_miles}
                  onChange={e => setDispatchSettings(s => ({ ...s, dispatch_service_radius_miles: e.target.value }))}
                />
              </div>
            )}

            {/* Postal codes */}
            {dispatchSettings.dispatch_service_area_type === 'postal_codes' && (
              <div style={{ marginBottom: 14 }}>
                <label style={bssLabel}>Preferred ZIP / Postal Codes</label>
                <textarea
                  style={{ ...bssInput, height: 100, resize: 'vertical' }}
                  placeholder={"One per line or comma-separated\ne.g.\n33101\n33102\n33103"}
                  value={dispatchSettings.dispatch_preferred_postal_codes}
                  onChange={e => setDispatchSettings(s => ({ ...s, dispatch_preferred_postal_codes: e.target.value }))}
                />
                <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
                  When no live technicians or jobs exist, the map will center on your configured default
                  center and zoom rather than geocoding each ZIP on every page load.
                </div>
              </div>
            )}

            {/* Default zoom — shown for custom_center and postal_codes */}
            {(dispatchSettings.dispatch_service_area_type === 'custom_center' ||
              dispatchSettings.dispatch_service_area_type === 'postal_codes') && (
              <div style={{ marginBottom: 14 }}>
                <label style={bssLabel}>Default Zoom Level (1–22)</label>
                <input
                  type="number" min="1" max="22" step="1"
                  style={{ ...bssInput, maxWidth: 100 }}
                  value={dispatchSettings.dispatch_default_zoom}
                  onChange={e => setDispatchSettings(s => ({ ...s, dispatch_default_zoom: e.target.value }))}
                />
                <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
                  11 = city view · 13 = neighborhood · 15 = street level
                </div>
              </div>
            )}

            {dispatchSettings.dispatch_service_area_type === 'business_address' && (
              <div style={{ padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, color: '#0369a1', lineHeight: 1.5 }}>
                The map will open centered on your business address coordinates.
                Make sure your address is saved in the <button onClick={() => setSearchParams({ tab: 'settings' })}
                  style={{ background: 'none', border: 'none', color: '#0369a1', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 }}>
                  Settings tab
                </button>.
              </div>
            )}
          </Section>

          <Section title="Auto-Fit Behavior">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['dispatch_auto_fit_live_techs', 'Auto-fit to live technician locations'],
                ['dispatch_auto_fit_today_jobs', "Auto-fit to today's job locations"],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
                  <input
                    type="checkbox"
                    checked={!!dispatchSettings[key]}
                    onChange={e => setDispatchSettings(s => ({ ...s, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Job Status Inclusion">
            <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 10, lineHeight: 1.5 }}>
              Choose which job statuses appear on the Dispatch map.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['dispatch_include_scheduled', 'Scheduled jobs (default on)'],
                ['dispatch_include_completed', 'Completed jobs (default off)'],
                ['dispatch_include_cancelled', 'Cancelled / no-show jobs (default off)'],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
                  <input
                    type="checkbox"
                    checked={!!dispatchSettings[key]}
                    onChange={e => setDispatchSettings(s => ({ ...s, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Section>

          <SaveBar saving={dsSaving} saved={dsSaved} onSave={saveDispatchSettings} label="Save dispatch settings" />

          {/* ── KPI Cards ── */}
          <Section title="KPI Cards">
            <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 14, lineHeight: 1.5 }}>
              Choose which metrics appear in the five KPI cards at the top of the Dispatch page.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              {[
                ['kpi_show_live_techs',      'Live Technicians — techs with a recent GPS check-in'],
                ['kpi_show_active_jobs',     'Active Jobs — jobs currently in progress or paused'],
                ['kpi_show_todays_jobs',     "Today's Jobs — all jobs scheduled for today"],
                ['kpi_show_completed_today', 'Completed Today — jobs completed during today'],
                ['kpi_show_avg_response',    'Avg Response Time — time from dispatch to technician arrival'],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)', lineHeight: 1.4 }}>
                  <input
                    type="checkbox"
                    checked={!!kpiSettings[key]}
                    onChange={e => setKpiSettings(s => ({ ...s, [key]: e.target.checked }))}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* Average Response sub-settings */}
            <div style={{ background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--navy)', marginBottom: 10 }}>
                Average Response Time
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={!!kpiSettings.kpi_response_tracking_enabled}
                  onChange={e => setKpiSettings(s => ({ ...s, kpi_response_tracking_enabled: e.target.checked }))}
                />
                Enable response time tracking
              </label>

              <div style={{ opacity: kpiSettings.kpi_response_tracking_enabled ? 1 : 0.45, pointerEvents: kpiSettings.kpi_response_tracking_enabled ? 'auto' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={bssLabel}>Start event</label>
                    <select style={bssInput} value={kpiSettings.kpi_response_start_event}
                      onChange={e => setKpiSettings(s => ({ ...s, kpi_response_start_event: e.target.value }))}>
                      <option value="scheduled_at">Job scheduled time</option>
                      <option value="checkin_at">Tech check-in</option>
                      <option value="created_at">Job created time</option>
                    </select>
                  </div>
                  <div>
                    <label style={bssLabel}>End event</label>
                    <select style={bssInput} value={kpiSettings.kpi_response_end_event}
                      onChange={e => setKpiSettings(s => ({ ...s, kpi_response_end_event: e.target.value }))}>
                      <option value="checkin_at">Tech check-in</option>
                      <option value="scheduled_at">Job scheduled time</option>
                      <option value="created_at">Job created time</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={bssLabel}>Outlier threshold (minutes)</label>
                    <input
                      type="number" min="30" max="10080" step="30"
                      style={bssInput}
                      value={kpiSettings.kpi_response_outlier_minutes}
                      onChange={e => setKpiSettings(s => ({ ...s, kpi_response_outlier_minutes: e.target.value }))}
                    />
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
                      Jobs with response times above this limit are excluded. Default: 1440 (24 h).
                    </div>
                  </div>
                  <div>
                    <label style={bssLabel}>Minimum sample size</label>
                    <input
                      type="number" min="1" max="100" step="1"
                      style={bssInput}
                      value={kpiSettings.kpi_response_min_sample_size}
                      onChange={e => setKpiSettings(s => ({ ...s, kpi_response_min_sample_size: e.target.value }))}
                    />
                    <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
                      Minimum completed jobs required before showing the metric. Default: 1.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Adaptive KPI layout */}
            <div style={{ background: 'var(--off)', border: '1px solid var(--lightgray)', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--navy)', marginBottom: 10 }}>
                Layout
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)', lineHeight: 1.4 }}>
                  <input
                    type="checkbox"
                    checked={!!kpiSettings.kpi_adaptive_kpis_enabled}
                    onChange={e => setKpiSettings(s => ({ ...s, kpi_adaptive_kpis_enabled: e.target.checked }))}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span>
                    <strong>Adaptive KPIs</strong> — automatically reorder cards based on your team size and available data
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--navy)', lineHeight: 1.4 }}>
                  <input
                    type="checkbox"
                    checked={!!kpiSettings.kpi_fixed_layout}
                    onChange={e => setKpiSettings(s => ({ ...s, kpi_fixed_layout: e.target.checked }))}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span>
                    <strong>Fixed layout</strong> — always show cards in the order above, no automatic substitutions
                  </span>
                </label>
              </div>

              <div>
                <label style={bssLabel}>Fifth card preference</label>
                <select style={{ ...bssInput, maxWidth: 280 }} value={kpiSettings.kpi_fifth_preference}
                  onChange={e => setKpiSettings(s => ({ ...s, kpi_fifth_preference: e.target.value }))}>
                  <option value="average_response">Average Response Time</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 4 }}>
                  When adaptive mode replaces the fifth slot, this metric is preferred.
                </div>
              </div>
            </div>

            <SaveBar saving={kpiSaving} saved={kpiSaved} onSave={saveKpiSettings} label="Save KPI settings" />
          </Section>
        </div>
      )}
    </div>
  );
}
