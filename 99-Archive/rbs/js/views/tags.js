import { html, useState } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { Modal, ColorField, FormActions } from '../ui.js';
import { notify } from '../toast.js';
import { sortedTags, txnCountsByTag } from '../logic/tags.js';

const BLANK = { name: '', color: '#0891b2', excludeFromBudget: false };

export function Tags() {
  const s = store.getState();
  const tags = sortedTags(s);
  const counts = txnCountsByTag(s);
  const [editing, setEditing] = useState(null); // null | {} (new) | tag (edit)

  async function save(form) {
    const name = form.name.trim();
    if (!name) return notify('Tag name is required.', 'error');
    if (s.tags.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== editing.id)) {
      return notify(`A tag named "${name}" already exists.`, 'error');
    }
    if (editing.id) {
      await store.update('tags', editing.id, { name, color: form.color, excludeFromBudget: form.excludeFromBudget });
      notify(`Tag "${name}" updated.`);
    } else {
      const sortOrder = s.tags.reduce((m, t) => Math.max(m, t.sortOrder || 0), 0) + 1;
      await store.insert('tags', { name, color: form.color, excludeFromBudget: form.excludeFromBudget, sortOrder });
      notify(`Tag "${name}" created.`);
    }
    setEditing(null);
  }

  async function del(t) {
    const n = counts.get(t.id) || 0;
    if (!confirm(`Delete tag "${t.name}"? It will be removed from ${n} transaction(s).`)) return;
    await store.commit((st) => {
      st.tags = st.tags.filter((x) => x.id !== t.id);
      for (const txn of st.transactions) {
        if (txn.tagIds) txn.tagIds = txn.tagIds.filter((id) => id !== t.id);
      }
    });
    notify(`Tag "${t.name}" deleted.`);
  }

  return html`
    <${PageHeader} title="Tags">
      <button class="btn btn-primary" onClick=${() => setEditing({ ...BLANK })}>+ New Tag</button>
    </${PageHeader}>

    <div class="card">
      <p class="text-muted" style="margin:0;padding:16px 20px">
        Tags label transactions independently of their category — e.g. <strong>Work</strong>. A tag marked
        <em>"exclude from budget"</em> keeps its transactions out of your budget and dashboard totals by
        default, with a toggle on those pages to fold them back in.
      </p>
      ${tags.length ? html`
        <table class="table">
          <thead><tr>
            <th>Tag</th><th>In budget & dashboard?</th>
            <th class="text-right">Transactions</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${tags.map((t) => html`
              <tr key=${t.id}>
                <td><span class="tag-chip" style=${chip(t.color)}>${t.name}</span></td>
                <td>${t.excludeFromBudget
                  ? html`<span class="badge badge-gray">Excluded by default</span>`
                  : html`<span class="badge badge-green">Included</span>`}</td>
                <td class="text-right text-muted">${counts.get(t.id) || 0}</td>
                <td>
                  <button class="btn btn-sm" onClick=${() => setEditing(t)}>Edit</button>
                  <button class="btn btn-sm btn-danger" onClick=${() => del(t)}>×</button>
                </td>
              </tr>`)}
          </tbody>
        </table>` : html`<p class="empty-message">No tags yet. Create one to start labeling transactions.</p>`}
    </div>

    ${editing ? html`<${TagModal} tag=${editing} onSave=${save} onClose=${() => setEditing(null)} />` : null}`;
}

function chip(color) {
  return `background:${color}20;color:${color};border-color:${color}55`;
}

function TagModal({ tag, onSave, onClose }) {
  const [form, setForm] = useState({
    name: tag.name || '', color: tag.color || '#0891b2', excludeFromBudget: !!tag.excludeFromBudget,
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return html`
    <${Modal} title=${tag.id ? 'Edit Tag' : 'New Tag'} width=${420} onClose=${onClose}>
      <form onSubmit=${(e) => { e.preventDefault(); onSave(form); }}>
        <div class="form-group">
          <label>Name *</label>
          <input type="text" class="form-control" value=${form.name} required autofocus
                 placeholder="e.g. Work" onInput=${(e) => set({ name: e.target.value })} />
        </div>
        <div class="form-group">
          <label>Color</label>
          <${ColorField} value=${form.color} onChange=${(color) => set({ color })} />
        </div>
        <div class="form-group">
          <label class="toggle-label" style="text-transform:none;letter-spacing:normal;font-size:13px;font-weight:500">
            <input type="checkbox" checked=${form.excludeFromBudget}
                   onChange=${(e) => set({ excludeFromBudget: e.target.checked })} />
            Exclude these transactions from budget & dashboard by default
          </label>
          <span class="text-muted" style="font-size:12px">Turn on for work / reimbursable expenses you don't want in your personal budget.</span>
        </div>
        <${FormActions} submitLabel=${tag.id ? 'Save Changes' : 'Create Tag'} onCancel=${onClose} />
      </form>
    </${Modal}>`;
}
