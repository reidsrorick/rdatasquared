// Hash router. Paths look like  #/transactions?view=review .
// Views read the current path/query; nothing here touches the DOM.

export const ROUTES = [
  'dashboard', 'transactions', 'budget', 'bills',
  'accounts', 'categories', 'tags', 'data', 'import',
];

const DEFAULT = 'dashboard';

export function currentPath() {
  const raw = location.hash.replace(/^#\/?/, '');
  const path = raw.split('?')[0] || DEFAULT;
  return ROUTES.includes(path) ? path : DEFAULT;
}

export function currentQuery() {
  const i = location.hash.indexOf('?');
  return new URLSearchParams(i === -1 ? '' : location.hash.slice(i + 1));
}

export function navigate(path, query) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  location.hash = '#/' + path + qs;
}

export function onChange(fn) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

export function ensureHash() {
  if (!location.hash) location.hash = '#/' + DEFAULT;
}
