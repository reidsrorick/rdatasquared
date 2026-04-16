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

const BULK_FIELD_META = {
  title:    { label: 'Title',    required: true },
  type:     { label: 'Type' },
  status:   { label: 'Status' },
  priority: { label: 'Priority' },
  project:  { label: 'Project' },
  assignee: { label: 'Assignee' },
};

const DEFAULT_CUSTOM_OPTIONS = {
  type:     ['Bug','Feature','Enhancement','Task','Question'],
  status:   ['Open','In Progress','Review','Closed',"Won't Fix"],
  priority: ['Critical','High','Medium','Low'],
};

const DEFAULT_OPTION_COLORS = {
  type:     { Bug: '#e05555', Feature: '#4a9fd4', Enhancement: '#4caf79', Task: '#d4ac00', Question: '#a070d6' },
  status:   { Open: '#4a9fd4', 'In Progress': '#d4ac00', Review: '#a070d6', Closed: '#888888', "Won't Fix": '#c05050' },
  priority: { Critical: '#e05555', High: '#e08a30', Medium: '#d4ac00', Low: '#4caf79' },
};

const DEFAULT_BULK_ADD_FIELDS = [
  { key: 'title',    active: true },
  { key: 'type',     active: true },
  { key: 'status',   active: true },
  { key: 'priority', active: true },
  { key: 'project',  active: true },
  { key: 'assignee', active: false },
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
  sortKeys: [{ key: 'id', dir: 'desc' }],
  searchQuery: '',
  // Each Set holds values to EXCLUDE. Empty set = show all.
  filterExcl: {
    type:     new Set(),
    status:   new Set(),
    priority: new Set(),
    project:  new Set(),
  },
  selected: new Set(),
  customOptions: {
    type:     [...DEFAULT_CUSTOM_OPTIONS.type],
    status:   [...DEFAULT_CUSTOM_OPTIONS.status],
    priority: [...DEFAULT_CUSTOM_OPTIONS.priority],
  },
  optionColors: {
    type:     { ...DEFAULT_OPTION_COLORS.type },
    status:   { ...DEFAULT_OPTION_COLORS.status },
    priority: { ...DEFAULT_OPTION_COLORS.priority },
  },
  colFrozen: {}, // { [colKey]: true }
  bulkAddFields: DEFAULT_BULK_ADD_FIELDS.map(f => ({ ...f })),
  colOrder: COLUMN_DEFS.map(c => c.key), // display order of all columns
  colHidden: new Set(),                   // keys of hidden columns
  colWidths: {},                          // { [key]: px width override }
  textWrap: false,
  exportHandle: null,                     // FileSystemFileHandle for quick re-export
  timelineView: 'month',                  // 'day' | 'week' | 'month' | 'year'
  projectView: 'type',                    // 'type' | 'status'
  savedViews: [],                         // [{ id, name, filterExcl, searchQuery, sortKeys }]
  activeViewId: null,                     // id of the currently active saved view, or null
};
let openColPanel = false;
let openHeaderPanel = null; // { key, el }
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

function pad2(n) { return String(n).padStart(2, '0'); }

function getTimelineKey(isoDate, view) {
  if (!isoDate) return '';
  const d = new Date(isoDate); // local timezone (Central for user)
  if (view === 'day') {
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  if (view === 'week') {
    const mon = new Date(d);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); // back to Monday
    return `${mon.getFullYear()}-${pad2(mon.getMonth()+1)}-${pad2(mon.getDate())}`;
  }
  if (view === 'month') {
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  }
  if (view === 'year') {
    return `${d.getFullYear()}`;
  }
  return '';
}

function fmtTimelineLabel(key, view) {
  if (view === 'year') return key;
  const parts = key.split('-').map(Number);
  if (view === 'month') {
    return new Date(parts[0], parts[1]-1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  // day or week — show month + day
  return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

function injectBadgeStyles() {
  let style = document.getElementById('badge-styles-dynamic');
  if (!style) { style = document.createElement('style'); style.id = 'badge-styles-dynamic'; document.head.appendChild(style); }
  const rules = [];
  for (const [field, opts] of Object.entries(state.optionColors)) {
    for (const [val, hex] of Object.entries(opts)) {
      if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const cls = 'badge-' + field + '-' + val.replace(/[^a-zA-Z0-9]/g, '-');
      rules.push(`.${cls} { background: rgba(${r},${g},${b},0.15); color: ${hex}; }`);
    }
  }
  style.textContent = rules.join('\n');
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
  if (settings.colFrozen) state.colFrozen = settings.colFrozen;
  if (settings.colOrder) {
    const validKeys = new Set(COLUMN_DEFS.map(c => c.key));
    const saved = settings.colOrder.filter(k => validKeys.has(k));
    const savedSet = new Set(saved);
    const missing = COLUMN_DEFS.filter(c => !savedSet.has(c.key)).map(c => c.key);
    state.colOrder = [...saved, ...missing];
  }
  if (settings.colHidden) state.colHidden = new Set(settings.colHidden.filter(k => k !== 'title'));
  if (settings.colWidths) state.colWidths = settings.colWidths;
  if (settings.textWrap !== undefined) state.textWrap = settings.textWrap;
  if (settings.exportFileHandle) state.exportHandle = settings.exportFileHandle;
  if (settings.timelineView) state.timelineView = settings.timelineView;
  if (settings.projectView) state.projectView = settings.projectView;
  if (Array.isArray(settings.savedViews)) state.savedViews = settings.savedViews;
  if (settings.bulkAddFields) {
    // Merge saved fields with DEFAULT to pick up any new fields added later
    const saved = settings.bulkAddFields;
    const savedKeys = new Set(saved.map(f => f.key));
    const merged = [...saved];
    DEFAULT_BULK_ADD_FIELDS.forEach(df => {
      if (!savedKeys.has(df.key)) merged.push({ ...df });
    });
    state.bulkAddFields = merged.filter(f => BULK_FIELD_META[f.key]);
  }
  if (settings.customOptions) {
    for (const k of ['type', 'status', 'priority']) {
      if (Array.isArray(settings.customOptions[k]) && settings.customOptions[k].length > 0) {
        state.customOptions[k] = settings.customOptions[k];
      }
    }
  }
  if (settings.optionColors) {
    for (const k of ['type', 'status', 'priority']) {
      if (settings.optionColors[k]) {
        state.optionColors[k] = { ...state.optionColors[k], ...settings.optionColors[k] };
      }
    }
  }
  if (settings.viewState) {
    const vs = settings.viewState;
    if (vs.searchQuery !== undefined) state.searchQuery = vs.searchQuery;
    if (Array.isArray(vs.sortKeys) && vs.sortKeys.length) {
      state.sortKeys = vs.sortKeys;
    } else if (vs.sortKey) {
      // backward-compat with old format
      state.sortKeys = [{ key: vs.sortKey, dir: vs.sortDir || 'desc' }];
    }
    if (vs.filterExcl) {
      for (const [k, arr] of Object.entries(vs.filterExcl)) {
        if (state.filterExcl[k]) state.filterExcl[k] = new Set(arr);
      }
    }
  }
}

async function saveSetting(key, value) {
  settings[key] = value;
  await dbPut(STORE_SETTINGS, { key, value });
}

// ── Column helpers ────────────────────────────────────────────
function getVisibleCols() {
  return state.colOrder
    .map(key => COLUMN_DEFS.find(c => c.key === key))
    .filter(col => col && !state.colHidden.has(col.key));
}

function getColWidth(col) {
  return state.colWidths[col.key] ?? col.width;
}

function getColOptions(key) {
  if (key === 'type')     return ['', ...state.customOptions.type];
  if (key === 'status')   return state.customOptions.status;
  if (key === 'priority') return ['', ...state.customOptions.priority];
  return COLUMN_DEFS.find(c => c.key === key)?.options || [];
}

function populateFormSelects() {
  const typeEl     = document.getElementById('form-type');
  const statusEl   = document.getElementById('form-status');
  const priorityEl = document.getElementById('form-priority');
  if (!typeEl) return;

  const typeVal     = typeEl.value;
  const statusVal   = statusEl.value;
  const priorityVal = priorityEl.value;

  typeEl.innerHTML = '<option value="">-- Select --</option>' +
    state.customOptions.type.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
  statusEl.innerHTML = '<option value="">-- Select --</option>' +
    state.customOptions.status.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
  priorityEl.innerHTML = '<option value="">-- None --</option>' +
    state.customOptions.priority.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');

  if (typeVal)     typeEl.value     = typeVal;
  if (statusVal)   statusEl.value   = statusVal;
  if (priorityVal) priorityEl.value = priorityVal;
}

function saveViewState() {
  // Fire-and-forget; don't await
  saveSetting('viewState', {
    searchQuery: state.searchQuery,
    sortKeys:    state.sortKeys,
    filterExcl:  Object.fromEntries(
      Object.entries(state.filterExcl).map(([k, v]) => [k, [...v]])
    ),
  });
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
  document.getElementById('form-type').value = item ? item.type : 'Task';
  document.getElementById('form-status').value = item ? item.status : 'Open';
  document.getElementById('form-priority').value = item ? (item.priority || '') : 'Medium';
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

// ── Project autocomplete dropdown ─────────────────────────────
function attachProjectDropdown(input) {
  let dropdown = null;

  function getProjects(filter) {
    const all = [...new Set(state.items.map(i => i.project || '').filter(Boolean))].sort();
    if (!filter) return all;
    const q = filter.toLowerCase();
    return all.filter(p => p.toLowerCase().includes(q));
  }

  function removeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  function showDropdown() {
    removeDropdown();
    const opts = getProjects(input.value.trim());
    if (!opts.length) return;

    dropdown = document.createElement('div');
    dropdown.className = 'project-dropdown';

    opts.forEach(p => {
      const item = document.createElement('div');
      item.className = 'project-dropdown-item';
      item.textContent = p;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus on input so blur doesn't fire first
        input.value = p;
        removeDropdown();
        input.dispatchEvent(new Event('input', { bubbles: true })); // trigger any live previews
      });
      dropdown.appendChild(item);
    });

    const rect = input.getBoundingClientRect();
    dropdown.style.top    = (rect.bottom + window.scrollY) + 'px';
    dropdown.style.left   = (rect.left   + window.scrollX) + 'px';
    dropdown.style.width  = rect.width + 'px';
    document.body.appendChild(dropdown);
  }

  input.addEventListener('focus', showDropdown);
  input.addEventListener('input', showDropdown);
  input.addEventListener('blur', () => setTimeout(removeDropdown, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && dropdown) {
      const first = dropdown.querySelector('.project-dropdown-item');
      if (first) {
        input.value = first.textContent;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      removeDropdown();
      // let Tab continue so focus moves to next field naturally
    }
  });

  // Return cleanup so callers can tear it down if needed
  return removeDropdown;
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
    getColOptions(colDef.key).forEach(opt => {
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
    if (colDef.key === 'project') attachProjectDropdown(inp);
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

async function copySelected() {
  const selectedItems = state.items.filter(i => state.selected.has(i.id));
  if (!selectedItems.length) return;

  const lines = selectedItems.map(item => {
    const parts = [
      `#${item.id} — ${item.title}`,
      [
        item.project  ? `Project: ${item.project}`   : '',
        item.type     ? `Type: ${item.type}`          : '',
        item.status   ? `Status: ${item.status}`      : '',
        item.priority ? `Priority: ${item.priority}`  : '',
        item.assignee ? `Assignee: ${item.assignee}`  : '',
      ].filter(Boolean).join('  |  '),
    ];
    if (item.description) parts.push(item.description);
    if (item.log && item.log.length) {
      parts.push('Log:');
      [...item.log].reverse().forEach(e => parts.push(`  [${fmtDateTime(e.ts)}] ${e.note}`));
    }
    return parts.join('\n');
  });

  const text = lines.join('\n\n');

  try {
    await navigator.clipboard.writeText(text);
    showToast(`${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} copied to clipboard.`, 'success');
  } catch {
    showToast('Clipboard access denied. Try copying from a user gesture.', 'error');
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
  const log = item.log || [];

  if (!log.length) {
    container.innerHTML = '<div class="log-empty">No log entries yet.</div>';
    return;
  }

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

// ── Column header filter panels (Excel-style) ─────────────────
function closeAllFilterPanels() {
  closeHeaderPanel();
  if (openColPanel) { openColPanel = false; buildColsPanel(); }
}

function closeHeaderPanel() {
  if (openHeaderPanel) { openHeaderPanel.el.remove(); openHeaderPanel = null; }
}

function getHeaderFilterValues(key) {
  const items = state.items;
  if (key === 'type') {
    const order = state.customOptions.type;
    return [...order.filter(v => items.some(i => i.type === v)),
            ...[...new Set(items.map(i => i.type).filter(Boolean))].filter(v => !order.includes(v)).sort()];
  }
  if (key === 'status') {
    const order = state.customOptions.status;
    return [...order.filter(v => items.some(i => i.status === v)),
            ...[...new Set(items.map(i => i.status).filter(Boolean))].filter(v => !order.includes(v)).sort()];
  }
  if (key === 'priority') {
    const order = state.customOptions.priority;
    return [...order.filter(v => items.some(i => i.priority === v)),
            ...[...new Set(items.map(i => i.priority).filter(Boolean))].filter(v => !order.includes(v)).sort()];
  }
  if (key === 'project') {
    return [...new Set(items.map(i => i.project || '').filter(Boolean))].sort();
  }
  return [];
}

function showHeaderPanel(col, th) {
  if (openHeaderPanel?.key === col.key) { closeHeaderPanel(); return; }
  closeHeaderPanel();
  if (openColPanel) { openColPanel = false; buildColsPanel(); }

  const values  = getHeaderFilterValues(col.key);
  const excl    = state.filterExcl[col.key]; // undefined for non-filterable cols
  const allChecked = !excl || excl.size === 0;
  const someExcl = excl && excl.size > 0 && excl.size < values.length;
  const primarySort = state.sortKeys[0];

  const panel = document.createElement('div');
  panel.className = 'col-header-panel';

  panel.innerHTML = `
    <button class="chp-sort-btn${primarySort?.key === col.key && primarySort.dir === 'asc' ? ' chp-sort-active' : ''}" data-dir="asc">↑ Sort Ascending</button>
    <button class="chp-sort-btn${primarySort?.key === col.key && primarySort.dir === 'desc' ? ' chp-sort-active' : ''}" data-dir="desc">↓ Sort Descending</button>
    ${values.length ? `
      <div class="chp-divider"></div>
      <div class="chp-filter-rows">
        <label class="chp-row chp-row-all">
          <input type="checkbox" class="chp-check-all" ${allChecked ? 'checked' : ''} />
          <span>Select All</span>
        </label>
        ${values.map(v => `
          <label class="chp-row">
            <input type="checkbox" class="chp-check" value="${escHtml(v)}" ${!excl || !excl.has(v) ? 'checked' : ''} />
            <span>${v ? escHtml(v) : '<em>(none)</em>'}</span>
          </label>`).join('')}
      </div>` : ''}`;

  const rect = th.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 2) + 'px';
  panel.style.left = Math.min(rect.left, window.innerWidth - 210) + 'px';
  document.body.appendChild(panel);
  openHeaderPanel = { key: col.key, el: panel };

  // Set indeterminate on Select All
  const allBox = panel.querySelector('.chp-check-all');
  if (allBox && someExcl) allBox.indeterminate = true;

  // Sort buttons
  panel.querySelectorAll('.chp-sort-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.sortKeys = [{ key: col.key, dir: btn.dataset.dir }];
      closeHeaderPanel();
      applyFiltersAndRender();
    });
  });

  // Filter checkboxes
  if (excl) {
    allBox?.addEventListener('change', (e) => {
      e.stopPropagation();
      if (allBox.checked) {
        excl.clear();
        panel.querySelectorAll('.chp-check').forEach(cb => { cb.checked = true; });
      } else {
        values.forEach(v => excl.add(v));
        panel.querySelectorAll('.chp-check').forEach(cb => { cb.checked = false; });
      }
      syncHeaderPanelAllBox(panel, values, excl);
      applyFiltersAndRender();
    });
    panel.querySelectorAll('.chp-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        if (cb.checked) excl.delete(cb.value); else excl.add(cb.value);
        syncHeaderPanelAllBox(panel, values, excl);
        applyFiltersAndRender();
      });
    });
  }
}

function syncHeaderPanelAllBox(panel, values, excl) {
  const allBox = panel.querySelector('.chp-check-all');
  if (!allBox) return;
  allBox.checked = excl.size === 0;
  allBox.indeterminate = excl.size > 0 && excl.size < values.length;
}

function refreshFilters() {
  // Clean up stale exclusions (values no longer present in data)
  const items = state.items;
  const allVals = {
    type:     [...new Set(items.map(i => i.type).filter(Boolean))],
    status:   [...new Set(items.map(i => i.status).filter(Boolean))],
    priority: [...new Set(items.map(i => i.priority).filter(Boolean))],
    project:  [...new Set(items.map(i => i.project || '').filter(Boolean))],
  };
  for (const [field, excl] of Object.entries(state.filterExcl)) {
    for (const v of [...excl]) { if (!allVals[field]?.includes(v)) excl.delete(v); }
  }
}

// ── Filters & Sort ────────────────────────────────────────────
function applyFiltersAndRender() {
  saveViewState();
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

  // Exclude any values in the filterExcl sets
  for (const [field, excl] of Object.entries(state.filterExcl)) {
    if (excl.size > 0) items = items.filter(i => !excl.has(i[field] || ''));
  }

  items.sort((a, b) => {
    for (const { key, dir } of state.sortKeys) {
      const d = dir === 'asc' ? 1 : -1;
      let av = a[key] ?? '', bv = b[key] ?? '';
      let cmp = 0;
      if (key === 'id') {
        cmp = a.id - b.id;
      } else if (key === 'status') {
        const order = state.customOptions.status;
        const ai = order.indexOf(av), bi = order.indexOf(bv);
        cmp = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      } else if (key === 'priority') {
        const order = [...state.customOptions.priority, ''];
        const ai = order.indexOf(av === '' ? '' : av), bi = order.indexOf(bv === '' ? '' : bv);
        cmp = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      } else if (key === 'createdAt' || key === 'updatedAt') {
        cmp = new Date(av) - new Date(bv);
      } else {
        cmp = av.toString().localeCompare(bv.toString());
      }
      if (cmp !== 0) return cmp * d;
    }
    return 0;
  });

  state.filteredItems = items;
  refreshFilters();
  renderTable();
  renderDashboard();
}

// ── Freeze columns ────────────────────────────────────────────
function calcFrozenLeft() {
  const base = 36 + 80;
  const offsets = {};
  let offset = base;
  for (const col of getVisibleCols()) {
    if (state.colFrozen[col.key]) {
      offsets[col.key] = offset;
      offset += getColWidth(col);
    }
  }
  return offsets;
}

function isLastFrozen(key) {
  const frozenKeys = getVisibleCols().filter(c => state.colFrozen[c.key]).map(c => c.key);
  return frozenKeys.length > 0 && frozenKeys[frozenKeys.length - 1] === key;
}

function applyFrozenOffsets() {
  requestAnimationFrame(() => {
    const table = document.getElementById('items-table');
    if (!table) return;
    const checkTh = table.querySelector('thead th.col-check');
    const actionsTh = table.querySelector('thead th.col-actions');
    const base = (checkTh ? checkTh.getBoundingClientRect().width : 36) +
                 (actionsTh ? actionsTh.getBoundingClientRect().width : 80);
    let offset = base;
    const frozenCols = getVisibleCols().filter(c => state.colFrozen[c.key]);
    frozenCols.forEach((col, i) => {
      const isLast = i === frozenCols.length - 1;
      const th = table.querySelector(`thead th[data-col="${col.key}"]`);
      if (!th) return;
      th.style.left = offset + 'px';
      th.classList.toggle('col-frozen-last', isLast);
      table.querySelectorAll(`tbody td[data-col="${col.key}"]`).forEach(td => {
        td.style.left = offset + 'px';
        td.classList.toggle('col-frozen-last', isLast);
      });
      offset += th.getBoundingClientRect().width;
    });
  });
}

async function toggleFreeze(key) {
  const vis = getVisibleCols();
  const idx = vis.findIndex(c => c.key === key);
  if (idx === -1) return;

  if (!state.colFrozen[key]) {
    for (let i = 0; i <= idx; i++) state.colFrozen[vis[i].key] = true;
  } else {
    for (let i = idx; i < vis.length; i++) delete state.colFrozen[vis[i].key];
  }

  await saveSetting('colFrozen', state.colFrozen);
  renderTable();
}

// ── Table render ──────────────────────────────────────────────
function renderTableHeader() {
  const tr = document.getElementById('items-thead-row');
  const visibleIds = state.filteredItems.map(i => i.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => state.selected.has(id));
  const someChecked = !allChecked && visibleIds.some(id => state.selected.has(id));
  const frozenOffsets = calcFrozenLeft();

  // Build sort rank map: colKey → { rank, dir }
  const sortRank = {};
  state.sortKeys.forEach((sk, i) => { sortRank[sk.key] = { rank: i + 1, dir: sk.dir }; });
  const multiSort = state.sortKeys.length > 1;

  // Filterable columns (have filter checkboxes in header panel)
  const FILTERABLE = new Set(['type', 'status', 'priority', 'project']);

  tr.innerHTML = `<th class="col-check">
    <input type="checkbox" class="row-check" id="select-all-check" ${allChecked ? 'checked' : ''} title="Select all" />
  </th><th class="col-actions">Actions</th>` +
    getVisibleCols().map(col => {
      const sr = sortRank[col.key];
      const isFrozen = !!state.colFrozen[col.key];
      const frozenLeft = isFrozen ? `left:${frozenOffsets[col.key] ?? 0}px;` : '';
      const width = getColWidth(col);
      const hasFilter = FILTERABLE.has(col.key) && state.filterExcl[col.key]?.size > 0;
      const cls = [
        'sortable',
        sr ? (sr.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '',
        isFrozen ? 'col-data-frozen' : '',
        isFrozen && isLastFrozen(col.key) ? 'col-frozen-last' : '',
      ].filter(Boolean).join(' ');
      return `<th class="${cls}" data-col="${col.key}" style="min-width:${width}px;${frozenLeft}">
        ${escHtml(col.label)}${col.sortable ? '<span class="sort-icon"></span>' : ''}
        ${sr && multiSort ? `<span class="sort-rank">${sr.rank}</span>` : ''}
        <button class="col-filter-btn${hasFilter ? ' col-filter-active' : ''}" data-col-filter="${col.key}" title="Sort &amp; Filter">▾</button>
        <button class="freeze-btn${isFrozen ? ' is-frozen' : ''}" data-freeze="${col.key}" title="${isFrozen ? 'Unfreeze' : 'Freeze'} column">&#128204;</button>
        <div class="col-resize-handle" data-resize="${col.key}"></div>
      </th>`;
    }).join('');

  // Set indeterminate state (can't be done via HTML attribute)
  const selectAllBox = document.getElementById('select-all-check');
  if (selectAllBox) selectAllBox.indeterminate = someChecked;

  // Column header click — sort (single) or Shift+click (multi-sort)
  tr.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', (e) => {
      if (e.target.closest('.col-filter-btn, .freeze-btn, .col-resize-handle')) return;
      const colKey = th.dataset.col;
      if (e.shiftKey) {
        const existing = state.sortKeys.find(sk => sk.key === colKey);
        if (existing) {
          existing.dir = existing.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKeys.push({ key: colKey, dir: 'asc' });
        }
      } else {
        if (state.sortKeys.length === 1 && state.sortKeys[0].key === colKey) {
          state.sortKeys[0].dir = state.sortKeys[0].dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKeys = [{ key: colKey, dir: 'asc' }];
        }
      }
      applyFiltersAndRender();
    });
  });

  // Excel-style filter/sort panel per column
  tr.querySelectorAll('.col-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const colKey = btn.dataset.colFilter;
      const col = COLUMN_DEFS.find(c => c.key === colKey);
      if (col) showHeaderPanel(col, btn.closest('th'));
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
      document.querySelectorAll('#items-tbody .row-check').forEach(cb => {
        const id = parseInt(cb.closest('tr').dataset.id, 10);
        cb.checked = state.selected.has(id);
      });
      updateBulkBar();
    });
  }

  // Freeze toggle buttons
  tr.querySelectorAll('.freeze-btn[data-freeze]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFreeze(btn.dataset.freeze);
    });
  });

  // Resize handles
  tr.querySelectorAll('.col-resize-handle[data-resize]').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startColResize(handle.closest('th'), handle.dataset.resize, e.clientX);
    });
  });

  applyFrozenOffsets();
}

function renderTable() {
  renderTableHeader();
  document.getElementById('items-table')?.classList.toggle('wrap-text', state.textWrap);
  const tbody = document.getElementById('items-tbody');
  const empty = document.getElementById('empty-state');
  const emptyMsg = document.getElementById('empty-state-msg');
  const countLabel = document.getElementById('item-count-label');

  const items = state.filteredItems;
  countLabel.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    const hasFilters = state.searchQuery || Object.values(state.filterExcl).some(s => s.size > 0);
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
  const frozenOffsets = calcFrozenLeft();

  const cells = getVisibleCols().map(col => {
    const isFrozen = !!state.colFrozen[col.key];
    const isLast = isFrozen && isLastFrozen(col.key);
    const classes = [
      col.editable ? 'cell-editable' : '',
      isFrozen ? 'col-data-frozen' : '',
      isLast ? 'col-frozen-last' : '',
    ].filter(Boolean).join(' ');
    const style = isFrozen ? ` style="left:${frozenOffsets[col.key] ?? 0}px"` : '';
    return `<td data-col="${col.key}"${classes ? ` class="${classes}"` : ''}${style}>${buildCellContent(item, col)}</td>`;
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

  const byStatus = {}, byType = {}, byPriority = {}, byTime = {};

  items.forEach(item => {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    byType[item.type] = (byType[item.type] || 0) + 1;
    if (item.priority) byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
    const mk = getTimelineKey(item.createdAt, state.timelineView);
    if (mk) byTime[mk] = (byTime[mk] || 0) + 1;
  });

  document.getElementById('dash-total').textContent = total;
  document.getElementById('dash-open').textContent = byStatus['Open'] || 0;
  document.getElementById('dash-inprogress').textContent = byStatus['In Progress'] || 0;
  document.getElementById('dash-closed').textContent = byStatus['Closed'] || 0;

  renderDonut('chart-status', 'legend-status', byStatus, CHART_COLORS);
  renderDonut('chart-type', 'legend-type', byType, CHART_COLORS);
  renderBarChart('chart-priority', byPriority, state.customOptions.priority, CHART_COLORS);
  renderTimeline('chart-timeline', byTime, state.timelineView);
  updateTimelineToggles();
  renderByProject();
  renderLifetimeList();
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

function renderTimeline(chartId, byTime, view) {
  const el = document.getElementById(chartId);
  if (!el) return;

  const keys = Object.keys(byTime).sort();
  if (!keys.length) { el.innerHTML = '<span style="color:var(--text-dim);font-size:12px">No data</span>'; return; }

  const max = Math.max(...Object.values(byTime), 1);
  el.innerHTML = `<div class="timeline-chart">${keys.map(mk => {
    const label = fmtTimelineLabel(mk, view);
    const val = byTime[mk];
    const pct = Math.round((val / max) * 100);
    return `<div class="timeline-row">
      <div class="timeline-label">${escHtml(label)}</div>
      <div class="timeline-track"><div class="timeline-fill" style="width:${pct}%"></div></div>
      <div class="timeline-count">${val}</div>
    </div>`;
  }).join('')}</div>`;
}

function updateTimelineToggles() {
  document.querySelectorAll('[data-tl-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tlView === state.timelineView);
  });
}

function renderByProject() {
  const el = document.getElementById('chart-by-project');
  if (!el) return;

  const items = state.items;
  if (!items.length) { el.innerHTML = '<span style="color:var(--text-dim);font-size:12px">No data</span>'; return; }

  const groupBy = state.projectView; // 'type' | 'status'
  const keyOrder = groupBy === 'type' ? state.customOptions.type : state.customOptions.status;
  const keysPresent = keyOrder.filter(k => items.some(i => i[groupBy] === k));
  const colorMap = Object.fromEntries(keysPresent.map((k, i) => [k, CHART_COLORS[i % CHART_COLORS.length]]));

  const projectMap = {};
  items.forEach(item => {
    const proj = item.project?.trim() || '(No Project)';
    const key = item[groupBy];
    if (!projectMap[proj]) projectMap[proj] = {};
    if (key) projectMap[proj][key] = (projectMap[proj][key] || 0) + 1;
  });

  const projects = Object.entries(projectMap)
    .map(([name, counts]) => ({ name, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);

  const maxTotal = projects[0]?.total || 1;

  const legend = keysPresent.map(k =>
    `<span class="tbp-legend-item"><span class="tbp-dot" style="background:${colorMap[k]}"></span>${escHtml(k)}</span>`
  ).join('');

  const rows = projects.map(({ name, counts, total }) => {
    const barPct = (total / maxTotal * 100).toFixed(1);
    const segs = keysPresent
      .filter(k => counts[k])
      .map(k => {
        const pct = (counts[k] / total * 100).toFixed(1);
        return `<div class="tbp-seg" style="width:${pct}%;background:${colorMap[k]}" title="${escHtml(k)}: ${counts[k]}"></div>`;
      }).join('');
    return `<div class="tbp-row">
      <div class="tbp-label" title="${escHtml(name)}">${escHtml(name)}</div>
      <div class="tbp-track-wrap">
        <div class="tbp-track" style="width:${barPct}%">${segs}</div>
      </div>
      <div class="tbp-total">${total}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="tbp-legend">${legend}</div><div class="tbp-rows">${rows}</div>`;
  updateProjectViewToggles();
}

function updateProjectViewToggles() {
  document.querySelectorAll('[data-pbp-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pbpView === state.projectView);
  });
}

function renderLifetimeList() {
  const el = document.getElementById('lifetime-list');
  if (!el) return;

  const closedStatuses = new Set(['Closed', "Won't Fix"]);
  const now = Date.now();
  const open = state.items
    .filter(i => !closedStatuses.has(i.status))
    .map(i => ({ ...i, ageDays: Math.floor((now - new Date(i.createdAt)) / 86400000) }))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 15);

  if (!open.length) {
    el.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px 0">No open items.</div>';
    return;
  }

  const maxAge = open[0].ageDays || 1;
  el.innerHTML = `<div class="lifetime-chart">${open.map(item => {
    const pct = Math.round((item.ageDays / maxAge) * 100);
    const age = item.ageDays === 0 ? 'today' : `${item.ageDays}d`;
    return `<div class="lifetime-row">
      <div class="lifetime-info">
        <span class="lifetime-title" title="${escHtml(item.title)}">${escHtml(item.title)}</span>
        <span class="${badgeClass('status', item.status)} lifetime-badge">${escHtml(item.status)}</span>
      </div>
      <div class="lifetime-bar-wrap">
        <div class="lifetime-bar-track"><div class="lifetime-bar-fill" style="width:${pct}%"></div></div>
        <span class="lifetime-age">${age}</span>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ── Import / Export ───────────────────────────────────────────
function updateExportPathDisplay() {
  const hint = document.getElementById('export-path-hint');
  const changeBtn = document.getElementById('btn-export-change');
  if (hint) {
    if (state.exportHandle) {
      hint.textContent = state.exportHandle.name;
      hint.classList.remove('hidden');
    } else {
      hint.textContent = '';
      hint.classList.add('hidden');
    }
  }
  if (changeBtn) changeBtn.classList.toggle('hidden', !state.exportHandle);
}

async function exportJSON(pickNew = false) {
  const data = { version: 2, exportedAt: now(), items: state.items };
  const json = JSON.stringify(data, null, 2);

  // Try reusing saved handle
  if (!pickNew && state.exportHandle) {
    try {
      let perm = await state.exportHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'prompt') perm = await state.exportHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const writable = await state.exportHandle.createWritable();
        await writable.write(json);
        await writable.close();
        showToast(`Saved to ${state.exportHandle.name}`, 'success');
        return;
      }
    } catch {
      // Handle stale — fall through to picker
    }
  }

  // Show save picker
  if (!window.showSaveFilePicker) {
    // Browser doesn't support File System Access API — plain download
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `req-tracker.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported (download).', 'success');
    return;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: state.exportHandle?.name ?? `req-tracker.json`,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    state.exportHandle = handle;
    await saveSetting('exportFileHandle', handle);
    updateExportPathDisplay();
    showToast(`Saved to ${handle.name}`, 'success');
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Export failed.', 'error');
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

// ── Bulk Add ──────────────────────────────────────────────────
function parseBulkLine(line) {
  line = line.trim();
  if (!line) return null;
  const activeFields = state.bulkAddFields.filter(f => f.active);
  const parts = line.split(/\s*-\s*/);
  const item = { title: '', type: '', status: 'Open', priority: '', project: '', assignee: '' };
  activeFields.forEach((field, i) => {
    item[field.key] = (parts[i] || '').trim();
  });
  if (!item.title.trim()) return null;
  return item;
}

function renderBulkAddConfig() {
  const container = document.getElementById('bulk-add-config');
  if (!container) return;

  const fields = state.bulkAddFields;
  const activeFields = fields.filter(f => f.active);
  const formatStr = activeFields.map(f => BULK_FIELD_META[f.key].label).join(' - ');

  // Build chip HTML with separators between active chips
  const chips = fields.map((f, i) => {
    const meta = BULK_FIELD_META[f.key];
    const cls = ['bulk-chip', f.active ? 'bulk-chip-active' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" draggable="true" data-idx="${i}"${meta.required ? ' data-required="true"' : ''} title="${meta.required ? 'Title is required' : (f.active ? 'Click to deactivate' : 'Click to activate')}">${meta.label}</div>`;
  }).join('');

  container.innerHTML = `
    <div class="bulk-add-config-wrap">
      <div class="bulk-config-label">Field order <span class="bulk-config-hint">— drag to reorder, click to toggle on/off</span></div>
      <div class="bulk-config-chips" id="bulk-config-chips">${chips}</div>
      <div class="bulk-format-preview">Format: <strong>${formatStr || '(no active fields)'}</strong></div>
    </div>`;

  const chipsEl = document.getElementById('bulk-config-chips');
  let dragSrcIdx = null;

  chipsEl.querySelectorAll('.bulk-chip').forEach(chip => {
    // Click to toggle active/inactive (not for required fields)
    chip.addEventListener('click', async () => {
      if (chip.dataset.required) return;
      const idx = parseInt(chip.dataset.idx, 10);
      state.bulkAddFields[idx].active = !state.bulkAddFields[idx].active;
      await saveSetting('bulkAddFields', state.bulkAddFields);
      renderBulkAddConfig();
      updateBulkAddPreview();
    });

    // Drag to reorder
    chip.addEventListener('dragstart', (e) => {
      dragSrcIdx = parseInt(chip.dataset.idx, 10);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => chip.classList.add('dragging'), 0);
    });

    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      chipsEl.querySelectorAll('.bulk-chip').forEach(c => c.classList.remove('drag-over'));
    });

    chip.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      chipsEl.querySelectorAll('.bulk-chip').forEach(c => c.classList.remove('drag-over'));
      if (parseInt(chip.dataset.idx, 10) !== dragSrcIdx) chip.classList.add('drag-over');
    });

    chip.addEventListener('drop', async (e) => {
      e.preventDefault();
      const destIdx = parseInt(chip.dataset.idx, 10);
      if (dragSrcIdx === null || dragSrcIdx === destIdx) return;
      const moved = state.bulkAddFields.splice(dragSrcIdx, 1)[0];
      state.bulkAddFields.splice(destIdx, 0, moved);
      dragSrcIdx = null;
      await saveSetting('bulkAddFields', state.bulkAddFields);
      renderBulkAddConfig();
      updateBulkAddPreview();
    });
  });
}

function openBulkAdd() {
  document.getElementById('bulk-add-input').value = '';
  document.getElementById('bulk-add-preview').classList.add('hidden');
  renderBulkAddConfig();
  document.getElementById('modal-bulk-add').classList.remove('hidden');
  document.getElementById('bulk-add-input').focus();
}

function closeBulkAdd() {
  document.getElementById('modal-bulk-add').classList.add('hidden');
}

function updateBulkAddPreview() {
  const lines = document.getElementById('bulk-add-input').value.split('\n');
  const parsed = lines.map(parseBulkLine).filter(Boolean);
  const preview = document.getElementById('bulk-add-preview');
  if (!parsed.length) { preview.classList.add('hidden'); return; }
  preview.classList.remove('hidden');
  preview.innerHTML = `<strong>${parsed.length}</strong> item${parsed.length !== 1 ? 's' : ''} will be added.`;
}

async function executeBulkAdd() {
  const lines = document.getElementById('bulk-add-input').value.split('\n');
  const parsed = lines.map(parseBulkLine).filter(Boolean);
  if (!parsed.length) { showToast('No valid items to add.', 'error'); return; }

  const n = now();
  for (const raw of parsed) {
    const item = {
      id: makeId(),
      title: raw.title,
      type: raw.type,
      status: raw.status || 'Open',
      priority: raw.priority,
      assignee: raw.assignee || '',
      project: raw.project,
      description: '',
      log: [],
      createdAt: n,
      updatedAt: n,
    };
    state.items.push(item);
    await dbPut(STORE_ITEMS, item);
  }

  recalcNextId();
  closeBulkAdd();
  applyFiltersAndRender();
  showToast(`Added ${parsed.length} item${parsed.length !== 1 ? 's' : ''}.`, 'success');
}

// ── Column resize ─────────────────────────────────────────────
function startColResize(th, key, startX) {
  const startWidth = th.getBoundingClientRect().width;
  document.body.classList.add('col-resizing');

  function onMove(e) {
    const w = Math.max(50, Math.round(startWidth + e.clientX - startX));
    state.colWidths[key] = w;
    // Update all cells for this column live
    document.querySelectorAll(`[data-col="${key}"]`).forEach(el => {
      el.style.minWidth = w + 'px';
    });
  }

  async function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('col-resizing');
    await saveSetting('colWidths', state.colWidths);
    applyFrozenOffsets();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Column config panel ───────────────────────────────────────
function buildColsPanel() {
  const container = document.getElementById('col-config-dd');
  if (!container) return;

  const hiddenCount = state.colHidden.size;
  container.innerHTML = `
    <button class="fd-btn${hiddenCount ? ' fd-active' : ''}" id="col-panel-btn">
      Columns${hiddenCount ? ` <span class="fd-badge">${hiddenCount}</span>` : ''}
      <span class="fd-chevron">▾</span>
    </button>
    <div class="col-panel${openColPanel ? '' : ' hidden'}">
      <div class="col-panel-header">
        <span>Show / Reorder</span>
        <button class="btn btn-ghost btn-sm" id="col-panel-reset">Reset</button>
      </div>
      ${state.colOrder.map((key, idx) => {
        const col = COLUMN_DEFS.find(c => c.key === key);
        if (!col) return '';
        const isHidden = state.colHidden.has(key);
        const isRequired = key === 'title';
        return `<label class="col-panel-row${isHidden ? ' col-panel-row-dim' : ''}" draggable="true" data-key="${key}" data-pos="${idx}">
          <span class="col-panel-handle">⠿</span>
          <span class="col-panel-name">${escHtml(col.label)}</span>
          <input type="checkbox" class="col-panel-check" data-key="${key}" ${isHidden ? '' : 'checked'} ${isRequired ? 'disabled' : ''} />
        </label>`;
      }).join('')}
    </div>`;

  if (openColPanel) container.classList.add('fd-open');
  else container.classList.remove('fd-open');

  const panel = container.querySelector('.col-panel');

  container.querySelector('#col-panel-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openColPanel = !openColPanel;
    if (openColPanel) {
      closeHeaderPanel();
    }
    buildColsPanel();
  });

  container.querySelector('#col-panel-reset')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    state.colOrder = COLUMN_DEFS.map(c => c.key);
    state.colHidden = new Set();
    state.colWidths = {};
    await saveSetting('colOrder', state.colOrder);
    await saveSetting('colHidden', []);
    await saveSetting('colWidths', {});
    buildColsPanel();
    renderTable();
  });

  container.querySelectorAll('.col-panel-check').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      e.stopPropagation();
      const key = cb.dataset.key;
      if (cb.checked) {
        state.colHidden.delete(key);
      } else {
        state.colHidden.add(key);
        delete state.colFrozen[key];
        await saveSetting('colFrozen', state.colFrozen);
      }
      await saveSetting('colHidden', [...state.colHidden]);
      buildColsPanel();
      renderTable();
    });
  });

  if (!panel) return;
  let dragSrc = null;

  panel.querySelectorAll('.col-panel-row').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      dragSrc = parseInt(row.dataset.pos, 10);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => row.classList.add('dragging'), 0);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      panel.querySelectorAll('.col-panel-row').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      panel.querySelectorAll('.col-panel-row').forEach(r => r.classList.remove('drag-over'));
      if (parseInt(row.dataset.pos, 10) !== dragSrc) row.classList.add('drag-over');
    });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dest = parseInt(row.dataset.pos, 10);
      if (dragSrc === null || dragSrc === dest) return;
      const moved = state.colOrder.splice(dragSrc, 1)[0];
      state.colOrder.splice(dest, 0, moved);
      dragSrc = null;
      await saveSetting('colOrder', state.colOrder);
      buildColsPanel();
      renderTable();
    });
  });
}

// ── Text wrap ─────────────────────────────────────────────────
async function toggleTextWrap() {
  state.textWrap = !state.textWrap;
  await saveSetting('textWrap', state.textWrap);
  document.getElementById('items-table')?.classList.toggle('wrap-text', state.textWrap);
  document.getElementById('btn-text-wrap')?.classList.toggle('active', state.textWrap);
}

// ── Custom Options (Settings) ─────────────────────────────────
function renderCustomOptions() {
  const container = document.getElementById('custom-options-container');
  if (!container) return;

  const fields = [
    { key: 'type',     label: 'Type' },
    { key: 'status',   label: 'Status' },
    { key: 'priority', label: 'Priority' },
  ];

  container.innerHTML = fields.map(f => `
    <div class="opt-field-group">
      <div class="opt-field-label">${escHtml(f.label)}</div>
      <div class="opt-chips" id="opt-chips-${f.key}">
        ${state.customOptions[f.key].map((v, i) => {
          const color = state.optionColors[f.key][v] || CHART_COLORS[i % CHART_COLORS.length];
          return `<span class="opt-chip">
            <label class="opt-chip-color-wrap" title="Change color">
              <span class="opt-chip-dot" style="background:${color}"></span>
              <input type="color" class="opt-chip-color" data-field="${f.key}" data-val="${escHtml(v)}" value="${color}" />
            </label>
            ${escHtml(v)}
            <button class="opt-chip-del" data-field="${f.key}" data-idx="${i}" title="Remove">&times;</button>
          </span>`;
        }).join('')}
      </div>
      <div class="opt-add-row">
        <input type="text" class="opt-add-input" id="opt-add-input-${f.key}" placeholder="New ${escHtml(f.label.toLowerCase())} value…" />
        <button class="btn btn-ghost btn-sm opt-add-btn" data-field="${f.key}">Add</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.opt-chip-color').forEach(input => {
    input.addEventListener('input', () => {
      input.previousElementSibling.style.background = input.value;
      state.optionColors[input.dataset.field][input.dataset.val] = input.value;
      injectBadgeStyles();
    });
    input.addEventListener('change', async () => {
      await saveSetting('optionColors', state.optionColors);
    });
  });

  container.querySelectorAll('.opt-chip-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const field = btn.dataset.field;
      const idx = parseInt(btn.dataset.idx, 10);
      if (state.customOptions[field].length <= 1) {
        showToast('Must have at least one option.', 'error');
        return;
      }
      state.customOptions[field].splice(idx, 1);
      await saveSetting('customOptions', state.customOptions);
      renderCustomOptions();
      populateFormSelects();
    });
  });

  container.querySelectorAll('.opt-add-btn').forEach(btn => {
    const field = btn.dataset.field;
    const input = document.getElementById(`opt-add-input-${field}`);
    const doAdd = async () => {
      const val = input.value.trim();
      if (!val) return;
      if (state.customOptions[field].includes(val)) {
        showToast(`"${val}" already exists.`, 'error');
        return;
      }
      const idx = state.customOptions[field].length;
      const defaultColor = CHART_COLORS[idx % CHART_COLORS.length];
      state.customOptions[field].push(val);
      state.optionColors[field][val] = defaultColor;
      await saveSetting('customOptions', state.customOptions);
      await saveSetting('optionColors', state.optionColors);
      injectBadgeStyles();
      input.value = '';
      renderCustomOptions();
      populateFormSelects();
      showToast(`Added "${val}".`, 'success');
    };
    btn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { doAdd(); e.preventDefault(); } });
  });
}

// ── Refresh data ──────────────────────────────────────────────
async function refreshData() {
  await loadData();
  applyFiltersAndRender();
  showToast('Refreshed.', 'success');
}

// ── Saved Views ───────────────────────────────────────────────
function renderSavedViews() {
  const bar = document.getElementById('views-bar');
  if (!bar) return;

  const chips = state.savedViews.map(v => `
    <button class="view-chip${state.activeViewId === v.id ? ' active' : ''}" data-view-id="${escHtml(v.id)}" title="${state.activeViewId === v.id ? 'Clear view' : 'Apply view'}: ${escHtml(v.name)}">
      ${escHtml(v.name)}
      <span class="view-chip-del" data-del-id="${escHtml(v.id)}" title="Delete">&times;</span>
    </button>`).join('');

  bar.innerHTML = `
    <span class="views-bar-label">Views</span>
    <div class="views-chips">${chips}</div>
    <button class="btn btn-ghost btn-sm" id="btn-save-view">+ Save View</button>`;

  bar.querySelectorAll('.view-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.view-chip-del')) return;
      const viewId = btn.dataset.viewId;
      if (state.activeViewId === viewId) {
        clearView();
      } else {
        const view = state.savedViews.find(v => v.id === viewId);
        if (view) applyView(view);
      }
    });
  });

  bar.querySelectorAll('.view-chip-del').forEach(span => {
    span.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.savedViews = state.savedViews.filter(v => v.id !== span.dataset.delId);
      await saveSetting('savedViews', state.savedViews);
      renderSavedViews();
      showToast('View deleted.', 'success');
    });
  });

  document.getElementById('btn-save-view')?.addEventListener('click', () => {
    document.getElementById('save-view-name').value = '';
    document.getElementById('modal-save-view').classList.remove('hidden');
    document.getElementById('save-view-name').focus();
  });
}

async function saveCurrentView(name) {
  const view = {
    id: 'view-' + Date.now(),
    name: name.trim(),
    filterExcl: Object.fromEntries(
      Object.entries(state.filterExcl).map(([k, v]) => [k, [...v]])
    ),
    searchQuery: state.searchQuery,
    sortKeys: [...state.sortKeys],
  };
  state.savedViews.push(view);
  await saveSetting('savedViews', state.savedViews);
  renderSavedViews();
  showToast(`View "${name}" saved.`, 'success');
}

function applyView(view) {
  for (const [k, arr] of Object.entries(view.filterExcl || {})) {
    if (state.filterExcl[k]) state.filterExcl[k] = new Set(arr);
  }
  state.searchQuery = view.searchQuery || '';
  if (Array.isArray(view.sortKeys) && view.sortKeys.length) {
    state.sortKeys = view.sortKeys;
  }
  state.activeViewId = view.id;
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('btn-search-clear');
  if (searchInput) {
    searchInput.value = state.searchQuery;
    searchClear?.classList.toggle('hidden', !state.searchQuery);
  }
  renderSavedViews();
  applyFiltersAndRender();
}

function clearView() {
  for (const excl of Object.values(state.filterExcl)) excl.clear();
  state.searchQuery = '';
  state.sortKeys = [{ key: 'id', dir: 'desc' }];
  state.activeViewId = null;
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('btn-search-clear');
  if (searchInput) {
    searchInput.value = '';
    searchClear?.classList.add('hidden');
  }
  renderSavedViews();
  applyFiltersAndRender();
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

  // Refresh
  document.getElementById('btn-refresh')?.addEventListener('click', refreshData);

  // New item + Bulk Add
  document.getElementById('btn-new-item').addEventListener('click', () => openForm(null));
  document.getElementById('btn-bulk-add').addEventListener('click', openBulkAdd);
  document.getElementById('modal-bulk-add-close').addEventListener('click', closeBulkAdd);
  document.getElementById('modal-bulk-add-cancel').addEventListener('click', closeBulkAdd);
  document.getElementById('modal-bulk-add-ok').addEventListener('click', executeBulkAdd);
  document.getElementById('modal-bulk-add').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeBulkAdd(); });
  document.getElementById('bulk-add-input').addEventListener('input', updateBulkAddPreview);

  // Close / cancel form
  document.getElementById('btn-close-form').addEventListener('click', closeForm);
  document.getElementById('btn-cancel-form').addEventListener('click', closeForm);

  // Form submit
  document.getElementById('item-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('form-panel').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById('item-form').requestSubmit();
    }
  });

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

  // Filters — panels are built by refreshFilters(); just wire up "Clear" and click-outside
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    Object.values(state.filterExcl).forEach(s => s.clear());
    searchInput.value = '';
    state.searchQuery = '';
    searchClear.classList.add('hidden');
    closeAllFilterPanels();
    applyFiltersAndRender();
  });

  // Close panels when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#col-config-dd') &&
        !e.target.closest('.col-header-panel') &&
        !e.target.closest('.col-filter-btn')) {
      closeAllFilterPanels();
    }
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
  document.getElementById('btn-quick-export')?.addEventListener('click', () => exportJSON());
  document.getElementById('btn-export').addEventListener('click', () => exportJSON());
  document.getElementById('btn-export-change')?.addEventListener('click', () => exportJSON(true));

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
  document.getElementById('btn-export-selected').addEventListener('click', copySelected);
  document.getElementById('btn-deselect-all').addEventListener('click', () => {
    state.selected.clear();
    document.querySelectorAll('#items-tbody .row-check').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#items-tbody .row-selected').forEach(tr => tr.classList.remove('row-selected'));
    const selectAllBox = document.getElementById('select-all-check');
    if (selectAllBox) { selectAllBox.checked = false; selectAllBox.indeterminate = false; }
    updateBulkBar();
  });

  // Text wrap toggle
  document.getElementById('btn-text-wrap')?.addEventListener('click', toggleTextWrap);

  // Timeline view toggles (Day / Week / Month / Year)
  document.querySelectorAll('[data-tl-view]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.timelineView = btn.dataset.tlView;
      await saveSetting('timelineView', state.timelineView);
      renderDashboard();
    });
  });

  // By Project view toggles (Type / Status)
  document.querySelectorAll('[data-pbp-view]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.projectView = btn.dataset.pbpView;
      await saveSetting('projectView', state.projectView);
      renderByProject();
    });
  });

  // Save view modal
  document.getElementById('modal-save-view-cancel')?.addEventListener('click', () => {
    document.getElementById('modal-save-view').classList.add('hidden');
  });
  document.getElementById('modal-save-view-ok')?.addEventListener('click', () => {
    const name = document.getElementById('save-view-name').value.trim();
    if (!name) { showToast('Please enter a view name.', 'error'); return; }
    document.getElementById('modal-save-view').classList.add('hidden');
    saveCurrentView(name);
  });
  document.getElementById('save-view-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { document.getElementById('modal-save-view-ok').click(); e.preventDefault(); }
    if (e.key === 'Escape') { document.getElementById('modal-save-view').classList.add('hidden'); }
  });
  document.getElementById('modal-save-view')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
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
      if (!document.getElementById('modal-bulk-add').classList.contains('hidden')) { closeBulkAdd(); return; }
      if (!document.getElementById('modal-log').classList.contains('hidden')) { closeLogModal(); return; }
      if (!document.getElementById('modal-confirm').classList.contains('hidden')) { closeConfirm(); return; }
      if (!document.getElementById('modal-import').classList.contains('hidden')) {
        document.getElementById('modal-import').classList.add('hidden');
        pendingImportData = null;
        return;
      }
      if (!document.getElementById('modal-save-view').classList.contains('hidden')) { document.getElementById('modal-save-view').classList.add('hidden'); return; }
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
    // Restore search input value from persisted view state
    const searchInput = document.getElementById('search-input');
    if (searchInput && state.searchQuery) {
      searchInput.value = state.searchQuery;
      document.getElementById('btn-search-clear')?.classList.toggle('hidden', !state.searchQuery);
    }
    injectBadgeStyles();
    populateFormSelects();
    renderCustomOptions();
    renderSavedViews();
    updateTimelineToggles();
    attachProjectDropdown(document.getElementById('form-project'));
    applyFiltersAndRender();
    buildColsPanel();
    document.getElementById('btn-text-wrap')?.classList.toggle('active', state.textWrap);
    updateExportPathDisplay();
  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('items-tbody').innerHTML =
      '<tr><td colspan="10" style="color:var(--danger);padding:20px;text-align:center">Failed to initialize database. Please reload.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', init);
