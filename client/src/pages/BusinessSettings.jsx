import React, { useState, useEffect } from 'react';
import api from '../api';
import AddressAutocomplete from '../components/AddressAutocomplete';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TIMEZONES = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu'];
const VERTICALS = ['Auto Detailing','Pressure Washing','Landscaping','HVAC','Plumbing','Electrical','Pest Control','Pool Cleaning','Mobile Mechanic','Junk Removal','Window Tint / PPF','Appliance Repair','Garage Door','Flooring / Epoxy','Commercial Fleet Wash','Other'];

const inputCls = 'w-full border border-lightgray rounded-md px-3 py-2 text-sm text-navy placeholder:text-steel focus:ring-2 focus:ring-sand focus:outline-none bg-white';
const labelCls = 'block text-xs font-semibold text-slate uppercase tracking-wide mb-1 mt-4 first:mt-0';

function Section({ title, children }) {
  return (
    <div className="bg-white border border-lightgray rounded-lg p-6 mb-6">
      <div className="text-sm font-bold text-navy mb-4 pb-2 border-b border-lightgray">{title}</div>
      {children}
    </div>
  );
}

function SaveBar({ saving, saved, onSave, label = 'Save changes' }) {
  return (
    <div className="flex items-center gap-3 mt-5">
      <button
        onClick={onSave}
        disabled={saving}
        className="bg-sand text-navy font-bold px-6 py-2.5 rounded-md hover:brightness-95 transition text-sm disabled:opacity-60 disabled:cursor-wait"
      >
        {saving ? 'Saving…' : label}
      </button>
      {saved && (
        <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#1E6B3C' }}>
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
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-5">
          {error}
        </div>
      )}

      <Section title="Business Information">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Business Name</label>
            <input className={inputCls} value={profile.business_name || ''} onChange={e => setProfile(p => ({...p, business_name: e.target.value}))} placeholder="KMC Auto Spa" />
          </div>
          <div>
            <label className={labelCls}>Business Phone</label>
            <input className={inputCls} value={profile.phone || ''} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} placeholder="(813) 555-0100" />
          </div>
          <div className="col-span-full">
            <label className={labelCls}>Street Address</label>
            <AddressAutocomplete
              value={profile.address || ''}
              onChange={v => setProfile(p => ({ ...p, address: v }))}
              onPlace={({ street, city, state, zip, lat, lng }) =>
                setProfile(p => ({ ...p, address: street, city, state, zip, lat: lat || p.lat, lng: lng || p.lng }))
              }
              placeholder="123 Main St"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={profile.city || ''} onChange={e => setProfile(p => ({...p, city: e.target.value}))} placeholder="Tampa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>State</label>
              <input className={inputCls} value={profile.state || ''} onChange={e => setProfile(p => ({...p, state: e.target.value}))} placeholder="FL" maxLength={2} />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input className={inputCls} value={profile.zip || ''} onChange={e => setProfile(p => ({...p, zip: e.target.value}))} placeholder="33601" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} value={profile.website || ''} onChange={e => setProfile(p => ({...p, website: e.target.value}))} placeholder="https://kmcautospa.com" />
          </div>
          <div>
            <label className={labelCls}>Service Vertical</label>
            <select className={inputCls} value={profile.vertical || ''} onChange={e => setProfile(p => ({...p, vertical: e.target.value}))}>
              <option value="">Select vertical…</option>
              {VERTICALS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Timezone</label>
            <select className={inputCls} value={profile.timezone || 'America/New_York'} onChange={e => setProfile(p => ({...p, timezone: e.target.value}))}>
              {TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="col-span-full">
            <label className={labelCls}>Business Description (optional)</label>
            <textarea className={inputCls + ' h-[90px] resize-y'} value={profile.description || ''} onChange={e => setProfile(p => ({...p, description: e.target.value}))} placeholder="Brief description for your booking page…" />
          </div>
        </div>
        <SaveBar saving={saving} saved={saved === 'profile'} onSave={saveProfile} />
      </Section>

      <Section title="Hours of Operation">
        <div className="flex flex-col gap-3">
          {(hours.length ? hours : [0,1,2,3,4,5,6].map(d => ({ day_of_week:d, open_time:'08:00', close_time:'17:00', is_closed: d===0||d===6 }))).map((h, i) => (
            <div key={h.day_of_week} className="grid gap-3 items-center" style={{ gridTemplateColumns: '100px 1fr 1fr 120px' }}>
              <div className="text-sm font-semibold text-navy">{DAYS[h.day_of_week]}</div>
              <input type="time" className={inputCls + (h.is_closed ? ' opacity-35' : '')} value={h.open_time || '08:00'} disabled={h.is_closed}
                onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, open_time: e.target.value} : x))} />
              <input type="time" className={inputCls + (h.is_closed ? ' opacity-35' : '')} value={h.close_time || '17:00'} disabled={h.is_closed}
                onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, close_time: e.target.value} : x))} />
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate">
                <input type="checkbox" checked={!!h.is_closed} onChange={e => setHours(hs => hs.map((x,j) => j===i ? {...x, is_closed: e.target.checked} : x))} />
                Closed
              </label>
            </div>
          ))}
        </div>
        <SaveBar saving={saving} saved={saved === 'hours'} onSave={saveHours} />
      </Section>

      <Section title="Closures & Holidays">
        <div className="flex flex-col gap-2.5 mb-5">
          {closures.length === 0 && <div className="text-sm text-steel">No closures added yet.</div>}
          {closures.map(c => (
            <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${c.is_emergency ? 'bg-red-50 border-red-200' : 'bg-offwhite border-lightgray'}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-navy truncate">{c.name}</div>
                <div className="text-xs text-steel">{c.closure_date}{c.is_emergency ? ' · Emergency closure' : ''}</div>
              </div>
              <button onClick={() => deleteClosure(c.id)} className="text-red-600 hover:text-red-800 text-lg leading-none bg-transparent border-0 cursor-pointer flex-shrink-0">×</button>
            </div>
          ))}
        </div>
        <div className="grid gap-3 items-end" style={{ gridTemplateColumns: '1fr 2fr 1fr 120px' }}>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={newClosure.closure_date} onChange={e => setNewClosure(c => ({...c, closure_date: e.target.value}))} />
          </div>
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={newClosure.name} onChange={e => setNewClosure(c => ({...c, name: e.target.value}))} placeholder="Memorial Day" />
          </div>
          <div className="pt-5">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate">
              <input type="checkbox" checked={newClosure.is_emergency} onChange={e => setNewClosure(c => ({...c, is_emergency: e.target.checked}))} />
              Emergency
            </label>
          </div>
          <button onClick={addClosure} className="bg-navy text-sand font-bold px-4 py-2 rounded-lg text-sm cursor-pointer border-0">Add</button>
        </div>
      </Section>

      <Section title="Service Templates">
        <div className="flex flex-col gap-2.5 mb-6">
          {services.length === 0 && <div className="text-sm text-steel">No service templates yet. Add your first one below.</div>}
          {services.map(svc => (
            <div key={svc.id}>
              {editingSvc?.id === svc.id ? (
                <div className="bg-offwhite border border-lightgray rounded-xl p-4">
                  <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
                    <div>
                      <label className={labelCls}>Name</label>
                      <input className={inputCls} value={editingSvc.name} onChange={e => setEditingSvc(s => ({...s, name: e.target.value}))} />
                    </div>
                    <div>
                      <label className={labelCls}>Duration (min)</label>
                      <input type="number" className={inputCls} value={editingSvc.duration_minutes} onChange={e => setEditingSvc(s => ({...s, duration_minutes: parseInt(e.target.value)||60}))} />
                    </div>
                    <div>
                      <label className={labelCls}>Buffer (min)</label>
                      <input type="number" className={inputCls} value={editingSvc.buffer_minutes} onChange={e => setEditingSvc(s => ({...s, buffer_minutes: parseInt(e.target.value)||0}))} />
                    </div>
                    <div>
                      <label className={labelCls}>Price ($)</label>
                      <input type="number" className={inputCls} value={editingSvc.price || ''} onChange={e => setEditingSvc(s => ({...s, price: e.target.value}))} placeholder="0.00" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveService(editingSvc)} className="px-4 py-2 bg-navy text-sand border-0 rounded-md text-xs font-bold cursor-pointer">Save</button>
                    <button onClick={() => setEditingSvc(null)} className="px-4 py-2 bg-transparent border border-lightgray rounded-md text-xs cursor-pointer text-slate">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-offwhite border border-lightgray rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy truncate">{svc.name}</div>
                    <div className="text-xs text-steel mt-0.5">
                      {svc.duration_minutes}min + {svc.buffer_minutes}min buffer
                      {svc.price ? ` · $${parseFloat(svc.price).toFixed(2)}` : ''}
                    </div>
                  </div>
                  <button onClick={() => setEditingSvc({...svc})} className="bg-transparent border border-lightgray rounded-md px-3 py-1.5 text-xs cursor-pointer text-slate hover:border-slate transition-colors">Edit</button>
                  <button onClick={() => deleteService(svc.id)} className="bg-transparent border-0 text-red-600 cursor-pointer text-lg leading-none">×</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="bg-green-50 border border-green-600/20 rounded-xl p-4">
          <div className="text-sm font-semibold text-navy mb-3">Add Service Template</div>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={newSvc.name} onChange={e => setNewSvc(s => ({...s, name: e.target.value}))} placeholder="Full Detail" />
            </div>
            <div>
              <label className={labelCls}>Duration (min)</label>
              <input type="number" className={inputCls} value={newSvc.duration_minutes} onChange={e => setNewSvc(s => ({...s, duration_minutes: parseInt(e.target.value)||60}))} />
            </div>
            <div>
              <label className={labelCls}>Buffer (min)</label>
              <input type="number" className={inputCls} value={newSvc.buffer_minutes} onChange={e => setNewSvc(s => ({...s, buffer_minutes: parseInt(e.target.value)||0}))} />
            </div>
            <div>
              <label className={labelCls}>Price ($)</label>
              <input type="number" className={inputCls} value={newSvc.price} onChange={e => setNewSvc(s => ({...s, price: e.target.value}))} placeholder="150.00" />
            </div>
          </div>
          <button onClick={addService} className="px-5 py-2 bg-navy text-sand border-0 rounded-lg text-sm font-bold cursor-pointer">Add service</button>
        </div>
      </Section>

      <Section title="Tax & Legal">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className={labelCls}>EIN / Employer ID Number</label>
            <input className={inputCls} value={profile.ein || ''} onChange={e => setProfile(p => ({...p, ein: e.target.value}))} placeholder="XX-XXXXXXX" />
            <div className="text-xs text-steel mt-1">Used for 1099 reporting and payment processing setup.</div>
          </div>
          <div>
            <label className={labelCls}>Business Legal Name</label>
            <input className={inputCls} value={profile.business_name || ''} onChange={e => setProfile(p => ({...p, business_name: e.target.value}))} placeholder="KMC Auto Spa LLC" />
          </div>
          <div>
            <label className={labelCls}>State of Incorporation</label>
            <input className={inputCls} value={profile.state || ''} onChange={e => setProfile(p => ({...p, state: e.target.value}))} placeholder="DE" maxLength={2} />
          </div>
        </div>
        <div className="bg-amber-50 border border-sand/40 rounded-xl px-5 py-4 mb-4">
          <div className="text-sm font-bold text-navy mb-1.5">1099 Contractor Settings</div>
          <div className="text-sm text-slate leading-relaxed">
            Contractor tax classification is managed per technician in the <strong>Team</strong> section. Mark each technician as Employee or 1099 Contractor and enter their Tax ID for year-end reporting.
          </div>
        </div>
        <div className="bg-offwhite border border-lightgray rounded-xl px-5 py-4">
          <div className="text-sm font-bold text-navy mb-1.5">Platform Fee</div>
          <div className="text-sm text-slate leading-relaxed">
            FieldCore charges a <strong>1% platform fee</strong> on all payments processed through the platform. This is deducted before funds are transferred to your Stripe account. Standard Stripe fees (2.9% + 30¢) also apply.
          </div>
        </div>
        <SaveBar saving={saving} saved={saved === 'profile'} onSave={saveProfile} label="Save tax settings" />
      </Section>

      <Section title="No-Show Clock">
        <div className="grid grid-cols-2 gap-5 mb-5">
          <div>
            <label className={labelCls}>Grace Period</label>
            <select className={inputCls} value={nsSettings.grace_period_minutes}
              onChange={e => setNsSettings(s => ({ ...s, grace_period_minutes: parseInt(e.target.value) }))}>
              {[5, 10, 15, 20, 30].map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            <div className="text-xs text-steel mt-1">How long the tech waits before a no-show can be declared.</div>
          </div>
          <div className="flex flex-col gap-4 justify-center">
            <label className="flex items-center gap-3 cursor-pointer text-sm text-navy">
              <input type="checkbox" checked={nsSettings.auto_declare}
                onChange={e => setNsSettings(s => ({ ...s, auto_declare: e.target.checked }))} />
              Auto-declare no-show when timer expires
            </label>
            <label className="flex items-center gap-3 cursor-pointer text-sm text-navy">
              <input type="checkbox" checked={nsSettings.require_arrival_photo}
                onChange={e => setNsSettings(s => ({ ...s, require_arrival_photo: e.target.checked }))} />
              Require photo proof of arrival to start clock
            </label>
          </div>
        </div>
        <div className="mb-5">
          <label className={labelCls}>Custom Client SMS Template</label>
          <textarea
            className={inputCls + ' h-20 resize-y'}
            value={nsSettings.client_sms_template}
            onChange={e => setNsSettings(s => ({ ...s, client_sms_template: e.target.value }))}
            placeholder="Leave blank to use default. Use {minutes} and {amount} as placeholders."
          />
          <div className="text-xs text-steel mt-1">Variables: <code>{'{minutes}'}</code> = grace period, <code>{'{amount}'}</code> = deposit amount</div>
        </div>
        <div className="mb-6">
          <label className={labelCls}>Custom Technician SMS Template</label>
          <textarea
            className={inputCls + ' h-20 resize-y'}
            value={nsSettings.tech_sms_template}
            onChange={e => setNsSettings(s => ({ ...s, tech_sms_template: e.target.value }))}
            placeholder="Leave blank to use default. Use {client_name}, {address}, {amount} as placeholders."
          />
          <div className="text-xs text-steel mt-1">Variables: <code>{'{client_name}'}</code>, <code>{'{address}'}</code>, <code>{'{amount}'}</code></div>
        </div>
        <SaveBar saving={saving} saved={saved === 'noshow'} onSave={saveNsSettings} label="Save no-show settings" />
      </Section>
    </div>
  );
}
