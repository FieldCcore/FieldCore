import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

function fmtMoney(v) {
  if (v == null) return '—';
  return '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TABS = [
  { key: '',          label: 'All' },
  { key: 'MATCHED',   label: 'Matched' },
  { key: 'TRANSFER',  label: 'Transfers' },
  { key: 'UNMATCHED', label: 'Unmatched' },
  { key: 'EXCLUDED',  label: 'Excluded' },
];

const RECON_LABELS = {
  UNMATCHED: { label: 'Unmatched', cls: 'bank-recon--unmatched' },
  MATCHED:   { label: 'Matched',   cls: 'bank-recon--matched'   },
  TRANSFER:  { label: 'Transfer',  cls: 'bank-recon--transfer'  },
  EXCLUDED:  { label: 'Excluded',  cls: 'bank-recon--excluded'  },
};

export function ReconciliationPanel({ onClose }) {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState('');
  const [page,    setPage]    = useState(1);

  const limit = 50;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { page, limit, pending: 'false' };
    if (tab) params.status = tab;

    api.get('/integrations/banking/plaid/transactions', { params })
      .then(r => { setRows(r.data.transactions || []); setTotal(r.data.total || 0); setLoading(false); })
      .catch(e => { setError(e?.response?.data?.error || 'Could not load transactions.'); setLoading(false); });
  }, [page, tab]);

  useEffect(() => { load(); }, [load]);

  function switchTab(key) {
    setTab(key);
    setPage(1);
  }

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="fin-modal-overlay" role="dialog" aria-label="Reconciliation" aria-modal="true">
      <div className="fin-modal-body bank-panel-body bank-panel-body--wide">
        <div className="fin-modal-header">
          <h3 className="fin-modal-title">Reconciliation</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="bank-panel-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`bank-panel-tab${tab === t.key ? ' bank-panel-tab--active' : ''}`}
              onClick={() => switchTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="bank-panel-empty">Loading…</div>}
        {error   && <div className="bank-panel-error">{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div className="bank-panel-empty">No transactions in this category.</div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="bank-panel-count">{total.toLocaleString()} transaction{total !== 1 ? 's' : ''}</div>
            <table className="bank-panel-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th className="bank-panel-right">Cash In</th>
                  <th className="bank-panel-right">Cash Out</th>
                  <th>Reconciliation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(tx => {
                  const recon = RECON_LABELS[tx.reconciliation_status] || { label: tx.reconciliation_status, cls: '' };
                  return (
                    <tr key={tx.id}>
                      <td className="bank-panel-muted">{fmtDate(tx.posted_date)}</td>
                      <td>
                        <div className="bank-panel-desc">{tx.merchant_name || tx.description}</div>
                        {tx.merchant_name && tx.description !== tx.merchant_name && (
                          <div className="bank-panel-subdesc">{tx.description}</div>
                        )}
                      </td>
                      <td className="bank-panel-muted">
                        {tx.account_name}{tx.account_mask ? ` ••${tx.account_mask}` : ''}
                      </td>
                      <td className="bank-panel-right bank-panel-in">
                        {tx.direction === 'CASH_IN' ? fmtMoney(tx.amount) : ''}
                      </td>
                      <td className="bank-panel-right bank-panel-out">
                        {tx.direction === 'CASH_OUT' ? fmtMoney(tx.amount) : ''}
                      </td>
                      <td><span className={`bank-recon ${recon.cls}`}>{recon.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pages > 1 && (
              <div className="bank-panel-pagination">
                <button className="bank-panel-pg-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <span className="bank-panel-pg-info">Page {page} of {pages}</span>
                <button className="bank-panel-pg-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
