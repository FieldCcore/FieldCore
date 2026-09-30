const CURRENCY_EXPONENTS = {
  USD:2, EUR:2, GBP:2, CAD:2, AUD:2, NZD:2, CHF:2, SEK:2, NOK:2, DKK:2,
  SGD:2, HKD:2, MXN:2, BRL:2, ZAR:2, INR:2, CNY:2, AED:2, SAR:2, QAR:2,
  MYR:2, THB:2, PHP:2, IDR:2, PLN:2, CZK:2, HUF:2, RON:2, TRY:2, ILS:2,
  EGP:2, MAD:2, NGN:2, GHS:2, KES:2, COP:2, PEN:2, ARS:2, CLP:2,
  JPY:0, KRW:0, VND:0, PYG:0, UGX:0, RWF:0, GNF:0, XOF:0, XAF:0,
  XPF:0, BIF:0, DJF:0, KMF:0, MGA:0,
  BHD:3, IQD:3, JOD:3, KWD:3, LYD:3, OMR:3, TND:3,
  CLF:4, UYW:4,
};

export function formatMinorUnits(minor, currencyCode) {
  if (minor == null || minor === '') return '—';
  const code = String(currencyCode || '').toUpperCase();
  const exp = CURRENCY_EXPONENTS[code] ?? 2;
  const display = (Number(minor) / Math.pow(10, exp)).toFixed(exp);
  return code ? `${code} ${display}` : display;
}

export function formatDateOnly(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const parts = s.split('-');
  if (parts.length < 3) return '—';
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function truncateMiddle(str, maxLen = 20) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 1) / 2);
  const tail = maxLen - 1 - half;
  return `${str.slice(0, half)}…${str.slice(-tail)}`;
}
