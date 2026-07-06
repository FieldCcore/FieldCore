import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * SelectDropdown — FieldCore custom select replacement.
 * Menu is rendered via portal into document.body (position: fixed) so it
 * escapes all overflow:hidden ancestors without clipping.
 *
 * Props:
 *   value      string           currently selected value
 *   onChange   fn(value)        called with the new value string
 *   options    [{value, label}]
 *   minWidth   number (px)      defaults to 160
 */
export default function SelectDropdown({ value, onChange, options, minWidth = 160 }) {
  const [open,    setOpen]    = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0, openUp: false });

  const triggerRef = useRef(null);
  const menuRef    = useRef(null);

  // Recalculate fixed position from trigger's viewport rect.
  // Uses position:fixed so no scrollY offset is needed.
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect       = triggerRef.current.getBoundingClientRect();
    const itemHeight = 40;
    const menuHeight = options.length * itemHeight + 8; // padding 4px top+bottom
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp     = spaceBelow < menuHeight + 16 && rect.top > menuHeight + 16;
    setMenuPos({
      top:    openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
      left:   rect.left,
      width:  Math.max(rect.width, minWidth),
      openUp,
    });
  }, [options.length, minWidth]);

  useEffect(() => {
    if (!open) return;
    calcPos();

    function onDown(e) {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inMenu    = menuRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    // capture:true catches scroll on any ancestor, not just window
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown',   onKey);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown',   onKey);
    };
  }, [open, calcPos]);

  const selected    = options.find(o => o.value === value);
  const borderColor = open    ? 'var(--sand)'
                    : hovered ? 'var(--slate)'
                    :           'var(--lightgray)';

  const menu = open && createPortal(
    <ul
      ref={menuRef}
      role="listbox"
      style={{
        position:     'fixed',
        top:          menuPos.top,
        left:         menuPos.left,
        width:        menuPos.width,
        margin:       0,
        padding:      4,
        listStyle:    'none',
        background:   '#fff',
        border:       '1.5px solid var(--lightgray)',
        borderRadius: 12,
        boxShadow:    '0 8px 24px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.06)',
        zIndex:       9999,
        overflow:     'hidden',
        fontFamily:   'Inter, sans-serif',
      }}
    >
      {options.map(opt => {
        const isSel = opt.value === value;
        return (
          <li
            key={opt.value}
            role="option"
            aria-selected={isSel}
            onMouseDown={e => e.preventDefault()}
            onClick={() => { onChange(opt.value); setOpen(false); }}
            style={{
              height:     40,
              padding:    '0 12px',
              display:    'flex',
              alignItems: 'center',
              borderRadius: 8,
              fontSize:   13,
              fontWeight: isSel ? 600 : 400,
              fontFamily: 'Inter, sans-serif',
              color:      isSel ? '#fff' : 'var(--navy)',
              background: isSel ? 'var(--navy)' : 'transparent',
              cursor:     'pointer',
              transition: 'background .1s',
              userSelect: 'none',
            }}
            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--offwhite)'; }}
            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
          >
            {opt.label}
          </li>
        );
      })}
    </ul>,
    document.body
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block', minWidth }}>
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          height:      44,
          width:       '100%',
          padding:     '0 12px 0 14px',
          display:     'flex',
          alignItems:  'center',
          justifyContent: 'space-between',
          gap:         8,
          background:  '#fff',
          border:      `1.5px solid ${borderColor}`,
          borderRadius: 12,
          fontSize:    13,
          fontWeight:  500,
          fontFamily:  'Inter, sans-serif',
          color:       'var(--navy)',
          cursor:      'pointer',
          transition:  'border-color .15s',
          outline:     'none',
          whiteSpace:  'nowrap',
          boxSizing:   'border-box',
        }}
      >
        <span>{selected ? selected.label : '—'}</span>
        <ChevronDown
          size={15}
          style={{
            color:      'var(--slate)',
            flexShrink: 0,
            transform:  open ? 'rotate(180deg)' : 'none',
            transition: 'transform .18s',
          }}
        />
      </button>

      {menu}
    </div>
  );
}
