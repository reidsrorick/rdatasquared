// App chrome: the sidebar nav, plus the privacy-mode / collapse / mobile-drawer
// toggles ported from the old static/js/main.js. These toggle classes on
// <html> and persist to localStorage; they live outside Preact on purpose.

import { html } from './vendor/preact-htm.js';

const PRIVACY_KEY = 'rbs_privacy_mode';
const SIDEBAR_KEY = 'rbs_sidebar_collapsed';

export function toggleMobileNav() {
  document.documentElement.classList.toggle('mobile-nav-open');
}

export function toggleSidebar() {
  const collapsed = !document.documentElement.classList.contains('sidebar-collapsed');
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
  try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch (e) {}
  setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
}

export function togglePrivacyMode() {
  const on = !document.documentElement.classList.contains('privacy-mode');
  document.documentElement.classList.toggle('privacy-mode', on);
  try { localStorage.setItem(PRIVACY_KEY, on ? '1' : '0'); } catch (e) {}
  if (!on) {
    document.querySelectorAll('.revealed').forEach((el) => el.classList.remove('revealed'));
  }
}

export function initChrome() {
  // Click a masked figure to reveal it while privacy mode is on.
  const MASK_SEL = [
    '.amount-expense', '.amount-income', '.stat-value', '.result-num',
    '.import-stat-num', '.progress-label', '.budget-input', '.budget-grp-budget',
    '.budget-bar-amt', '.due-amount',
  ].join(', ');

  document.addEventListener('click', (e) => {
    if (!document.documentElement.classList.contains('privacy-mode')) return;
    const t = e.target.closest(MASK_SEL);
    if (!t) return;
    e.stopPropagation();
    if (t.tagName === 'INPUT') {
      // First click reveals + focuses for editing; click again (or blur) re-masks.
      if (t.classList.contains('revealed')) { t.classList.remove('revealed'); t.blur(); }
      else t.classList.add('revealed');
      return;
    }
    t.classList.toggle('revealed');
  }, true);

  document.addEventListener('blur', (e) => {
    if (!document.documentElement.classList.contains('privacy-mode')) return;
    const t = e.target;
    if (t.tagName === 'INPUT' && t.classList.contains('revealed')) t.classList.remove('revealed');
  }, true);
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

const NAV = [
  { section: 'Overview' },
  { key: 'dashboard',    label: 'Dashboard',   icon: iconGrid },
  { key: 'transactions', label: 'Transactions', icon: iconList },
  { section: 'Planning' },
  { key: 'budget', label: 'Budget', icon: iconDollar },
  { key: 'bills',  label: 'Bills',  icon: iconTag },
  { section: 'Setup' },
  { key: 'accounts',   label: 'Accounts',   icon: iconBank },
  { key: 'categories', label: 'Categories', icon: iconTag },
  { key: 'tags',       label: 'Tags',       icon: iconTag },
  { key: 'data',       label: 'Data',       icon: iconDb },
];

export function Sidebar({ path }) {
  return html`
    <button id="mobile-nav-toggle" onClick=${toggleMobileNav} aria-label="Open menu">
      ${svg(html`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`)}
    </button>
    <div id="mobile-nav-backdrop" onClick=${toggleMobileNav}></div>

    <nav class="sidebar">
      <div class="sidebar-logo">
        <img src="assets/logo.png" class="logo-img" alt="RBS Budget logo" />
        <span class="logo-text">RBS Budget</span>
      </div>
      <ul class="nav-links">
        ${NAV.map((item) => item.section
          ? html`<li class="nav-section">${item.section}</li>`
          : html`<li>
              <a href="#/${item.key}"
                 class="nav-link ${path === item.key || (item.key === 'data' && path === 'import') ? 'active' : ''}"
                 onClick=${closeMobile}>
                ${item.icon()}
                <span class="nav-link-label">${item.label}</span>
              </a>
            </li>`)}
      </ul>

      <div class="sidebar-footer">
        <button class="privacy-btn" onClick=${toggleSidebar} title="Collapse sidebar">
          ${svg(html`<polyline points="15 18 9 12 15 6"/>`, 'collapse-icon')}
          <span>Collapse</span>
        </button>
        <button class="privacy-btn" onClick=${togglePrivacyMode}>
          ${svg(html`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`)}
          <span>Privacy Mode</span>
        </button>
      </div>
    </nav>`;
}

function closeMobile() {
  document.documentElement.classList.remove('mobile-nav-open');
}

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function svg(children, id) {
  return html`<svg id=${id} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${children}</svg>`;
}
function iconGrid()   { return svg(html`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`); }
function iconList()   { return svg(html`<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>`); }
function iconDollar() { return svg(html`<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>`); }
function iconTag()    { return svg(html`<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`); }
function iconBank()   { return svg(html`<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`); }
function iconDb()     { return svg(html`<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>`); }
