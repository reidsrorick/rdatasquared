import { html, useState, useMemo } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { notify } from '../toast.js';
import { money, signedMoney, fmtDate, titleCase } from '../format.js';
import {
  parseCSV, guessMapping, buildReview, commitImport, linkManual,
} from '../csv.js';

const STEPS = ['Upload', 'Map Columns', 'Review', 'Done'];

export function ImportCsv() {
  const s = store.getState();
  const accounts = [...s.accounts].sort((a, b) => a.name.localeCompare(b.name));
  const history = [...s.imports].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1)).slice(0, 20);
  const acctName = new Map(s.accounts.map((a) => [a.id, a.name]));

  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);          // raw parsed CSV rows
  const [mapping, setMapping] = useState(null);  // {dateCol, descCol, mode, amountCol, amountSign, debitCol, creditCol, hasHeader}
  const [review, setReview] = useState([]);      // review rows (mutable transfer flag + skip)
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const account = s.accounts.find((a) => a.id === Number(accountId));
  const headers = rows[0] || [];

  async function onUpload() {
    setError('');
    if (!file || !accountId) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { setError('That file looks empty.'); return; }
    setRows(parsed);
    setMapping(guessMapping(parsed[0]));
    setStep(2);
  }

  function doParse() {
    setError('');
    const m = mapping;
    if (m.dateCol == null || m.descCol == null) { setError('Please select Date and Description columns.'); return; }
    if (m.mode === 'single' && m.amountCol == null) { setError('Please select an Amount column.'); return; }
    if (m.mode === 'split' && (m.debitCol == null || m.creditCol == null)) { setError('Please select both Debit and Credit columns.'); return; }
    const cleaned = {
      dateCol: m.dateCol, descCol: m.descCol, hasHeader: m.hasHeader,
      amountCol: m.mode === 'single' ? m.amountCol : null,
      amountSign: m.amountSign,
      debitCol: m.mode === 'split' ? m.debitCol : null,
      creditCol: m.mode === 'split' ? m.creditCol : null,
    };
    const built = buildReview(rows, cleaned, account.id, account.type, s);
    if (!built.length) { setError('No rows to import after applying the mapping.'); return; }
    setReview(built);
    setStep(3);
  }

  async function doConfirm() {
    setError('');
    const chosen = review.filter((r) => !r.skip && !r.error);
    if (!chosen.length) { setError('No transactions selected to import.'); return; }
    const res = await commitImport(account.id, file.name, review);
    setResult(res);
    setStep(4);
    notify(`Imported ${res.imported} transaction(s).`);
  }

  function reset() {
    setStep(1); setFile(null); setRows([]); setMapping(null);
    setReview([]); setResult(null); setError('');
  }

  return html`
    <${PageHeader} title="Import CSV">
      <a href="#/data" class="btn">← Data</a>
    </${PageHeader}>

    <div class="step-indicator">
      ${STEPS.map((label, i) => html`
        ${i > 0 ? html`<div class="step-line"></div>` : null}
        <div class="step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}">
          <span>${i + 1}</span> ${label}
        </div>`)}
    </div>

    ${step === 1 ? html`<${StepUpload} accounts=${accounts} accountId=${accountId}
        setAccountId=${setAccountId} file=${file} setFile=${setFile}
        error=${error} onNext=${onUpload} />` : null}

    ${step === 2 ? html`<${StepMap} headers=${headers} rows=${rows} mapping=${mapping}
        setMapping=${setMapping} error=${error} onBack=${() => setStep(1)} onNext=${doParse} />` : null}

    ${step === 3 ? html`<${StepReview} review=${review} setReview=${setReview}
        error=${error} onBack=${() => setStep(2)} onConfirm=${doConfirm} />` : null}

    ${step === 4 ? html`<${StepDone} result=${result} onReset=${reset} />` : null}

    ${history.length ? html`
      <div class="card">
        <div class="card-header"><h2>Recent Imports</h2></div>
        <table class="table">
          <thead><tr><th>File</th><th>Account</th><th>Date</th><th class="text-right">Rows</th></tr></thead>
          <tbody>
            ${history.map((imp) => html`
              <tr key=${imp.id}>
                <td>${imp.filename || '—'}</td>
                <td>${acctName.get(imp.accountId) || '—'}</td>
                <td class="text-muted">${new Date(imp.importedAt).toLocaleString('en-US')}</td>
                <td class="text-right">${imp.rowCount}</td>
              </tr>`)}
          </tbody>
        </table>
      </div>` : null}`;
}

function StepUpload({ accounts, accountId, setAccountId, file, setFile, error, onNext }) {
  const [dragOver, setDragOver] = useState(false);
  return html`
    <div class="card">
      <div class="card-header"><h2>Select File & Account</h2></div>
      <div class="card-body">
        <div class="form-group">
          <label>Account *</label>
          <select class="form-control" value=${accountId} onChange=${(e) => setAccountId(e.target.value)}>
            <option value="">— Select account —</option>
            ${accounts.map((a) => html`<option value=${String(a.id)}>${a.name} (${titleCase(a.type)})</option>`)}
          </select>
        </div>
        <div class="form-group">
          <label>CSV File *</label>
          <label class="drop-zone ${dragOver ? 'drag-over' : ''}" style="display:block;cursor:pointer"
                 onDragOver=${(e) => { e.preventDefault(); setDragOver(true); }}
                 onDragLeave=${() => setDragOver(false)}
                 onDrop=${(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}>
            <div class="drop-zone-inner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              <p>Drop CSV here or click to select</p>
              <span class="text-muted">${file ? file.name : ''}</span>
            </div>
            <input type="file" accept=".csv,.txt" style="display:none"
                   onChange=${(e) => setFile(e.target.files[0] || null)} />
          </label>
        </div>
        <div class="form-actions" style="margin-top:0;padding-top:0;border-top:none">
          <button class="btn btn-primary" disabled=${!file || !accountId} onClick=${onNext}>Next: Map Columns →</button>
        </div>
        ${error ? html`<div class="error-msg">${error}</div>` : null}
      </div>
    </div>`;
}

function StepMap({ headers, rows, mapping, setMapping, error, onBack, onNext }) {
  const set = (p) => setMapping((m) => ({ ...m, ...p }));
  const colOptions = [html`<option value="">— Select —</option>`,
    ...headers.map((h, i) => html`<option value=${String(i)}>${h || `Column ${i + 1}`}</option>`)];
  const preview = (mapping.hasHeader ? rows.slice(1) : rows).slice(0, 5);
  const colSel = (val, key) => html`
    <select class="form-control" value=${val == null ? '' : String(val)}
            onChange=${(e) => set({ [key]: e.target.value === '' ? null : Number(e.target.value) })}>
      ${colOptions}
    </select>`;

  return html`
    <div class="card">
      <div class="card-header">
        <h2>Map Columns</h2>
        <span class="text-muted">${(mapping.hasHeader ? rows.length - 1 : rows.length)} rows</span>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label>Preview (first rows of your CSV)</label>
          <div class="csv-preview">
            <table>
              <thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
              <tbody>${preview.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody>
            </table>
          </div>
        </div>

        <div class="mapping-grid">
          <div class="form-group"><label>Date Column *</label>${colSel(mapping.dateCol, 'dateCol')}</div>
          <div class="form-group"><label>Description Column *</label>${colSel(mapping.descCol, 'descCol')}</div>
          <div class="form-group">
            <label>Amount Type *</label>
            <select class="form-control" value=${mapping.mode} onChange=${(e) => set({ mode: e.target.value })}>
              <option value="single">Single Amount Column</option>
              <option value="split">Separate Debit & Credit Columns</option>
            </select>
          </div>
          ${mapping.mode === 'single' ? html`
            <div>
              <div class="form-group"><label>Amount Column *</label>${colSel(mapping.amountCol, 'amountCol')}</div>
              <div class="form-group">
                <label>Sign Convention</label>
                <select class="form-control" value=${mapping.amountSign} onChange=${(e) => set({ amountSign: e.target.value })}>
                  <option value="negative_is_expense">Negative = expense (most banks)</option>
                  <option value="positive_is_expense">Positive = expense (flip sign)</option>
                </select>
              </div>
            </div>` : html`
            <div>
              <div class="form-group"><label>Debit Column (money out)</label>${colSel(mapping.debitCol, 'debitCol')}</div>
              <div class="form-group"><label>Credit Column (money in)</label>${colSel(mapping.creditCol, 'creditCol')}</div>
            </div>`}
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" checked=${mapping.hasHeader} onChange=${(e) => set({ hasHeader: e.target.checked })} />
              First row is a header row
            </label>
          </div>
        </div>

        <div class="form-actions" style="margin-top:0;padding-top:0;border-top:none">
          <button class="btn btn-primary" onClick=${onNext}>Next: Review →</button>
          <button class="btn" onClick=${onBack}>← Back</button>
        </div>
        ${error ? html`<div class="error-msg">${error}</div>` : null}
      </div>
    </div>`;
}

function StepReview({ review, setReview, error, onBack, onConfirm }) {
  const stats = useMemo(() => {
    let toImport = 0, transfers = 0;
    for (const r of review) if (!r.skip && !r.error) { toImport++; if (r.isTransfer) transfers++; }
    return {
      toImport, transfers,
      dups: review.filter((r) => r.isDuplicate).length,
      errors: review.filter((r) => r.error).length,
    };
  }, [review]);

  const patch = (i, p) => setReview((rs) => rs.map((r) => (r.i === i ? { ...r, ...p } : r)));

  return html`
    <div class="card">
      <div class="card-header">
        <h2>Review Transactions</h2>
        <div class="import-legend">
          <span class="legend-item"><span class="legend-dot normal"></span> Normal</span>
          <span class="legend-item"><span class="legend-dot transfer"></span> Transfer</span>
          <span class="legend-item"><span class="legend-dot duplicate"></span> Duplicate (skipped)</span>
          <span class="legend-item"><span class="legend-dot error"></span> Parse error (skipped)</span>
        </div>
      </div>

      <div class="import-summary">
        <div class="import-stat"><span class="import-stat-num" style="color:var(--success)">${stats.toImport}</span><span class="import-stat-label">To Import</span></div>
        <div class="import-stat"><span class="import-stat-num" style="color:var(--warning)">${stats.transfers}</span><span class="import-stat-label">Transfers</span></div>
        <div class="import-stat"><span class="import-stat-num" style="color:var(--text-muted)">${stats.dups}</span><span class="import-stat-label">Duplicates Skipped</span></div>
        <div class="import-stat"><span class="import-stat-num" style="color:var(--danger)">${stats.errors}</span><span class="import-stat-label">Errors Skipped</span></div>
      </div>

      <div class="card-body" style="padding-top:0">
        <div class="form-actions" style="margin-top:0;border-top:none;padding-top:0">
          <button class="btn btn-primary" onClick=${onConfirm}>Confirm Import</button>
          <button class="btn" onClick=${onBack}>← Back</button>
        </div>
        ${error ? html`<div class="error-msg">${error}</div>` : null}
      </div>

      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Import</th><th>Date</th><th>Description</th>
            <th class="text-right">Amount</th><th>Transfer</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${review.map((r) => {
              if (r.error) return html`
                <tr key=${r.i} class="review-row-error">
                  <td><input type="checkbox" disabled /></td>
                  <td colspan="4" class="text-muted">${(r.raw || []).join(', ')}</td>
                  <td><span class="badge" style="background:#fef2f2;color:#991b1b">Error</span></td>
                </tr>`;
              return html`
                <tr key=${r.i} class=${r.isDuplicate ? 'review-row-duplicate' : r.isTransfer ? 'review-row-transfer' : ''}>
                  <td><input type="checkbox" checked=${!r.skip} onChange=${(e) => patch(r.i, { skip: !e.target.checked })} /></td>
                  <td>${fmtDate(r.date)}</td>
                  <td>${r.description}</td>
                  <td class="text-right ${r.amount < 0 ? 'amount-expense' : 'amount-income'}">${signedMoney(r.amount)}</td>
                  <td><label class="toggle-label"><input type="checkbox" checked=${r.isTransfer}
                        onChange=${(e) => patch(r.i, { isTransfer: e.target.checked })} /> Transfer</label></td>
                  <td>${r.isDuplicate
                    ? html`<span class="badge badge-gray">Duplicate</span>`
                    : r.isTransfer
                      ? html`<span class="badge badge-gray">Transfer</span>`
                      : html`<span class="badge badge-green">Normal</span>`}</td>
                </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>`;
}

function StepDone({ result, onReset }) {
  const [links, setLinks] = useState({});
  async function link(m) {
    await linkManual(m.manualId, m.importedId);
    setLinks((l) => ({ ...l, [m.manualId]: true }));
    notify('Manual entry linked.');
  }
  return html`
    <div class="card">
      <div class="card-header"><h2>Import Complete</h2></div>
      <div class="import-result">
        <div class="result-item"><div class="result-num success">${result.imported}</div><div class="result-label">Imported</div></div>
        <div class="result-item"><div class="result-num warning">${result.transfersFlagged}</div><div class="result-label">Transfers Flagged</div></div>
      </div>

      ${result.manualMatches.length ? html`
        <div class="card-body" style="padding-top:0">
          <h3 style="margin-bottom:8px">Potential Manual Entry Matches</h3>
          <p class="text-muted" style="margin-bottom:16px">These manual entries appear to match newly imported transactions. Link them (the manual entry will be hidden from totals) or keep both.</p>
        </div>
        <table class="table">
          <thead><tr><th>Manual Entry</th><th>Imported Transaction</th><th>Amount</th><th>Action</th></tr></thead>
          <tbody>
            ${result.manualMatches.map((m) => html`
              <tr key=${m.manualId}>
                <td>${fmtDate(m.manualDate)} — ${m.manualDesc}</td>
                <td>${m.importedDesc}</td>
                <td class=${m.manualAmount < 0 ? 'amount-expense' : 'amount-income'}>${signedMoney(m.manualAmount)}</td>
                <td>${links[m.manualId]
                  ? html`<span class="text-muted" style="font-size:12px">Linked ✓</span>`
                  : html`<button class="btn btn-sm btn-primary" onClick=${() => link(m)}>Link (hide manual)</button>`}</td>
              </tr>`)}
          </tbody>
        </table>` : null}

      <div class="card-body">
        <div class="form-actions" style="margin-top:0;border-top:none;padding-top:0">
          <a href="#/transactions" class="btn btn-primary">View Transactions</a>
          <button class="btn" onClick=${onReset}>Import Another File</button>
        </div>
      </div>
    </div>`;
}
