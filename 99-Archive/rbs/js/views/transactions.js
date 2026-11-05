import { html, useState, useEffect, useMemo, useRef } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { Modal, CategorySelect, FormActions } from '../ui.js';
import { notify } from '../toast.js';
import { money, signedMoney, fmtDate, parseMoney, todayISO } from '../format.js';
import { groupedCategories, categoryMap, catColor } from '../logic/categories.js';
import { sortedTags, tagMap } from '../logic/tags.js';
import {
  filterTransactions, sortTransactions, reviewCount, isSupersededManual,
  suggestCategories, PAGE_SIZE, accountName,
} from '../logic/transactions.js';

const BLANK_FILTERS = {
  accountIds: [], categoryVals: [], tagVals: [], amountType: '',
  showTransfers: false, showSuperseded: false, search: '', dateFrom: '', dateTo: '',
};

function filtersFromQuery(q) {
  return {
    accountIds: q.getAll('account_id').map(Number),
    categoryVals: q.getAll('category_id'),
    tagVals: q.getAll('tag_id'),
    amountType: q.get('amount_type') || '',
    showTransfers: q.get('show_transfers') === '1',
    showSuperseded: q.get('show_superseded') === '1',
    search: q.get('search') || '',
    dateFrom: q.get('date_from') || '',
    dateTo: q.get('date_to') || '',
  };
}

export function Transactions({ query }) {
  const s = store.getState();
  const { groups, ungrouped } = groupedCategories(s);
  const cats = categoryMap(s);
  const tags = sortedTags(s);
  const tagsById = tagMap(s);
  const accounts = [...s.accounts].sort((a, b) => a.name.localeCompare(b.name));

  const view = query.get('view') === 'review' ? 'review' : 'all';
  const [filters, setFilters] = useState(() => filtersFromQuery(query));
  const [sort, setSort] = useState(query.get('sort') || 'date');
  const [dir, setDir] = useState(query.get('dir') || 'desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState({});

  const setF = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const clearFilters = () => { setFilters({ ...BLANK_FILTERS }); setPage(1); };

  const filtered = useMemo(
    () => sortTransactions(filterTransactions({ ...filters, view }, s), sort, dir, s),
    [filters, view, sort, dir, s],
  );
  const totalAmount = filtered.reduce((sum, t) => sum + t.amount, 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rc = reviewCount(s);

  // Category suggestions for uncategorized rows on the current page.
  useEffect(() => {
    const ids = pageRows.filter((t) => t.categoryId == null).map((t) => t.id);
    if (!ids.length) { setSuggestions({}); return; }
    setSuggestions(suggestCategories(ids, s));
  }, [page, view, filters, sort, dir, s.transactions.length]);

  function toggleSort(key) {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir(key === 'date' || key === 'amount' ? 'desc' : 'asc'); }
    setPage(1);
  }

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll(on) {
    setSelected(on ? new Set(pageRows.map((t) => t.id)) : new Set());
  }

  async function setCategory(id, catId) {
    await store.update('transactions', id, { categoryId: catId });
  }
  async function toggleTransfer(t) {
    await store.update('transactions', t.id, { isTransfer: !t.isTransfer });
  }
  async function del(id) {
    if (!confirm('Delete this transaction?')) return;
    await store.remove('transactions', id);
    setSelected((p) => { const n = new Set(p); n.delete(id); return n; });
  }
  async function bulkCategorize(catVal) {
    const ids = [...selected];
    if (!ids.length) return;
    const catId = catVal === '0' || catVal === '' ? null : Number(catVal);
    await store.commit((st) => {
      for (const t of st.transactions) if (ids.includes(t.id)) t.categoryId = catId;
    });
    setSelected(new Set());
    notify(`Updated ${ids.length} transaction(s).`);
  }

  const selectedSum = [...selected].reduce((sum, id) => {
    const t = s.transactions.find((x) => x.id === id);
    return sum + (t ? t.amount : 0);
  }, 0);

  const sortArrow = (key) => (sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  return html`
    <${PageHeader} title="Transactions">
      <button class="btn btn-primary" onClick=${() => setAdding(true)}>+ Add Manual Entry</button>
    </${PageHeader}>

    <div class="txn-views">
      <a href="#/transactions" class="txn-view-tab ${view !== 'review' ? 'active' : ''}">All</a>
      <a href="#/transactions?view=review" class="txn-view-tab ${view === 'review' ? 'active' : ''}">
        Needs Review ${rc ? html`<span class="txn-view-badge">${rc}</span>` : null}
      </a>
    </div>

    <div class="card filter-card">
      <div class="filter-form">
        <div class="filter-row">
          <input type="text" class="form-control filter-search" placeholder="Description"
                 value=${filters.search} onInput=${(e) => setF({ search: e.target.value })} />
          <${MultiFilter} label="All Accounts" options=${accounts.map((a) => ({ value: a.id, label: a.name }))}
                          selected=${filters.accountIds} onChange=${(v) => setF({ accountIds: v })} numeric />
          <${MultiFilter} label="All Categories"
                          options=${catFilterOptions(groups, ungrouped)}
                          selected=${filters.categoryVals} onChange=${(v) => setF({ categoryVals: v })} />
          ${tags.length ? html`
            <${MultiFilter} label="All Tags"
                            options=${[{ value: 'none', label: '— Untagged —' }, ...tags.map((t) => ({ value: String(t.id), label: t.name }))]}
                            selected=${filters.tagVals} onChange=${(v) => setF({ tagVals: v })} />` : null}
          <select class="form-control" value=${filters.amountType} onChange=${(e) => setF({ amountType: e.target.value })}>
            <option value="">All Amounts</option>
            <option value="spending">Spending only</option>
            <option value="earning">Earning only</option>
          </select>
          <input type="date" class="form-control" title="From date" value=${filters.dateFrom} onInput=${(e) => setF({ dateFrom: e.target.value })} />
          <input type="date" class="form-control" title="To date" value=${filters.dateTo} onInput=${(e) => setF({ dateTo: e.target.value })} />
          <button class="btn" onClick=${clearFilters}>Clear</button>
        </div>
        <div class="filter-toggles">
          <label class="toggle-label">
            <input type="checkbox" checked=${filters.showTransfers} onChange=${(e) => setF({ showTransfers: e.target.checked })} />
            Show transfers
          </label>
          <label class="toggle-label">
            <input type="checkbox" checked=${filters.showSuperseded} onChange=${(e) => setF({ showSuperseded: e.target.checked })} />
            Show superseded manual entries
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="table-meta">
          ${filtered.length} transaction${filtered.length !== 1 ? 's' : ''} ·${' '}
          ${selected.size
            ? html`<span>${selected.size} selected</span> <strong class=${selectedSum < 0 ? 'amount-expense' : 'amount-income'}>${signedMoney(selectedSum)}</strong>`
            : html`<span>Total</span> <strong class=${totalAmount < 0 ? 'amount-expense' : 'amount-income'}>${signedMoney(totalAmount)}</strong>`}
        </div>
        ${selected.size ? html`
          <div class="bulk-actions" style="display:flex">
            <select class="form-control form-control-sm" onChange=${(e) => { bulkCategorize(e.target.value); e.target.value = ''; }}>
              <option value="">Set category…</option>
              ${groups.map((g) => html`<optgroup label=${g.name}>
                ${g.categories.map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
              </optgroup>`)}
              ${ungrouped.length ? html`<optgroup label="Ungrouped">
                ${ungrouped.map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
              </optgroup>` : null}
              <option value="0">Clear category</option>
            </select>
          </div>` : null}
      </div>

      ${pageRows.length ? html`
        <div class="table-container">
          <table class="table" id="txn-table">
            <thead><tr>
              <th><input type="checkbox"
                         checked=${pageRows.length > 0 && pageRows.every((t) => selected.has(t.id))}
                         onChange=${(e) => toggleAll(e.target.checked)} /></th>
              ${[['Date', 'date'], ['Account', 'account'], ['Description', 'description'], ['Category', 'category'], ['Source', 'source']].map(
                ([lbl, key]) => html`<th class="sortable" onClick=${() => toggleSort(key)}>${lbl}${sortArrow(key)}</th>`)}
              <th class="sortable text-right" onClick=${() => toggleSort('amount')}>Amount${sortArrow('amount')}</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              ${pageRows.map((t) => {
                const cat = t.categoryId != null ? cats.get(t.categoryId) : null;
                const sug = suggestions[t.id];
                return html`
                  <tr key=${t.id} class="txn-row ${t.isTransfer ? 'transfer-row' : ''}"
                      style="cursor:pointer" onClick=${() => setDetail(t)}>
                    <td onClick=${(e) => e.stopPropagation()}>
                      <input type="checkbox" class="row-check" checked=${selected.has(t.id)} onChange=${() => toggleRow(t.id)} />
                    </td>
                    <td class="text-muted">${fmtDate(t.date)}</td>
                    <td>${accountName(t.accountId, s)}</td>
                    <td class="desc-cell">
                      ${t.description.length > 60 ? t.description.slice(0, 60) + '…' : t.description}
                      ${t.notes ? html`<span class="notes-badge">note</span>` : null}
                      ${isSupersededManual(t) ? html`<span class="linked-badge">linked</span>` : null}
                      ${(t.tagIds || []).map((id) => {
                        const tg = tagsById.get(id);
                        return tg ? html`<span class="tag-chip tag-chip-sm" style=${chip(tg.color)}>${tg.name}</span>` : null;
                      })}
                    </td>
                    <td class="cat-cell" onClick=${(e) => e.stopPropagation()}>
                      <${CategorySelect} className="cat-select form-control-sm" value=${t.categoryId}
                                         groups=${groups} ungrouped=${ungrouped}
                                         onChange=${(v) => setCategory(t.id, v)} />
                      ${sug && t.categoryId == null ? html`
                        <div class="cat-suggestion" title=${`Apply suggested category (${sug.confidence}% confidence)`}
                             onClick=${(e) => { e.stopPropagation(); setCategory(t.id, sug.categoryId); }}>
                          <span class="cat-suggestion-name">${sug.categoryName}</span>
                          <span class="cat-suggestion-conf">${sug.confidence}%</span>
                        </div>` : null}
                    </td>
                    <td>${t.source === 'csv_import'
                      ? html`<span class="badge badge-blue">CSV</span>`
                      : html`<span class="badge badge-gray">Manual</span>`}</td>
                    <td class="text-right ${t.amount < 0 ? 'amount-expense' : 'amount-income'}">${signedMoney(t.amount)}</td>
                    <td class="actions-cell" onClick=${(e) => e.stopPropagation()}>
                      <button class="btn-icon ${t.isTransfer ? 'active' : ''}"
                              title=${t.isTransfer ? 'Unmark transfer' : 'Mark as transfer'}
                              onClick=${() => toggleTransfer(t)}>⇄</button>
                      <button class="btn-icon btn-danger" title="Delete" onClick=${() => del(t.id)}>×</button>
                    </td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? html`
          <div class="pagination">
            <button class="btn btn-sm" disabled=${page <= 1} onClick=${() => setPage(page - 1)}>← Prev</button>
            <span>Page ${page} of ${totalPages}</span>
            <button class="btn btn-sm" disabled=${page >= totalPages} onClick=${() => setPage(page + 1)}>Next →</button>
          </div>` : null}`
        : html`<p class="empty-message">${view === 'review'
            ? '🎉 All caught up — every transaction has a category.'
            : 'No transactions match your filters.'}</p>`}
    </div>

    ${detail ? html`<${DetailModal} txn=${s.transactions.find((x) => x.id === detail.id) || detail}
                     tags=${tags} cats=${cats} s=${s} onClose=${() => setDetail(null)} />` : null}
    ${adding ? html`<${AddModal} accounts=${accounts} groups=${groups} ungrouped=${ungrouped} tags=${tags}
                     onClose=${() => setAdding(false)} />` : null}`;
}

function chip(color) { return `background:${color}20;color:${color};border-color:${color}55`; }

function catFilterOptions(groups, ungrouped) {
  const opts = [{ value: 'uncategorized', label: '— Uncategorized —' }];
  for (const g of groups) for (const c of g.categories) opts.push({ value: String(c.id), label: `${g.name}: ${c.name}` });
  for (const c of ungrouped) opts.push({ value: String(c.id), label: c.name });
  return opts;
}

// ── Multi-select filter: button + checkbox dropdown ──
function MultiFilter({ label, options, selected, onChange, numeric }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);
  const norm = (v) => (numeric ? Number(v) : v);
  const sel = new Set(selected.map(String));
  const summary = sel.size === 0 ? label
    : sel.size === 1 ? (options.find((o) => String(o.value) === [...sel][0])?.label || label)
    : `${sel.size} selected`;

  function toggle(v) {
    const key = String(v);
    const next = new Set(sel);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange([...next].map(norm));
  }

  return html`
    <div class="filter-field" ref=${ref} style="position:relative">
      <button type="button" class="form-control ms-summary" onClick=${() => setOpen(!open)}>${summary}</button>
      ${open ? html`
        <div class="ms-panel open" style="position:absolute;z-index:50;max-height:280px;overflow:auto;min-width:200px">
          ${options.map((o) => html`
            <label class="ms-opt" key=${String(o.value)}>
              <input type="checkbox" checked=${sel.has(String(o.value))} onChange=${() => toggle(o.value)} /> ${o.label}
            </label>`)}
        </div>` : null}
    </div>`;
}

// ── Transaction detail modal ──
function DetailModal({ txn, tags, cats, s, onClose }) {
  const [notesVal, setNotesVal] = useState(txn.notes || '');
  const [tagIds, setTagIds] = useState(new Set(txn.tagIds || []));
  const cat = txn.categoryId != null ? cats.get(txn.categoryId) : null;

  async function saveNotes() {
    await store.update('transactions', txn.id, { notes: notesVal.trim() });
    notify('Note saved.');
  }
  async function saveTags() {
    await store.update('transactions', txn.id, { tagIds: [...tagIds].sort((a, b) => a - b) });
    notify('Tags saved.');
  }

  return html`
    <${Modal} onClose=${onClose} width=${460}>
      <div class="txn-detail-header">
        <div>
          <div class="txn-detail-amount ${txn.amount < 0 ? 'amount-expense' : 'amount-income'}">${signedMoney(txn.amount)}</div>
          <div class="txn-detail-date">${fmtDate(txn.date)}</div>
        </div>
        <button class="btn-icon" onClick=${onClose} style="font-size:18px;width:34px;height:34px">×</button>
      </div>
      <div class="txn-detail-body">
        ${row('Description', txn.description)}
        ${row('Account', accountName(txn.accountId, s))}
        ${row('Category', cat ? cat.name : '— uncategorized —')}
        ${row('Source', txn.source === 'csv_import' ? 'CSV Import' : 'Manual Entry')}
        ${row('Transfer', txn.isTransfer ? 'Yes' : 'No')}
        ${tags.length ? html`
          <div class="txn-detail-row" style="align-items:flex-start">
            <span class="txn-detail-label">Tags</span>
            <span class="txn-detail-value">
              <div class="tag-checkbox-row">
                ${tags.map((t) => html`
                  <label class="tag-checkbox" key=${t.id}>
                    <input type="checkbox" checked=${tagIds.has(t.id)} onChange=${() => setTagIds((p) => {
                      const n = new Set(p); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n;
                    })} />
                    <span class="tag-chip" style=${chip(t.color)}>${t.name}</span>
                  </label>`)}
              </div>
              <button class="btn btn-sm btn-primary" style="margin-top:8px" onClick=${saveTags}>Save tags</button>
            </span>
          </div>` : null}
        <div class="txn-detail-row" style="align-items:flex-start">
          <span class="txn-detail-label">Notes</span>
          <span class="txn-detail-value">
            <textarea class="form-control" rows="2" value=${notesVal}
                      placeholder="What was this purchase for?" onInput=${(e) => setNotesVal(e.target.value)}></textarea>
            <button class="btn btn-sm btn-primary" style="margin-top:8px" onClick=${saveNotes}>Save note</button>
          </span>
        </div>
        ${txn.createdAt ? row('Created', new Date(txn.createdAt).toLocaleString('en-US')) : null}
        ${txn.importId ? row('Import #', '#' + txn.importId) : null}
      </div>
    </${Modal}>`;
}

function row(label, value) {
  return html`
    <div class="txn-detail-row">
      <span class="txn-detail-label">${label}</span>
      <span class="txn-detail-value">${value}</span>
    </div>`;
}

// ── Add manual entry ──
function AddModal({ accounts, groups, ungrouped, tags, onClose }) {
  const [form, setForm] = useState({
    accountId: accounts[0]?.id ? String(accounts[0].id) : '',
    date: todayISO(), description: '', amount: '', categoryId: null,
    isTransfer: false, notes: '', tagIds: new Set(),
  });
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  async function submit(e) {
    e.preventDefault();
    const amt = parseMoney(form.amount);
    if (!form.accountId) return notify('Account is required.', 'error');
    if (!form.date) return notify('Date is required.', 'error');
    if (!form.description.trim()) return notify('Description is required.', 'error');
    if (amt == null) return notify('Enter a valid amount.', 'error');
    await store.insert('transactions', {
      accountId: Number(form.accountId),
      date: form.date,
      description: form.description.trim(),
      amount: amt,
      categoryId: typeof form.categoryId === 'number' ? form.categoryId : null,
      isTransfer: form.isTransfer,
      source: 'manual',
      importId: null,
      linkedTransactionId: null,
      notes: form.notes.trim(),
      createdAt: new Date().toISOString(),
      tagIds: [...form.tagIds].sort((a, b) => a - b),
    });
    notify('Transaction added.');
    onClose();
  }

  return html`
    <${Modal} title="Add Manual Entry" width=${460} onClose=${onClose}>
      <form onSubmit=${submit}>
        <div class="form-row" style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label>Account *</label>
            <select class="form-control" value=${form.accountId} onChange=${(e) => set({ accountId: e.target.value })}>
              ${accounts.map((a) => html`<option value=${String(a.id)}>${a.name}</option>`)}
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>Date *</label>
            <input type="date" class="form-control" value=${form.date} onInput=${(e) => set({ date: e.target.value })} />
          </div>
        </div>
        <div class="form-group">
          <label>Description *</label>
          <input type="text" class="form-control" value=${form.description} autofocus
                 onInput=${(e) => set({ description: e.target.value })} />
        </div>
        <div class="form-row" style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label>Amount *</label>
            <input type="text" class="form-control" inputmode="decimal" value=${form.amount}
                   placeholder="-12.34 for spending" onInput=${(e) => set({ amount: e.target.value })} />
          </div>
          <div class="form-group" style="flex:1">
            <label>Category</label>
            <${CategorySelect} value=${form.categoryId} groups=${groups} ungrouped=${ungrouped}
                               onChange=${(v) => set({ categoryId: v })} />
          </div>
        </div>
        <div class="form-group">
          <label class="toggle-label" style="text-transform:none;letter-spacing:normal;font-size:13px;font-weight:500">
            <input type="checkbox" checked=${form.isTransfer} onChange=${(e) => set({ isTransfer: e.target.checked })} />
            This is a transfer between accounts
          </label>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input type="text" class="form-control" value=${form.notes} onInput=${(e) => set({ notes: e.target.value })} />
        </div>
        <${FormActions} submitLabel="Add Transaction" onCancel=${onClose} />
      </form>
    </${Modal}>`;
}
