import React from 'react';

/**
 * FieldCore Logo
 * dark     — use light colours (navy→offwhite) for use on dark backgrounds
 * scale    — multiplier for the full icon+wordmark; default 1 = full size (82px icon, 42px text)
 * noIcon   — render wordmark only
 *
 * Navbar usage: <FieldCoreLogo dark scale={18/42} />
 */
export default function FieldCoreLogo({ dark = false, scale = 1, noIcon = false }) {
  const NAVY = dark ? '#EDEBE7' : '#1C2333';
  const TAN  = '#D6B58A';

  const sq = (top, left, color) => (
    <div
      key={`${top}-${left}`}
      style={{
        position:     'absolute',
        top:          top  * scale,
        left:         left * scale,
        width:        26   * scale,
        height:       26   * scale,
        borderRadius: 6    * scale,
        background:   color,
        flexShrink:   0,
      }}
    />
  );

  const iconW = 82 * scale;
  // tan square overflows 10px above the top — give wrapper extra headroom
  const iconH = (82 + 10) * scale;

  return (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      gap:         18 * scale,
      userSelect:  'none',
      flexShrink:  0,
    }}>
      {!noIcon && (
        <div style={{
          position: 'relative',
          width:    iconW,
          height:   iconH,
          flexShrink: 0,
          // shift down so the overflowing tan square is visible
          marginTop: 10 * scale,
        }}>
          {/* top center — navy */}
          {sq(0,   28, NAVY)}
          {/* top right offset — tan (overflows container top by 10px) */}
          {sq(-10, 56, TAN)}
          {/* middle left — navy */}
          {sq(28,  0,  NAVY)}
          {/* middle right — navy */}
          {sq(28,  56, NAVY)}
          {/* bottom center — navy */}
          {sq(56,  28, NAVY)}
        </div>
      )}
      <div style={{
        fontFamily:    "'Inter', sans-serif",
        fontWeight:    800,
        fontSize:      42 * scale,
        letterSpacing: '0.04em',
        color:         NAVY,
        lineHeight:    1,
      }}>
        FIELDCORE
      </div>
    </div>
  );
}
