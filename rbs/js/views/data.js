import { html, useState, useRef } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { exportBackup, importBackup } from '../backup.js';
import { fmtDate } from '../format.js';

export function Data() {
  const s = store.getState();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);

  const totals = {
    accounts: s.accounts.length,
    transactions: s.transactions.length,
    categories: s.categories.length,
    tags: s.tags.length,
  };

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Import replaces ALL current data in this browser. Continue?')) return;
    try {
      await importBackup(file);
      setMsg({ kind: 'success', text: 'Backup imported. Everything below reflects the new data.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  async function onReset() {
    if (!confirm('Wipe everything and start from a fresh install? This cannot be undone.')) return;
    await store.reset();
    setMsg({ kind: 'success', text: 'Reset to a fresh install.' });
  }

  return html`
    <${PageHeader} title="Data" />

    ${msg ? html`<div class="flash flash-${msg.kind}" style="margin-bottom:16px">${msg.text}</div>` : null}

    <div class="card">
      <div class="card-header"><h2>Import</h2></div>
      <div style="padding: 4px 20px 20px">
        <div class="export-row">
          <div>
            <div class="export-title">Import CSV</div>
            <div class="text-muted" style="font-size:13px">
              Upload a bank or credit-card CSV, map its columns, review duplicates, then add the transactions.
            </div>
          </div>
          <a href="#/import" class="btn btn-primary">Import CSV →</a>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Backup</h2></div>
      <div style="padding: 4px 20px 20px">
        <p class="text-muted" style="font-size:13px; margin-bottom:14px">
          Your data lives only in this browser. Export a JSON file to keep a copy or move
          to another device. Importing <strong>replaces</strong> everything here — there is no merge.
        </p>
        <div class="export-row">
          <div>
            <div class="export-title">Export everything (JSON)</div>
            <div class="text-muted" style="font-size:13px">
              ${totals.accounts} accounts · ${totals.transactions} transactions ·
              ${totals.categories} categories · ${totals.tags} tags.
              ${s.meta.lastExport
                ? html`Last export ${fmtDate(s.meta.lastExport)}.`
                : html`<strong>Never exported.</strong>`}
            </div>
          </div>
          <button class="btn btn-primary" onClick=${() => { exportBackup(); setMsg({ kind: 'success', text: 'Backup downloaded.' }); }}>
            ⬇ Download JSON
          </button>
        </div>
        <div class="export-row">
          <div>
            <div class="export-title">Import a backup</div>
            <div class="text-muted" style="font-size:13px">Pick a previously exported <code>YYYY-MM-DD RBS_Export.json</code> file.</div>
          </div>
          <button class="btn" onClick=${() => fileRef.current && fileRef.current.click()}>Choose file…</button>
          <input ref=${fileRef} type="file" accept="application/json,.json" style="display:none" onChange=${onFile} />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Danger zone</h2></div>
      <div style="padding: 4px 20px 20px">
        <div class="export-row">
          <div>
            <div class="export-title">Reset to a fresh install</div>
            <div class="text-muted" style="font-size:13px">Clears all data and reseeds the default categories, groups, and tags.</div>
          </div>
          <button class="btn btn-danger" onClick=${onReset}>Reset</button>
        </div>
      </div>
    </div>`;
}
