// Boot: load the dataset, then render one root component that re-renders on
// every store change and on every hash change.

import { html, render, useState, useEffect } from './vendor/preact-htm.js';
import * as store from './store.js';
import { currentPath, currentQuery, onChange, ensureHash } from './router.js';
import { Sidebar, initChrome } from './shell.js';
import { ToastHost } from './toast.js';
import { views } from './views/index.js';
import { backupIsStale, exportBackup } from './backup.js';

function BackupNudge() {
  const [dismissed, setDismissed] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => store.subscribe(() => bump((n) => n + 1)), []);

  const s = store.getState();
  const hasData = s.accounts.length > 0 || s.transactions.length > 0;
  if (dismissed || !hasData || !backupIsStale()) return null;

  const last = s.meta && s.meta.lastExport;
  return html`
    <div class="flash flash-error" style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <span style="flex:1">
        ${last ? `Your last backup was ${last}. ` : 'You have never backed up. '}
        Your data lives only in this browser — export a copy now.
      </span>
      <button class="btn btn-sm btn-primary" onClick=${() => { exportBackup(); setDismissed(true); }}>Export now</button>
      <button class="btn btn-sm" onClick=${() => setDismissed(true)}>Later</button>
    </div>`;
}

function App() {
  const [path, setPath] = useState(currentPath());
  const [, bump] = useState(0);

  useEffect(() => store.subscribe(() => bump((n) => n + 1)), []);
  useEffect(() => onChange(() => setPath(currentPath())), []);

  const View = views[path] || views.dashboard;

  return html`
    <div class="layout">
      <${Sidebar} path=${path} />
      <main class="content">
        <${BackupNudge} />
        <${View} query=${currentQuery()} />
      </main>
      <${ToastHost} />
    </div>`;
}

async function boot() {
  await store.load();
  ensureHash();
  initChrome();
  render(html`<${App} />`, document.getElementById('app'));
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML =
    '<div class="boot">Something went wrong loading the app. Check the console.</div>';
});
