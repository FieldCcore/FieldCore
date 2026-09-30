import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { AuLoading, AuError, AuEmpty, fmtDateTime } from './AuthorityShared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScopeBadge({ scope }) {
  return (
    <span className="au-badge au-badge--active" style={{ marginRight: 4, fontSize: '0.75rem' }}>
      {scope}
    </span>
  );
}

function StatusBadge({ status }) {
  const cls = status === 'active' ? 'au-badge--active' : 'au-badge--revoked';
  return <span className={`au-badge ${cls}`}>{status}</span>;
}

// ── One-time secret display ───────────────────────────────────────────────────

function OneTimeSecretDisplay({ credential, publicId, label, onDismiss }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(credential).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }).catch(() => {});
    }
  }

  return (
    <div className="au-one-time-secret" data-testid="one-time-secret-display">
      <div className="au-one-time-secret__warning">
        Copy now — this secret will not be shown again.
      </div>
      <div className="au-one-time-secret__meta">
        <span>Label: </span>
        <span data-testid="one-time-label">{label}</span>
      </div>
      <div className="au-one-time-secret__meta">
        <span>Public ID: </span>
        <code data-testid="one-time-public-id">{publicId}</code>
      </div>
      <div className="au-one-time-secret__value">
        <code data-testid="one-time-secret-value">{credential}</code>
      </div>
      <div className="au-one-time-secret__actions">
        <button
          type="button"
          className="au-btn au-btn--primary"
          onClick={handleCopy}
          data-testid="copy-secret-btn"
        >
          {copied ? 'Copied!' : 'Copy Secret'}
        </button>
        <button
          type="button"
          className="au-btn au-btn--secondary"
          onClick={onDismiss}
          data-testid="dismiss-secret-btn"
        >
          I have saved this secret
        </button>
      </div>
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateCredentialForm({ validScopes, canEvaluate, onCreated, onCancel }) {
  const [label, setLabel] = useState('');
  const [selectedScopes, setSelectedScopes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const grantableScopes = validScopes.filter(s => {
    if (s === 'authority:evaluate') return canEvaluate;
    return true;
  });

  function toggleScope(scope) {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) { setError('Label is required.'); return; }
    if (selectedScopes.length === 0) { setError('Select at least one scope.'); return; }
    setSubmitting(true);
    try {
      const data = await api.post('/authority/credentials', { label: label.trim(), scopes: selectedScopes });
      onCreated(data);
    } catch (err) {
      setError(err.message || 'Create failed.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="au-form" data-testid="create-credential-form">
      <h3 className="au-section-title">New API Credential</h3>
      <AuError msg={error} />
      <div className="au-field">
        <label className="au-label" htmlFor="cred-label">Label</label>
        <input
          id="cred-label"
          className="au-input"
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={100}
          placeholder="e.g. Production server"
          data-testid="cred-label-input"
        />
      </div>
      <div className="au-field">
        <span className="au-label">Scopes</span>
        {grantableScopes.length === 0 && (
          <p className="au-info">You do not have the capabilities required to grant any scopes.</p>
        )}
        {grantableScopes.map(scope => (
          <label key={scope} className="au-checkbox-label" data-testid={`scope-checkbox-${scope}`}>
            <input
              type="checkbox"
              checked={selectedScopes.includes(scope)}
              onChange={() => toggleScope(scope)}
            />
            {' '}{scope}
          </label>
        ))}
      </div>
      <div className="au-actions">
        <button
          type="submit"
          className="au-btn au-btn--primary"
          disabled={submitting}
          data-testid="create-credential-submit"
        >
          {submitting ? 'Creating…' : 'Create Credential'}
        </button>
        <button
          type="button"
          className="au-btn au-btn--secondary"
          onClick={onCancel}
          disabled={submitting}
          data-testid="create-credential-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Revoke dialog ─────────────────────────────────────────────────────────────

function RevokeDialog({ cred, onRevoked, onCancel }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleRevoke() {
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/authority/credentials/${cred.id}`, { reason: reason.trim() || null });
      onRevoked(cred.id);
    } catch (err) {
      setError(err.message || 'Revoke failed.');
      setSubmitting(false);
    }
  }

  return (
    <div className="au-dialog-overlay" data-testid="revoke-dialog">
      <div className="au-dialog">
        <h3 className="au-dialog__title">Revoke Credential</h3>
        <p>
          Revoke <strong data-testid="revoke-cred-label">{cred.label}</strong>?
        </p>
        <p className="au-dialog__meta">
          Public ID: <code data-testid="revoke-cred-public-id">{cred.public_id}</code>
        </p>
        <p className="au-dialog__warn">
          Revocation is immediate and permanent. This credential will no longer authenticate.
          There is no undo.
        </p>
        <AuError msg={error} />
        <div className="au-field">
          <label className="au-label" htmlFor="revoke-reason">Reason (optional)</label>
          <input
            id="revoke-reason"
            className="au-input"
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={500}
            data-testid="revoke-reason-input"
          />
        </div>
        <div className="au-actions">
          <button
            type="button"
            className="au-btn au-btn--danger"
            onClick={handleRevoke}
            disabled={submitting}
            data-testid="revoke-confirm-btn"
          >
            {submitting ? 'Revoking…' : 'Revoke Credential'}
          </button>
          <button
            type="button"
            className="au-btn au-btn--secondary"
            onClick={onCancel}
            disabled={submitting}
            data-testid="revoke-cancel-btn"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Credential row ────────────────────────────────────────────────────────────

function CredentialRow({ cred, canManage, onRevoke }) {
  return (
    <tr data-testid={`cred-row-${cred.id}`}>
      <td data-testid="cred-label">{cred.label}</td>
      <td><code data-testid="cred-public-id">{cred.public_id}</code></td>
      <td>
        {(cred.scopes || []).map(s => <ScopeBadge key={s} scope={s} />)}
      </td>
      <td><StatusBadge status={cred.status} /></td>
      <td data-testid="cred-created-at">{fmtDateTime(cred.created_at)}</td>
      <td data-testid="cred-last-used">{cred.last_used_at ? fmtDateTime(cred.last_used_at) : '—'}</td>
      <td data-testid="cred-revoked-at">
        {cred.revoked_at ? fmtDateTime(cred.revoked_at) : '—'}
      </td>
      <td>
        {canManage && cred.status === 'active' && (
          <button
            type="button"
            className="au-btn au-btn--danger au-btn--sm"
            onClick={() => onRevoke(cred)}
            data-testid={`revoke-btn-${cred.id}`}
          >
            Revoke
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuthorityCredentials() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [validScopes, setValidScopes] = useState([]);
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [hasManage, setHasManage]   = useState(false);
  const [hasEvaluate, setHasEvaluate] = useState(false);
  const [hasRead, setHasRead]       = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newSecret, setNewSecret]   = useState(null); // { credential, publicId, label }
  const [revokeTarget, setRevokeTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [capRes, listRes] = await Promise.all([
        api.get('/authority/capabilities'),
        api.get('/authority/credentials').catch(e => {
          // 503 or 403 from AUTHORITY_ENABLED check — still show page state
          if (e.status === 503 || e.status === 404) return null;
          throw e;
        }),
      ]);

      const caps = capRes.capabilities || capRes || [];
      const capSet = new Set(Array.isArray(caps) ? caps : []);
      setHasManage(capSet.has('AUTHORITY_API_CREDENTIAL_MANAGE'));
      setHasRead(capSet.has('AUTHORITY_API_CREDENTIAL_READ'));
      setHasEvaluate(capSet.has('AUTHORITY_EVALUATE'));

      if (listRes) {
        setCredentials(listRes.credentials || []);
        setValidScopes(listRes.valid_scopes || []);
        setFlagEnabled(!!listRes.flag_enabled);
      }
    } catch (err) {
      setError(err.message || 'Failed to load credentials.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated(data) {
    // Hold raw credential in transient state only — never in storage.
    setNewSecret({
      credential: data.credential,
      publicId:   data.public_id,
      label:      data.label,
    });
    setShowCreate(false);
    // Reload list (new credential won't have secret in the list).
    load();
  }

  function handleSecretDismissed() {
    // Clear the secret from state — it will not be shown again.
    setNewSecret(null);
  }

  function handleRevoked(credentialId) {
    setRevokeTarget(null);
    setCredentials(prev => prev.map(c =>
      c.id === credentialId ? { ...c, status: 'revoked', revoked_at: new Date().toISOString() } : c
    ));
  }

  if (loading) return <AuLoading />;
  if (error)   return <AuError msg={error} />;

  return (
    <div className="au-page" data-testid="authority-credentials-page">
      <div className="au-page__header">
        <h1 className="au-page__title">Authority API Credentials</h1>
        <p className="au-page__subtitle">
          Manage machine-to-machine credentials for institution server-side systems.
        </p>
      </div>

      {!flagEnabled && (
        <div className="au-info" data-testid="flag-off-message">
          External API access is not enabled for this account.
          {(hasManage || hasRead) && credentials.length > 0
            ? ' You can view and revoke existing credentials below. Contact support to enable external API access.'
            : ' Contact support to enable external API access.'}
        </div>
      )}

      {newSecret && (
        <OneTimeSecretDisplay
          credential={newSecret.credential}
          publicId={newSecret.publicId}
          label={newSecret.label}
          onDismiss={handleSecretDismissed}
        />
      )}

      {revokeTarget && (
        <RevokeDialog
          cred={revokeTarget}
          onRevoked={handleRevoked}
          onCancel={() => setRevokeTarget(null)}
        />
      )}

      {showCreate && (
        <CreateCredentialForm
          validScopes={validScopes}
          canEvaluate={hasEvaluate}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!showCreate && !newSecret && hasManage && flagEnabled && (
        <div className="au-toolbar" data-testid="create-credential-toolbar">
          <button
            type="button"
            className="au-btn au-btn--primary"
            onClick={() => setShowCreate(true)}
            data-testid="open-create-form-btn"
          >
            + New Credential
          </button>
        </div>
      )}

      {!showCreate && !newSecret && flagEnabled && (
        <div className="au-info" style={{ marginTop: 12, fontSize: '0.85rem' }}>
          <strong>Replace / rotate:</strong> Create a new credential, update your server
          to use the new credential, then revoke the old one using the Revoke button.
          Old credentials remain active until explicitly revoked.
        </div>
      )}

      <div className="au-section" data-testid="credentials-list">
        <h2 className="au-section-title">Credentials</h2>
        {credentials.length === 0 ? (
          <AuEmpty text="No credentials yet." />
        ) : (
          <table className="au-table" data-testid="credentials-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Public ID</th>
                <th>Scopes</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Revoked</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(c => (
                <CredentialRow
                  key={c.id}
                  cred={c}
                  canManage={hasManage}
                  onRevoke={setRevokeTarget}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="au-disclaimer" data-testid="api-disclaimer">
        API credentials are machine-to-machine tokens. The raw secret is shown
        once at creation and cannot be retrieved. Store it securely. Revocation
        takes effect immediately. Historical evaluation records remain available
        after revocation. This API is for server-side use only — do not use
        credentials in browsers or client-side code.
      </div>
    </div>
  );
}
