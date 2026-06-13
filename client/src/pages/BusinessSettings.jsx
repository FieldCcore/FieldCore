import React, { useState, useEffect } from 'react';
import api from '../api';
import AddressAutocomplete from '../components/AddressAutocomplete';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TIMEZONES = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu'];
const VERTICALS = ['Auto Detailing','Pressure Washing','Landscaping','HVAC','Plumbing','Electrical','Pest Control','Pool Cleaning','Mobile Mechanic','Junk Removal','Window Tint / PPF','Appliance Repair','Garage Door','Flooring / Epoxy','Commercial Fleet Wash','Other'];

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #E6E6E6',
  borderRadius: 8, fontSize: 14, color: '#1C2333', outline: 'none',
  background: 'white', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
};
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#8A90A2', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' };

function Section({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E6E6E6', padding: 28, marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1C2333', marginBottom: 20 }}>{title}</div>
      {children}
    </div>
  );
}

function SaveBar({ saving, saved, onSave, label = 'Save changes' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
      <button onClick={onSave} disabled={saving} style={{ padding: '9px 22px', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : label}
      </button>
      {saved && (
        <span style={{ fontSize: 13, color: '#1E6B3C', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }}>
            <path d="M3 8l3.5 3.5 6.5-7" stroke="#1E6B3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Saved
        </span>
      )}
    </div>
  );
}

export default function BusinessSettings() {
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

  return (
    <div>
      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#C62828', marginBottom: 16 }}>{error}</div>}

      <Section title="Business Information">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Business Name</label>
            <input style={inputStyle} value={profile.business_name || ''} onChange={e => setProfile(p => ({...p, business_name: e.target.value}))} placeholder="KMC Auto Spa" />
          </div>
          <div>
            <label style={labelStyle}>Business Phone</label>
            <input style={inputStyle} value={profile.phone || ''} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} placeholder="(813) 555-0100" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Street Address</label>
            <AddressAutocomplete
              value={profile.address || ''}
              onChange={v => setProfile(p => ({ ...p, address: v }))}
              onPlace={({ street, city, state, zip, lat, lng }) =>
                setProfile(p => ({ ...p, address: street, city, state, zip, lat: lat || p.lat, lng: lng || p.lng }))
              }
              placeholder="123 Main St"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>City</label>
            <input style={inputStyle} value={profile.city || ''} onChange={e => setProfile(p => ({...p, city: e.target.value}))} placeholder="Tampa" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>State</label>
              <input style={inputStyle} value={profile.state || ''} onChange={e => setProfile(p => ({...p, state: e.target.value}))} placeholder="FL" maxLength={2} />
            </div>
            <div>
              <label style={labelStyle}>ZIP</label>
              <input style={inputStyle} value={profile.zip || ''} onChange={e => setProfile(p => ({...p, zip: e.target.value}))} placeholder="33601" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input style={inputStyle} value={profile.website || ''} onChange={e => setProfile(p => ({...p, website: e.target.value}))} placeholder="https://kmcautospa.com" />
          </div>
          <div>
            <label style={labelStyle}>Service Vertical</label>
            <select style={inputStyle} value={profile.vertical || ''} onChange={e => setProfile(p => ({...p, vertical: e.target.value}))}>
              <option value="">Select vertical…</option>
              {VERTICALS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Timezone</label>
            <select style={inputStyle} value={profile.timezone || 'America/New_York'} onChange={e => setProfile(p => ({...p, timezone: e.target.value}))}>
              {TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Business Description (optional)</label>
            <textarea style={{ ...inputStyle, height: 90, resize: 'vertical' }} value={profile.description || ''} onChange={e => setProfile(p => ({...p, description: e.target.value}))} placeholder="Brief description for your booking page…" />
          </div>
        </div>
        <SaveBar saving={saving} saved={saved === 'profile'} onSave={saveProfile} />
      </Section>

      <Section title="Hours of Operation">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(hours.length ? hours : [0,1,2,3,4,5,6].map(d => ({ day_of_week:d, open_time:'08:00', close_time:'17:00', is_closed: d===0||d===6 }))).map((h, i) => (
            <div key={h.day_of_week} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 120px', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2333' }}>{DAYS[h.day_of_week]}</div>
              <input type="time" style={{ ...inputStyle, opacity: h.is_closed ? 0.35 : 1 }} value={h.open_time || '08:00'} disabled={h.is_closed}
                onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, open_time: e.target.value} : x))} />
              <input type="time" style={{ ...inputStyle, opacity: h.is_closed ? 0.35 : 1 }} value={h.close_time || '17:00'} disabled={h.is_closed}
                onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, close_time: e.target.value} : x))} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#5F667A' }}>
                <input type="checkbox" checked={!!h.is_closed} onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, is_closed: e.target.checked} : x))} />
                Closed
              </label>
            </div>
          ))}
        </div>
        <SaveBar saving={saving} saved={saved === 'hours'} onSave={saveHours} />
      </Section>

      <Section title="Closures & Holidays">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {closures.length === 0 && <div style={{ fontSize: 13, color: '#8A90A2' }}>No closures added yet.</div>}
          {closures.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: c.is_emergency ? '#FEF2F2' : '#F8F7F5', borderRadius: 8, border: `1px solid ${c.is_emergency ? '#FCA5A5' : '#E6E6E6'}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2333' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#8A90A2' }}>{c.closure_date}{c.is_emergency ? ' · Emergency closure' : ''}</div>
              </div>
              <button onClick={() => deleteClosure(c.id)} style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 120px', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" style={inputStyle} value={newClosure.closure_date} onChange={e => setNewClosure(c => ({...c, closure_date: e.target.value}))} />
          </div>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={newClosure.name} onChange={e => setNewClosure(c => ({...c, name: e.target.value}))} placeholder="Memorial Day" />
          </div>
          <div style={{ paddingTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#5F667A' }}>
              <input type="checkbox" checked={newClosure.is_emergency} onChange={e => setNewClosure(c => ({...c, is_emergency: e.target.checked}))} />
              Emergency
            </label>
          </div>
          <button onClick={addClosure} style={{ padding: '10px 16px', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add</button>
        </div>
      </Section>

      <Section title="Service Templates">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {services.length === 0 && <div style={{ fontSize: 13, color: '#8A90A2' }}>No service templates yet. Add your first one below.</div>}
          {services.map(svc => (
            <div key={svc.id}>
              {editingSvc?.id === svc.id ? (
                <div style={{ background: '#F8F7F5', border: '1px solid #E6E6E6', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Name</label>
                      <input style={inputStyle} value={editingSvc.name} onChange={e => setEditingSvc(s => ({...s, name: e.target.value}))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Duration (min)</label>
                      <input type="number" style={inputStyle} value={editingSvc.duration_minutes} onChange={e => setEditingSvc(s => ({...s, duration_minutes: parseInt(e.target.value)||60}))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Buffer (min)</label>
                      <input type="number" style={inputStyle} value={editingSvc.buffer_minutes} onChange={e => setEditingSvc(s => ({...s, buffer_minutes: parseInt(e.target.value)||0}))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Price ($)</label>
                      <input type="number" style={inputStyle} value={editingSvc.price || ''} onChange={e => setEditingSvc(s => ({...s, price: e.target.value}))} placeholder="0.00" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveService(editingSvc)} style={{ padding: '8px 16px', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditingSvc(null)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #E6E6E6', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#5F667A' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#F8F7F5', border: '1px solid #E6E6E6', borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2333' }}>{svc.name}</div>
                    <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 2 }}>
                      {svc.duration_minutes}min + {svc.buffer_minutes}min buffer
                      {svc.price ? ` · $${parseFloat(svc.price).toFixed(2)}` : ''}
                    </div>
                  </div>
                  <button onClick={() => setEditingSvc({...svc})} style={{ background: 'none', border: '1px solid #E6E6E6', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#5F667A' }}>Edit</button>
                  <button onClick={() => deleteService(svc.id)} style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ background: '#F0F9F4', border: '1px solid rgba(21,128,61,.15)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2333', marginBottom: 12 }}>Add Service Template</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={newSvc.name} onChange={e => setNewSvc(s => ({...s, name: e.target.value}))} placeholder="Full Detail" />
            </div>
            <div>
              <label style={labelStyle}>Duration (min)</label>
              <input type="number" style={inputStyle} value={newSvc.duration_minutes} onChange={e => setNewSvc(s => ({...s, duration_minutes: parseInt(e.target.value)||60}))} />
            </div>
            <div>
              <label style={labelStyle}>Buffer (min)</label>
              <input type="number" style={inputStyle} value={newSvc.buffer_minutes} onChange={e => setNewSvc(s => ({...s, buffer_minutes: parseInt(e.target.value)||0}))} />
            </div>
            <div>
              <label style={labelStyle}>Price ($)</label>
              <input type="number" style={inputStyle} value={newSvc.price} onChange={e => setNewSvc(s => ({...s, price: e.target.value}))} placeholder="150.00" />
            </div>
          </div>
          <button onClick={addService} style={{ padding: '9px 20px', background: '#1C2333', color: '#D6B58A', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add service</button>
        </div>
      </Section>

      <Section title="Tax & Legal">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>EIN / Employer ID Number</label>
            <input style={inputStyle} value={profile.ein || ''} onChange={e => setProfile(p => ({...p, ein: e.target.value}))} placeholder="XX-XXXXXXX" />
            <div style={{ fontSize: 11, color: '#8A90A2', marginTop: 4 }}>Used for 1099 reporting and payment processing setup.</div>
          </div>
          <div>
            <label style={labelStyle}>Business Legal Name</label>
            <input style={inputStyle} value={profile.business_name || ''} onChange={e => setProfile(p => ({...p, business_name: e.target.value}))} placeholder="KMC Auto Spa LLC" />
          </div>
          <div>
            <label style={labelStyle}>State of Incorporation</label>
            <input style={inputStyle} value={profile.state || ''} onChange={e => setProfile(p => ({...p, state: e.target.value}))} placeholder="DE" maxLength={2} />
          </div>
        </div>
        <div style={{ background: '#FFF8ED', border: '1.5px solid rgba(214,181,138,.4)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1C2333', marginBottom: 6 }}>1099 Contractor Settings</div>
          <div style={{ fontSize: 13, color: '#5F667A', lineHeight: 1.65 }}>
            Contractor tax classification is managed per technician in the <strong>Team</strong> section. Mark each technician as Employee or 1099 Contractor and enter their Tax ID for year-end reporting.
          </div>
        </div>
        <div style={{ background: '#F8F7F5', border: '1px solid #E6E6E6', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1C2333', marginBottom: 6 }}>Platform Fee</div>
          <div style={{ fontSize: 13, color: '#5F667A', lineHeight: 1.65 }}>
            FieldCore charges a <strong>1% platform fee</strong> on all payments processed through the platform. This is deducted before funds are transferred to your Stripe account. Standard Stripe fees (2.9% + 30¢) also apply.
          </div>
        </div>
        <SaveBar saving={saving} saved={saved === 'profile'} onSave={saveProfile} label="Save tax settings" />
      </Section>

      <Section title="No-Show Clock">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Grace Period</label>
            <select style={inputStyle} value={nsSettings.grace_period_minutes}
              onChange={e => setNsSettings(s => ({ ...s, grace_period_minutes: parseInt(e.target.value) }))}>
              {[5, 10, 15, 20, 30].map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 5 }}>How long the tech waits before a no-show can be declared.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14, color: '#1C2333' }}>
              <input type="checkbox" checked={nsSettings.auto_declare}
                onChange={e => setNsSettings(s => ({ ...s, auto_declare: e.target.checked }))} />
              Auto-declare no-show when timer expires
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14, color: '#1C2333' }}>
              <input type="checkbox" checked={nsSettings.require_arrival_photo}
                onChange={e => setNsSettings(s => ({ ...s, require_arrival_photo: e.target.checked }))} />
              Require photo proof of arrival to start clock
            </label>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Custom Client SMS Template</label>
          <textarea
            style={{ ...inputStyle, height: 80, resize: 'vertical' }}
            value={nsSettings.client_sms_template}
            onChange={e => setNsSettings(s => ({ ...s, client_sms_template: e.target.value }))}
            placeholder="Leave blank to use default. Use {minutes} and {amount} as placeholders."
          />
          <div style={{ fontSize: 11, color: '#8A90A2', marginTop: 4 }}>Variables: <code>{'{minutes}'}</code> = grace period, <code>{'{amount}'}</code> = deposit amount</div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Custom Technician SMS Template</label>
          <textarea
            style={{ ...inputStyle, height: 80, resize: 'vertical' }}
            value={nsSettings.tech_sms_template}
            onChange={e => setNsSettings(s => ({ ...s, tech_sms_template: e.target.value }))}
            placeholder="Leave blank to use default. Use {client_name}, {address}, {amount} as placeholders."
          />
          <div style={{ fontSize: 11, color: '#8A90A2', marginTop: 4 }}>Variables: <code>{'{client_name}'}</code>, <code>{'{address}'}</code>, <code>{'{amount}'}</code></div>
        </div>
        <SaveBar saving={saving} saved={saved === 'noshow'} onSave={saveNsSettings} label="Save no-show settings" />
      </Section>
    </div>
  );
}
