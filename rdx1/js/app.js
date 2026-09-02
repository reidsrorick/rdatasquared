// ===== App shell: routing, theme, backup banner =====
import { $, $$, el, debounce, daysBetween, todayISO, isoDate, toast } from './util.js';
import { getSettings, getContacts, subscribe, updateSettings } from './store.js';
import {
  renderDashboard, renderContacts, renderContactDetail, renderContactForm,
  renderSettings, applyTheme,
} from './views.js';
import { exportJSON } from './importExport.js';

const main = $('#main');
const search = $('#global-search');

// ---------- routing ----------
const routes = [
  { re: /^#\/?$/, tab: 'dashboard', view: () => renderDashboard() },
  { re: /^#\/contacts$/, tab: 'contacts', view: () => renderContacts(search.value || '') },
  { re: /^#\/add$/, tab: 'add', view: () => renderContactForm(null) },
  { re: /^#\/edit\/(.+)$/, tab: 'contacts', view: m => renderContactForm(m[1]) },
  { re: /^#\/contact\/(.+)$/, tab: 'contacts', view: m => renderContactDetail(m[1]) },
  { re: /^#\/settings$/, tab: 'settings', view: () => renderSettings() },
];

function router() {
  const hash = location.hash || '#/';
  let matched = routes[0], m = null;
  for (const r of routes) {
    const mm = hash.match(r.re);
    if (mm) { matched = r; m = mm; break; }
  }
  main.innerHTML = '';
  try {
    main.appendChild(matched.view(m));
  } catch (e) {
    console.error(e);
    main.appendChild(el('div', { class: 'empty', text: 'Something went wrong rendering this page. Check the console.' }));
  }
  $$('.tab-bar a').forEach(a => a.classList.toggle('active', a.dataset.tab === matched.tab));
  main.focus();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', router);

// ---------- global search ----------
search.addEventListener('input', debounce(() => {
  if (!location.hash.startsWith('#/contacts')) {
    if (search.value.trim()) location.hash = '#/contacts';
    else return;
  }
  router();
}, 180));
search.addEventListener('search', () => {
  if (location.hash.startsWith('#/contacts')) router();
});

// ---------- theme ----------
applyTheme();
$('#theme-toggle').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  const cur = getSettings().theme || 'auto';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  updateSettings({ theme: next });
  applyTheme();
  toast(`Theme: ${next}`);
});
// react to OS theme changes when in auto
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((getSettings().theme || 'auto') === 'auto') { /* CSS handles it */ }
});

// ---------- backup reminder banner ----------
const banner = $('#backup-banner');
function refreshBanner() {
  const s = getSettings();
  const contacts = getContacts();
  const days = s.backupReminderDays;
  let show = false;
  if (days > 0 && contacts.length > 0) {
    const ref = s.lastExportAt || s.backupDismissedAt;
    if (!s.lastExportAt) {
      const dismissedRecently = s.backupDismissedAt &&
        daysBetween(isoDate(new Date(s.backupDismissedAt)), todayISO()) < 3;
      show = !dismissedRecently;
    } else {
      show = daysBetween(isoDate(new Date(s.lastExportAt)), todayISO()) >= days;
    }
  }
  banner.hidden = !show;
  if (show) {
    const since = s.lastExportAt
      ? `It's been ${daysBetween(isoDate(new Date(s.lastExportAt)), todayISO())} days since your last backup.`
      : `You haven't backed up yet — export a copy so you don't lose anything.`;
    banner.querySelector('span').textContent = since;
  }
}
banner.addEventListener('click', e => {
  const act = e.target.dataset.act;
  if (act === 'export') exportJSON();
  else if (act === 'dismiss') { updateSettings({ backupDismissedAt: new Date().toISOString() }); refreshBanner(); }
});

subscribe(() => { refreshBanner(); });

// ---------- boot ----------
refreshBanner();
router();

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW registration failed', err));
  });
}
