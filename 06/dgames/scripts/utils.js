/* ============================================================
   UTILS — Pure helpers with no side effects.
   ============================================================ */
window.Utils = (() => {

  /** Generate a unique ID for user-added games. */
  function generateId() {
    const ts  = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 7);
    return `user_${ts}_${rnd}`;
  }

  /** Current timestamp as ISO string. */
  function isoNow() {
    return new Date().toISOString();
  }

  /** Format ISO string to "Apr 17, 2026". */
  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
    } catch { return iso; }
  }

  /** Debounce — returns a function that delays invoking fn by ms. */
  function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /** Safely escape HTML for textContent insertion. */
  function esc(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  /** Truncate a string to maxLen, adding "…" if cut. */
  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  /** Validate that a string is a reachable-looking URL. */
  function isValidUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }

  /** Normalize a URL for duplicate comparison: lowercase, no trailing slash. */
  function normalizeUrl(url) {
    try {
      const u = new URL(url.trim());
      return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase()
           + (u.search || '') + (u.hash || '');
    } catch { return url.trim().toLowerCase().replace(/\/+$/, ''); }
  }

  /**
   * Deterministic "color bucket" from a string, 0–5, for placeholder gradients.
   * Maps the first character code (mod 6) so similar titles don't clash too often.
   */
  function colorIndex(str) {
    if (!str) return 0;
    let h = 0;
    for (let i = 0; i < Math.min(str.length, 8); i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h % 6;
  }

  /**
   * Emoji/letter placeholder for cards without thumbnails.
   * Returns { style, letter } where style is a CSS gradient string.
   */
  function placeholder(title) {
    const idx    = colorIndex(title);
    const letter = (title || '?')[0].toUpperCase();
    return { idx, letter };
  }

  /** Parse a comma-separated tag string into a clean array. */
  function parseTags(str) {
    if (!str) return [];
    return str.split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0 && t.length <= 40);
  }

  /** Format a tags array back to a comma-separated string. */
  function tagsToString(arr) {
    return Array.isArray(arr) ? arr.join(', ') : '';
  }

  /** Deep clone via JSON (safe for plain-data objects). */
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** Show a toast notification. type: 'success' | 'error' | 'info' | 'warning' */
  function toast(message, type = 'success', duration = 3200) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('visible'));
    });

    // Animate out and remove
    setTimeout(() => {
      el.classList.remove('visible');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
  }

  return {
    generateId, isoNow, formatDate, debounce, esc, truncate,
    isValidUrl, normalizeUrl, colorIndex, placeholder,
    parseTags, tagsToString, clone, toast,
  };
})();
