'use strict';

/* ============================================================
   Requirements & Bug Tracker — app.js
   IndexedDB-backed, vanilla JS, no dependencies
   ============================================================ */

// ── Constants ─────────────────────────────────────────────────
const DB_NAME = 'req-tracker-db';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';
const STORE_SETTINGS = 'settings';

const COLUMN_DEFS = [
  { key: 'id',          label: 'ID',          sortable: true,  width: 60,  editable: false },
  { key: 'title',       label: 'Title',        sortable: true,  width: 240, editable: 'text' },
  { key: 'project',     label: 'Project',      sortable: true,  width: 130, editable: 'text' },
  { key: 'type',        label: 'Type',         sortable: true,  width: 110, editable: 'select',
    options: ['Bug','Feature','Enhancement','Task','Question'] },
  { key: 'status',      label: 'Status',       sortable: true,  width: 120, editable: 'select',
    options: ['Open','In Progress','Review','Closed',"Won't Fix"] },
  { key: 'priority',    label: 'Priority',     sortable: true,  width: 100, editable: 'select',
    options: ['','Critical','High','Medium','Low'] },
  { key: 'assignee',    label: 'Assignee',     sortable: true,  width: 130, editable: 'text' },
  { key: 'createdAt',   label: 'Created',      sortable: true,  width: 110, editable: false },
  { key: 'updatedAt',   label: 'Updated',      sortable: true,  width: 110, editable: false },
];

const STATUS_ORDER = ['Open','In Progress','Review','Closed',"Won't Fix"];
const PRIORITY_ORDER = ['Critical','High','Medium','Low',''];

const CHART_COLORS = [
  '#F5C800','#4a9fd4','#4caf79','#e05555','#a070d6','#e08a30','#56b8b8','#c8745a'
];

const DEMO_DATA = [
  { title:'Login page crashes on Safari',    project:'Website',    type:'Bug',         status:'Open',       priority:'Critical', assignee:'Alice', description:'Clicking the login button on Safari 16 throws a TypeError. Reproducible on iOS and macOS.' },
  { title:'Add dark mode toggle',            project:'Website',    type:'Feature',     status:'In Progress',priority:'High',     assignee:'Bob',   description:'Users have requested a dark mode. Should persist to localStorage.' },
  { title:'Improve CSV export formatting',   project:'Backend',    type:'Enhancement', status:'Open',       priority:'Medium',   assignee:'Alice', description:'Commas inside fields should be properly escaped per RFC 4180.' },
  { title:'Update dependencies to latest',   project:'Backend',    type:'Task',        status:'Closed',     priority:'Low',      assignee:'Carol', description:'Run npm audit and update all packages.' },
  { title:'Pagination on the contacts list', project:'Website',    type:'Feature',     status:'Review',     priority:'High',     assignee:'Bob',   description:'Currently the table renders all rows at once. Add server-side or virtual pagination.' },
  { title:'404 error on /profile route',     project:'Website',    type:'Bug',         status:'Open',       priority:'High',     assignee:'Carol', description:'Navigating directly to /profile returns 404. Route is missing from the router config.' },
  { title:'Search is case-sensitive',        project:'Mobile App', type:'Bug',         status:'Closed',     priority:'Medium',   assignee:'Alice', description:'Search input should normalize both sides to lowercase before comparing.' },
  { title:'API rate limit handling',         project:'Backend',    type:'Task',        status:'Open',       priority:'Medium',   assignee:'',      description:'When the upstream API returns 429, we should retry with exponential backoff.' },
  { title:'Which auth library to use?',      project:'Mobile App', type:'Question',    status:'Open',       priority:'Low',      assignee:'Bob',   description:'Evaluating Passport.js vs custom JWT middleware. Need team input.' },
  { title:'Keyboard navigation in modal',    project:'Website',    type:'Enhancement', status:"Won't Fix",  priority:'Low',      assignee:'',      description:'Focus trap and ESC-to-close were considered out of scope for v1.' },
];

// ── State ─────────────────────────────────────────────────────
let db = null;
let state = {
  items: [],
  filteredItems: [],
  sortKey: 'id',
  sortDir: 'desc',
  searchQuery: '',
  filterType: '',
  filterStatus: '',
  filterPriority: '',
  filterProject: '',
  selected: new Set(),
};
let settings = { theme: 'system' };
let nextId = 1;
let pendingImportData = null;
let activeLogItemId = null;

// ── IndexedDB ─────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_ITEMS)) {
        const s = d.createObjectStore(STORE_ITEMS, { keyPath: 'id', autoIncrement: false });
        s.createIndex('status', 'status');
        s.createIndex('type', 'type');
        s.createIndex('priority', 'priority');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!d.objectStoreNames.contains(STORE_SETTINGS)) {
        d.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(storeName, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbClear(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Data helpers ──────────────────────────────────────────────
function now() { return new Date().toISOString(); }

function makeId() { return nextId++; }

function recalcNextId() {
  nextId = state.items.length ? Math.max(...state.items.map(i => i.id)) + 1 : 1;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeClass(prefix, value) {
  return 'badge badge-' + prefix + '-' + String(value).replace(/[^a-zA-Z0-9]/g, '-');
}

// ── Load / Save ───────────────────────────────────────────────
async function loadData() {
  const raw = await dbGetAll(STORE_ITEMS);
  // Normalize items — add missing fields from older records
  state.items = raw.map(item => ({
    project: '',
    log: [],
    ...item,
  }));
  recalcNextId();
}

async function loadSettings() {
  const rows = await dbGetAll(STORE_SETTINGS);
  rows.forEach(r => { settings[r.key] = r.value; });
}

async function saveSetting(key, value) {
  settings[key] = value;
  await dbPut(STORE_SETTINGS, { key, value });
}

// ── Theme ─────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2800);
}

// ── Confirm modal ─────────────────────────────────────────────
let confirmCallback = null;
function showConfirm(title, msg, okLabel, okClass, cb) {
  document.getElementById('modal-confirm-title').textContent = title;
  document.getElementById('modal-confirm-msg').textContent = msg;
  const okBtn = document.getElementById('modal-confirm-ok');
  okBtn.textContent = okLabel || 'Confirm';
  okBtn.className = 'btn ' + (okClass || 'btn-danger');
  confirmCallback = cb;
  document.getElementById('modal-confirm').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('modal-confirm').classList.add('hidden');
  confirmCallback = null;
}

// ── Form panel ────────────────────────────────────────────────
function openForm(item) {
  const panel = document.getElementById('form-panel');
  document.getElementById('form-panel-title').textContent = item ? 'Edit Item' : 'New Item';
  document.getElementById('form-id').value = item ? item.id : '';
  document.getElementById('form-title').value = item ? item.title : '';
  document.getElementById('form-type').value = item ? item.type : '';
  document.getElementById('form-status').value = item ? item.status : '';
  document.getElementById('form-priority').value = item ? (item.priority || '') : '';
  document.getElementById('form-assignee').value = item ? (item.assignee || '') : '';
  document.getElementById('form-project').value = item ? (item.project || '') : '';
  document.getElementById('form-description').value = item ? (item.description || '') : '';
  panel.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  panel.classList.remove('hidden');
  document.getElementById('form-title').focus();
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeForm() {
  document.getElementById('form-panel').classList.add('hidden');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const titleEl = document.getElementById('form-title');
  const typeEl = document.getElementById('form-type');
  const statusEl = document.getElementById('form-status');
  let valid = true;

  [titleEl, typeEl, statusEl].forEach(el => {
    el.classList.remove('error');
    if (!el.value.trim()) { el.classList.add('error'); valid = false; }
  });

  if (!valid) { showToast('Please fill in required fields.', 'error'); return; }

  const idVal = document.getElementById('form-id').value;
  const isNew = !idVal;
  const n = now();
  const existingItem = isNew ? null : state.items.find(i => i.id === parseInt(idVal, 10));

  const item = {
    id: isNew ? makeId() : parseInt(idVal, 10),
    title: titleEl.value.trim(),
    type: typeEl.value,
    status: statusEl.value,
    priority: document.getElementById('form-priority').value,
    assignee: document.getElementById('form-assignee').value.trim(),
    project: document.getElementById('form-project').value.trim(),
    description: document.getElementById('form-description').value.trim(),
    log: existingItem ? (existingItem.log || []) : [],
    createdAt: existingItem ? existingItem.createdAt : n,
    updatedAt: n,
  };

  await dbPut(STORE_ITEMS, item);

  if (isNew) {
    state.items.push(item);
    recalcNextId();
  } else {
    const idx = state.items.findIndex(i => i.id === item.id);
    if (idx !== -1) state.items[idx] = item;
  }

  closeForm();
  applyFiltersAndRender();
  showToast(isNew ? 'Item created.' : 'Item updated.', 'success');
}

// ── Delete ────────────────────────────────────────────────────
async function handleDelete(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  showConfirm('Delete Item', `Delete "${item.title}"? This cannot be undone.`, 'Delete', 'btn-danger', async () => {
    await dbDelete(STORE_ITEMS, id);
    state.items = state.items.filter(i => i.id !== id);
    closeConfirm();
    applyFiltersAndRender();
    showToast('Item deleted.', 'success');
  });
}

// ── Inline editing ────────────────────────────────────────────
function startInlineEdit(td, item, colDef) {
  if (td.querySelector('.cell-input, .cell-select')) return; // already editing
  td.classList.add('cell-editing');

  const originalHTML = td.innerHTML;
  const currentVal = String(item[colDef.key] ?? '');
  let committed = false;

  td.innerHTML = '';

  if (colDef.editable === 'select') {
    const sel = document.createElement('select');
    sel.className = 'cell-select';
    colDef.options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt;
      el.textContent = opt || '— None —';
      el.selected = opt === currentVal;
      sel.appendChild(el);
    });
    td.appendChild(sel);
    sel.focus();
    sel.addEventListener('change', () => commit(sel.value));
    sel.addEventListener('blur', () => commit(sel.value));
    sel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { cancel(); e.stopPropagation(); }
    });
  } else {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'cell-input';
    inp.value = currentVal;
    if (colDef.key === 'project') inp.setAttribute('list', 'project-datalist');
    td.appendChild(inp);
    inp.focus();
    inp.select();
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commit(inp.value); e.preventDefault(); }
      if (e.key === 'Escape') { cancel(); e.stopPropagation(); }
    });
    inp.addEventListener('blur', () => commit(inp.value));
  }

  async function commit(newVal) {
    if (committed) return;
    committed = true;
    td.classList.remove('cell-editing');

    if (newVal === currentVal) {
      td.innerHTML = originalHTML;
      return;
    }

    item[colDef.key] = newVal;
    item.updatedAt = now();
    await dbPut(STORE_ITEMS, item);

    const idx = state.items.findIndex(i => i.id === item.id);
    if (idx !== -1) state.items[idx] = item;

    td.innerHTML = buildCellContent(item, colDef);
    attachDoubleClick(td, item, colDef);

    if (colDef.key === 'project') refreshFilters();
    renderDashboard();
  }

  function cancel() {
    if (committed) return;
    committed = true;
    td.classList.remove('cell-editing');
    td.innerHTML = originalHTML;
    attachDoubleClick(td, item, colDef);
  }
}

function attachDoubleClick(td, item, colDef) {
  td.addEventListener('dblclick', () => startInlineEdit(td, item, colDef), { once: true });
}

function buildCellContent(item, colDef) {
  const key = colDef.key;
  const val = item[key];

  if (key === 'id') return `<span class="id-cell">#${item.id}</span>`;
  if (key === 'title') return `<span class="text-truncate" title="${escHtml(val)}">${escHtml(val)}</span>`;
  if (key === 'project') return val ? escHtml(val) : '<span class="text-muted">—</span>';
  if (key === 'type') return val ? `<span class="${badgeClass('type', val)}">${escHtml(val)}</span>` : '';
  if (key === 'status') return val ? `<span class="${badgeClass('status', val)}">${escHtml(val)}</span>` : '';
  if (key === 'priority') return val ? `<span class="${badgeClass('priority', val)}">${escHtml(val)}</span>` : '<span class="text-muted">—</span>';
  if (key === 'assignee') return val ? escHtml(val) : '<span class="text-muted">—</span>';
  if (key === 'createdAt') return `<span class="date-cell">${fmtDate(val)}</span>`;
  if (key === 'updatedAt') return `<span class="date-cell">${fmtDate(val)}</span>`;
  return escHtml(val ?? '');
}

// ── Bulk selection ────────────────────────────────────────────
function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const count = state.selected.size;
  if (count === 0) {
    bar.classList.add('hidden');
  } else {
    bar.classList.remove('hidden');
    document.getElementById('bulk-bar-count').textContent =
      `${count} item${count !== 1 ? 's' : ''} selected`;
  }
}

async function exportSelected() {
  const selectedItems = state.items.filter(i => state.selected.has(i.id));
  if (!selectedItems.length) return;
  const data = { version: 2, exportedAt: now(), items: selectedItems };
  const json = JSON.stringify(data, null, 2);
  const filename = `req-export-selected-${new Date().toISOString().slice(0,10)}.json`;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    showToast(`Exported ${selectedItems.length} item(s).`, 'success');
  } catch (err) {
    if (err.name === 'AbortError') return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${selectedItems.length} item(s).`, 'success');
  }
}

// ── Update Log modal ──────────────────────────────────────────
function openLogModal(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  activeLogItemId = id;

  document.getElementById('modal-log-title').textContent = 'Update Log';
  document.getElementById('modal-log-subtitle').textContent = `#${item.id} — ${item.title}`;
  document.getElementById('log-note-input').value = '';
  renderLogEntries(item);
  document.getElementById('modal-log').classList.remove('hidden');
  document.getElementById('log-note-input').focus();
}

function closeLogModal() {
  document.getElementById('modal-log').classList.add('hidden');
  activeLogItemId = null;
}

function renderLogEntries(item) {
  const container = document.getElementById('log-entries');
  const empty = document.getElementById('log-empty');
  const log = item.log || [];

  if (!log.length) {
    container.innerHTML = '';
    container.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  // Newest first
  container.innerHTML = [...log].reverse().map(entry => `
    <div class="log-entry">
      <div class="log-entry-ts">${fmtDateTime(entry.ts)}</div>
      <div class="log-entry-note">${escHtml(entry.note)}</div>
    </div>
  `).join('');
}

async function addLogEntry() {
  if (activeLogItemId == null) return;
  const note = document.getElementById('log-note-input').value.trim();
  if (!note) { showToast('Note cannot be empty.', 'error'); return; }

  const item = state.items.find(i => i.id === activeLogItemId);
  if (!item) return;

  if (!item.log) item.log = [];
  item.log.push({ ts: now(), note });
  item.updatedAt = now();

  await dbPut(STORE_ITEMS, item);

  const idx = state.items.findIndex(i => i.id === activeLogItemId);
  if (idx !== -1) state.items[idx] = item;

  document.getElementById('log-note-input').value = '';
  renderLogEntries(item);

  // Update the log badge in the table row without full re-render
  const logBtn = document.querySelector(`tr[data-id="${activeLogItemId}"] .btn-log`);
  if (logBtn) {
    const count = item.log.length;
    const badge = logBtn.querySelector('.log-badge');
    if (badge) {
      badge.textContent = count;
    } else {
      logBtn.insertAdjacentHTML('beforeend', `<span class="log-badge">${count}</span>`);
    }
  }

  showToast('Note added.', 'success');
}

// ── Filter dropdowns (all dynamic from data) ──────────────────
function refreshFilters() {
  // Helper: rebuild one select from unique non-empty values, preserving current selection
  function rebuild(id, allLabel, values) {
    const sel = document.getElementById(id);
    const current = sel.value;
    sel.innerHTML = `<option value="">${allLabel}</option>` +
      values.map(v => `<option value="${escHtml(v)}"${v === current ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
    // If the previously selected value no longer exists in the data, reset the state
    if (current && !values.includes(current)) sel.value = '';
  }

  const items = state.items;

  // Types — preserve logical order where possible, append unknown values
  const TYPE_ORDER = ['Bug','Feature','Enhancement','Task','Question'];
  const types = [
    ...TYPE_ORDER.filter(t => items.some(i => i.type === t)),
    ...[...new Set(items.map(i => i.type).filter(Boolean))].filter(t => !TYPE_ORDER.includes(t)).sort(),
  ];

  // Statuses — preserve workflow order
  const STATUS_ORDER_FILTER = ['Open','In Progress','Review','Closed',"Won't Fix"];
  const statuses = [
    ...STATUS_ORDER_FILTER.filter(s => items.some(i => i.status === s)),
    ...[...new Set(items.map(i => i.status).filter(Boolean))].filter(s => !STATUS_ORDER_FILTER.includes(s)).sort(),
  ];

  // Priorities — preserve severity order
  const PRI_ORDER = ['Critical','High','Medium','Low'];
  const priorities = [
    ...PRI_ORDER.filter(p => items.some(i => i.priority === p)),
    ...[...new Set(items.map(i => i.priority).filter(Boolean))].filter(p => !PRI_ORDER.includes(p)).sort(),
  ];

  // Projects — alphabetical
  const projects = [...new Set(items.map(i => i.project || '').filter(Boolean))].sort();

  rebuild('filter-type',     'All Types',     types);
  rebuild('filter-status',   'All Statuses',  statuses);
  rebuild('filter-priority', 'All Priorities', priorities);
  rebuild('filter-project',  'All Projects',  projects);

  // Also update the form datalist for project autocomplete
  const dl = document.getElementById('project-datalist');
  if (dl) dl.innerHTML = projects.map(p => `<option value="${escHtml(p)}">`).join('');
}

// ── Filters & Sort ────────────────────────────────────────────
function applyFiltersAndRender() {
  let items = state.items.slice();

  const q = state.searchQuery.toLowerCase();
  if (q) {
    items = items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      (i.assignee || '').toLowerCase().includes(q) ||
      (i.project || '').toLowerCase().includes(q) ||
      String(i.id).includes(q)
    );
  }

  if (state.filterType) items = items.filter(i => i.type === state.filterType);
  if (state.filterStatus) items = items.filter(i => i.status === state.filterStatus);
  if (state.filterPriority) items = items.filter(i => i.priority === state.filterPriority);
  if (state.filterProject) items = items.filter(i => (i.project || '') === state.filterProject);

  const key = state.sortKey;
  const dir = state.sortDir === 'asc' ? 1 : -1;

  items.sort((a, b) => {
    let av = a[key] ?? '', bv = b[key] ?? '';
    if (key === 'id') return (a.id - b.id) * dir;
    if (key === 'status') {
      const ai = STATUS_ORDER.indexOf(av), bi = STATUS_ORDER.indexOf(bv);
      return (ai - bi) * dir;
    }
    if (key === 'priority') {
      const ai = PRIORITY_ORDER.indexOf(av === '' ? '' : av), bi = PRIORITY_ORDER.indexOf(bv === '' ? '' : bv);
      return (ai - bi) * dir;
    }
    if (key === 'createdAt' || key === 'updatedAt') {
      return (new Date(av) - new Date(bv)) * dir;
    }
    return av.toString().localeCompare(bv.toString()) * dir;
  });

  state.filteredItems = items;
  refreshFilters();
  renderTable();
  renderDashboard();
}

// ── Table render ──────────────────────────────────────────────
function renderTableHeader() {
  const tr = document.getElementById('items-thead-row');
  const visibleIds = state.filteredItems.map(i => i.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => state.selected.has(id));
  const someChecked = !allChecked && visibleIds.some(id => state.selected.has(id));
  tr.innerHTML = `<th class="col-check">
    <input type="checkbox" class="row-check" id="select-all-check" ${allChecked ? 'checked' : ''} title="Select all" />
  </th><th class="col-actions">Actions</th>` +
    COLUMN_DEFS.map(col => {
      const isSort = state.sortKey === col.key;
      const cls = ['sortable', isSort ? (state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : ''].filter(Boolean).join(' ');
      return `<th class="${cls}" data-col="${col.key}" style="min-width:${col.width}px">
        ${escHtml(col.label)}${col.sortable ? '<span class="sort-icon"></span>' : ''}
      </th>`;
    }).join('');

  // Set indeterminate state (can't be done via HTML attribute)
  const selectAllBox = document.getElementById('select-all-check');
  if (selectAllBox) selectAllBox.indeterminate = someChecked;

  tr.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (state.sortKey === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = col;
        state.sortDir = 'asc';
      }
      applyFiltersAndRender();
    });
  });

  // Select-all checkbox
  if (selectAllBox) {
    selectAllBox.addEventListener('change', () => {
      const visibleIds = state.filteredItems.map(i => i.id);
      if (selectAllBox.checked) {
        visibleIds.forEach(id => state.selected.add(id));
      } else {
        visibleIds.forEach(id => state.selected.delete(id));
      }
      // Re-sync row checkboxes without full re-render
      document.querySelectorAll('#items-tbody .row-check').forEach(cb => {
        const id = parseInt(cb.closest('tr').dataset.id, 10);
        cb.checked = state.selected.has(id);
      });
      updateBulkBar();
    });
  }
}

function renderTable() {
  renderTableHeader();
  const tbody = document.getElementById('items-tbody');
  const empty = document.getElementById('empty-state');
  const emptyMsg = document.getElementById('empty-state-msg');
  const countLabel = document.getElementById('item-count-label');

  const items = state.filteredItems;
  countLabel.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    const hasFilters = state.searchQuery || state.filterType || state.filterStatus || state.filterPriority || state.filterProject;
    emptyMsg.textContent = hasFilters
      ? 'No items match the current filters.'
      : 'Create your first item to get started.';
    return;
  }

  empty.classList.add('hidden');
  tbody.innerHTML = items.map(item => buildRow(item)).join('');

  // Attach listeners for actions column buttons
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.closest('tr').dataset.id, 10);
      const item = state.items.find(i => i.id === id);
      if (item) openForm(item);
    });
  });

  tbody.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.closest('tr').dataset.id, 10);
      handleDelete(id);
    });
  });

  tbody.querySelectorAll('.btn-log').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.closest('tr').dataset.id, 10);
      openLogModal(id);
    });
  });

  // Row checkboxes
  tbody.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = parseInt(cb.closest('tr').dataset.id, 10);
      if (cb.checked) {
        state.selected.add(id);
        cb.closest('tr').classList.add('row-selected');
      } else {
        state.selected.delete(id);
        cb.closest('tr').classList.remove('row-selected');
      }
      updateBulkBar();
      // Update select-all header checkbox state
      const visibleIds = state.filteredItems.map(i => i.id);
      const allChecked = visibleIds.every(id => state.selected.has(id));
      const someChecked = !allChecked && visibleIds.some(id => state.selected.has(id));
      const selectAllBox = document.getElementById('select-all-check');
      if (selectAllBox) { selectAllBox.checked = allChecked; selectAllBox.indeterminate = someChecked; }
    });
  });

  updateBulkBar();

  // Attach double-click inline editing for editable cells
  tbody.querySelectorAll('td[data-col]').forEach(td => {
    const colKey = td.dataset.col;
    const colDef = COLUMN_DEFS.find(c => c.key === colKey);
    if (!colDef || !colDef.editable) return;
    const id = parseInt(td.closest('tr').dataset.id, 10);
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    td.classList.add('cell-editable');
    attachDoubleClick(td, item, colDef);
  });
}

function buildRow(item) {
  const logCount = (item.log || []).length;
  const logBadge = logCount ? `<span class="log-badge">${logCount}</span>` : '';
  const isSelected = state.selected.has(item.id);

  const cells = COLUMN_DEFS.map(col => {
    const editable = col.editable ? ' class="cell-editable"' : '';
    return `<td data-col="${col.key}"${editable}>${buildCellContent(item, col)}</td>`;
  }).join('');

  return `<tr data-id="${item.id}"${isSelected ? ' class="row-selected"' : ''}>
    <td class="col-check">
      <input type="checkbox" class="row-check" ${isSelected ? 'checked' : ''} />
    </td>
    <td class="col-actions">
      <div class="tbl-actions">
        <button class="tbl-btn tbl-btn-edit btn-edit" title="Open full edit form">&#9998;</button>
        <button class="tbl-btn tbl-btn-log btn-log" title="Update log">${logCount > 0 ? '&#128221;' : '&#128203;'}${logBadge}</button>
        <button class="tbl-btn tbl-btn-delete btn-del" title="Delete">&#128465;</button>
      </div>
    </td>
    ${cells}
  </tr>`;
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  const items = state.items;
  const total = items.length;

  const byStatus = {}, byType = {}, byPriority = {}, byMonth = {};

  items.forEach(item => {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    byType[item.type] = (byType[item.type] || 0) + 1;
    if (item.priority) byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
    const d = new Date(item.createdAt);
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    byMonth[mk] = (byMonth[mk] || 0) + 1;
  });

  document.getElementById('dash-total').textContent = total;
  document.getElementById('dash-open').textContent = byStatus['Open'] || 0;
  document.getElementById('dash-inprogress').textContent = byStatus['In Progress'] || 0;
  document.getElementById('dash-closed').textContent = byStatus['Closed'] || 0;

  renderDonut('chart-status', 'legend-status', byStatus, CHART_COLORS);
  renderDonut('chart-type', 'legend-type', byType, CHART_COLORS);
  renderBarChart('chart-priority', byPriority, PRIORITY_ORDER.filter(p => p), CHART_COLORS);
  renderTimeline('chart-timeline', byMonth);
}

function renderDonut(chartId, legendId, data, colors) {
  const el = document.getElementById(chartId);
  const leg = document.getElementById(legendId);
  if (!el) return;

  const entries = Object.entries(data).filter(([,v]) => v > 0);
  if (!entries.length) { el.innerHTML = '<span style="color:var(--text-dim);font-size:12px">No data</span>'; if(leg)leg.innerHTML=''; return; }

  const total = entries.reduce((s,[,v]) => s+v, 0);
  const size = 120, cx = 60, cy = 60, r = 44, inner = 24;
  let angle = -Math.PI / 2;

  const paths = entries.map(([, val], i) => {
    const sweep = (val / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    const xi1 = cx + inner * Math.cos(angle - sweep), yi1 = cy + inner * Math.sin(angle - sweep);
    const xi2 = cx + inner * Math.cos(angle), yi2 = cy + inner * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const color = colors[i % colors.length];
    return `<path d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${large},0 ${xi1},${yi1} Z" fill="${color}" opacity="0.9"/>`;
  });

  el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths.join('')}</svg>`;

  if (leg) {
    leg.innerHTML = entries.map(([label, val], i) =>
      `<div class="legend-item"><div class="legend-dot" style="background:${colors[i % colors.length]}"></div>${escHtml(label)}: ${val}</div>`
    ).join('');
  }
}

function renderBarChart(chartId, data, order, colors) {
  const el = document.getElementById(chartId);
  if (!el) return;

  const keys = order.length ? order.filter(k => data[k] != null) : Object.keys(data);
  if (!keys.length) { el.innerHTML = '<span style="color:var(--text-dim);font-size:12px">No data</span>'; return; }

  const max = Math.max(...keys.map(k => data[k] || 0), 1);

  el.innerHTML = `<div class="bar-chart">${keys.map((k, i) => {
    const val = data[k] || 0;
    const pct = Math.round((val / max) * 100);
    return `<div class="bar-row">
      <div class="bar-label">${escHtml(k)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colors[i % colors.length]}"></div></div>
      <div class="bar-count">${val}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderTimeline(chartId, byMonth) {
  const el = document.getElementById(chartId);
  if (!el) return;

  const keys = Object.keys(byMonth).sort();
  if (!keys.length) { el.innerHTML = '<span style="color:var(--text-dim);font-size:12px">No data</span>'; return; }

  const max = Math.max(...Object.values(byMonth), 1);
  el.innerHTML = `<div class="timeline-chart">${keys.map(mk => {
    const [yr, mo] = mk.split('-');
    const label = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    const val = byMonth[mk];
    const pct = Math.round((val / max) * 100);
    return `<div class="timeline-row">
      <div class="timeline-label">${escHtml(label)}</div>
      <div class="timeline-track"><div class="timeline-fill" style="width:${pct}%"></div></div>
      <div class="timeline-count">${val}</div>
    </div>`;
  }).join('')}</div>`;
}

// ── Import / Export ───────────────────────────────────────────
async function exportJSON() {
  const data = { version: 2, exportedAt: now(), items: state.items };
  const json = JSON.stringify(data, null, 2);
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `req-tracker-export-${new Date().toISOString().slice(0,10)}.json`,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    showToast('Exported successfully.', 'success');
  } catch (err) {
    if (err.name === 'AbortError') return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `req-tracker-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported (download fallback).', 'success');
  }
}

function validateImportData(data) {
  if (!data || typeof data !== 'object') return 'Invalid JSON structure.';
  if (!Array.isArray(data.items)) return 'Missing "items" array in JSON.';
  for (const item of data.items) {
    if (typeof item.title !== 'string' || !item.title.trim()) return `Item missing required "title" field.`;
    if (typeof item.type !== 'string' || !item.type.trim()) return `Item "${item.title}" missing required "type" field.`;
    if (typeof item.status !== 'string' || !item.status.trim()) return `Item "${item.title}" missing required "status" field.`;
  }
  return null;
}

function openImportModal(data) {
  pendingImportData = data;
  const msg = document.getElementById('import-validation-msg');
  msg.className = 'import-validation hidden';
  msg.textContent = '';
  document.querySelector('input[name="import-mode"][value="merge"]').checked = true;
  document.getElementById('modal-import').classList.remove('hidden');
}

async function doImport(mode) {
  const data = pendingImportData;
  if (!data) return;

  const n = now();

  if (mode === 'replace') {
    await dbClear(STORE_ITEMS);
    state.items = [];
    nextId = 1;
  }

  for (const raw of data.items) {
    let id;
    if (mode === 'merge' && raw.id != null) {
      const existing = state.items.findIndex(i => i.id === raw.id);
      if (existing !== -1) {
        const merged = { project: '', log: [], ...state.items[existing], ...raw, updatedAt: n };
        state.items[existing] = merged;
        await dbPut(STORE_ITEMS, merged);
        continue;
      }
      id = raw.id;
    } else {
      id = makeId();
    }

    const item = {
      id,
      title: (raw.title || '').trim(),
      type: raw.type || '',
      status: raw.status || 'Open',
      priority: raw.priority || '',
      assignee: (raw.assignee || '').trim(),
      project: (raw.project || '').trim(),
      description: (raw.description || '').trim(),
      log: Array.isArray(raw.log) ? raw.log : [],
      createdAt: raw.createdAt || n,
      updatedAt: n,
    };
    state.items.push(item);
    await dbPut(STORE_ITEMS, item);
  }

  recalcNextId();
  document.getElementById('modal-import').classList.add('hidden');
  pendingImportData = null;
  applyFiltersAndRender();
  showToast(`Imported ${data.items.length} item(s).`, 'success');
}

// ── Clear all ─────────────────────────────────────────────────
async function clearAllData() {
  showConfirm(
    'Clear All Data',
    `This will permanently delete all ${state.items.length} item(s). This cannot be undone.`,
    'Clear All',
    'btn-danger',
    async () => {
      await dbClear(STORE_ITEMS);
      state.items = [];
      nextId = 1;
      closeConfirm();
      applyFiltersAndRender();
      showToast('All data cleared.', 'success');
    }
  );
}

// ── Demo data ─────────────────────────────────────────────────
async function loadDemoData() {
  const added = [];
  for (const raw of DEMO_DATA) {
    const id = makeId();
    const created = new Date(Date.now() - Math.random() * 60 * 24 * 3600 * 1000).toISOString();
    const item = {
      id,
      title: raw.title,
      type: raw.type,
      status: raw.status,
      priority: raw.priority,
      assignee: raw.assignee,
      project: raw.project || '',
      description: raw.description,
      log: [],
      createdAt: created,
      updatedAt: created,
    };
    state.items.push(item);
    await dbPut(STORE_ITEMS, item);
    added.push(item);
  }
  recalcNextId();
  applyFiltersAndRender();
  showToast(`Loaded ${added.length} demo items.`, 'success');
}

// ── Page navigation ───────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
  if (pageId === 'dashboard') renderDashboard();
}

// ── Event listeners ───────────────────────────────────────────
function initEventListeners() {
  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      showPage(item.dataset.page);
    });
  });

  // Sidebar collapse
  document.getElementById('sidebar-collapse-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  // New item
  document.getElementById('btn-new-item').addEventListener('click', () => openForm(null));

  // Close / cancel form
  document.getElementById('btn-close-form').addEventListener('click', closeForm);
  document.getElementById('btn-cancel-form').addEventListener('click', closeForm);

  // Form submit
  document.getElementById('item-form').addEventListener('submit', handleFormSubmit);

  // Search
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('btn-search-clear');
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !state.searchQuery);
    applyFiltersAndRender();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    searchClear.classList.add('hidden');
    applyFiltersAndRender();
  });

  // Filters
  document.getElementById('filter-type').addEventListener('change', (e) => { state.filterType = e.target.value; applyFiltersAndRender(); });
  document.getElementById('filter-status').addEventListener('change', (e) => { state.filterStatus = e.target.value; applyFiltersAndRender(); });
  document.getElementById('filter-priority').addEventListener('change', (e) => { state.filterPriority = e.target.value; applyFiltersAndRender(); });
  document.getElementById('filter-project').addEventListener('change', (e) => { state.filterProject = e.target.value; applyFiltersAndRender(); });

  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-project').value = '';
    searchInput.value = '';
    state.filterType = '';
    state.filterStatus = '';
    state.filterPriority = '';
    state.filterProject = '';
    state.searchQuery = '';
    searchClear.classList.add('hidden');
    applyFiltersAndRender();
  });

  // Theme
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = btn.dataset.theme;
      applyTheme(t);
      await saveSetting('theme', t);
    });
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', exportJSON);

  // Import
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-import-input').click();
  });

  document.getElementById('file-import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const err = validateImportData(data);
        if (err) {
          showToast('Import error: ' + err, 'error');
        } else {
          openImportModal(data);
        }
      } catch {
        showToast('Invalid JSON file.', 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('modal-import-cancel').addEventListener('click', () => {
    document.getElementById('modal-import').classList.add('hidden');
    pendingImportData = null;
  });
  document.getElementById('modal-import-ok').addEventListener('click', () => {
    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    doImport(mode);
  });

  // Clear all
  document.getElementById('btn-clear-all').addEventListener('click', clearAllData);

  // Bulk bar
  document.getElementById('btn-export-selected').addEventListener('click', exportSelected);
  document.getElementById('btn-deselect-all').addEventListener('click', () => {
    state.selected.clear();
    document.querySelectorAll('#items-tbody .row-check').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#items-tbody .row-selected').forEach(tr => tr.classList.remove('row-selected'));
    const selectAllBox = document.getElementById('select-all-check');
    if (selectAllBox) { selectAllBox.checked = false; selectAllBox.indeterminate = false; }
    updateBulkBar();
  });

  // Demo data
  document.getElementById('btn-load-demo').addEventListener('click', () => {
    showConfirm('Load Demo Data', 'This will add sample items to your tracker. Continue?', 'Load Demo', 'btn-primary', async () => {
      closeConfirm();
      await loadDemoData();
    });
  });

  // Confirm modal
  document.getElementById('modal-confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('modal-confirm-ok').addEventListener('click', () => {
    if (typeof confirmCallback === 'function') confirmCallback();
  });

  // Log modal
  document.getElementById('modal-log-close').addEventListener('click', closeLogModal);
  document.getElementById('btn-add-log-entry').addEventListener('click', addLogEntry);
  document.getElementById('log-note-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      addLogEntry();
      e.preventDefault();
    }
  });
  document.getElementById('modal-log').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLogModal();
  });

  // Close modals on overlay click
  document.getElementById('modal-confirm').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirm();
  });
  document.getElementById('modal-import').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
      pendingImportData = null;
    }
  });

  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('modal-log').classList.contains('hidden')) { closeLogModal(); return; }
      if (!document.getElementById('modal-confirm').classList.contains('hidden')) { closeConfirm(); return; }
      if (!document.getElementById('modal-import').classList.contains('hidden')) {
        document.getElementById('modal-import').classList.add('hidden');
        pendingImportData = null;
        return;
      }
      if (!document.getElementById('form-panel').classList.contains('hidden')) { closeForm(); return; }
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────
async function init() {
  try {
    db = await openDB();
    await loadSettings();
    await loadData();
    applyTheme(settings.theme || 'system');
    initEventListeners();
    applyFiltersAndRender();
  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('items-tbody').innerHTML =
      '<tr><td colspan="10" style="color:var(--danger);padding:20px;text-align:center">Failed to initialize database. Please reload.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', init);
