import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import api from '../../api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(v) {
  if (v == null) return '—';
  return '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSyncTime(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d) / 60000);
  if (diffMin < 2)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return d.toLocaleDateString();
}

// ── Plaid Link wrapper ────────────────────────────────────────────────────────

function PlaidLinkButton({ onSuccess, onError, children, disabled, className }) {
  const [linkToken, setLinkToken]   = useState(null);
  const [fetching,  setFetching]    = useState(false);
  const [fetchErr,  setFetchErr]    = useState(null);

  const fetchLinkToken = useCallback(async () => {
    setFetching(true);
    setFetchErr(null);
    try {
      const res = await api.post('/integrations/banking/plaid/link-token');
      setLinkToken(res.data.linkToken);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Could not start bank connection.';
      setFetchErr(msg);
      onError?.(msg);
      setFetching(false);
    }
  }, [onError]);

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: async (publicToken, metadata) => {
      setLinkToken(null);
      onSuccess(publicToken, metadata);
    },
    onExit: () => {
      setLinkToken(null);
      setFetching(false);
    },
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
      setFetching(false);
    }
  }, [linkToken, ready, open]);

  const handleClick = async () => {
    if (disabled || fetching) return;
    await fetchLinkToken();
  };

  return (
    <>
      <button
        type="button"
        className={className || 'fin-int-connect-btn btn-secondary'}
        onClick={handleClick}
        disabled={disabled || fetching}
        aria-label="Connect bank account"
      >
        {fetching ? 'Connecting…' : children}
      </button>
      {fetchErr && (
        <div className="fin-src-notif fin-src-notif--error" role="alert" style={{ marginTop: 4 }}>
          {fetchErr}
        </div>
      )}
    </>
  );
}

// ── Banking card states ───────────────────────────────────────────────────────
// NOT_CONFIGURED → CONFIGURED_NOT_CONNECTED → CONNECTING → CONNECTED → SYNCING
// → REAUTH_REQUIRED → SYNC_ERROR → DISCONNECTED

const STATUS_BADGE = {
  CONNECTED:       { label: 'Active',       cls: 'fin-src-badge--active'   },
  SYNCING:         { label: 'Syncing…',     cls: 'fin-src-badge--syncing'  },
  DEGRADED:        { label: 'Degraded',     cls: 'fin-src-badge--degraded' },
  REAUTH_REQUIRED: { label: 'Attention',    cls: 'fin-src-badge--degraded' },
  SYNC_ERROR:      { label: 'Attention',    cls: 'fin-src-badge--degraded' },
  not_connected:   { label: 'Optional',     cls: 'fin-src-badge--optional' },
  not_configured:  { label: 'Unavailable',  cls: 'fin-src-badge--optional' },
  DISCONNECTED:    { label: 'Optional',     cls: 'fin-src-badge--optional' },
};

// ── Manage accounts modal ─────────────────────────────────────────────────────

function ManageModal({ connections, onClose, onUpdated }) {
  const [saving, setSaving] = useState({});
  const [notif,  setNotif]  = useState(null);
  const [disconnectId, setDisconnectId] = useState(null);

  async function toggleCashPosition(accountId, bankAccountId, value) {
    setSaving(s => ({ ...s, [bankAccountId]: true }));
    try {
      await api.patch(`/integrations/banking/plaid/accounts/${bankAccountId}`, {
        include_in_cash_position: value,
      });
      setNotif({ type: 'success', msg: 'Account updated.' });
      onUpdated?.();
    } catch (err) {
      setNotif({ type: 'error', msg: err?.response?.data?.error || 'Update failed.' });
    } finally {
      setSaving(s => ({ ...s, [bankAccountId]: false }));
    }
  }

  async function confirmDisconnect(connectionId) {
    try {
      await api.post('/integrations/banking/plaid/disconnect', { connectionId });
      setNotif({ type: 'success', msg: 'Bank disconnected. Historical data preserved.' });
      setDisconnectId(null);
      onUpdated?.();
    } catch (err) {
      setNotif({ type: 'error', msg: err?.response?.data?.error || 'Disconnect failed.' });
    }
  }

  return (
    <div className="fin-modal-overlay" role="dialog" aria-label="Manage Banking" aria-modal="true">
      <div className="fin-modal-body" style={{ maxWidth: 560, width: '100%' }}>
        <div className="fin-modal-header">
          <h3 className="fin-modal-title">Manage Banking</h3>
          <button type="button" className="fin-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {notif && (
          <div className={`fin-src-notif fin-src-notif--${notif.type}`} role="status" style={{ margin: '0 0 12px' }}>
            {notif.msg}
            <button className="fin-src-notif-dismiss" onClick={() => setNotif(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {connections.map(conn => (
          <div key={conn.id} className="banking-manage-institution">
            <div className="banking-manage-inst-header">
              <span className="banking-manage-inst-name">{conn.institution_name || 'Institution'}</span>
              <span className={`fin-src-badge ${STATUS_BADGE[conn.status]?.cls || 'fin-src-badge--optional'}`}>
                {STATUS_BADGE[conn.status]?.label || conn.status}
              </span>
            </div>

            {conn.last_sync_at && (
              <div className="fin-src-sync-row" style={{ marginBottom: 8 }}>
                <span className="fin-src-sync-label">Last sync</span>
                <span className="fin-src-sync-value">{fmtSyncTime(conn.last_sync_at)}</span>
              </div>
            )}

            <div className="banking-accounts-list">
              {(conn.accounts || []).map(acct => (
                <div key={acct.id} className="banking-account-row">
                  <div className="banking-account-info">
                    <span className="banking-account-name">{acct.name}</span>
                    {acct.mask && <span className="banking-account-mask">••••{acct.mask}</span>}
                    <span className="banking-account-type">{acct.type}</span>
                  </div>
                  <div className="banking-account-balances">
                    {acct.current_balance != null && (
                      <span className="banking-balance-current">{fmtMoney(acct.current_balance)}</span>
                    )}
                    {acct.available_balance != null && acct.available_balance !== acct.current_balance && (
                      <span className="banking-balance-avail">({fmtMoney(acct.available_balance)} avail)</span>
                    )}
                  </div>
                  <label className="banking-cash-toggle" title="Include in Cash Position calculation">
                    <input
                      type="checkbox"
                      checked={!!acct.include_in_cash_position}
                      disabled={saving[acct.id]}
                      onChange={e => toggleCashPosition(acct.account_id, acct.id, e.target.checked)}
                    />
                    <span className="banking-cash-toggle-label">Cash Position</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="fin-src-actions" style={{ marginTop: 8 }}>
              {disconnectId === conn.id ? (
                <div className="fin-src-disconnect-confirm">
                  <span className="fin-src-disconnect-q">Disconnect {conn.institution_name}?</span>
                  <button
                    type="button"
                    className="fin-src-action-btn fin-src-action-btn--danger"
                    onClick={() => confirmDisconnect(conn.id)}
                  >
                    Yes, Disconnect
                  </button>
                  <button
                    type="button"
                    className="fin-src-action-btn"
                    onClick={() => setDisconnectId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="fin-src-action-btn fin-src-action-btn--danger"
                  onClick={() => setDisconnectId(conn.id)}
                >
                  Disconnect Institution
                </button>
              )}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <button type="button" className="fin-src-action-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main BankingCard ──────────────────────────────────────────────────────────

export function BankingCard({ src, onCoverageRefresh }) {
  const [status,      setStatus]      = useState(null);
  const [connections, setConnections] = useState([]);
  const [syncing,     setSyncing]     = useState(false);
  const [notif,       setNotif]       = useState(null);
  const [showManage,  setShowManage]  = useState(false);
  const [exchanging,  setExchanging]  = useState(false);

  const configured = src?.configured || src?.canConnect;
  const connInfo   = src?.connectionInfo;
  const cardStatus = connInfo?.status || src?.status;

  const loadConnections = useCallback(async () => {
    try {
      const res = await api.get('/integrations/banking/plaid/connections');
      setConnections(res.data.connections || []);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    if (connInfo) {
      loadConnections();
    }
  }, [connInfo, loadConnections]);

  // Stable ref so the poll callback always calls the latest onCoverageRefresh
  const onRefreshRef = useRef(onCoverageRefresh);
  useEffect(() => { onRefreshRef.current = onCoverageRefresh; });

  // Poll status while SYNCING — stops when backend resolves or after 3 minutes
  const pollRef = useRef(null);
  useEffect(() => {
    if (cardStatus !== 'SYNCING') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return; // Already polling for this SYNCING state

    let ticks = 0;
    pollRef.current = setInterval(async () => {
      if (++ticks > 60) { // 3-minute hard stop
        clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }
      try {
        const res = await api.get('/integrations/banking/plaid/status');
        if (res.data.status !== 'SYNCING') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          onRefreshRef.current?.(); // Refresh full coverage state
        }
      } catch { /* non-fatal — keep polling */ }
    }, 3000);

    return () => { clearInterval(pollRef.current); pollRef.current = null; };
  }, [cardStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePlaidSuccess(publicToken) {
    setExchanging(true);
    setNotif(null);
    try {
      await api.post('/integrations/banking/plaid/exchange', { publicToken });
      setNotif({ type: 'success', msg: 'Bank account connected. Syncing transactions…' });
      onCoverageRefresh?.();
      loadConnections();
      setTimeout(() => setNotif(null), 5000);
    } catch (err) {
      setNotif({ type: 'error', msg: err?.response?.data?.error || 'Could not connect bank account.' });
    } finally {
      setExchanging(false);
    }
  }

  async function handleSyncNow() {
    if (syncing) return;
    const firstConn = connections[0];
    if (!firstConn) return;
    setSyncing(true);
    setNotif(null);
    try {
      const res = await api.post('/integrations/banking/plaid/sync', { connectionId: firstConn.id });
      if (res.data.syncing) {
        setNotif({ type: 'info', msg: 'A sync is already in progress.' });
      } else {
        setNotif({ type: 'success', msg: 'Sync started.' });
        setTimeout(() => { setNotif(null); onCoverageRefresh?.(); }, 4000);
      }
    } catch (err) {
      setNotif({ type: 'error', msg: err?.response?.data?.error || 'Sync failed.' });
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  }

  function handleManageUpdated() {
    loadConnections();
    onCoverageRefresh?.();
  }

  const isConnected     = connInfo !== null;
  const isReauth        = cardStatus === 'REAUTH_REQUIRED';
  const isSyncError     = cardStatus === 'SYNC_ERROR';
  const isActiveSyncing = cardStatus === 'SYNCING' || syncing;

  const badge = STATUS_BADGE[cardStatus] || STATUS_BADGE.not_connected;

  const totalBalance  = connections.reduce((sum, c) =>
    sum + (c.accounts || [])
      .filter(a => a.is_active && a.include_in_cash_position)
      .reduce((s, a) => s + (parseFloat(a.current_balance) || 0), 0), 0
  );
  const totalAccounts = connections.reduce((sum, c) =>
    sum + (c.accounts || []).filter(a => a.is_active).length, 0
  );
  const lastSync = connections[0]?.last_sync_at || connInfo?.lastSyncAt;

  return (
    <div className={`fin-src-card fin-src-card--${isConnected ? (isReauth || isSyncError ? 'degraded' : 'active') : 'not_connected'}`}>
      <div className="fin-src-header">
        <span className="fin-src-name">Banking</span>
        <span className={`fin-src-badge ${badge.cls}`}>{badge.label}</span>
      </div>

      {/* Connected: show institution/account summary */}
      {isConnected && (
        <>
          {connections.length === 1 && connections[0].institution_name && (
            <div className="fin-src-company">{connections[0].institution_name}</div>
          )}

          {connections.length > 1 && (
            <div className="fin-src-company">{connections.length} Institutions Connected</div>
          )}

          {totalAccounts > 0 && (
            <div className="banking-summary-row">
              <span className="banking-summary-label">Total Cash Position</span>
              <span className="banking-summary-value">{fmtMoney(totalBalance)}</span>
            </div>
          )}

          {lastSync && (
            <div className="fin-src-sync-row">
              <span className="fin-src-sync-label">Last Sync</span>
              <span className="fin-src-sync-value">{fmtSyncTime(lastSync)}</span>
            </div>
          )}

          {(isReauth || isSyncError) && connInfo?.lastErrorMessageSafe && (
            <div className="fin-src-error">{connInfo.lastErrorMessageSafe}</div>
          )}
        </>
      )}

      {/* Capabilities */}
      <div className="fin-src-capabilities">
        {['Bank Balances', 'Cash Transactions', 'Cash Out', 'External Deposits', 'Reconciliation'].map(c => (
          <span key={c} className="fin-int-cap">{c}</span>
        ))}
      </div>

      {/* Notification banner */}
      {notif && (
        <div className={`fin-src-notif fin-src-notif--${notif.type}`} role="status">
          {notif.msg}
          <button className="fin-src-notif-dismiss" onClick={() => setNotif(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Actions: connected */}
      {isConnected && (
        <div className="fin-src-actions">
          <button
            type="button"
            className={`fin-src-action-btn${isActiveSyncing ? ' fin-src-action-btn--busy' : ''}`}
            onClick={handleSyncNow}
            disabled={isActiveSyncing}
            aria-label="Sync bank data now"
          >
            {isActiveSyncing ? 'Syncing…' : isSyncError ? 'Retry Sync' : 'Sync Now'}
          </button>
          <button
            type="button"
            className="fin-src-action-btn"
            onClick={() => setShowManage(true)}
            aria-label="Manage bank accounts"
          >
            Manage
          </button>
          {isReauth && (
            <PlaidLinkButton
              onSuccess={handlePlaidSuccess}
              onError={msg => setNotif({ type: 'error', msg })}
              className="fin-src-action-btn"
            >
              Reconnect
            </PlaidLinkButton>
          )}
        </div>
      )}

      {/* Actions: not connected */}
      {!isConnected && configured && (
        <div>
          <PlaidLinkButton
            onSuccess={handlePlaidSuccess}
            onError={msg => setNotif({ type: 'error', msg })}
            disabled={exchanging}
            className="fin-int-connect-btn btn-secondary"
          >
            Connect Bank
          </PlaidLinkButton>
        </div>
      )}

      {/* Not configured */}
      {!isConnected && !configured && (
        <button
          type="button"
          className="fin-int-connect-btn btn-secondary"
          disabled
          aria-label="Banking unavailable — configuration required"
        >
          Configuration Required
        </button>
      )}

      {/* Manage modal */}
      {showManage && (
        <ManageModal
          connections={connections}
          onClose={() => setShowManage(false)}
          onUpdated={handleManageUpdated}
        />
      )}
    </div>
  );
}
