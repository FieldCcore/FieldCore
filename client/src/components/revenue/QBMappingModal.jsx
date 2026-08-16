'use strict';
import React, { useState, useEffect, useMemo } from 'react';
import api from '../../api';

// Category tree — mirrors FIELDCORE_CATEGORIES in accountingSyncService.js.
// Backend is authoritative for validation; this is for display only.
const CATEGORIES = [
  {
    category: 'cogs',
    label: 'Direct Cost / COGS',
    subcategories: [
      { value: 'direct_labor',      label: 'Direct Labor'        },
      { value: 'materials',         label: 'Materials'           },
      { value: 'fuel',              label: 'Fuel'                },
      { value: 'travel',            label: 'Travel'              },
      { value: 'merchant_fees',     label: 'Merchant Fees'       },
      { value: 'subcontractors',    label: 'Subcontractors'      },
      { value: 'premium_pay',       label: 'Premium Pay'         },
      { value: 'equipment_rental',  label: 'Equipment / Rental'  },
      { value: 'other_direct_cost', label: 'Other Direct Cost'   },
    ],
  },
  {
    category: 'operating_expenses',
    label: 'Operating Expense',
    subcategories: [
      { value: 'admin_payroll',         label: 'Admin Payroll'         },
      { value: 'marketing',             label: 'Marketing'             },
      { value: 'software',              label: 'Software'              },
      { value: 'insurance',             label: 'Insurance'             },
      { value: 'rent',                  label: 'Rent'                  },
      { value: 'utilities',             label: 'Utilities'             },
      { value: 'vehicle_overhead',      label: 'Vehicle Overhead'      },
      { value: 'professional_services', label: 'Professional Services' },
      { value: 'office_expense',        label: 'Office Expense'        },
      { value: 'other_operating',       label: 'Other Operating'       },
    ],
  },
  {
    category: 'taxes',
    label: 'Tax',
    subcategories: [
      { value: 'tax', label: 'Tax' },
    ],
  },
  {
    category: 'cash_accounts',
    label: 'Cash / Bank',
    subcategories: [
      { value: 'cash_bank',     label: 'Cash / Bank'   },
      { value: 'other_income',  label: 'Other Income'  },
      { value: 'other_expense', label: 'Other Expense' },
    ],
  },
];

// Map category → label for suggestion hints
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(g => [g.category, g.label]));

// Account status derived from mapping fields
function accountStatus(row) {
  if (row._isIgnored)                     return 'excluded';
  if (row._category && row._subcategory)  return 'mapped';
  if (row._category)                      return 'suggested';
  return 'unmapped';
}

const STATUS_STYLE = {
  mapped:    { label: 'Mapped',    color: '#16a34a', bg: '#f0fdf4' },
  suggested: { label: 'Suggested', color: '#d97706', bg: '#fffbeb' },
  unmapped:  { label: 'Unmapped',  color: '#dc2626', bg: '#fef2f2' },
  excluded:  { label: 'Excluded',  color: '#6b7280', bg: '#f3f4f6' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.unmapped;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function CategorySelect({ value, suggestionCategory, onChange }) {
  return (
    <div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #D1D5DB', minWidth: 195, background: '#fff' }}
      >
        <option value="">— Unmapped —</option>
        {CATEGORIES.map(group => (
          <optgroup key={group.category} label={group.label}>
            {group.subcategories.map(sub => (
              <option key={sub.value} value={`${group.category}:${sub.value}`}>
                {sub.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="ignore">Exclude / Ignore</option>
      </select>
      {suggestionCategory && !value && (
        <div style={{ fontSize: 11, color: '#d97706', marginTop: 3 }}>
          Suggested: {CATEGORY_LABELS[suggestionCategory] || suggestionCategory}
        </div>
      )}
    </div>
  );
}

// Select value encoding: "category:subcategory", "ignore", or ""
function selectValue(row) {
  if (row._isIgnored) return 'ignore';
  if (row._category && row._subcategory) return `${row._category}:${row._subcategory}`;
  return '';
}

export default function QBMappingModal({ onClose, onSaved }) {
  const [rows,        setRows]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState(null);
  const [search,      setSearch]      = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dirty,       setDirty]       = useState(false);

  useEffect(() => {
    api.get('/integrations/accounting/quickbooks/mappings')
      .then(r => {
        setRows(r.data.mappings.map(m => ({
          ...m,
          _category:    m.fieldcore_category    || null,
          _subcategory: m.fieldcore_subcategory  || null,
          _isIgnored:   m.is_ignored             || false,
        })));
        setLoading(false);
      })
      .catch(e => {
        setFetchError(e?.response?.data?.error || 'Failed to load account mappings.');
        setLoading(false);
      });
  }, []);

  const counts = useMemo(() => {
    if (!rows) return {};
    const c = { unmapped: 0, suggested: 0, mapped: 0, excluded: 0 };
    rows.forEach(r => { c[accountStatus(r)] = (c[accountStatus(r)] || 0) + 1; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter(row => {
      if (filterStatus !== 'all' && accountStatus(row) !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          row.provider_account_name?.toLowerCase().includes(q) ||
          row.provider_account_type?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, filterStatus]);

  function handleChange(providerAccountId, val) {
    setRows(prev => prev.map(r => {
      if (r.provider_account_id !== providerAccountId) return r;
      if (val === 'ignore') return { ...r, _category: null, _subcategory: null, _isIgnored: true };
      if (!val)             return { ...r, _category: null, _subcategory: null, _isIgnored: false };
      const [cat, sub] = val.split(':');
      return { ...r, _category: cat || null, _subcategory: sub || null, _isIgnored: false };
    }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = rows.map(r => ({
        providerAccountId:    r.provider_account_id,
        fieldcoreCategory:    r._isIgnored ? null : r._category,
        fieldcoreSubcategory: r._isIgnored ? null : r._subcategory,
        isIgnored:            r._isIgnored,
      }));
      await api.post('/integrations/accounting/quickbooks/mappings/bulk', { mappings: payload });
      onSaved?.();
    } catch (e) {
      setSaveError(e?.response?.data?.error || 'Failed to save mappings.');
      setSaving(false);
    }
  }

  const needsAction = (counts.unmapped || 0) + (counts.suggested || 0);

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2.5rem 1rem', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="QuickBooks Account Mapping"
    >
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 900, boxShadow: '0 24px 64px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #E6E6E6' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C2333' }}>Account Mapping</h2>
            <div style={{ fontSize: 13, color: '#5F667A', marginTop: 4 }}>
              {loading ? 'Loading…' : needsAction === 0
                ? 'All accounts mapped — P&L data is ready.'
                : `${needsAction} account${needsAction !== 1 ? 's' : ''} need review to calculate accurate P&L.`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#8A90A2', padding: '2px 6px', lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        {!loading && rows && (
          <div style={{ display: 'flex', gap: 10, padding: '0.875rem 1.5rem', borderBottom: '1px solid #E6E6E6', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search accounts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: '6px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
              aria-label="Search accounts"
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, background: '#fff' }}
              aria-label="Filter by status"
            >
              <option value="all">All ({rows.length})</option>
              <option value="unmapped">Unmapped ({counts.unmapped || 0})</option>
              <option value="suggested">Suggested ({counts.suggested || 0})</option>
              <option value="mapped">Mapped ({counts.mapped || 0})</option>
              <option value="excluded">Excluded ({counts.excluded || 0})</option>
            </select>
          </div>
        )}

        {/* Table body */}
        <div style={{ overflowY: 'auto', maxHeight: '52vh', flex: 1 }}>
          {loading && (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#8A90A2', fontSize: 14 }}>Loading accounts…</div>
          )}
          {fetchError && (
            <div style={{ padding: '2rem', color: '#dc2626', fontSize: 14, textAlign: 'center' }}>{fetchError}</div>
          )}
          {!loading && rows && filtered.length === 0 && (
            <div style={{ padding: '2rem', color: '#8A90A2', fontSize: 14, textAlign: 'center' }}>No accounts match your filter.</div>
          )}
          {!loading && rows && filtered.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: '#EDEBE7' }}>
                  <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: '#1C2333', borderBottom: '1px solid #D1D5DB', whiteSpace: 'nowrap' }}>Account Name</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#1C2333', borderBottom: '1px solid #D1D5DB', whiteSpace: 'nowrap' }}>QB Type</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#1C2333', borderBottom: '1px solid #D1D5DB' }}>FieldCore Category</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: '#1C2333', borderBottom: '1px solid #D1D5DB', whiteSpace: 'nowrap' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const status = accountStatus(row);
                  return (
                    <tr
                      key={row.provider_account_id}
                      style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}
                    >
                      <td style={{ padding: '9px 16px', color: '#1C2333', fontWeight: 500 }}>
                        {row.provider_account_name}
                      </td>
                      <td style={{ padding: '9px 12px', color: '#5F667A' }}>
                        <span style={{ fontSize: 11, background: '#E6E6E6', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                          {row.provider_account_type}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <CategorySelect
                          value={selectValue(row)}
                          suggestionCategory={status === 'suggested' ? row._category : null}
                          onChange={val => handleChange(row.provider_account_id, val)}
                        />
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderTop: '1px solid #E6E6E6', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#8A90A2' }}>
            {!loading && rows && `${rows.length} total accounts · ${counts.mapped || 0} mapped · ${needsAction} need review`}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saveError && (
              <span style={{ fontSize: 12, color: '#dc2626' }}>{saveError}</span>
            )}
            <button
              onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#5F667A', fontWeight: 500 }}
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !dirty}
              style={{
                padding: '8px 20px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                background: saving || loading || !dirty ? '#E6E6E6' : '#1C2333',
                color:      saving || loading || !dirty ? '#8A90A2' : '#fff',
                cursor:     saving || loading || !dirty ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save Mappings'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
