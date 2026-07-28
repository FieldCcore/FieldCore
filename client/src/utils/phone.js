export function formatPhone(raw) {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}

export function normalizePhone(raw) {
  if (!raw) return '';
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  const d = cleaned.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === '1') return `+${d}`;
  return cleaned;
}

export function isValidPhone(raw) {
  return (raw || '').replace(/\D/g, '').length >= 10;
}
