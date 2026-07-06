import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * SelectDropdown — FieldCore custom select replacement.
 * Props:
 *   value      string          currently selected value
 *   onChange   fn(value)       called with the new value string
 *   options    [{value, label}]
 *   minWidth   number (px)     defaults to 160
 */
export default function SelectDropdown({ value, onChange, options, minWidth = 160 }) {
  const [open, setOpen]       = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown',   onKey);
    };
  }, [open]);

  const selected    = options.find(o => o.value === value);
  const borderColor = open    ? 'var(--sand)'
                    : hovered ? 'var(--slate)'
                    :           'var(--lightgray)';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', minWidth }}>
      {/* ── Trigger ── */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          height: 44,
          width: '100%',
          padding: '0 12px 0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: '#fff',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: 'Inter, sans-serif',
          color: 'var(--navy)',
          cursor: 'pointer',
          transition: 'border-color .15s',
          outline: 'none',
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
        }}
      >
        <span>{selected ? selected.label : '—'}</span>
        <ChevronDown
          size={15}
          style={{
            color: 'var(--slate)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .18s',
          }}
        />
      </button>

      {/* ── Menu ── */}
      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: '100%',
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: '#fff',
            border: '1.5px solid var(--lightgray)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.06)',
            zIndex: 300,
            overflow: 'hidden',
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
                  height: 40,
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isSel ? 600 : 400,
                  fontFamily: 'Inter, sans-serif',
                  color: isSel ? '#fff' : 'var(--navy)',
                  background: isSel ? 'var(--navy)' : 'transparent',
                  cursor: 'pointer',
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
        </ul>
      )}
    </div>
  );
}
