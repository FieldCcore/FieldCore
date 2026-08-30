import React, { useState, useEffect } from 'react';
import { MapPin, Plus } from 'lucide-react';
import api from '../api';
import AddressAutocomplete from './AddressAutocomplete';

const LABEL_PRESETS = ['Home', 'Office', 'Warehouse', 'Property 2', 'Rental', 'Garage', 'Other'];

// Inline form for adding a new location, with option to save to client or use temporarily.
function AddLocationForm({ clientId, onSaved, onCancel }) {
  const [label,               setLabel]               = useState('Home');
  const [customLabel,         setCustomLabel]         = useState('');
  const [address,             setAddress]             = useState('');
  const [city,                setCity]                = useState('');
  const [state,               setState]               = useState('');
  const [zip,                 setZip]                 = useState('');
  const [lat,                 setLat]                 = useState('');
  const [lng,                 setLng]                 = useState('');
  const [placeId,             setPlaceId]             = useState('');
  const [formattedAddress,    setFormattedAddress]    = useState('');
  const [accessInstructions,  setAccessInstructions]  = useState('');
  const [saveToClient,        setSaveToClient]        = useState(true);
  const [saving,              setSaving]              = useState(false);
  const [error,               setError]               = useState('');

  const effectiveLabel = label === '__custom__' ? customLabel.trim() : label;

  async function handleSave() {
    if (!address.trim()) { setError('Address is required.'); return; }
    if (!effectiveLabel) { setError('Label is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (saveToClient && clientId) {
        const res = await api.post(`/clients/${clientId}/locations`, {
          label:               effectiveLabel,
          address:             address.trim(),
          city:                city   || null,
          state:               state  || null,
          zip:                 zip    || null,
          lat:                 lat    || null,
          lng:                 lng    || null,
          place_id:            placeId           || null,
          formatted_address:   formattedAddress  || null,
          access_instructions: accessInstructions.trim() || null,
        });
        onSaved(res.data, true);
      } else {
        onSaved({
          id:                  null,
          label:               effectiveLabel,
          address:             address.trim(),
          city:                city   || '',
          state:               state  || '',
          zip:                 zip    || '',
          lat:                 lat    || null,
          lng:                 lng    || null,
          place_id:            placeId || null,
          is_primary:          false,
          temp:                true,
        }, false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save location.');
      setSaving(false);
    }
  }

  const btnBase = {
    flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid',
  };

  return (
    <div style={{
      border: '1px solid var(--lightgray)', borderRadius: 8, padding: 16,
      background: 'var(--offwhite)', marginTop: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <MapPin size={13} />
        Add Service Location
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: 12, marginBottom: 10 }}>{error}</p>}

      {/* Label chips */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate)', marginBottom: 6 }}>Location Label</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LABEL_PRESETS.map(l => (
            <button key={l} type="button"
              onClick={() => { setLabel(l); setCustomLabel(''); }}
              style={{
                padding: '3px 10px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                border: '1px solid var(--lightgray)',
                background: label === l ? 'var(--navy)' : 'var(--white)',
                color:      label === l ? '#fff'       : 'var(--navy)',
              }}
            >{l}</button>
          ))}
          <button type="button"
            onClick={() => setLabel('__custom__')}
            style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
              border: '1px solid var(--lightgray)',
              background: label === '__custom__' ? 'var(--navy)' : 'var(--white)',
              color:      label === '__custom__' ? '#fff'       : 'var(--navy)',
            }}
          >Custom</button>
        </div>
        {label === '__custom__' && (
          <input
            data-testid="add-location-custom-label"
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder="e.g. Vacation Home, Job Site A"
            style={{ marginTop: 8, fontSize: 13, width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--lightgray)' }}
          />
        )}
      </div>

      {/* Address autocomplete */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate)', marginBottom: 4 }}>Service Address</div>
        <AddressAutocomplete
          data-testid="add-location-address"
          value={address}
          onChange={v => {
            setAddress(v);
            setCity(''); setState(''); setZip('');
            setLat(''); setLng(''); setPlaceId('');
          }}
          onPlace={place => {
            setAddress(place.street || '');
            setCity(place.city     || '');
            setState(place.state   || '');
            setZip(place.zip       || '');
            setLat(place.lat  ? String(place.lat)  : '');
            setLng(place.lng  ? String(place.lng)  : '');
            setPlaceId(place.place_id || '');
            setFormattedAddress(place.formattedAddress || '');
          }}
          placeholder="Start typing an address…"
        />
        {(city || state) && (
          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 3 }}>
            {[city, state, zip].filter(Boolean).join(', ')}
          </div>
        )}
      </div>

      {/* Access instructions */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate)', marginBottom: 4 }}>
          Access Instructions <span style={{ fontWeight: 400 }}>(optional)</span>
        </div>
        <input
          value={accessInstructions}
          onChange={e => setAccessInstructions(e.target.value)}
          placeholder="Gate code, parking, etc."
          style={{ fontSize: 13, width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--lightgray)' }}
        />
      </div>

      {/* Save vs. temporary toggle */}
      {clientId && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button type="button" data-testid="save-to-client-btn"
            onClick={() => setSaveToClient(true)}
            style={{
              ...btnBase,
              borderColor: saveToClient  ? 'var(--navy)' : 'var(--lightgray)',
              background:  saveToClient  ? 'var(--navy)' : 'var(--white)',
              color:       saveToClient  ? '#fff'        : 'var(--navy)',
            }}
          >Save to Client</button>
          <button type="button" data-testid="temp-location-btn"
            onClick={() => setSaveToClient(false)}
            style={{
              ...btnBase,
              borderColor: !saveToClient ? 'var(--navy)' : 'var(--lightgray)',
              background:  !saveToClient ? 'var(--navy)' : 'var(--white)',
              color:       !saveToClient ? '#fff'        : 'var(--navy)',
            }}
          >Use for This Job Only</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '7px 14px', fontSize: 12, borderRadius: 6, border: '1px solid var(--lightgray)', background: 'var(--white)', cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="button" data-testid="add-location-save-btn"
          onClick={handleSave}
          disabled={saving || !address.trim()}
          style={{ padding: '7px 14px', fontSize: 12, borderRadius: 6, border: 'none', background: 'var(--navy)', color: '#fff', cursor: saving || !address.trim() ? 'default' : 'pointer', opacity: saving || !address.trim() ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Use This Location'}
        </button>
      </div>
    </div>
  );
}

// ClientLocationField — service location selector for job/project/agreement creation.
//
// When clientId is provided: loads that client's saved locations and shows a dropdown.
// When no locations exist yet: shows AddressAutocomplete with "+ Add Location" option.
// "+ Add Location" opens AddLocationForm inline (no page navigation required).
//
// Props:
//   clientId           string|null  — client whose locations to load
//   locationId         string|null  — currently selected saved location id
//   address            string       — current manual address value (for fallback input)
//   onSelect(data)                  — called with { location_id, address, city, state, zip, lat, lng }
//   onAddressChange(str)            — called when the manual address input changes (not a full selection)
export default function ClientLocationField({
  clientId,
  locationId,
  address,
  onSelect,
  onAddressChange,
  testId,
}) {
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);

  useEffect(() => {
    if (!clientId) { setLocations([]); return; }
    setLoading(true);
    api.get(`/clients/${clientId}/locations`)
      .then(r => {
        const locs = r.data || [];
        setLocations(locs);
        // Auto-select primary location if nothing is selected yet and no manual address typed
        if (!locationId && !address && locs.length > 0) {
          const primary = locs.find(l => l.is_primary) || locs[0];
          onSelect({
            location_id: primary.id,
            address:     primary.address || '',
            city:        primary.city    || '',
            state:       primary.state   || '',
            zip:         primary.zip     || '',
            lat:         primary.lat     || null,
            lng:         primary.lng     || null,
          });
        }
      })
      .catch(() => setLocations([]))
      .finally(() => setLoading(false));
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDropdownChange(e) {
    const val = e.target.value;
    if (val === '__add__') { setShowAdd(true); return; }
    if (!val) { onSelect({ location_id: null, address: '', city: '', state: '', zip: '', lat: null, lng: null }); return; }
    const loc = locations.find(l => l.id === val);
    if (loc) {
      onSelect({
        location_id: loc.id,
        address:     loc.address || '',
        city:        loc.city    || '',
        state:       loc.state   || '',
        zip:         loc.zip     || '',
        lat:         loc.lat     || null,
        lng:         loc.lng     || null,
      });
    }
  }

  function handleAddSaved(loc, savedToClient) {
    if (savedToClient && loc.id) {
      setLocations(prev => {
        const without = prev.filter(l => l.id !== loc.id);
        return [...without, loc];
      });
    }
    onSelect({
      location_id: loc.id || null,
      address:     loc.address || '',
      city:        loc.city    || '',
      state:       loc.state   || '',
      zip:         loc.zip     || '',
      lat:         loc.lat     || null,
      lng:         loc.lng     || null,
    });
    setShowAdd(false);
  }

  const selectedLoc = locationId ? locations.find(l => l.id === locationId) : null;

  // No client: bare AddressAutocomplete
  if (!clientId) {
    return (
      <>
        <AddressAutocomplete
          value={address}
          onChange={onAddressChange}
          onPlace={place => onSelect({
            location_id: null,
            address:     place.street || '',
            city:        place.city   || '',
            state:       place.state  || '',
            zip:         place.zip    || '',
            lat:         place.lat    || null,
            lng:         place.lng    || null,
          })}
          placeholder="Street address"
          data-testid={testId}
        />
      </>
    );
  }

  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--steel)', padding: '8px 0' }}>Loading service locations…</div>;
  }

  return (
    <div>
      {/* Saved-location dropdown */}
      {locations.length > 0 && !showAdd && (
        <>
          <select
            data-testid="location-dropdown"
            value={locationId || ''}
            onChange={handleDropdownChange}
            style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--lightgray)', background: 'var(--white)', color: 'var(--navy)' }}
          >
            <option value="">— Select service location —</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.label}{loc.is_primary ? ' (Primary)' : ''}
                {loc.address ? `  —  ${loc.address}${loc.city ? `, ${loc.city}` : ''}` : ''}
              </option>
            ))}
            <option value="__add__">+ Add Location…</option>
          </select>
          {selectedLoc && (
            <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4, paddingLeft: 2 }}>
              {[selectedLoc.address, selectedLoc.city, selectedLoc.state, selectedLoc.zip].filter(Boolean).join(', ')}
              {selectedLoc.access_instructions && (
                <span style={{ display: 'block', marginTop: 2, fontStyle: 'italic' }}>
                  {selectedLoc.access_instructions}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* No saved locations: manual entry + "+ Add to Client" link */}
      {locations.length === 0 && !showAdd && (
        <>
          <AddressAutocomplete
            value={address}
            onChange={onAddressChange}
            onPlace={place => onSelect({
              location_id: null,
              address:     place.street || '',
              city:        place.city   || '',
              state:       place.state  || '',
              zip:         place.zip    || '',
              lat:         place.lat    || null,
              lng:         place.lng    || null,
            })}
            placeholder="Street address"
            data-testid={testId}
          />
          <button type="button" data-testid="add-location-link"
            onClick={() => setShowAdd(true)}
            style={{
              marginTop: 6, fontSize: 12, color: 'var(--navy)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Plus size={12} /> Save location to client
          </button>
        </>
      )}

      {/* Inline add-location form */}
      {showAdd && (
        <AddLocationForm
          data-testid="add-location-form"
          clientId={clientId}
          onSaved={handleAddSaved}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
