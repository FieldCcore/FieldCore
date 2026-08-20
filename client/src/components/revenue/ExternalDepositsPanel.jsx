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

export function ExternalDepositsPanel({ onClose }) {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);
  const [start,   setStart]   = useState('');
  const [end,     setEnd]     = useState('');

  const limit = 50;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { page, limit };
    if (start) params.start = start;
    if (end)   params.end   = end;

    api.get('/integrations/banking/plaid/external-deposits', { params })
      .then(r => { setRows(r.data.deposits || []); setTotal(r.data.total || 0); setLoading(false); })
      .catch(e => { setError(e?.response?.data?.error || 'Could not load external deposits.'); setLoading(false); });
  }, [page, start, end]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="fin-modal-overlay" role="dialog" aria-label="External Deposits" aria-modal="true">
      <div className="fin-modal-body bank-panel-body bank-panel-body--wide">
        <div className="fin-modal-header">
          <h3 className="fin-modal-title">External Deposits</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p className="bank-panel-hint">
          Bank deposits not matched to FieldCore Payments, QuickBooks, or an internal transfer.
          These may represent revenue from outside FieldCore.
        </p>

        <form className="bank-panel-filters" onSubmit={e => { e.preventDefault(); setPage(1); load(); }}>
          <input type="date" className="bank-panel-input" value={start} onChange={e => setStart(e.target.value)} />
          <input type="date" className="bank-panel-input" value={end}   onChange={e => setEnd(e.target.value)} />
          <button type="submit" className="bank-panel-filter-btn">Apply</button>
        </form>

        {loading && <div className="bank-panel-empty">Loading…</div>}
        {error   && <div className="bank-panel-error">{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div className="bank-panel-empty">No unmatched external deposits found.</div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="bank-panel-count">{total.toLocaleString()} unmatched deposit{total !== 1 ? 's' : ''}</div>
            <table className="bank-panel-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th className="bank-panel-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(tx => (
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
                    <td className="bank-panel-muted bank-panel-cat">{tx.personal_finance_category_primary || '—'}</td>
                    <td className="bank-panel-right bank-panel-in bank-panel-bold">{fmtMoney(tx.amount)}</td>
                  </tr>
                ))}
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
