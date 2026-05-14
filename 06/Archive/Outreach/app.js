/* ─── IndexedDB ─────────────────────────────────────────── */
const DB_NAME    = 'outreach-tracker';
const DB_VERSION = 1;
const STORE      = 'contacts';
const META_STORE = 'meta';

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('name',    'name',    { unique: false });
        s.createIndex('status',  'status',  { unique: false });
        s.createIndex('company', 'company', { unique: false });
      }
      if (!d.objectStoreNames.contains(META_STORE)) {
        d.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function tx(store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

function dbAll() {
  return new Promise((res, rej) => {
    const req = tx(STORE).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function dbGet(id) {
  return new Promise((res, rej) => {
    const req = tx(STORE).get(id);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function dbPut(contact) {
  return new Promise((res, rej) => {
    const req = tx(STORE, 'readwrite').put(contact);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function dbDelete(id) {
  return new Promise((res, rej) => {
    const req = tx(STORE, 'readwrite').delete(id);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function metaGet(key) {
  return new Promise((res, rej) => {
    const req = tx(META_STORE).get(key);
    req.onsuccess = e => res(e.target.result?.value ?? null);
    req.onerror   = e => rej(e.target.error);
  });
}

function metaSet(key, value) {
  return new Promise((res, rej) => {
    const req = tx(META_STORE, 'readwrite').put({ key, value });
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

/* ─── Status Colors ─────────────────────────────────────── */
const STATUS_COLORS = {
  amber:  { bg: '#fffbeb', text: '#d97706' },
  green:  { bg: '#f0fdf4', text: '#16a34a' },
  blue:   { bg: '#eef0fe', text: '#4f6ef7' },
  gray:   { bg: '#f3f4f6', text: '#6b7280' },
  red:    { bg: '#fef2f2', text: '#ef4444' },
  purple: { bg: '#faf5ff', text: '#a855f7' },
  pink:   { bg: '#fdf2f8', text: '#ec4899' },
  teal:   { bg: '#f0fdfa', text: '#0d9488' },
};

const COLOR_KEYS = Object.keys(STATUS_COLORS);

/* ─── Field metadata ─────────────────────────────────────── */
const FIELD_INPUT_TYPE = {
  email:         'email',
  phone:         'tel',
  linkedin:      'url',
  lastContacted: 'date',
  status:        'select',
  notes:         'textarea',
  nextSteps:     'textarea',
};

/* ─── Spreadsheet column → field mapping ────────────────── */
const COLUMN_MAP = {
  // Generic
  'contact name':            'name',
  'name':                    'name',
  'relationship':            'source',
  'title':                   'title',
  'organization':            'company',
  'company':                 'company',
  'industry':                'industry',
  'email':                   'email',
  'phone':                   'phone',
  'location':                'location',
  'last contact date':       'lastContacted',
  'last contacted':          'lastContacted',
  'next steps':              'nextSteps',
  'notes':                   'notes',
  // LinkedIn
  'url':                     'linkedin',
  'email address':           'email',
  'position':                'title',
  'connected on':            'lastContacted',
};
const SPLIT_NAME_COLS = new Set(['first name', 'last name']);
const SKIP_COLUMNS    = new Set(['id', 'months since last contact']);

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10)
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw; // non-US / unusual — leave as-is
}

function renderFieldDisplay(field, val) {
  if (!val) return '';
  switch (field) {
    case 'email':        return `<a href="mailto:${esc(val)}">${esc(val)}</a>`;
    case 'phone':        return `<a href="tel:${esc(val)}">${esc(formatPhone(val))}</a>`;
    case 'linkedin':     return `<a href="${esc(val)}" target="_blank">${esc(val)}</a>`;
    case 'status':       return renderTagHtml(val);
    case 'lastContacted': return formatDate(val);
    case 'tags':         return val.split(',').map(t => t.trim()).filter(Boolean)
                           .map(t => `<span class="tag-chip-display">${esc(t)}</span>`).join('');
    default: return esc(val);
  }
}

/* ─── Tag chip input widget ──────────────────────────────── */
function renderTagInputHtml(wrapId, tagsStr) {
  const tags = (tagsStr || '').split(',').map(t => t.trim()).filter(Boolean);
  const chips = tags.map(t =>
    `<span class="tag-chip" data-tag="${esc(t)}">${esc(t)}<button type="button" class="tag-chip-remove" onclick="removeTagChip(this)" tabindex="-1">×</button></span>`
  ).join('');
  return `<div class="tag-input-wrap" id="${wrapId}">${chips}<input type="text" class="tag-input-text" placeholder="${tags.length ? '' : 'Add tag…'}" onkeydown="tagInputKeydown(event,this)" oninput="this.placeholder=''"></div>`;
}

function tagInputKeydown(e, input) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    e.stopPropagation();
    const val = input.value.replace(/,/g, '').trim();
    if (!val) return;
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.dataset.tag = val;
    chip.innerHTML = `${esc(val)}<button type="button" class="tag-chip-remove" tabindex="-1" onclick="removeTagChip(this)">×</button>`;
    input.parentNode.insertBefore(chip, input);
    input.value = '';
    input.placeholder = '';
    input.focus();
  } else if (e.key === 'Backspace' && input.value === '') {
    const chips = input.parentNode.querySelectorAll('.tag-chip');
    if (chips.length) chips[chips.length - 1].remove();
  }
}

function removeTagChip(btn) {
  btn.closest('.tag-chip').remove();
}

function collectTags(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return '';
  return [...wrap.querySelectorAll('.tag-chip[data-tag]')].map(c => c.dataset.tag).join(', ');
}

function clearTagInput(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
  const input = wrap.querySelector('.tag-input-text');
  if (input) { input.value = ''; input.placeholder = 'Add tag…'; }
}

const DEFAULT_STATUSES = [
  { name: 'prospect', color: 'amber'  },
  { name: 'active',   color: 'green'  },
  { name: 'client',   color: 'blue'   },
  { name: 'inactive', color: 'gray'   },
];

const INTERACTION_TYPES = ['Meeting', 'Call', 'Email', 'Dinner', 'Lunch', 'Coffee', 'Text', 'Video Call', 'Event', 'Other'];

const DEFAULT_SOURCES = [
  'LinkedIn', 'Conference', 'Referral', 'Cold Outreach',
  'Event', 'Mutual Contact', 'Email', 'Phone', 'Other',
];

/* ─── State ─────────────────────────────────────────────── */
let allContacts   = [];
let customStatuses = [...DEFAULT_STATUSES];
let overdueThreshold = 30; // days since last contact before marked overdue
let exportName       = 'RDX1';
let exportAppendDate = false;
let filterStatus  = 'all';
let sortBy        = 'name';
let searchQuery   = '';
let listView      = 'cards';
let tableFilters  = {};
let selectedIds   = new Set();
let openContactId = null;
let dpEditMode    = false;
let currentView   = 'contacts'; // 'contacts' | 'settings'

let savedExportHandle = null;
let savedImportHandle = null;

/* ─── Helpers ───────────────────────────────────────────── */
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysAgo(iso) {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso + 'T00:00:00')) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return diff + 'd ago';
  if (diff < 30) return Math.floor(diff / 7) + 'w ago';
  return Math.floor(diff / 30) + 'mo ago';
}

function isOverdue(c) {
  if (!c.lastContacted) return false;
  // not overdue if there's a future planned interaction
  const today = new Date().toISOString().slice(0, 10);
  if ((c.interactions || []).some(e => e.planned && e.date >= today)) return false;
  const days = Math.floor((Date.now() - new Date(c.lastContacted + 'T00:00:00')) / 86400000);
  return days > overdueThreshold;
}

function getStatusStyle(statusName) {
  const s = customStatuses.find(x => x.name === statusName);
  const c = STATUS_COLORS[s?.color] || STATUS_COLORS.gray;
  return `background:${c.bg};color:${c.text}`;
}

function renderTagHtml(statusName) {
  if (!statusName) return '';
  return `<span class="tag" style="${getStatusStyle(statusName)}">${esc(statusName)}</span>`;
}

function toast(msg, type = '') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function esc(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Render ─────────────────────────────────────────────── */
function filteredContacts() {
  let list = [...allContacts];
  if (filterStatus === 'overdue')               list = list.filter(isOverdue);
  else if (filterStatus.startsWith('missing:')) { const f = filterStatus.slice(8); list = list.filter(c => !c[f]); }
  else if (filterStatus !== 'all')              list = list.filter(c => c.status === filterStatus);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(c =>
      (c.name      || '').toLowerCase().includes(q) ||
      (c.title     || '').toLowerCase().includes(q) ||
      (c.company   || '').toLowerCase().includes(q) ||
      (c.industry  || '').toLowerCase().includes(q) ||
      (c.location  || '').toLowerCase().includes(q) ||
      (c.email     || '').toLowerCase().includes(q) ||
      (c.phone     || '').toLowerCase().includes(q) ||
      (c.tags      || '').toLowerCase().includes(q) ||
      (c.source    || '').toLowerCase().includes(q) ||
      (c.nextSteps || '').toLowerCase().includes(q) ||
      (c.notes     || '').toLowerCase().includes(q)
    );
  }
  list.sort((a, b) => {
    if (sortBy === 'name')          return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'company')       return (a.company || '').localeCompare(b.company || '');
    if (sortBy === 'lastContacted') return (b.lastContacted || '') > (a.lastContacted || '') ? 1 : -1;
    if (sortBy === 'created')       return b.id - a.id;
    return 0;
  });
  return list;
}

function renderStats() {
  const total   = allContacts.length;
  const overdue = allContacts.filter(isOverdue).length;

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-overdue').textContent = overdue;

  // Dynamic status stats
  const statsRow = document.getElementById('dynamic-stats');
  statsRow.innerHTML = customStatuses.slice(0, 2).map(s => {
    const count = allContacts.filter(c => c.status === s.name).length;
    return `<div class="stat-card">
      <div class="stat-label" style="text-transform:capitalize">${esc(s.name)}</div>
      <div class="stat-value">${count}</div>
    </div>`;
  }).join('');
}

function renderSidebarNav() {
  const container = document.getElementById('status-nav-items');
  container.innerHTML = customStatuses.map(s =>
    `<button class="nav-item${filterStatus === s.name ? ' active' : ''}" data-status="${esc(s.name)}" onclick="setFilter('${esc(s.name)}')">
      <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>
      <span style="text-transform:capitalize">${esc(s.name)}</span>
      <span class="badge">${allContacts.filter(c => c.status === s.name).length}</span>
    </button>`
  ).join('');

  document.querySelectorAll('.nav-item[data-status="all"] .badge').forEach(b => {
    b.textContent = allContacts.length;
  });

  const missingFields = ['phone', 'email', 'location', 'company', 'lastContacted'];
  missingFields.forEach(f => {
    const el = document.getElementById(`badge-missing-${f}`);
    if (el) el.textContent = allContacts.filter(c => !c[f]).length;
  });
}

function renderContacts() {
  const list = filteredContacts();
  const grid     = document.getElementById('contacts-grid');
  const tableWrap = document.getElementById('contacts-table-wrap');

  const MISSING_LABELS = { phone: 'No Phone', email: 'No Email', location: 'No Location', company: 'No Company', lastContacted: 'Never Contacted' };
  const label = filterStatus === 'overdue' ? 'Overdue Contacts'
    : filterStatus.startsWith('missing:') ? (MISSING_LABELS[filterStatus.slice(8)] || 'Contacts')
    : 'Contacts';
  document.getElementById('toolbar-title').textContent =
    list.length === allContacts.length
      ? `${allContacts.length} ${label}`
      : `${list.length} of ${allContacts.length} — ${label}`;

  const emptyHtml = `<div class="empty-state">
    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
    <h3>${searchQuery || filterStatus !== 'all' ? 'No contacts match' : 'No contacts yet'}</h3>
    <p>${searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filter.' : 'Click <strong>+ Add Contact</strong> to get started.'}</p>
  </div>`;

  if (listView === 'table') {
    grid.style.display = 'none';
    tableWrap.style.display = '';
    if (list.length === 0) { tableWrap.innerHTML = emptyHtml; return; }
    renderTable(list);
  } else {
    grid.style.display = '';
    tableWrap.style.display = 'none';
    if (list.length === 0) { grid.innerHTML = emptyHtml; return; }
    grid.innerHTML = list.map(c => {
      const overdue  = isOverdue(c);
      const selected = selectedIds.has(c.id);
      return `<div class="contact-card${selected ? ' selected' : ''}" data-id="${c.id}" onclick="openDetail(${c.id})">
        <div class="card-select" onclick="event.stopPropagation(); toggleSelect(${c.id})">
          <input type="checkbox" class="card-checkbox" ${selected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelect(${c.id})">
        </div>
        <div class="avatar">${initials(c.name)}</div>
        <div class="contact-info">
          <div class="contact-name">${esc(c.name)}</div>
          <div class="contact-sub">${[c.title, c.company].filter(Boolean).map(esc).join(' · ')}</div>
          ${c.email || c.location ? `<div class="contact-sub" style="font-size:12px">${[c.email, c.location].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
          ${c.tags ? `<div class="card-tags">${c.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="tag-chip-display">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="contact-meta">
          ${renderTagHtml(c.status)}
          ${c.lastContacted ? `<span class="last-contact ${overdue ? 'overdue' : ''}">${daysAgo(c.lastContacted)}</span>` : '<span class="last-contact" style="opacity:.5">Never contacted</span>'}
          <div class="contact-actions" onclick="event.stopPropagation()">
            <button class="icon-btn" title="Edit" onclick="openDetailEdit(${c.id})">${svgEdit}</button>
            <button class="icon-btn danger" title="Delete" onclick="confirmDelete(${c.id})">${svgTrash}</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }
}

/* ─── Multi-select & Manual Merge ───────────────────────── */
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateSelectionBar();
  // update just the visual without full re-render
  document.querySelectorAll(`[data-id="${id}"]`).forEach(el => {
    if (el.classList.contains('contact-card')) {
      el.classList.toggle('selected', selectedIds.has(id));
      const cb = el.querySelector('.card-checkbox');
      if (cb) cb.checked = selectedIds.has(id);
    }
    if (el.tagName === 'TR') {
      el.classList.toggle('ct-row-selected', selectedIds.has(id));
      const cb = el.querySelector('input[type=checkbox]');
      if (cb) cb.checked = selectedIds.has(id);
    }
  });
}

function updateSelectionBar() {
  let bar = document.getElementById('selection-bar');
  if (selectedIds.size < 2) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selection-bar';
    bar.className = 'selection-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <span class="selection-bar-count">${selectedIds.size} selected</span>
    <button class="btn btn-primary btn-sm" onclick="showMergeDialog()">Merge</button>
    <button class="btn btn-secondary btn-sm" onclick="clearSelection()">Cancel</button>`;
}

function clearSelection() {
  selectedIds.clear();
  updateSelectionBar();
  renderContacts();
}

function showMergeDialog() {
  const ids = [...selectedIds];
  const contacts = ids.map(id => allContacts.find(c => c.id === id)).filter(Boolean);
  const modal = document.getElementById('merge-modal');
  const list  = document.getElementById('merge-pick-list');
  list.innerHTML = contacts.map(c => `
    <label class="merge-pick-opt">
      <input type="radio" name="merge-keep" value="${c.id}" ${c.id === ids[0] ? 'checked' : ''}>
      <div class="merge-pick-info">
        <div class="merge-pick-name">${esc(c.name)}</div>
        <div class="merge-pick-sub">${[c.title, c.company, c.location].filter(Boolean).map(esc).join(' · ')}</div>
        ${c.lastContacted ? `<div class="merge-pick-sub">${formatDate(c.lastContacted)}</div>` : ''}
        ${c.tags ? `<div class="merge-pick-sub">${c.tags}</div>` : ''}
      </div>
    </label>`).join('');
  modal.classList.add('open');
}

async function confirmMerge() {
  const keepId = Number(document.querySelector('input[name="merge-keep"]:checked')?.value);
  if (!keepId) return;
  const deleteIds = [...selectedIds].filter(id => id !== keepId);
  closeModal('merge-modal');
  await mergeAndKeep(keepId, ...deleteIds);
  clearSelection();
  toast('Contacts merged', 'success');
}

function setListView(view) {
  listView = view;
  document.getElementById('btn-view-cards').classList.toggle('active', view === 'cards');
  document.getElementById('btn-view-table').classList.toggle('active', view === 'table');
  renderContacts();
}

const TABLE_COLS = [
  { label: 'Name',          field: 'name',         type: 'text' },
  { label: 'Title',         field: 'title',        type: 'text' },
  { label: 'Company',       field: 'company',      type: 'text' },
  { label: 'Location',      field: 'location',     type: 'text' },
  { label: 'Status',        field: 'status',       type: 'select' },
  { label: 'Tags',          field: 'tags',         type: 'tags' },
  { label: 'Last Contacted',field: 'lastContacted',type: 'date' },
  { label: 'Phone',         field: 'phone',        type: 'tel' },
  { label: 'Email',         field: 'email',        type: 'email' },
];

function applyTableFilters(list) {
  return list.filter(c =>
    TABLE_COLS.every(col => {
      const f = tableFilters[col.field];
      if (!f || (Array.isArray(f) ? !f.length : !f.trim())) return true;
      if (col.type === 'select') return f.includes(c[col.field] || '');
      return (c[col.field] || '').toString().toLowerCase().includes(f.toLowerCase().trim());
    })
  );
}

function setTableFilter(field, value) {
  if (value) tableFilters[field] = value;
  else delete tableFilters[field];
  renderTable(filteredContacts());
}

function toggleStatusFilter(name, checked) {
  if (!Array.isArray(tableFilters.status)) tableFilters.status = [];
  if (checked) { if (!tableFilters.status.includes(name)) tableFilters.status.push(name); }
  else tableFilters.status = tableFilters.status.filter(s => s !== name);
  if (!tableFilters.status.length) delete tableFilters.status;
  // re-render only tbody to preserve open <details>
  const list = applyTableFilters(filteredContacts());
  const tbl  = document.getElementById('contacts-table');
  if (tbl) renderTableBody(tbl.querySelector('tbody'), list);
  // update clear button visibility
  const hasFilter = Object.keys(tableFilters).some(k => { const v = tableFilters[k]; return Array.isArray(v) ? v.length : !!v; });
  const clearBtn  = document.querySelector('.ct-clear-btn');
  if (hasFilter && !clearBtn) renderTable(filteredContacts());
  else if (!hasFilter && clearBtn) renderTable(filteredContacts());
}

function clearTableFilters() {
  tableFilters = {};
  renderTable(filteredContacts());
}

function renderTableBody(tbody, list) {
  tbody.innerHTML = list.map(c => {
    const overdue  = isOverdue(c);
    const selected = selectedIds.has(c.id);
    const cells = TABLE_COLS.map(col => {
      let display;
      if (col.type === 'tags')            display = renderFieldDisplay('tags', c[col.field] || '');
      else if (col.type === 'select')     display = renderTagHtml(c[col.field]);
      else if (col.field === 'lastContacted') display = c[col.field] ? `<span class="${overdue ? 'overdue' : ''}">${formatDate(c[col.field])}</span>` : '';
      else if (col.field === 'phone')     display = c[col.field] ? esc(formatPhone(c[col.field])) : '';
      else display = esc(c[col.field] || '');
      return `<td class="ct-cell" data-id="${c.id}" data-field="${col.field}" data-type="${col.type}">${display || '<span class="ct-empty">—</span>'}</td>`;
    }).join('');
    return `<tr data-id="${c.id}"${selected ? ' class="ct-row-selected"' : ''}>
      <td class="ct-check" onclick="event.stopPropagation(); toggleSelect(${c.id})">
        <input type="checkbox" ${selected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelect(${c.id})">
      </td>
      ${cells}
      <td class="ct-actions">
        <button class="icon-btn" title="Open" onclick="openDetail(${c.id})">${svgEdit}</button>
        <button class="icon-btn danger" title="Delete" onclick="confirmDelete(${c.id})">${svgTrash}</button>
      </td>
    </tr>`;
  }).join('');
  tbody.onclick = e => {
    const td = e.target.closest('.ct-cell');
    if (!td || td.classList.contains('editing')) return;
    startTableCellEdit(td);
  };
}

function renderTable(list) {
  const tbl   = document.getElementById('contacts-table');
  const thead = tbl.querySelector('thead');
  const tbody = tbl.querySelector('tbody');

  const hasFilter = Object.keys(tableFilters).some(k => { const v = tableFilters[k]; return Array.isArray(v) ? v.length : !!v; });
  const selectedStatuses = tableFilters.status || [];

  thead.innerHTML = `<tr>
    <th style="width:36px"></th>
    ${TABLE_COLS.map(c => `<th>${c.label}</th>`).join('')}
    <th style="width:70px">${hasFilter ? `<button class="ct-clear-btn" onclick="clearTableFilters()">✕ Clear</button>` : ''}</th>
  </tr>
  <tr class="ct-filter-row">
    <th></th>
    ${TABLE_COLS.map(col => {
      if (col.type === 'select') {
        const label = selectedStatuses.length ? `${selectedStatuses.length} selected` : 'All';
        const items = customStatuses.map(s => `
          <label class="ct-status-opt">
            <input type="checkbox" ${selectedStatuses.includes(s.name) ? 'checked' : ''} onchange="toggleStatusFilter('${esc(s.name)}',this.checked)">
            <span style="text-transform:capitalize">${esc(s.name)}</span>
          </label>`).join('');
        return `<th><details class="ct-status-filter${selectedStatuses.length ? ' has-filter' : ''}">
          <summary>${label}</summary>
          <div class="ct-status-options">${items}</div>
        </details></th>`;
      }
      const val = tableFilters[col.field] || '';
      return `<th><input class="ct-filter-input" type="text" placeholder="Filter…" value="${esc(val)}" oninput="setTableFilter('${col.field}',this.value)"></th>`;
    }).join('')}
    <th></th>
  </tr>`;

  renderTableBody(tbody, applyTableFilters(list));
}

function startTableCellEdit(td) {
  const contactId = Number(td.dataset.id);
  const field     = td.dataset.field;
  const type      = td.dataset.type;
  const c         = allContacts.find(x => x.id === contactId);
  if (!c) return;
  const rawVal = c[field] || '';

  td.classList.add('editing');

  if (type === 'tags') {
    const wrapId = `ct-tags-${contactId}`;
    td.innerHTML = renderTagInputHtml(wrapId, rawVal);
    const wrap  = td.querySelector('.tag-input-wrap');
    const input = wrap.querySelector('.tag-input-text');
    input.focus();
    let done = false;
    const commit = async () => {
      if (done) return; done = true;
      const newVal = collectTags(wrapId);
      await saveTableCell(contactId, field, newVal);
      td.classList.remove('editing');
      td.innerHTML = renderFieldDisplay('tags', newVal) || '<span class="ct-empty">—</span>';
    };
    wrap.addEventListener('focusout', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) commit(); }, 0));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { done = true; td.classList.remove('editing'); td.innerHTML = renderFieldDisplay('tags', rawVal) || '<span class="ct-empty">—</span>'; } });
    return;
  }

  let input;
  if (type === 'select') {
    input = document.createElement('select');
    input.className = 'ct-input';
    customStatuses.forEach(s => {
      const o = document.createElement('option');
      o.value = s.name; o.textContent = s.name;
      if (s.name === rawVal) o.selected = true;
      input.appendChild(o);
    });
  } else {
    input = document.createElement('input');
    input.className = 'ct-input';
    input.type  = type === 'tags' ? 'text' : type;
    input.value = rawVal;
  }

  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  if (input.select && type !== 'select') input.select();

  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    const newVal = input.value.trim ? input.value.trim() : input.value;
    await saveTableCell(contactId, field, newVal);
    td.classList.remove('editing');
    if (field === 'status')        td.innerHTML = renderTagHtml(newVal) || '<span class="ct-empty">—</span>';
    else if (field === 'phone')    td.innerHTML = newVal ? esc(formatPhone(newVal)) : '<span class="ct-empty">—</span>';
    else if (field === 'lastContacted') td.innerHTML = newVal ? esc(formatDate(newVal)) : '<span class="ct-empty">—</span>';
    else td.innerHTML = esc(newVal) || '<span class="ct-empty">—</span>';
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { done = true; td.classList.remove('editing'); td.innerHTML = (field === 'status' ? renderTagHtml(rawVal) : esc(rawVal)) || '<span class="ct-empty">—</span>'; }
    if (e.key === 'Tab') { commit(); }
  });
}

async function saveTableCell(contactId, field, newVal) {
  const c = allContacts.find(x => x.id === contactId);
  if (!c) return;
  c[field] = newVal;
  c.updatedAt = new Date().toISOString();
  await dbPut(c);
  const idx = allContacts.findIndex(x => x.id === contactId);
  if (idx !== -1) allContacts[idx] = c;
  renderStats(); renderSidebarNav();
}

/* ─── Detail Panel ───────────────────────────────────────── */
function openDetail(id, startInEdit = false) {
  openContactId = id;
  dpEditMode = startInEdit;
  const c = allContacts.find(x => x.id === id);
  if (!c) return;
  renderDetailPanel(c);
  document.getElementById('detail-panel').classList.add('open');
}

function openDetailEdit(id) { openDetail(id, true); }

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  openContactId = null;
  dpEditMode = false;
}

function renderDetailPanel(c) {
  document.getElementById('dp-avatar').textContent  = initials(c.name);
  document.getElementById('dp-name').textContent    = c.name || '';
  document.getElementById('dp-company').textContent = c.company || '';

  const body   = document.getElementById('dp-body');
  const footer = document.getElementById('dp-footer');

  // Make header name/company dblclick-editable
  const nameEl = document.getElementById('dp-name');
  nameEl.dataset.field = 'name';
  nameEl.dataset.raw   = c.name || '';
  const compEl = document.getElementById('dp-company');
  compEl.dataset.field = 'company';
  compEl.dataset.raw   = c.company || '';

  if (dpEditMode) {
    const statusOptions = customStatuses.map(s =>
      `<option value="${esc(s.name)}" ${c.status === s.name ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');

    body.innerHTML = `<div class="dp-edit-form" style="margin-bottom:0">
      <div class="field"><label>Name *</label><input id="dpe-name" value="${esc(c.name)}"></div>
      <div class="field"><label>Title</label><input id="dpe-title" value="${esc(c.title || '')}" placeholder="VP of Sales"></div>
      <div class="field"><label>Company</label><input id="dpe-company" value="${esc(c.company || '')}"></div>
      <div class="field"><label>Industry</label><input id="dpe-industry" value="${esc(c.industry || '')}" placeholder="SaaS, Finance…"></div>
      <div class="field"><label>Location</label><input id="dpe-location" value="${esc(c.location || '')}" placeholder="Austin, TX"></div>
      <div class="field"><label>Email</label><input id="dpe-email" type="email" value="${esc(c.email || '')}"></div>
      <div class="field"><label>Phone</label><input id="dpe-phone" type="tel" value="${esc(c.phone || '')}"></div>
      <div class="field"><label>LinkedIn / Social</label><input id="dpe-linkedin" type="url" value="${esc(c.linkedin || '')}"></div>
      <div class="field"><label>Status</label><select id="dpe-status">${statusOptions}</select></div>
      <div class="field"><label>Tags</label>${renderTagInputHtml('dpe-tags-wrap', c.tags || '')}</div>
      <div class="field"><label>Last Contacted</label><input id="dpe-lastContacted" type="date" value="${esc(c.lastContacted || '')}"></div>
      <div class="field"><label>Next Steps</label><textarea id="dpe-nextSteps">${esc(c.nextSteps || '')}</textarea></div>
      <div class="field"><label>Notes</label><textarea id="dpe-notes">${esc(c.notes || '')}</textarea></div>
    </div>` + renderInteractionLog(c);

    footer.innerHTML = `
      <button class="btn btn-secondary" style="flex:1" onclick="cancelDetailEdit()">Cancel</button>
      <button class="btn btn-primary" style="flex:1" onclick="saveDetailEdit()">Save</button>`;
  } else {
    const rows = [];
    if (c.title)         rows.push(dRow(svgBriefcase, 'Title',          'title',         c.title));
    if (c.industry)      rows.push(dRow(svgBuilding,  'Industry',       'industry',      c.industry));
    if (c.location)      rows.push(dRow(svgMapPin,    'Location',       'location',      c.location));
    if (c.email)         rows.push(dRow(svgMail,      'Email',          'email',         c.email));
    if (c.phone)         rows.push(dRow(svgPhone,     'Phone',          'phone',         c.phone));
    if (c.linkedin)      rows.push(dRow(svgLink,      'LinkedIn',       'linkedin',      c.linkedin));
    if (c.status)        rows.push(dRow(svgTag,       'Status',         'status',        c.status));
    rows.push(dRow(svgTag, 'Tags', 'tags', c.tags || ''));
    if (c.lastContacted) rows.push(dRow(svgCal, 'Last Contacted', 'lastContacted', c.lastContacted));

    body.innerHTML = rows.join('') +
      `<div class="detail-notes" ${c.nextSteps ? '' : 'style="display:none"'}>
        <div class="detail-notes-title">Next Steps</div>
        <div class="detail-notes-text editable-val" data-field="nextSteps" data-raw="${esc(c.nextSteps || '')}">${esc(c.nextSteps || '')}</div>
      </div>
      <div class="detail-notes" ${c.notes ? '' : 'style="display:none"'}>
        <div class="detail-notes-title">Notes</div>
        <div class="detail-notes-text editable-val" data-field="notes" data-raw="${esc(c.notes || '')}">${esc(c.notes || '')}</div>
      </div>` +
      renderInteractionLog(c);

    footer.innerHTML = `
      <button class="btn btn-secondary" style="flex:1" onclick="switchToEdit()">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete(openContactId)">Delete</button>`;
  }
}

function dRow(icon, label, field, rawVal) {
  const display = renderFieldDisplay(field, rawVal);
  const empty = !rawVal;
  return `<div class="detail-row">
    <span class="detail-row-icon">${icon}</span>
    <div style="flex:1;min-width:0">
      <div class="detail-row-label">${label}</div>
      <div class="detail-row-val editable-val${empty ? ' detail-row-empty' : ''}" data-field="${field}" data-raw="${esc(rawVal || '')}">${display || (field === 'tags' ? '<span class="detail-row-placeholder">double-click to add tags</span>' : '')}</div>
    </div>
  </div>`;
}

/* ─── Interaction / Activity Log ────────────────────────── */
function renderInteractionLog(c) {
  const today    = new Date().toISOString().slice(0, 10);
  const typeOpts = INTERACTION_TYPES.map(t => `<option>${esc(t)}</option>`).join('');
  const all      = (c.interactions || []).slice();
  const upcoming = all.filter(e => e.planned).sort((a, b) => a.date.localeCompare(b.date));
  const past     = all.filter(e => !e.planned).sort((a, b) => b.date.localeCompare(a.date));

  function entryHtml(e) {
    return `<div class="log-entry${e.planned ? ' log-entry-planned' : ''}">
      <div class="log-entry-header">
        <span class="log-type-pill${e.planned ? ' planned' : ''}">${esc(e.type)}</span>
        <span class="log-entry-date">${formatDate(e.date)}</span>
        <button class="log-delete-btn" onclick="deleteInteraction(${c.id},${e.id})" title="Remove">${svgTrash}</button>
      </div>
      ${e.notes ? `<div class="log-entry-notes">${esc(e.notes)}</div>` : ''}
    </div>`;
  }

  const upcomingHtml = upcoming.length === 0 ? '' : `
    <div class="log-subsection-label">Upcoming</div>
    ${upcoming.map(entryHtml).join('')}`;

  const pastHtml = past.length === 0
    ? (upcoming.length === 0 ? `<div class="log-empty">No interactions logged yet.</div>` : '')
    : `${past.length > 0 && upcoming.length > 0 ? '<div class="log-subsection-label">Past</div>' : ''}
       ${past.map(entryHtml).join('')}`;

  return `<div class="log-section">
    <div class="log-section-header">
      <span class="log-section-title">Activity Log</span>
      <span class="log-count">${all.length}</span>
    </div>
    <div class="log-add-form">
      <div class="log-add-top">
        <select id="dp-log-type" class="log-type-select">${typeOpts}</select>
        <input type="date" id="dp-log-date" value="${today}" class="log-date-input">
      </div>
      <textarea id="dp-log-notes" class="log-notes-input" placeholder="Notes (optional)" rows="2"></textarea>
      <div class="log-add-bottom">
        <label class="log-planned-toggle">
          <input type="checkbox" id="dp-log-planned">
          <span>Planned</span>
        </label>
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="logInteraction()">Log</button>
      </div>
    </div>
    <div class="log-entries">${upcomingHtml}${pastHtml}</div>
  </div>`;
}

async function logInteraction() {
  const typeEl    = document.getElementById('dp-log-type');
  const dateEl    = document.getElementById('dp-log-date');
  const notesEl   = document.getElementById('dp-log-notes');
  const plannedEl = document.getElementById('dp-log-planned');
  if (!typeEl || !dateEl) return;

  const date    = dateEl.value;
  const planned = plannedEl?.checked || false;
  if (!date) { toast('Please select a date', 'error'); return; }

  const c = allContacts.find(x => x.id === openContactId);
  if (!c) return;

  const entry = { id: Date.now(), date, type: typeEl.value, notes: (notesEl?.value || '').trim() };
  if (planned) entry.planned = true;
  if (!c.interactions) c.interactions = [];
  c.interactions.push(entry);

  // only update lastContacted for past/present interactions
  if (!planned) {
    if (!c.lastContacted || date > c.lastContacted) c.lastContacted = date;
  }
  c.updatedAt = new Date().toISOString();
  await dbPut(c);

  const idx = allContacts.findIndex(x => x.id === openContactId);
  if (idx !== -1) allContacts[idx] = c;

  renderDetailPanel(c);
  renderStats(); renderSidebarNav(); renderContacts();
  toast('Interaction logged', 'success');
}

async function deleteInteraction(contactId, entryId) {
  const c = allContacts.find(x => x.id === contactId);
  if (!c?.interactions) return;
  c.interactions = c.interactions.filter(e => e.id !== entryId);
  c.updatedAt = new Date().toISOString();
  await dbPut(c);
  const idx = allContacts.findIndex(x => x.id === contactId);
  if (idx !== -1) allContacts[idx] = c;
  renderDetailPanel(c);
  renderStats(); renderSidebarNav(); renderContacts();
}

/* ─── Per-field inline editing (double-click) ────────────── */
function startInlineEdit(el) {
  if (el.classList.contains('editing')) return;
  el.classList.add('editing');

  const field  = el.dataset.field;
  const rawVal = el.dataset.raw || '';
  const type   = FIELD_INPUT_TYPE[field] || 'text';

  // Tags get their own chip widget instead of a plain input
  if (field === 'tags') {
    const wrapId = 'inline-tags-wrap';
    el.innerHTML = renderTagInputHtml(wrapId, rawVal);
    const wrap      = el.querySelector('.tag-input-wrap');
    const textInput = wrap.querySelector('.tag-input-text');
    textInput.focus();

    let committed = false;

    async function commitTags() {
      if (committed) return;
      committed = true;
      const newVal = collectTags(wrapId);
      el.dataset.raw = newVal;
      el.classList.remove('editing');
      el.innerHTML = renderFieldDisplay('tags', newVal) || '<span class="detail-row-placeholder">double-click to add tags</span>';
      const c = allContacts.find(x => x.id === openContactId);
      if (!c) return;
      c.tags = newVal;
      c.updatedAt = new Date().toISOString();
      await dbPut(c);
      const idx = allContacts.findIndex(x => x.id === openContactId);
      if (idx !== -1) allContacts[idx] = c;
      renderStats(); renderSidebarNav(); renderContacts();
    }

    wrap.addEventListener('focusout', () => {
      setTimeout(() => { if (!wrap.contains(document.activeElement)) commitTags(); }, 0);
    });
    textInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); if (!committed) { committed = true; el.classList.remove('editing'); el.innerHTML = renderFieldDisplay('tags', rawVal) || '<span class="detail-row-placeholder">double-click to add tags</span>'; } }
    });
    return;
  }

  let input;
  if (type === 'select') {
    input = document.createElement('select');
    customStatuses.forEach(s => {
      const o = document.createElement('option');
      o.value = s.name; o.textContent = s.name;
      if (s.name === rawVal) o.selected = true;
      input.appendChild(o);
    });
  } else if (type === 'textarea') {
    input = document.createElement('textarea');
    input.value = rawVal;
    input.rows  = 4;
  } else {
    input = document.createElement('input');
    input.type  = type === 'datalist' ? 'text' : type;
    input.value = rawVal;
  }
  input.className = 'inline-edit-input';

  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  if (input.select && type !== 'select') input.select();

  let committed = false;

  async function commit() {
    if (committed) return;
    committed = true;

    const newVal = (input.value || '').trim ? (input.value || '').trim() : (input.value || '');
    el.dataset.raw = newVal;
    el.classList.remove('editing');
    el.innerHTML = field === 'notes' ? esc(newVal) : renderFieldDisplay(field, newVal);

    // Update header elements if name/company
    if (field === 'name') {
      document.getElementById('dp-name').textContent = newVal;
      document.getElementById('dp-avatar').textContent = initials(newVal);
    }
    if (field === 'company') {
      document.getElementById('dp-company').textContent = newVal;
    }

    // Show/hide notes section
    if (field === 'notes') {
      document.querySelector('.detail-notes').style.display = newVal ? '' : 'none';
    }

    const c = allContacts.find(x => x.id === openContactId);
    if (!c) return;
    c[field] = newVal;
    c.updatedAt = new Date().toISOString();
    await dbPut(c);
    const idx = allContacts.findIndex(x => x.id === openContactId);
    if (idx !== -1) allContacts[idx] = c;
    renderStats(); renderSidebarNav(); renderContacts();
  }

  function cancel() {
    if (committed) return;
    committed = true;
    el.classList.remove('editing');
    el.innerHTML = field === 'notes' ? esc(rawVal) : renderFieldDisplay(field, rawVal);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function switchToEdit() {
  dpEditMode = true;
  const c = allContacts.find(x => x.id === openContactId);
  if (c) renderDetailPanel(c);
}

function cancelDetailEdit() {
  dpEditMode = false;
  const c = allContacts.find(x => x.id === openContactId);
  if (c) renderDetailPanel(c);
}

async function saveDetailEdit() {
  const name = document.getElementById('dpe-name').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }

  const existing = allContacts.find(x => x.id === openContactId);
  const contact = {
    ...existing,
    name,
    title:         document.getElementById('dpe-title').value.trim(),
    company:       document.getElementById('dpe-company').value.trim(),
    industry:      document.getElementById('dpe-industry').value.trim(),
    location:      document.getElementById('dpe-location').value.trim(),
    email:         document.getElementById('dpe-email').value.trim(),
    phone:         document.getElementById('dpe-phone').value.trim(),
    linkedin:      document.getElementById('dpe-linkedin').value.trim(),
    status:        document.getElementById('dpe-status').value,
    tags:          collectTags('dpe-tags-wrap'),
    lastContacted: document.getElementById('dpe-lastContacted').value,
    nextSteps:     document.getElementById('dpe-nextSteps').value.trim(),
    notes:         document.getElementById('dpe-notes').value.trim(),
    updatedAt:     new Date().toISOString(),
  };

  await dbPut(contact);
  await reload();
  dpEditMode = false;
  const updated = allContacts.find(x => x.id === openContactId);
  if (updated) renderDetailPanel(updated);
  toast('Saved', 'success');
}

/* ─── Contact Modal (Add new) ────────────────────────────── */
function openAdd() {
  rebuildModalSelects();
  document.getElementById('modal-title').textContent = 'New Contact';
  document.getElementById('contact-form').reset();
  document.getElementById('field-status').value = customStatuses[0]?.name || 'prospect';
  // Reset new fields explicitly since reset() may not clear them
  ['field-title','field-industry','field-location','field-nextSteps'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearTagInput('field-tags-wrap');
  openModal('contact-modal');
}

function rebuildModalSelects() {
  const statusSel = document.getElementById('field-status');
  statusSel.innerHTML = customStatuses.map(s =>
    `<option value="${esc(s.name)}">${esc(s.name)}</option>`
  ).join('');
}

async function saveContact() {
  const name = document.getElementById('field-name').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }

  const contact = {
    name,
    title:         document.getElementById('field-title').value.trim(),
    company:       document.getElementById('field-company').value.trim(),
    industry:      document.getElementById('field-industry').value.trim(),
    location:      document.getElementById('field-location').value.trim(),
    email:         document.getElementById('field-email').value.trim(),
    phone:         document.getElementById('field-phone').value.trim(),
    linkedin:      document.getElementById('field-linkedin').value.trim(),
    status:        document.getElementById('field-status').value,
    tags:          collectTags('field-tags-wrap'),
    lastContacted: document.getElementById('field-lastContacted').value,
    nextSteps:     document.getElementById('field-nextSteps').value.trim(),
    notes:         document.getElementById('field-notes').value.trim(),
    updatedAt:     new Date().toISOString(),
    createdAt:     new Date().toISOString(),
  };

  await dbPut(contact);
  await reload();
  closeModal('contact-modal');
  toast('Contact added', 'success');
}

async function confirmDelete(id) {
  const c = allContacts.find(x => x.id === id);
  if (!confirm(`Delete "${c?.name}"? This cannot be undone.`)) return;
  await dbDelete(id);
  await reload();
  if (openContactId === id) closeDetail();
  toast('Contact deleted');
}

/* ─── Settings Page ──────────────────────────────────────── */
function showSettings() {
  currentView = 'settings';
  document.getElementById('main-content').style.display    = '';
  document.getElementById('map-view').style.display        = 'none';
  document.getElementById('duplicates-view').style.display = 'none';
  document.getElementById('followups-view').style.display  = 'none';
  document.getElementById('contacts-view').classList.add('hidden');
  document.getElementById('settings-page').classList.add('active');
  document.querySelectorAll('.nav-item[data-view], .nav-item[data-status]').forEach(n =>
    n.classList.toggle('active', n.dataset.view === 'settings')
  );
  renderSettingsPage();
  closeDetail();
}

function showContacts() {
  currentView = 'contacts';
  document.getElementById('main-content').style.display    = '';
  document.getElementById('map-view').style.display        = 'none';
  document.getElementById('duplicates-view').style.display = 'none';
  document.getElementById('followups-view').style.display  = 'none';
  document.getElementById('contacts-view').classList.remove('hidden');
  document.getElementById('settings-page').classList.remove('active');
  document.querySelectorAll('.nav-item[data-view]').forEach(n =>
    n.classList.toggle('active', n.dataset.view === 'contacts')
  );
  setFilter(filterStatus);
}

function buildExportFilename() {
  const base = exportName || 'RDX1';
  return exportAppendDate ? `${base}-${new Date().toISOString().slice(0,10)}.json` : `${base}.json`;
}

function refreshExportPreview() {
  const preview = document.getElementById('export-name-preview');
  if (preview) preview.textContent = `→ ${buildExportFilename()}`;
}

async function updateExportName(val) {
  exportName = val.trim() || 'RDX1';
  await metaSet('exportName', exportName);
  refreshExportPreview();
}

async function updateExportAppendDate(checked) {
  exportAppendDate = checked;
  await metaSet('exportAppendDate', checked);
  refreshExportPreview();
}

async function updateOverdueThreshold(val) {
  const n = parseInt(val, 10);
  if (!n || n < 1) return;
  overdueThreshold = n;
  await metaSet('overdueThreshold', n);
  renderStats(); renderSidebarNav(); renderContacts();
}

function renderSettingsPage() {
  const nameInput = document.getElementById('export-name-input');
  if (nameInput) {
    nameInput.value = exportName;
    const cb = document.getElementById('export-append-date');
    if (cb) cb.checked = exportAppendDate;
    refreshExportPreview();
  }
  const input = document.getElementById('overdue-threshold-input');
  if (input) input.value = overdueThreshold;
  renderStatusSettings();
}

const svgGrip = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/><circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/></svg>`;

function renderStatusSettings() {
  const list = document.getElementById('status-settings-list');
  list.innerHTML = customStatuses.map((s, i) => {
    const swatches = COLOR_KEYS.map(k => {
      const c = STATUS_COLORS[k];
      return `<div class="color-swatch ${s.color === k ? 'selected' : ''}"
        style="background:${c.bg};border-color:${s.color === k ? c.text : 'transparent'};outline:2px solid ${s.color === k ? c.text : 'transparent'}"
        title="${k}" onclick="setStatusColor(${i},'${k}')"></div>`;
    }).join('');

    return `<div class="item-row" draggable="true" data-index="${i}"
        ondragstart="statusDragStart(event,${i})"
        ondragover="statusDragOver(event)"
        ondragend="statusDragEnd(event)"
        ondrop="statusDrop(event,${i})">
      <span class="drag-handle" title="Drag to reorder">${svgGrip}</span>
      <div class="item-row-name">${renderTagHtml(s.name)}</div>
      <div class="item-row-color">${swatches}</div>
      <div class="item-row-order">
        ${i > 0 ? `<button class="icon-btn" onclick="moveStatus(${i},-1)" title="Move up">↑</button>` : '<span style="width:24px"></span>'}
        ${i < customStatuses.length - 1 ? `<button class="icon-btn" onclick="moveStatus(${i},1)" title="Move down">↓</button>` : '<span style="width:24px"></span>'}
      </div>
      ${customStatuses.length > 1
        ? `<button class="icon-btn danger" onclick="deleteStatus(${i})" title="Delete">${svgTrash}</button>`
        : ''}
    </div>`;
  }).join('');
}

let _dragIdx = null;

function statusDragStart(e, i) {
  _dragIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.closest('.item-row').classList.add('dragging'), 0);
}

function statusDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.item-row.drag-over').forEach(el => el.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

function statusDrop(e, toIdx) {
  e.preventDefault();
  if (_dragIdx === null || _dragIdx === toIdx) return;
  const moved = customStatuses.splice(_dragIdx, 1)[0];
  customStatuses.splice(toIdx, 0, moved);
  metaSet('customStatuses', customStatuses);
  renderSidebarNav();
  renderStatusSettings();
}

function statusDragEnd(e) {
  _dragIdx = null;
  document.querySelectorAll('.item-row').forEach(el => el.classList.remove('dragging', 'drag-over'));
}

function moveStatus(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= customStatuses.length) return;
  [customStatuses[i], customStatuses[j]] = [customStatuses[j], customStatuses[i]];
  metaSet('customStatuses', customStatuses);
  renderSidebarNav();
  renderStatusSettings();
}


function setStatusColor(index, colorKey) {
  customStatuses[index].color = colorKey;
  metaSet('customStatuses', customStatuses);
  renderSettingsPage();
  renderContacts();
}

function addStatus() {
  const input = document.getElementById('new-status-input');
  const name  = input.value.trim().toLowerCase();
  if (!name) return;
  if (customStatuses.find(s => s.name === name)) { toast('Status already exists', 'error'); return; }
  customStatuses.push({ name, color: COLOR_KEYS[customStatuses.length % COLOR_KEYS.length] });
  metaSet('customStatuses', customStatuses);
  input.value = '';
  renderSidebarNav();
  renderSettingsPage();
}

function deleteStatus(index) {
  const s = customStatuses[index];
  const inUse = allContacts.filter(c => c.status === s.name).length;
  if (inUse > 0 && !confirm(`"${s.name}" is used by ${inUse} contact(s). Delete anyway?`)) return;
  customStatuses.splice(index, 1);
  metaSet('customStatuses', customStatuses);
  renderSidebarNav();
  renderSettingsPage();
}


/* ─── Import / Export ────────────────────────────────────── */
async function loadSavedHandles() {
  try {
    savedExportHandle = await metaGet('exportFileHandle');
    savedImportHandle = await metaGet('importFileHandle');
  } catch (_) {}
  updateHandleUI();
}

function updateHandleUI() {
  const exportPath = document.getElementById('export-saved-path');
  const importPath = document.getElementById('import-saved-path');

  if (savedExportHandle) {
    exportPath.innerHTML = `<strong>Saved:</strong> ${esc(savedExportHandle.name)} <button class="btn btn-ghost btn-sm" onclick="clearExportHandle()">Clear</button>`;
    exportPath.style.display = 'flex';
    document.getElementById('btn-export-saved').disabled = false;
  } else {
    exportPath.style.display = 'none';
    document.getElementById('btn-export-saved').disabled = true;
  }

  if (savedImportHandle) {
    importPath.innerHTML = `<strong>Saved:</strong> ${esc(savedImportHandle.name)} <button class="btn btn-ghost btn-sm" onclick="clearImportHandle()">Clear</button>`;
    importPath.style.display = 'flex';
    document.getElementById('btn-import-saved').disabled = false;
  } else {
    importPath.style.display = 'none';
    document.getElementById('btn-import-saved').disabled = true;
  }
}

async function clearExportHandle() { savedExportHandle = null; await metaSet('exportFileHandle', null); updateHandleUI(); }
async function clearImportHandle() { savedImportHandle = null; await metaSet('importFileHandle', null); updateHandleUI(); }

function buildExportData() {
  return JSON.stringify({
    version: 1, exported: new Date().toISOString(),
    contacts: allContacts, statuses: customStatuses,
  }, null, 2);
}

async function exportNew() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: buildExportFilename(),
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const w = await handle.createWritable();
    await w.write(buildExportData()); await w.close();
    savedExportHandle = handle;
    await metaSet('exportFileHandle', handle);
    updateHandleUI(); toast('Exported successfully', 'success'); closeModal('ie-modal');
  } catch (e) { if (e.name !== 'AbortError') toast('Export failed: ' + e.message, 'error'); }
}

async function exportSaved() {
  if (!savedExportHandle) return;
  try {
    const perm = await savedExportHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') await savedExportHandle.requestPermission({ mode: 'readwrite' });
    const w = await savedExportHandle.createWritable();
    await w.write(buildExportData()); await w.close();
    toast('Exported to saved path', 'success'); closeModal('ie-modal');
  } catch (e) { if (e.name !== 'AbortError') toast('Export failed: ' + e.message, 'error'); }
}

async function importNew() {
  try {
    const [handle] = await window.showOpenFilePicker({ types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
    await doImport(handle);
    savedImportHandle = handle; await metaSet('importFileHandle', handle); updateHandleUI();
  } catch (e) { if (e.name !== 'AbortError') toast('Import failed: ' + e.message, 'error'); }
}

async function importSaved() {
  if (!savedImportHandle) return;
  try {
    const perm = await savedImportHandle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') await savedImportHandle.requestPermission({ mode: 'read' });
    await doImport(savedImportHandle);
  } catch (e) { if (e.name !== 'AbortError') toast('Import failed: ' + e.message, 'error'); }
}

async function doImport(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { toast('Invalid JSON file', 'error'); return; }

  const contacts = Array.isArray(data) ? data : data.contacts;
  if (!Array.isArray(contacts)) { toast('Unrecognized format', 'error'); return; }

  if (data.statuses) { customStatuses = data.statuses; await metaSet('customStatuses', customStatuses); }

  const mode = document.getElementById('import-mode').value;
  if (mode === 'replace') { for (const c of await dbAll()) await dbDelete(c.id); }

  let count = 0;
  for (const c of contacts) {
    if (!c.name) continue;
    const entry = { ...c };
    if (mode !== 'replace') delete entry.id;
    await dbPut(entry); count++;
  }

  await reload(); toast(`Imported ${count} contacts`, 'success'); closeModal('ie-modal');
}

/* ─── Modal helpers ──────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ─── Navigation ─────────────────────────────────────────── */
function setFilter(status) {
  filterStatus = status;
  document.querySelectorAll('.nav-item[data-status]').forEach(n =>
    n.classList.toggle('active', n.dataset.status === status)
  );
  // Highlight overdue stat card when that filter is active
  document.getElementById('stat-overdue-card').classList.toggle('stat-card-active', status === 'overdue');
  renderContacts();
}

/* ─── SVG Icons ──────────────────────────────────────────── */
const svgEdit  = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`;
const svgTrash = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;
const svgMail  = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`;
const svgPhone = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>`;
const svgLink  = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>`;
const svgTag   = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`;
const svgCal   = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;
const svgHandshake = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
const svgGear       = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
const svgBriefcase  = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`;
const svgBuilding   = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`;
const svgMapPin     = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;

/* ─── Import type toggle ─────────────────────────────────── */
function setImportType(type) {
  document.getElementById('import-panel-json').style.display  = type === 'json'  ? '' : 'none';
  document.getElementById('import-panel-sheet').style.display = type === 'sheet' ? '' : 'none';
  document.getElementById('import-panel-li').style.display    = type === 'li'    ? '' : 'none';
  document.getElementById('toggle-json').classList.toggle('active',  type === 'json');
  document.getElementById('toggle-sheet').classList.toggle('active', type === 'sheet');
  document.getElementById('toggle-li').classList.toggle('active',    type === 'li');
}

/* ─── Duplicate Detection ────────────────────────────────── */
function normalizeName(name = '') {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findDuplicates() {
  const map = new Map();
  for (const c of allContacts) {
    const key = normalizeName(c.name);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return [...map.values()].filter(g => g.length > 1);
}

function showFollowups() {
  currentView = 'followups';
  document.getElementById('main-content').style.display    = '';
  document.getElementById('map-view').style.display        = 'none';
  document.getElementById('contacts-view').classList.add('hidden');
  document.getElementById('settings-page').classList.remove('active');
  document.getElementById('duplicates-view').style.display = 'none';
  document.getElementById('followups-view').style.display  = '';
  document.querySelectorAll('.nav-item[data-status], .nav-item[data-view]').forEach(n =>
    n.classList.toggle('active', n.dataset.view === 'followups')
  );
  closeDetail();
  renderFollowupsView();
}

function renderFollowupsView() {
  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  allContacts.forEach(c => {
    (c.interactions || []).filter(e => e.planned).forEach(e => {
      items.push({ contact: c, entry: e });
    });
  });
  items.sort((a, b) => a.entry.date.localeCompare(b.entry.date));

  const past     = items.filter(x => x.entry.date < today);
  const upcoming = items.filter(x => x.entry.date >= today);

  function renderGroup(list, label) {
    if (!list.length) return '';
    return `<div class="fu-group-label">${label}</div>
      ${list.map(({ contact: c, entry: e }) => `
        <div class="fu-card" onclick="openDetail(${c.id})">
          <div class="fu-date ${e.date < today ? 'overdue' : ''}">${formatDate(e.date)}</div>
          <div class="fu-body">
            <div class="fu-name">${esc(c.name)}</div>
            <div class="fu-sub">${[c.title, c.company].filter(Boolean).map(esc).join(' · ')}</div>
            <div class="fu-meta">
              <span class="log-type-pill planned">${esc(e.type)}</span>
              ${e.notes ? `<span class="fu-notes">${esc(e.notes)}</span>` : ''}
            </div>
          </div>
          <button class="icon-btn danger fu-del" title="Remove" onclick="event.stopPropagation(); deletePlannedFromView(${c.id},${e.id})">${svgTrash}</button>
        </div>`).join('')}`;
  }

  const content = document.getElementById('followups-content');
  if (!items.length) {
    content.innerHTML = `<div class="empty-state" style="padding:48px 0">
      <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
      <h3>No planned follow-ups</h3>
      <p>Open a contact and log a planned interaction to see it here.</p>
    </div>`;
    return;
  }
  content.innerHTML = renderGroup(upcoming, 'Upcoming') + renderGroup(past, 'Past Due');
}

async function deletePlannedFromView(contactId, entryId) {
  await deleteInteraction(contactId, entryId);
  renderFollowupsView();
  updateFollowupsBadge();
}

function updateFollowupsBadge() {
  const count = allContacts.reduce((n, c) => n + (c.interactions || []).filter(e => e.planned).length, 0);
  const el = document.getElementById('followups-badge');
  if (el) el.textContent = count;
}

function showDuplicates() {
  currentView = 'duplicates';
  document.getElementById('main-content').style.display = '';
  document.getElementById('map-view').style.display     = 'none';
  document.getElementById('contacts-view').classList.add('hidden');
  document.getElementById('settings-page').classList.remove('active');
  document.getElementById('followups-view').style.display  = 'none';
  document.getElementById('duplicates-view').style.display = '';
  document.querySelectorAll('.nav-item[data-status], .nav-item[data-view]').forEach(n =>
    n.classList.toggle('active', n.dataset.view === 'duplicates')
  );
  closeDetail();
  renderDuplicatesView();
}

function renderDuplicatesView() {
  const groups  = findDuplicates();
  const content = document.getElementById('duplicates-content');

  if (!groups.length) {
    content.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <h3>No duplicates found</h3>
      <p>All contact names are unique.</p>
    </div>`;
    return;
  }

  content.innerHTML = groups.map(group => {
    const cards = group.map(c => `
      <div class="dup-card">
        <div class="dup-card-name">${esc(c.name)}</div>
        ${c.title   ? `<div class="dup-card-row">${esc(c.title)}${c.company ? ' · ' + esc(c.company) : ''}</div>` : (c.company ? `<div class="dup-card-row">${esc(c.company)}</div>` : '')}
        ${c.email   ? `<div class="dup-card-row">${esc(c.email)}</div>` : ''}
        ${c.phone   ? `<div class="dup-card-row">${esc(c.phone)}</div>` : ''}
        ${c.location ? `<div class="dup-card-row">${esc(c.location)}</div>` : ''}
        ${c.lastContacted ? `<div class="dup-card-row">Last: ${formatDate(c.lastContacted)}</div>` : ''}
        ${(c.interactions||[]).length ? `<div class="dup-card-row">${(c.interactions||[]).length} interaction(s)</div>` : ''}
        <div class="dup-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openDetail(${c.id})">View</button>
          <button class="btn btn-primary btn-sm" onclick="mergeAndKeep(${c.id}, ${group.filter(x=>x.id!==c.id).map(x=>x.id).join(',')})">Merge &amp; Keep</button>
          <button class="btn btn-sm" style="background:var(--danger-light);color:var(--danger);border:none" onclick="deleteDuplicate(${c.id})">Delete</button>
        </div>
      </div>`).join('');

    return `<div class="dup-group">${cards}</div>`;
  }).join('');
}

async function mergeAndKeep(keepId, ...deleteIds) {
  const keep = allContacts.find(c => c.id === keepId);
  if (!keep) return;

  for (const delId of deleteIds) {
    const del = allContacts.find(c => c.id === delId);
    if (!del) continue;

    // Copy any fields the keeper is missing
    const fields = ['title','company','industry','location','email','phone',
                    'linkedin','source','tags','nextSteps','notes','status'];
    for (const f of fields) {
      if (!keep[f] && del[f]) keep[f] = del[f];
    }

    // Merge interaction logs
    keep.interactions = [...(keep.interactions||[]), ...(del.interactions||[])]
      .sort((a, b) => b.date.localeCompare(a.date));

    // Keep the most recent lastContacted
    if (del.lastContacted && (!keep.lastContacted || del.lastContacted > keep.lastContacted))
      keep.lastContacted = del.lastContacted;

    await dbDelete(delId);
  }

  keep.updatedAt = new Date().toISOString();
  await dbPut(keep);
  await reload();
  renderDuplicatesView();
  toast('Merged — kept ' + keep.name, 'success');
}

async function deleteDuplicate(id) {
  const c = allContacts.find(x => x.id === id);
  if (!confirm(`Delete "${c?.name}"? This cannot be undone.`)) return;
  await dbDelete(id);
  await reload();
  renderDuplicatesView();
  toast('Duplicate deleted');
}

/* ─── Spreadsheet (CSV / XLSX) Import ───────────────────── */
function importSpreadsheet() {
  const input = document.getElementById('spreadsheet-file-input');
  input.value = '';
  input.click();
}

async function handleSpreadsheetFile(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    const buffer = await file.arrayBuffer();
    const wb     = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const sheet  = wb.Sheets[wb.SheetNames[0]];
    const rows   = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd', defval: '' });

    if (!rows.length) { toast('File appears to be empty', 'error'); return; }

    // Detect LinkedIn format (has First Name + Last Name columns)
    const sampleHeaders = Object.keys(rows[0]).map(h => h.trim().toLowerCase());
    const isLinkedIn = sampleHeaders.includes('first name') && sampleHeaders.includes('last name');

    const mode = document.getElementById('import-mode').value;
    if (mode === 'replace') {
      for (const c of await dbAll()) await dbDelete(c.id);
    }

    let count = 0;
    for (const row of rows) {
      const contact = { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

      // Combine First Name + Last Name for LinkedIn exports
      if (isLinkedIn) {
        const first = String(row['First Name'] || row['first name'] || '').trim();
        const last  = String(row['Last Name']  || row['last name']  || '').trim();
        const full  = [first, last].filter(Boolean).join(' ');
        if (full) contact.name = full;
      }

      for (const [rawHeader, rawVal] of Object.entries(row)) {
        const header = rawHeader.trim().toLowerCase();
        if (SPLIT_NAME_COLS.has(header)) continue; // handled above
        if (SKIP_COLUMNS.has(header)) continue;
        const field = COLUMN_MAP[header];
        if (!field) continue;

        let val = String(rawVal || '').trim();
        if (!val) continue;

        if (field === 'lastContacted') val = normalizeDate(val);
        contact[field] = val;
      }

      if (!contact.name) continue;
      if (!contact.status) contact.status = customStatuses[0]?.name || 'prospect';
      if (isLinkedIn && !contact.tags) contact.tags = 'LinkedIn';
      await dbPut(contact);
      count++;
    }

    await reload();
    closeModal('ie-modal');
    toast(`Imported ${count} contacts`, 'success');
  } catch (e) {
    console.error(e);
    toast('Import failed: ' + e.message, 'error');
  }
}

function normalizeDate(val) {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return '';
}

/* ─── Map View ───────────────────────────────────────────── */
let leafletMap    = null;
let mapPopulated  = false;
let activeTileLayer = null;
const geoCache    = {};

const MAP_STYLES = {
  voyager: {
    label: 'Voyager',
    url:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attr:  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    sub:   'abcd',
  },
  positron: {
    label: 'Light',
    url:   'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attr:  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    sub:   'abcd',
  },
  dark: {
    label: 'Dark',
    url:   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr:  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    sub:   'abcd',
  },
  esri_street: {
    label: 'Street',
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attr:  'Tiles © Esri',
    sub:   null,
  },
  esri_topo: {
    label: 'Topo',
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attr:  'Tiles © Esri',
    sub:   null,
  },
  esri_satellite: {
    label: 'Satellite',
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:  'Tiles © Esri',
    sub:   null,
  },
};

let activeStyleKey = 'voyager';

async function showMap() {
  currentView = 'map';
  document.getElementById('main-content').style.display  = 'none';
  document.getElementById('map-view').style.display      = 'flex';
  document.querySelectorAll('.nav-item[data-status], .nav-item[data-view]').forEach(n =>
    n.classList.toggle('active', n.dataset.view === 'map')
  );
  closeDetail();

  document.getElementById('duplicates-view').style.display = 'none';
  document.getElementById('followups-view').style.display  = 'none';
  if (!leafletMap) {
    leafletMap = L.map('map-container').setView([39.5, -98.35], 4);
    const saved = await metaGet('mapStyle');
    if (saved && MAP_STYLES[saved]) activeStyleKey = saved;
    activeTileLayer = applyTileLayer(activeStyleKey);
    addStyleSwitcher();
  } else {
    leafletMap.invalidateSize();
  }

  await populateMap();
}

function showMapFromNav() { showMap(); }

function applyTileLayer(styleKey) {
  const s = MAP_STYLES[styleKey];
  if (activeTileLayer) leafletMap.removeLayer(activeTileLayer);
  const opts = { attribution: s.attr, maxZoom: 19 };
  if (s.sub) opts.subdomains = s.sub;
  activeTileLayer = L.tileLayer(s.url, opts).addTo(leafletMap);
  return activeTileLayer;
}

async function setMapStyle(styleKey) {
  activeStyleKey = styleKey;
  applyTileLayer(styleKey);
  await metaSet('mapStyle', styleKey);
  // Update switcher button states
  document.querySelectorAll('.map-style-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.style === styleKey)
  );
}

function addStyleSwitcher() {
  const StyleControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'map-style-switcher');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML = Object.entries(MAP_STYLES).map(([key, s]) =>
        `<button class="map-style-btn${key === activeStyleKey ? ' active' : ''}" data-style="${key}" onclick="setMapStyle('${key}')">${s.label}</button>`
      ).join('');
      return div;
    },
  });
  new StyleControl().addTo(leafletMap);
}

async function populateMap() {
  // Group contacts by location string
  const byLoc = new Map();
  const noLoc = [];
  for (const c of allContacts) {
    if (!c.location || !c.location.trim()) { noLoc.push(c); continue; }
    const key = c.location.trim().toLowerCase();
    if (!byLoc.has(key)) byLoc.set(key, { label: c.location.trim(), contacts: [] });
    byLoc.get(key).contacts.push(c);
  }

  // Clear existing markers
  leafletMap.eachLayer(l => { if (l instanceof L.Marker) leafletMap.removeLayer(l); });
  mapPopulated = false;

  // No-location panel
  const noLocDiv  = document.getElementById('map-no-location');
  const noLocList = document.getElementById('map-no-location-list');
  if (noLoc.length) {
    noLocList.innerHTML = noLoc.map(c =>
      `<span class="map-no-loc-chip" onclick="openDetail(${c.id});showContacts()">${esc(c.name)}</span>`
    ).join('');
    noLocDiv.style.display = '';
  } else {
    noLocDiv.style.display = 'none';
  }

  if (!byLoc.size) return;

  // Geocode each unique location, sequentially with rate-limit gap
  const statusBar  = document.getElementById('map-status-bar');
  const statusText = document.getElementById('map-status-text');
  const locations  = [...byLoc.values()];
  let fetched = 0;

  for (const { label, contacts } of locations) {
    const coords = await geocodeCity(label, () => {
      fetched++;
      statusBar.style.display = '';
      statusText.textContent  = `Locating cities… ${fetched} / ${locations.length}`;
    });

    if (coords) {
      const marker = L.marker([coords.lat, coords.lng]).addTo(leafletMap);
      const rows   = contacts.map(c =>
        `<div class="map-popup-row"><a href="#" onclick="event.preventDefault();openDetail(${c.id})">${esc(c.name)}</a>${c.title ? `<span class="map-popup-title"> · ${esc(c.title)}</span>` : ''}</div>`
      ).join('');
      marker.bindPopup(
        `<div class="map-popup"><strong>${esc(label)}</strong>${rows}</div>`,
        { maxWidth: 220 }
      );
    }
  }

  statusBar.style.display = 'none';
  mapPopulated = true;

  // Fit map to markers
  const markerGroup = L.featureGroup(
    leafletMap.getLayers ? undefined :
    [...byLoc.values()].map(({ label }) => {
      const c = geoCache[label.toLowerCase()];
      return c ? L.marker([c.lat, c.lng]) : null;
    }).filter(Boolean)
  );
  try { leafletMap.fitBounds(markerGroup.getBounds(), { padding: [40, 40] }); } catch (_) {}
}

async function geocodeCity(location, onFetch) {
  const key = location.trim().toLowerCase();
  if (geoCache[key] !== undefined) return geoCache[key];

  const stored = await metaGet('geo:' + key);
  if (stored !== null) { geoCache[key] = stored; return stored; }

  onFetch?.();
  await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit: 1 req/sec

  try {
    const url  = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`;
    const res  = await fetch(url);
    const data = await res.json();
    const coords = data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
    geoCache[key] = coords;
    await metaSet('geo:' + key, coords);
    return coords;
  } catch {
    geoCache[key] = null;
    return null;
  }
}

/* ─── Reload ─────────────────────────────────────────────── */
async function clearAllData() {
  if (!confirm('Delete ALL contacts and reset settings? This cannot be undone.')) return;
  if (!confirm('Are you sure? Every contact, note, and activity log will be gone permanently.')) return;
  const all = await dbAll();
  for (const c of all) await dbDelete(c.id);
  await metaSet('customStatuses', null);
  await metaSet('customSources',  null);
  await metaSet('overdueThreshold', null);
  await metaSet('exportName', null);
  await metaSet('exportAppendDate', null);
  customStatuses   = [...DEFAULT_STATUSES];
  overdueThreshold = 30;
  exportName       = 'RDX1';
  exportAppendDate = false;
  await reload();
  toast('All data cleared', 'success');
}

async function reload() {
  allContacts = await dbAll();
  renderStats();
  renderSidebarNav();
  renderContacts();
  const dupCount = findDuplicates().length;
  const badge    = document.getElementById('dup-badge');
  if (badge) {
    badge.textContent = dupCount;
    badge.style.background = dupCount ? 'var(--danger)' : '';
    badge.style.color      = dupCount ? '#fff'          : '';
  }
  updateFollowupsBadge();
}

/* ─── Init ───────────────────────────────────────────────── */
function applyDarkMode(dark) {
  document.body.classList.toggle('dark', dark);
  const icon = document.getElementById('dark-mode-icon');
  if (!icon) return;
  icon.innerHTML = dark
    ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/>`
    : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>`;
}

async function toggleDarkMode() {
  const dark = !document.body.classList.contains('dark');
  applyDarkMode(dark);
  await metaSet('darkMode', dark);
}

async function init() {
  await openDB();

  const savedStatuses   = await metaGet('customStatuses');
  const savedThreshold  = await metaGet('overdueThreshold');
  const savedExportName = await metaGet('exportName');
  if (savedStatuses)   customStatuses   = savedStatuses;
  if (savedThreshold)  overdueThreshold = savedThreshold;
  if (savedExportName) exportName = savedExportName;
  const savedAppendDate = await metaGet('exportAppendDate');
  if (savedAppendDate !== null) exportAppendDate = savedAppendDate;
  const savedDark = await metaGet('darkMode');
  if (savedDark) applyDarkMode(true);

  await reload();
  await loadSavedHandles();

  // Double-click to edit fields in detail panel body
  document.getElementById('dp-body').addEventListener('dblclick', e => {
    const el = e.target.closest('.editable-val[data-field]');
    if (el) startInlineEdit(el);
  });

  // Double-click to edit name / company in detail header
  document.getElementById('detail-header').addEventListener('dblclick', e => {
    const el = e.target.closest('[data-field]');
    if (el && !el.classList.contains('detail-close') && !el.closest('button')) startInlineEdit(el);
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderContacts();
  });

  document.getElementById('sort-select').addEventListener('change', e => {
    sortBy = e.target.value;
    renderContacts();
  });

  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); });
  });

  document.getElementById('new-status-input').addEventListener('keydown', e => { if (e.key === 'Enter') addStatus(); });

  document.addEventListener('keydown', e => {
    if (!e.ctrlKey || e.key !== 'Enter') return;
    if (document.getElementById('contact-modal')?.classList.contains('open')) {
      e.preventDefault(); saveContact();
    } else if (dpEditMode && openContactId) {
      e.preventDefault(); saveDetailEdit();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
