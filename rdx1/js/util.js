// ===== Small DOM + date helpers =====

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---- dates ----
export function todayISO() {
  const d = new Date();
  return isoDate(d);
}

export function isoDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function fmtDate(s) {
  const d = parseISO(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateShort(s) {
  const d = parseISO(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return `${-n} days ago`;
  return `in ${n} days`;
}

export function exportFilename(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} RDX1_Export.json`;
}

// ---- text ----
export function initials(first, last) {
  const a = (first || '').trim(), b = (last || '').trim();
  if (a || b) return ((a[0] || '') + (b[0] || '')).toUpperCase() || '?';
  return '?';
}

// Deterministic color from a string, blended toward the brand palette.
const BRAND = ['#1E40D4', '#2563eb', '#0ea5e9', '#10B982', '#059669', '#F97316', '#ea580c', '#7c3aed'];
export function colorFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return BRAND[h % BRAND.length];
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

export function confirmModal({ title, body, confirmText = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const back = el('div', { class: 'modal-back' });
    const done = v => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('h3', { text: title }),
      body ? el('p', { class: 'muted', text: body }) : null,
      el('div', { class: 'form-actions' }, [
        el('button', { class: 'btn btn-ghost', text: 'Cancel', onclick: () => done(false) }),
        el('button', { class: danger ? 'btn btn-danger' : 'btn', text: confirmText, onclick: () => done(true) }),
      ]),
    ]);
    back.appendChild(modal);
    back.addEventListener('click', e => { if (e.target === back) done(false); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
  });
}
