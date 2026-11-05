// Formatting + small shared helpers. Ported from the old static/js/main.js.

export function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function signedMoney(n) {
  const body = money(Math.abs(n || 0));
  return (n || 0) < 0 ? '-' + body : '+' + body;
}

// "2026-09-02" -> "09/02/2026"
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString('en-US', {
    month: 'long', year: 'numeric',
  });
}

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

export function daysBetween(fromISO, toISOStr) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISOStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// "2026-09-02" -> "Sep 2, 2026"
export function longDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// Parse a money value, tolerating "$", commas, and (parentheses) for negative.
export function parseMoney(s) {
  s = String(s == null ? '' : s).trim().replace(/\$/g, '').replace(/,/g, '');
  if (!s) return null;
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
  const v = parseFloat(s);
  if (Number.isNaN(v)) return null;
  return neg ? -v : v;
}

// Add a scheme so a bare domain ("chase.com") still links.
export function normalizeUrl(u) {
  u = String(u == null ? '' : u).trim();
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function titleCase(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
