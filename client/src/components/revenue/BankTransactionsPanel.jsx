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

const RECON_LABELS = {
  UNMATCHED:  { label: 'Unmatched',  cls: 'bank-recon--unmatched' },
  MATCHED:    { label: 'Matched',    cls: 'bank-recon--matched'   },
  TRANSFER:   { label: 'Transfer',   cls: 'bank-recon--transfer'  },
  EXCLUDED:   { label: 'Excluded',   cls: 'bank-recon--excluded'  },
};

export function BankTransactionsPanel({ onClose, defaultDirection }) {
  const [rows,      setRows]      = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [page,      setPage]      = useState(1);
  const [accounts,  setAccounts]  = useState([]);

  const [search,    setSearch]    = useState('');
  const [start,     setStart]     = useState('');
  const [end,       setEnd]       = useState('');
  const [accountId, setAccountId] = useState('');
  const [direction, setDirection] = useState(defaultDirection || '');
  const [status,    setStatus]    = useState('');

  const limit = 50;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { page, limit };
    if (search)    params.search    = search;
    if (start)     params.start     = start;
    if (end)       params.end       = end;
    if (accountId) params.account_id = accountId;
    if (direction) params.direction  = direction;
    if (status)    params.status     = status;

    api.get('/integrations/banking/plaid/transactions', { params })
      .then(r => { setRows(r.data.transactions || []); setTotal(r.data.total || 0); setLoading(false); })
      .catch(e => { setError(e?.response?.data?.error || 'Could not load transactions.'); setLoading(false); });
  }, [page, search, start, end, accountId, direction, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/integrations/banking/plaid/connections')
      .then(r => {
        const accts = (r.data.connections || []).flatMap(c =>
          (c.accounts || []).filter(a => a.is_active).map(a => ({ id: a.id, label: `${c.institution_name} — ${a.name} ••${a.mask || ''}` }))
        );
        setAccounts(accts);
      })
      .catch(() => {});
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="fin-modal-overlay" role="dialog" aria-label="Cash Transactions" aria-modal="true">
      <div className="fin-modal-body bank-panel-body bank-panel-body--wide">
        <div className="fin-modal-header">
          <h3 className="fin-modal-title">
            {defaultDirection === 'CASH_OUT' ? 'Cash Out' : 'Cash Transactions'}
          </h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Filters */}
        <form className="bank-panel-filters" onSubmit={handleFilter}>
          <input
            className="bank-panel-input"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <input type="date" className="bank-panel-input" value={start} onChange={e => setStart(e.target.value)} />
          <input type="date" className="bank-panel-input" value={end}   onChange={e => setEnd(e.target.value)} />
          <select className="bank-panel-select" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {!defaultDirection && (
            <select className="bank-panel-select" value={direction} onChange={e => setDirection(e.target.value)}>
              <option value="">All Directions</option>
              <option value="CASH_IN">Cash In</option>
              <option value="CASH_OUT">Cash Out</option>
            </select>
          )}
          <select className="bank-panel-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="UNMATCHED">Unmatched</option>
            <option value="MATCHED">Matched</option>
            <option value="TRANSFER">Transfer</option>
            <option value="EXCLUDED">Excluded</option>
          </select>
          <button type="submit" className="bank-panel-filter-btn">Apply</button>
        </form>

        {loading && <div className="bank-panel-empty">Loading…</div>}
        {error   && <div className="bank-panel-error">{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div className="bank-panel-empty">No transactions found.</div>
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
                  <th>Category</th>
                  <th className="bank-panel-right">Cash In</th>
                  <th className="bank-panel-right">Cash Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(tx => {
                  const recon = RECON_LABELS[tx.reconciliation_status] || { label: tx.reconciliation_status, cls: '' };
                  return (
                    <tr key={tx.id} className={tx.pending ? 'bank-row--pending' : ''}>
                      <td className="bank-panel-muted">{fmtDate(tx.posted_date)}</td>
                      <td>
                        <div className="bank-panel-desc">{tx.merchant_name || tx.description}</div>
                        {tx.merchant_name && tx.description !== tx.merchant_name && (
                          <div className="bank-panel-subdesc">{tx.description}</div>
                        )}
                        {tx.pending && <span className="bank-panel-pending">Pending</span>}
                      </td>
                      <td className="bank-panel-muted">
                        {tx.account_name}{tx.account_mask ? ` ••${tx.account_mask}` : ''}
                      </td>
                      <td className="bank-panel-muted bank-panel-cat">{tx.personal_finance_category_primary || '—'}</td>
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
                <button
                  className="bank-panel-pg-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >Prev</button>
                <span className="bank-panel-pg-info">Page {page} of {pages}</span>
                <button
                  className="bank-panel-pg-btn"
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                >Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
