import { useRef, useCallback } from 'react';

function ChevronIcon({ dir }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }} aria-hidden="true">
      <path
        d={dir === 'left' ? 'M10 4L6 8l4 4' : 'M6 4l4 4-4 4'}
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13 }} aria-hidden="true">
      <path
        d="M3 4h10v9H3V4zm0 0V2h10v2M6 2v2m4-2v2M3 8h10"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// Format date as "Today, Aug 2" or "Sat, Aug 2"
function formatDispatchDate(dateStr, isToday) {
  if (!dateStr || isToday) return 'Today';
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids DST shift issues
  const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
  const month   = d.toLocaleDateString(undefined, { month: 'short' });
  const day     = d.getDate();
  return `${dayName}, ${month} ${day}`;
}

// Parse 'YYYY-MM-DD' → Date (noon local to avoid DST issues)
function parseLocal(str) {
  return new Date(str + 'T12:00:00');
}

// Format Date → 'YYYY-MM-DD'
function toYmd(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

// Compute today's local YYYY-MM-DD using browser time.
// In production the server uses tenant TZ, but for UI nav this is a best-effort helper.
function todayYmd() {
  return toYmd(new Date());
}

/**
 * Compact date navigator rendered inside the expanded Dispatch sidebar.
 *
 * Props:
 *   date        — 'YYYY-MM-DD' or null (null = today)
 *   onDateChange — called with 'YYYY-MM-DD' or null (when navigating to today)
 *   accountName  — optional entity label for scope line (e.g. 'Apex Electric')
 */
export default function DispatchDateControl({ date, onDateChange, accountName }) {
  const inputRef = useRef(null);

  const isToday  = !date;
  const todayStr = todayYmd();
  const dateStr  = date ?? todayStr;

  const goPrev = useCallback(() => {
    const d = parseLocal(dateStr);
    d.setDate(d.getDate() - 1);
    const prev = toYmd(d);
    onDateChange(prev === todayStr ? null : prev);
  }, [dateStr, todayStr, onDateChange]);

  const goNext = useCallback(() => {
    const d = parseLocal(dateStr);
    d.setDate(d.getDate() + 1);
    const next = toYmd(d);
    onDateChange(next === todayStr ? null : next);
  }, [dateStr, todayStr, onDateChange]);

  const goToday = useCallback(() => {
    onDateChange(null);
  }, [onDateChange]);

  const handlePickerChange = useCallback((e) => {
    const val = e.target.value; // 'YYYY-MM-DD'
    if (!val) { onDateChange(null); return; }
    onDateChange(val === todayStr ? null : val);
  }, [todayStr, onDateChange]);

  const openPicker = useCallback(() => {
    inputRef.current?.showPicker?.();
    inputRef.current?.click();
  }, []);

  const label = formatDispatchDate(dateStr, isToday);
  const scopeLine = accountName
    ? `${accountName} · ${isToday ? 'Today' : formatDispatchDate(dateStr, false)}`
    : `All jobs · ${isToday ? 'Today' : formatDispatchDate(dateStr, false)}`;

  return (
    <div className="dispatch-date-control" aria-label="Dispatch date navigation">
      {/* Scope label */}
      <div className="dispatch-date-scope" aria-live="polite">{scopeLine}</div>

      {/* Date navigator */}
      <div className="dispatch-date-nav">
        <button
          type="button"
          className="dispatch-date-nav-btn"
          onClick={goPrev}
          aria-label="Previous day"
        >
          <ChevronIcon dir="left" />
        </button>

        <div className="dispatch-date-center">
          {/* Clickable date label opens picker */}
          <button
            type="button"
            className="dispatch-date-label-btn"
            onClick={openPicker}
            aria-label={`Selected date: ${label}. Click to open date picker`}
          >
            <CalendarIcon />
            <span className="dispatch-date-label-text">{label}</span>
          </button>
          {/* Hidden date input for native picker */}
          <input
            ref={inputRef}
            type="date"
            className="dispatch-date-input-hidden"
            value={dateStr}
            onChange={handlePickerChange}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        <button
          type="button"
          className="dispatch-date-nav-btn"
          onClick={goNext}
          aria-label="Next day"
        >
          <ChevronIcon dir="right" />
        </button>
      </div>

      {/* Today shortcut — only when not already on today */}
      {!isToday && (
        <button
          type="button"
          className="dispatch-date-today-btn"
          onClick={goToday}
          aria-label="Go to today"
        >
          Back to Today
        </button>
      )}
    </div>
  );
}
