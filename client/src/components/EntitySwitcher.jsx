import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DOT_COLORS = ['#D6B58A', '#7B9EC9', '#82C9A0', '#C98282', '#C9B882'];

export default function EntitySwitcher() {
  const { user, accounts, switching, switchError, switchAccount } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef    = useRef(null);
  const triggerRef = useRef(null);
  const menuRef    = useRef(null);

  const activeAccount = accounts.find(a => a.id === user?.accountId);
  const otherAccounts = accounts.filter(a => a.id !== user?.accountId);
  const hasOthers     = otherAccounts.length > 0;

  function dotColor(account) {
    const idx = accounts.indexOf(account);
    return DOT_COLORS[idx % DOT_COLORS.length];
  }

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus first menu item when dropdown opens
  useEffect(() => {
    if (open && menuRef.current) {
      const first = menuRef.current.querySelector('[role="menuitem"]:not([disabled])');
      first?.focus();
    }
  }, [open]);

  function handleTriggerKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ' ') && hasOthers) {
      e.preventDefault();
      setOpen(o => !o);
    } else if (e.key === 'ArrowDown' && hasOthers) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function handleMenuKeyDown(e) {
    if (!menuRef.current) return;
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if      (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home')      { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End')       { e.preventDefault(); items[items.length - 1]?.focus(); }
  }

  async function handleSwitch(accountId) {
    if (switching) return;
    setOpen(false);
    try {
      await switchAccount(accountId);
      nav('/dashboard');
    } catch {}
  }

  if (!activeAccount) return null;

  return (
    <div className="entity-panel" ref={wrapRef}>
      <div className="entity-section-label">Entities</div>

      {/* Active entity — always visible; acts as dropdown trigger when others exist */}
      <button
        ref={triggerRef}
        className={'entity-opt active' + (hasOthers ? ' entity-trigger' : '')}
        onClick={() => { if (hasOthers) setOpen(o => !o); }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup={hasOthers ? 'menu' : undefined}
        aria-expanded={hasOthers ? open : undefined}
        aria-controls={hasOthers && open ? 'es-entity-menu' : undefined}
        disabled={switching}
        title={activeAccount.name}
      >
        <span className="entity-dot" style={{ background: dotColor(activeAccount) }} />
        <span className="entity-name active" style={{ fontSize: 11.5 }}>
          {switching ? 'Switching…' : activeAccount.name}
        </span>
        <span className="entity-badge active">
          {switching ? '…' : activeAccount.role}
        </span>
        {hasOthers && (
          <ChevronDown
            size={12}
            className={'entity-chevron' + (open ? ' open' : '')}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Dropdown — other entities only, never includes the active entity */}
      {open && (
        <div
          id="es-entity-menu"
          ref={menuRef}
          role="menu"
          aria-label="Switch entity"
          className="entity-dropdown"
          onKeyDown={handleMenuKeyDown}
        >
          {otherAccounts.map(a => (
            <button
              key={a.id}
              role="menuitem"
              className="entity-opt entity-dropdown-item"
              onClick={() => handleSwitch(a.id)}
              disabled={switching}
              title={a.name}
            >
              <span className="entity-dot" style={{ background: dotColor(a) }} />
              <span className="entity-name" style={{ fontSize: 11.5 }}>{a.name}</span>
              <span className="entity-badge">{a.role}</span>
            </button>
          ))}
        </div>
      )}

      {switchError && (
        <div className="entity-switch-error">{switchError}</div>
      )}

      {!hasOthers && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.22)', padding: '4px 12px', fontStyle: 'italic' }}>
          Add more entities in{' '}
          <a href="/entities" style={{ color: 'rgba(214,181,138,.55)', textDecoration: 'none' }}>Entities</a>
        </div>
      )}
    </div>
  );
}
