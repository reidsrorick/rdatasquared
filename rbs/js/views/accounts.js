import { html, useState } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { Modal, FormActions } from '../ui.js';
import { notify } from '../toast.js';
import { money, parseMoney, normalizeUrl, todayISO, titleCase, round2 } from '../format.js';
import {
  computedBalance, netWorth, txnCountByAccount, latestSnapshot, accountSnapshots, snapshotDiff,
} from '../logic/balances.js';

const TYPES = [['checking', 'Checking'], ['credit_card', 'Credit Card'], ['savings', 'Savings']];

export function Accounts() {
  const s = store.getState();
  const accounts = [...s.accounts].sort((a, b) => a.name.localeCompare(b.name));
  const counts = txnCountByAccount(s);

  const [modal, setModal] = useState(null);     // null | {} | account
  const [reconcile, setReconcile] = useState(null); // null | account

  async function save(form) {
    const name = form.name.trim();
    if (!name) return notify('Account name is required.', 'error');
    const patch = {
      name,
      type: form.type,
      institution: form.institution.trim(),
      institutionUrl: normalizeUrl(form.institutionUrl),
      openingBalance: parseMoney(form.openingBalance) ?? 0,
      openingDate: form.openingDate || null,
    };
    if (modal.id) {
      await store.update('accounts', modal.id, patch);
      notify(`Account "${name}" updated.`);
    } else {
      await store.insert('accounts', patch);
      notify(`Account "${name}" created.`);
    }
    setModal(null);
  }

  async function del(a) {
    if ((counts.get(a.id) || 0) > 0) return;
    if (!confirm(`Delete ${a.name}? This cannot be undone.`)) return;
    await store.commit((st) => {
      st.accounts = st.accounts.filter((x) => x.id !== a.id);
      st.balanceSnapshots = st.balanceSnapshots.filter((x) => x.accountId !== a.id);
    });
    notify(`Account "${a.name}" deleted.`);
  }

  const nw = netWorth(s);

  return html`
    <${PageHeader} title="Accounts">
      <button class="btn btn-primary" onClick=${() => setModal({})}>+ Add Account</button>
    </${PageHeader}>

    ${accounts.length ? html`
      <div class="card net-worth-card">
        <div>
          <div class="net-worth-label">Net worth <span class="text-muted">· computed from opening balances + transactions</span></div>
          <div class="net-worth-value ${nw < 0 ? 'amount-negative' : 'amount-positive'}">${money(nw)}</div>
        </div>
      </div>

      <div class="card">
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Type</th><th>Institution</th>
            <th class="text-right">Computed balance</th><th>Last reconciled</th>
            <th class="text-right">Txns</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${accounts.map((a) => {
              const bal = computedBalance(a.id, { s });
              const n = counts.get(a.id) || 0;
              const snap = latestSnapshot(a.id, s);
              const diff = snap ? snapshotDiff(snap) : null;
              return html`
                <tr key=${a.id}>
                  <td><strong>${a.name}</strong></td>
                  <td><span class="account-type-badge type-${a.type}">${titleCase(a.type)}</span></td>
                  <td class="text-muted">${a.institutionUrl
                    ? html`<a href=${a.institutionUrl} target="_blank" rel="noopener noreferrer">${a.institution || a.institutionUrl}</a>`
                    : (a.institution || '—')}</td>
                  <td class="text-right amount-cell ${bal < 0 ? 'amount-negative' : 'amount-positive'}">${money(bal)}</td>
                  <td>${snap ? html`
                    <span class="text-muted">${new Date(snap.asOfDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    ${diff === 0
                      ? html` <span class="recon-badge recon-ok" title="Books matched">✓ matched</span>`
                      : html` <span class="recon-badge recon-off" title="Entered minus computed at last check">⚠ off by ${money(diff)}</span>`}`
                    : html`<span class="text-muted">— never</span>`}</td>
                  <td class="text-right">${n}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-primary" onClick=${() => setReconcile(a)}>Reconcile</button>
                    <button class="btn btn-sm" onClick=${() => setModal(a)}>Edit</button>
                    <button class="btn btn-sm btn-danger" disabled=${n > 0}
                            title=${n > 0 ? 'Has transactions' : ''} onClick=${() => del(a)}>Delete</button>
                  </td>
                </tr>`;
            })}
          </tbody>
        </table>
      </div>` : html`<div class="card"><p class="empty-message">No accounts yet. Add one to get started.</p></div>`}

    <div class="card info-card">
      <h3>Keeping balances in sync</h3>
      <p>Set an <strong>opening balance</strong> (what the account held before your first tracked transaction) so the app can compute a running balance. Then hit <strong>Reconcile</strong> whenever you want and type in the actual balance from your bank — the app compares it against what it computed and flags any difference, so a missing or duplicate transaction shows up right away.</p>
      <p class="text-muted">Balances are signed: enter money you <em>owe</em> (like a credit-card balance) as a negative number.</p>
    </div>

    ${modal ? html`<${AccountModal} account=${modal} onSave=${save} onClose=${() => setModal(null)} />` : null}
    ${reconcile ? html`<${ReconcileModal} account=${reconcile} onClose=${() => setReconcile(null)} />` : null}`;
}

function AccountModal({ account, onSave, onClose }) {
  const [form, setForm] = useState({
    name: account.name || '',
    type: account.type || 'checking',
    institution: account.institution || '',
    institutionUrl: account.institutionUrl || '',
    openingBalance: account.openingBalance != null ? String(account.openingBalance) : '',
    openingDate: account.openingDate || '',
  });
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  return html`
    <${Modal} title=${account.id ? 'Edit Account' : 'Add Account'} width=${420} onClose=${onClose}>
      <form onSubmit=${(e) => { e.preventDefault(); onSave(form); }}>
        <div class="form-group">
          <label>Name *</label>
          <input type="text" class="form-control" value=${form.name} required autofocus
                 placeholder="e.g. Chase Checking" onInput=${(e) => set({ name: e.target.value })} />
        </div>
        <div class="form-group">
          <label>Type *</label>
          <select class="form-control" value=${form.type} onChange=${(e) => set({ type: e.target.value })}>
            ${TYPES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}
          </select>
        </div>
        <div class="form-row" style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label>Opening balance</label>
            <input type="text" class="form-control" inputmode="decimal" value=${form.openingBalance}
                   placeholder="0.00" onInput=${(e) => set({ openingBalance: e.target.value })} />
            <small class="text-muted">Balance before your first transaction. Negative = owed.</small>
          </div>
          <div class="form-group" style="flex:1">
            <label>As of date</label>
            <input type="date" class="form-control" value=${form.openingDate}
                   onInput=${(e) => set({ openingDate: e.target.value })} />
          </div>
        </div>
        <div class="form-group">
          <label>Institution</label>
          <input type="text" class="form-control" value=${form.institution}
                 placeholder="e.g. Chase, Amex" onInput=${(e) => set({ institution: e.target.value })} />
        </div>
        <div class="form-group">
          <label>Institution Link</label>
          <input type="text" class="form-control" value=${form.institutionUrl}
                 placeholder="e.g. chase.com/login" onInput=${(e) => set({ institutionUrl: e.target.value })} />
        </div>
        <${FormActions} submitLabel=${account.id ? 'Save Changes' : 'Add Account'} onCancel=${onClose} />
      </form>
    </${Modal}>`;
}

function ReconcileModal({ account, onClose }) {
  const s = store.getState();
  const [asOf, setAsOf] = useState(todayISO());
  const [entered, setEntered] = useState('');
  const [note, setNote] = useState('');

  const computed = computedBalance(account.id, { asOf, s });
  const enteredNum = parseMoney(entered);
  const diff = enteredNum == null ? null : round2(enteredNum - computed);
  const history = accountSnapshots(account.id, s);

  async function submit(e) {
    e.preventDefault();
    if (enteredNum == null) return notify('Enter the actual balance to reconcile.', 'error');
    await store.insert('balanceSnapshots', {
      accountId: account.id, asOfDate: asOf,
      enteredBalance: enteredNum, computedBalance: computed,
      note: note.trim(), createdAt: new Date().toISOString(),
    });
    if (Math.abs(diff) < 0.005) notify(`"${account.name}" reconciled — everything lines up. ✓`);
    else notify(`"${account.name}" reconciled — off by ${money(diff)} (entered ${money(enteredNum)} vs computed ${money(computed)}).`, 'error');
    onClose();
  }

  async function delSnap(id) {
    if (!confirm('Remove this reconciliation record?')) return;
    await store.remove('balanceSnapshots', id);
    notify('Reconciliation record removed.');
  }

  return html`
    <${Modal} title=${html`Reconcile <span>${account.name}</span>`} width=${480} onClose=${onClose}>
      <form onSubmit=${submit}>
        <div class="form-group">
          <label>As of date</label>
          <input type="date" class="form-control" value=${asOf} onInput=${(e) => setAsOf(e.target.value)} />
        </div>
        <div class="recon-compare">
          <div class="recon-row">
            <span>App computed balance</span>
            <strong class="amount-cell">${money(computed)}</strong>
          </div>
          <div class="form-group" style="margin:10px 0 0">
            <label>Actual balance from your bank *</label>
            <input type="text" class="form-control" inputmode="decimal" value=${entered} required autocomplete="off"
                   placeholder="0.00" onInput=${(e) => setEntered(e.target.value)} />
          </div>
          <div class="recon-row recon-diff-row">
            <span>Difference (actual − computed)</span>
            <strong class="amount-cell ${diff == null ? '' : Math.abs(diff) < 0.005 ? 'recon-match' : 'amount-negative'}">
              ${diff == null ? '—' : money(diff)}
            </strong>
          </div>
        </div>
        <div class="form-group" style="margin-top:12px">
          <label>Note (optional)</label>
          <input type="text" class="form-control" value=${note}
                 placeholder="e.g. matched July statement" onInput=${(e) => setNote(e.target.value)} />
        </div>
        <${FormActions} submitLabel="Save reconciliation" onCancel=${onClose} />
      </form>

      <div style="margin-top:18px">
        <h4 class="recon-history-title">History</h4>
        ${history.length ? html`
          <table class="table recon-history-table">
            <thead><tr>
              <th>As of</th><th class="text-right">Entered</th><th class="text-right">Computed</th>
              <th class="text-right">Diff</th><th></th>
            </tr></thead>
            <tbody>
              ${history.map((h) => {
                const d = snapshotDiff(h);
                const matched = Math.abs(d) < 0.005;
                return html`<tr key=${h.id}>
                  <td>${h.asOfDate}${h.note ? html` <span class="text-muted" title=${h.note}>🗒</span>` : null}</td>
                  <td class="text-right">${money(h.enteredBalance)}</td>
                  <td class="text-right">${money(h.computedBalance)}</td>
                  <td class="text-right ${matched ? 'recon-match' : 'amount-negative'}">${matched ? '✓' : money(d)}</td>
                  <td class="text-right"><button class="btn btn-sm btn-danger" title="Remove" onClick=${() => delSnap(h.id)}>×</button></td>
                </tr>`;
              })}
            </tbody>
          </table>` : html`<p class="text-muted" style="margin:0">No reconciliations yet.</p>`}
      </div>
    </${Modal}>`;
}
