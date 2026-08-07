import React, { createContext, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const RevenueFilterContext = createContext(null);

// UTC today as 'YYYY-MM-DD'
function utcToday() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// UTC date offset by N days from today
function utcOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// First day of UTC month
function utcMonthStart(offsetMonths = 0) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`;
}

// Last day of UTC previous month
function utcLastMonthEnd() {
  const d = new Date();
  d.setUTCDate(0); // last day of previous month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// UTC quarter start
function utcQuarterStart() {
  const d = new Date();
  const m = d.getUTCMonth(); // 0-11
  const qStartMonth = Math.floor(m / 3) * 3; // 0, 3, 6, 9
  return `${d.getUTCFullYear()}-${String(qStartMonth+1).padStart(2,'0')}-01`;
}

// UTC year start
function utcYearStart() {
  return `${new Date().getUTCFullYear()}-01-01`;
}

// UTC week start (Monday)
function utcWeekStart() {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function buildPresets() {
  const today = utcToday();
  return [
    { label: 'Today',           start: today,             end: today,               key: 'today' },
    { label: 'This Week',       start: utcWeekStart(),    end: today,               key: 'this_week' },
    { label: 'Month to Date',   start: utcMonthStart(),   end: today,               key: 'mtd' },
    { label: 'Last Month',      start: utcMonthStart(-1), end: utcLastMonthEnd(),   key: 'last_month' },
    { label: 'Quarter to Date', start: utcQuarterStart(), end: today,               key: 'qtd' },
    { label: 'Year to Date',    start: utcYearStart(),    end: today,               key: 'ytd' },
  ];
}

const VALID_VIEWS = ['overview', 'financials', 'operations', 'customers', 'forecasting', 'reports'];
const COMPARISON_OPTIONS = [
  { value: 'none',             label: 'No comparison'    },
  { value: 'previous_period',  label: 'Previous Period'  },
  { value: 'previous_month',   label: 'Previous Month'   },
  { value: 'previous_quarter', label: 'Previous Quarter' },
  { value: 'previous_year',    label: 'Previous Year'    },
];
const INTERVAL_OPTIONS = [
  { value: 'daily',   label: 'Daily'   },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
];

export function RevenueFilterProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const presets = useMemo(() => buildPresets(), []);
  const defaultPreset = presets.find(p => p.key === 'mtd');

  // Read from URL, with sensible defaults
  const view       = VALID_VIEWS.includes(searchParams.get('view'))      ? searchParams.get('view')      : 'overview';
  const start      = searchParams.get('start')      || defaultPreset.start;
  const end        = searchParams.get('end')        || defaultPreset.end;
  const comparison = searchParams.get('comparison') || 'none';
  const interval   = searchParams.get('interval')   || 'daily';
  const preset     = searchParams.get('preset')     || 'mtd';

  function applyParams(updates) {
    const current = { view, start, end, comparison, interval, preset };
    const merged  = { ...current, ...updates };
    const next    = {};
    // Only include non-default values in URL to keep URLs clean
    if (merged.view !== 'overview') next.view = merged.view;
    next.start = merged.start;
    next.end   = merged.end;
    if (merged.comparison && merged.comparison !== 'none') next.comparison = merged.comparison;
    if (merged.interval   && merged.interval   !== 'daily') next.interval  = merged.interval;
    if (merged.preset     && merged.preset     !== 'mtd')   next.preset    = merged.preset;
    setSearchParams(next, { replace: true });
  }

  function setFilter(key, value) {
    applyParams({ [key]: value });
  }

  function setPreset(presetKey) {
    const p = presets.find(pr => pr.key === presetKey);
    if (p) applyParams({ start: p.start, end: p.end, preset: presetKey });
  }

  function resetFilters() {
    setSearchParams({}, { replace: true });
  }

  const filters = { view, start, end, comparison, interval, preset };

  const value = {
    filters,
    setFilter,
    setPreset,
    resetFilters,
    presets,
    COMPARISON_OPTIONS,
    INTERVAL_OPTIONS,
    VALID_VIEWS,
  };

  return (
    <RevenueFilterContext.Provider value={value}>
      {children}
    </RevenueFilterContext.Provider>
  );
}

export function useRevenueFilters() {
  const ctx = useContext(RevenueFilterContext);
  if (!ctx) throw new Error('useRevenueFilters must be used within RevenueFilterProvider');
  return ctx;
}
