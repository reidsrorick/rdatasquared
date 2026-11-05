import { html, useState, useRef } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { Modal, ColorField, FormActions } from '../ui.js';
import { notify } from '../toast.js';
import {
  groupedCategories, txnCountsByCategory, catColor, nextCatSortOrder,
} from '../logic/categories.js';

export function Categories() {
  const s = store.getState();
  const { groups, ungrouped } = groupedCategories(s);
  const counts = txnCountsByCategory(s);

  const [groupModal, setGroupModal] = useState(null); // null | {} | group
  const [catModal, setCatModal] = useState(null);     // null | {groupId} | category
  const [delModal, setDelModal] = useState(null);     // null | category

  const drag = useRef(null); // { type:'cat'|'group', id }

  // ── Group CRUD ──
  async function saveGroup(form) {
    const name = form.name.trim();
    if (!name) return notify('Group name is required.', 'error');
    if (groupModal.id) {
      await store.update('categoryGroups', groupModal.id, { name, color: form.color });
      notify(`Group "${name}" updated.`);
    } else {
      const sortOrder = s.categoryGroups.reduce((m, g) => Math.max(m, g.sortOrder || 0), 0) + 1;
      await store.insert('categoryGroups', { name, color: form.color, sortOrder });
      notify(`Group "${name}" created.`);
    }
    setGroupModal(null);
  }
  async function deleteGroup(g) {
    if (!confirm(`Delete group "${g.name}"? Its categories will become ungrouped.`)) return;
    await store.commit((st) => {
      for (const c of st.categories) if (c.groupId === g.id) c.groupId = null;
      st.categoryGroups = st.categoryGroups.filter((x) => x.id !== g.id);
    });
    notify(`Group "${g.name}" deleted (categories moved to ungrouped).`);
  }

  // ── Category CRUD ──
  async function saveCat(form) {
    const name = form.name.trim();
    if (!name) return notify('Category name is required.', 'error');
    const patch = {
      name,
      color: form.color,
      isIncome: form.isIncome,
      excludeFromBudget: form.excludeFromBudget,
      groupId: form.groupId || null,
      notes: form.notes.trim(),
      link: form.link.trim(),
      recurrence: ['none', 'monthly', 'yearly'].includes(form.recurrence) ? form.recurrence : 'none',
      dueDate: form.dueDate || null,
    };
    if (catModal.id) {
      await store.update('categories', catModal.id, patch);
      notify(`Category "${name}" updated.`);
    } else {
      await store.insert('categories', {
        ...patch, sortOrder: nextCatSortOrder(patch.groupId, s), defaultBudget: 0,
      });
      notify(`Category "${name}" created.`);
    }
    setCatModal(null);
  }
  async function reassignDelete(catId, reassignTo) {
    const cat = s.categories.find((c) => c.id === catId);
    await store.commit((st) => {
      const to = reassignTo ? Number(reassignTo) : null;
      for (const t of st.transactions) if (t.categoryId === catId) t.categoryId = to;
      st.categories = st.categories.filter((c) => c.id !== catId);
      st.spendingPlans = st.spendingPlans.filter((p) => p.categoryId !== catId);
      st.billPayments = st.billPayments.filter((b) => b.categoryId !== catId);
    });
    notify(`Category "${cat.name}" deleted.`);
    setDelModal(null);
  }
  function askDeleteCat(c) {
    const n = counts.get(c.id) || 0;
    if (n === 0) {
      if (confirm(`Delete "${c.name}"?`)) reassignDelete(c.id, '');
    } else {
      setDelModal(c);
    }
  }

  // ── Drag & drop ──
  function onDrop(targetGroupId, beforeCatId) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.type === 'cat') {
      store.commit((st) => {
        const moved = st.categories.find((c) => c.id === d.id);
        if (!moved) return;
        moved.groupId = targetGroupId;
        // rebuild order for the target group
        const inGroup = st.categories
          .filter((c) => c.id !== d.id && (c.groupId ?? null) === (targetGroupId ?? null))
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const idx = beforeCatId == null ? inGroup.length : inGroup.findIndex((c) => c.id === beforeCatId);
        inGroup.splice(idx === -1 ? inGroup.length : idx, 0, moved);
        inGroup.forEach((c, i) => { c.sortOrder = i; });
      });
    } else if (d.type === 'group') {
      store.commit((st) => {
        const ordered = [...st.categoryGroups].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const from = ordered.findIndex((g) => g.id === d.id);
        const [g] = ordered.splice(from, 1);
        const to = beforeCatId == null ? ordered.length : ordered.findIndex((x) => x.id === beforeCatId);
        ordered.splice(to === -1 ? ordered.length : to, 0, g);
        ordered.forEach((x, i) => { x.sortOrder = i; });
      });
    }
  }

  const allowDrop = (e) => e.preventDefault();

  return html`
    <${PageHeader} title="Categories">
      <button class="btn btn-primary" onClick=${() => setGroupModal({})}>+ New Group</button>
    </${PageHeader}>

    <div id="group-container">
      ${groups.map((g) => html`
        <div key=${g.id} class="cat-group-card"
             onDragOver=${(e) => { if (drag.current?.type === 'group') allowDrop(e); }}
             onDrop=${(e) => { if (drag.current?.type === 'group') { e.preventDefault(); onDrop(null, g.id); } }}>
          <div class="cat-group-header" style=${`border-left:4px solid ${g.color}`}>
            <div class="cat-group-drag-handle" title="Drag to reorder group" draggable="true"
                 onDragStart=${() => { drag.current = { type: 'group', id: g.id }; }}>⠿</div>
            <div class="cat-group-title">
              <span class="color-dot" style=${`background:${g.color}`}></span>
              <strong>${g.name}</strong>
              <span class="text-muted" style="font-size:12px">(${g.categories.length})</span>
            </div>
            <div class="cat-group-actions">
              <button class="btn btn-sm" onClick=${() => setGroupModal(g)}>Edit</button>
              <button class="btn btn-sm btn-danger" onClick=${() => deleteGroup(g)}>Delete</button>
            </div>
          </div>
          <div class="cat-item-list"
               onDragOver=${(e) => { if (drag.current?.type === 'cat') allowDrop(e); }}
               onDrop=${(e) => { if (drag.current?.type === 'cat') { e.preventDefault(); onDrop(g.id, null); } }}>
            ${g.categories.map((c) => html`
              <${CatRow} key=${c.id} cat=${c} color=${catColor(c, s)} count=${counts.get(c.id) || 0}
                         onEdit=${() => setCatModal(c)} onDelete=${() => askDeleteCat(c)}
                         onDragStart=${() => { drag.current = { type: 'cat', id: c.id }; }}
                         onDropBefore=${() => onDrop(g.id, c.id)}
                         dragRef=${drag} />`)}
            ${g.categories.length === 0
              ? html`<div class="cat-item-empty text-muted">No categories — drag one here or add below.</div>` : null}
            <button class="btn btn-sm cat-add-btn" onClick=${() => setCatModal({ groupId: g.id })}>+ Add to ${g.name}</button>
          </div>
        </div>`)}

      ${ungrouped.length ? html`
        <div class="cat-group-card">
          <div class="cat-group-header" style="border-left:4px solid #94a3b8">
            <div class="cat-group-title">
              <strong>Ungrouped</strong>
              <span class="text-muted" style="font-size:12px">(${ungrouped.length})</span>
            </div>
          </div>
          <div class="cat-item-list"
               onDragOver=${(e) => { if (drag.current?.type === 'cat') allowDrop(e); }}
               onDrop=${(e) => { if (drag.current?.type === 'cat') { e.preventDefault(); onDrop(null, null); } }}>
            ${ungrouped.map((c) => html`
              <${CatRow} key=${c.id} cat=${c} color="#94a3b8" count=${counts.get(c.id) || 0}
                         onEdit=${() => setCatModal(c)} onDelete=${() => askDeleteCat(c)}
                         onDragStart=${() => { drag.current = { type: 'cat', id: c.id }; }}
                         onDropBefore=${() => onDrop(null, c.id)}
                         dragRef=${drag} />`)}
          </div>
        </div>` : null}

      ${!groups.length && !ungrouped.length
        ? html`<div class="card"><p class="empty-message">No categories yet. Add one to get started.</p></div>` : null}
    </div>

    ${groupModal ? html`<${GroupModal} group=${groupModal} onSave=${saveGroup} onClose=${() => setGroupModal(null)} />` : null}
    ${catModal ? html`<${CatModal} cat=${catModal} groups=${groups} onSave=${saveCat} onClose=${() => setCatModal(null)} />` : null}
    ${delModal ? html`<${DeleteModal} cat=${delModal} groups=${groups} ungrouped=${ungrouped}
                       count=${counts.get(delModal.id) || 0}
                       onConfirm=${(to) => reassignDelete(delModal.id, to)} onClose=${() => setDelModal(null)} />` : null}`;
}

function schedBadge(c) {
  if (c.dueDate) {
    const d = new Date(c.dueDate + 'T00:00:00');
    if (c.recurrence === 'monthly') return html`<span class="badge cat-due-badge" title="Due date">Monthly · day ${d.getDate()}</span>`;
    if (c.recurrence === 'yearly') return html`<span class="badge cat-due-badge">Yearly · ${d.toLocaleString('en-US', { month: 'short', day: 'numeric' })}</span>`;
    return html`<span class="badge cat-due-badge">Due ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
  }
  if (c.recurrence && c.recurrence !== 'none') {
    return html`<span class="badge cat-due-badge">${c.recurrence[0].toUpperCase() + c.recurrence.slice(1)}</span>`;
  }
  return null;
}

function CatRow({ cat, color, count, onEdit, onDelete, onDragStart, onDropBefore, dragRef }) {
  return html`
    <div class="cat-item"
         onDragOver=${(e) => { if (dragRef.current?.type === 'cat') e.preventDefault(); }}
         onDrop=${(e) => { if (dragRef.current?.type === 'cat') { e.preventDefault(); e.stopPropagation(); onDropBefore(); } }}>
      <div class="cat-drag-handle" title="Drag to reorder" draggable="true" onDragStart=${onDragStart}>⠿</div>
      <span class="color-dot" style=${`background:${color}`}></span>
      <div class="cat-item-label">
        <span class="cat-item-name">${cat.name}</span>
        ${cat.notes ? html`<span class="cat-item-notes">${cat.notes}</span>` : null}
      </div>
      ${schedBadge(cat)}
      ${cat.isIncome ? html`<span class="badge badge-green">Income</span>` : null}
      ${cat.link ? html`<a href=${cat.link} target="_blank" rel="noopener" class="btn btn-sm cat-pay-link">↗ Pay</a>` : null}
      <span class="text-muted cat-item-count">${count} txn${count !== 1 ? 's' : ''}</span>
      <div class="cat-item-actions">
        <button class="btn btn-sm" onClick=${onEdit}>Edit</button>
        <button class="btn btn-sm btn-danger" onClick=${onDelete}>×</button>
      </div>
    </div>`;
}

function GroupModal({ group, onSave, onClose }) {
  const [form, setForm] = useState({ name: group.name || '', color: group.color || '#6b7280' });
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  return html`
    <${Modal} title=${group.id ? 'Edit Group' : 'New Group'} width=${420} onClose=${onClose}>
      <form onSubmit=${(e) => { e.preventDefault(); onSave(form); }}>
        <div class="form-group">
          <label>Group Name *</label>
          <input type="text" class="form-control" value=${form.name} required autofocus
                 placeholder="e.g. Food & Dining" onInput=${(e) => set({ name: e.target.value })} />
        </div>
        <div class="form-group">
          <label>Color</label>
          <${ColorField} value=${form.color} onChange=${(color) => set({ color })} />
        </div>
        <${FormActions} submitLabel=${group.id ? 'Save Group' : 'Create Group'} onCancel=${onClose} />
      </form>
    </${Modal}>`;
}

function CatModal({ cat, groups, onSave, onClose }) {
  const [form, setForm] = useState({
    name: cat.name || '',
    color: cat.color || '#6b7280',
    groupId: cat.groupId ?? (cat.groupId === undefined ? '' : ''),
    isIncome: !!cat.isIncome,
    excludeFromBudget: !!cat.excludeFromBudget,
    notes: cat.notes || '',
    link: cat.link || '',
    recurrence: cat.recurrence || 'none',
    dueDate: cat.dueDate || '',
  });
  // a "new to this group" object carries groupId but no id
  if (form.groupId === '' && cat.groupId != null && cat.id == null) form.groupId = cat.groupId;
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  return html`
    <${Modal} title=${cat.id ? 'Edit Category' : 'Add Category'} width=${420} onClose=${onClose}>
      <form onSubmit=${(e) => { e.preventDefault(); onSave(form); }}>
        <div class="form-group">
          <label>Name *</label>
          <input type="text" class="form-control" value=${form.name} required autofocus
                 placeholder="e.g. Groceries" onInput=${(e) => set({ name: e.target.value })} />
        </div>
        <div class="form-group">
          <label>Group</label>
          <select class="form-control" value=${form.groupId == null ? '' : String(form.groupId)}
                  onChange=${(e) => set({ groupId: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">— no group —</option>
            ${groups.map((g) => html`<option value=${String(g.id)}>${g.name}</option>`)}
          </select>
        </div>
        <div class="form-group">
          <label class="toggle-label" style=${TL}>
            <input type="checkbox" checked=${form.isIncome} onChange=${(e) => set({ isIncome: e.target.checked })} />
            Income category
          </label>
        </div>
        <div class="form-group">
          <label class="toggle-label" style=${TL}>
            <input type="checkbox" checked=${form.excludeFromBudget} onChange=${(e) => set({ excludeFromBudget: e.target.checked })} />
            Exclude from budget & spending reports
          </label>
          <span class="text-muted" style="font-size:12px">For transfers and other non-spending categories.</span>
        </div>
        <div class="form-group">
          <label>Color</label>
          <${ColorField} value=${form.color} onChange=${(color) => set({ color })} />
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input type="text" class="form-control" value=${form.notes}
                 placeholder="e.g. Includes takeout and delivery" onInput=${(e) => set({ notes: e.target.value })} />
        </div>
        <div class="form-group">
          <label>Payment Link</label>
          <input type="url" class="form-control" value=${form.link}
                 placeholder="https://… (where you go to pay this)" onInput=${(e) => set({ link: e.target.value })} />
        </div>
        <div class="form-row" style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label>Recurrence</label>
            <select class="form-control" value=${form.recurrence} onChange=${(e) => set({ recurrence: e.target.value })}>
              <option value="none">None</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>Due Date</label>
            <input type="date" class="form-control" value=${form.dueDate} onInput=${(e) => set({ dueDate: e.target.value })} />
          </div>
        </div>
        <${FormActions} submitLabel=${cat.id ? 'Save Changes' : 'Add Category'} onCancel=${onClose} />
      </form>
    </${Modal}>`;
}

const TL = 'text-transform:none;letter-spacing:normal;font-size:13px;font-weight:500';

function DeleteModal({ cat, groups, ungrouped, count, onConfirm, onClose }) {
  const [to, setTo] = useState('');
  return html`
    <${Modal} title=${`Delete "${cat.name}"`} width=${420} onClose=${onClose}>
      <p>This category has ${count} transaction(s). Choose where to reassign them:</p>
      <form onSubmit=${(e) => { e.preventDefault(); onConfirm(to); }}>
        <div class="form-group">
          <label>Reassign transactions to:</label>
          <select class="form-control" value=${to} onChange=${(e) => setTo(e.target.value)}>
            <option value="">Uncategorized</option>
            ${groups.map((g) => html`<optgroup label=${g.name}>
              ${g.categories.filter((c) => c.id !== cat.id).map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
            </optgroup>`)}
            ${ungrouped.length ? html`<optgroup label="Ungrouped">
              ${ungrouped.filter((c) => c.id !== cat.id).map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
            </optgroup>` : null}
          </select>
        </div>
        <${FormActions} submitLabel="Delete" onCancel=${onClose} danger=${true} />
      </form>
    </${Modal}>`;
}
