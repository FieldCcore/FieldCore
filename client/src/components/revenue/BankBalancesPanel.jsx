import React, { useState, useEffect } from 'react';
import api from '../../api';

function fmtMoney(v) {
  if (v == null) return '—';
  return '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function BankBalancesPanel({ onClose }) {
  const [connections, setConnections] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    api.get('/integrations/banking/plaid/connections')
      .then(r => { setConnections(r.data.connections || []); setLoading(false); })
      .catch(e => { setError(e?.response?.data?.error || 'Could not load balances.'); setLoading(false); });
  }, []);

  const allAccounts = connections.flatMap(c =>
    (c.accounts || []).filter(a => a.is_active).map(a => ({ ...a, institution_name: c.institution_name, last_sync_at: c.last_sync_at }))
  );

  return (
    <div className="fin-modal-overlay" role="dialog" aria-label="Bank Balances" aria-modal="true">
      <div className="fin-modal-body bank-panel-body">
        <div className="fin-modal-header">
          <h3 className="fin-modal-title">Bank Balances</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading && <div className="bank-panel-empty">Loading…</div>}
        {error   && <div className="bank-panel-error">{error}</div>}

        {!loading && !error && allAccounts.length === 0 && (
          <div className="bank-panel-empty">No bank accounts found.</div>
        )}

        {!loading && !error && allAccounts.length > 0 && (
          <table className="bank-panel-table">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Account</th>
                <th>Type</th>
                <th className="bank-panel-right">Current</th>
                <th className="bank-panel-right">Available</th>
                <th className="bank-panel-center">Cash Position</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {allAccounts.map(a => (
                <tr key={a.id}>
                  <td className="bank-panel-inst">{a.institution_name || '—'}</td>
                  <td>
                    <span className="bank-panel-acct-name">{a.name}</span>
                    {a.mask && <span className="bank-panel-mask"> ••{a.mask}</span>}
                  </td>
                  <td><span className="bank-panel-type">{a.type}</span></td>
                  <td className="bank-panel-right bank-panel-bold">{fmtMoney(a.current_balance)}</td>
                  <td className="bank-panel-right">{a.available_balance != null ? fmtMoney(a.available_balance) : '—'}</td>
                  <td className="bank-panel-center">
                    {a.include_in_cash_position
                      ? <span className="bank-panel-badge bank-panel-badge--yes">Included</span>
                      : <span className="bank-panel-badge bank-panel-badge--no">Excluded</span>}
                  </td>
                  <td className="bank-panel-muted">{fmtDate(a.last_sync_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
