(() => {
const { Workbook } = window.XLSX;

/* ───────── helpers ───────── */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null || n === '' || isNaN(n) ? '' : (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const opts = (list, val, blank = true) => (blank ? '<option value=""></option>' : '') + list.map(x => `<option${x === val ? ' selected' : ''}>${esc(x)}</option>`).join('') + (val && !list.includes(val) ? `<option selected>${esc(val)}</option>` : '');
// dates are 'YYYY-MM-DD' strings everywhere
const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => toISO(new Date());
const dim = (y, m) => new Date(y, m, 0).getDate();
const mk = (y, m, d) => { const f = new Date(y, m - 1, 1), yy = f.getFullYear(), mm = f.getMonth() + 1; return toISO(new Date(yy, mm - 1, Math.min(d, dim(yy, mm)))); }; // month may overflow (13 = next January)
const fmt = s => { const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };

function savedView() { try { const v = sessionStorage.getItem('view'); return v === 'roommate' ? 'owed' : ['dashboard', 'transactions', 'recurring', 'owed', 'trends', 'settings'].includes(v) ? v : 'dashboard'; } catch { return 'dashboard'; } } // opening the app lands on the dashboard; refreshing keeps the page you were on
/* ───────── state ───────── */
let demo = false, freshUser = false, handle = null, D = null, mtime = 0, pending = null, view = savedView(), recOrder = null, queue = Promise.resolve();
const F = { q: '', month: '', cat: '', review: false, rec: '', split: '', limit: 300 }; // the Transactions filters; kept for a page refresh
try { const f = JSON.parse(sessionStorage.getItem('filters')); if (f && typeof f === 'object') for (const k in F) if (typeof f[k] === typeof F[k]) F[k] = f[k]; } catch {}

/* ───────── remembered file handle (IndexedDB) ───────── */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('budget', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv')); tx.oncomplete = () => { db.close(); res(req.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; }); };

/* ───────── data shape (version 8) ─────────
   transactions: { id, date, desc, cat, amt, from, to, notes, work, rec, parts? }   rec = name of a recurring item ('' if none)
                 parts (optional) = line items under one charge: [{ id, desc, amt (same sign as the charge), rec, excluded? }] — they inherit its category
                 excluded (optional, true) = a charge tagged to a recurring item that is kept in the history but left out of the item's calculations
   recurring:    { id, name, group, dueDay (1-31, optional), active, url? (where you pay it), period? ('year' = charged once a year; absent = monthly), dueMonth? (1-12, yearly items) } — no amount: it's worked out from the charges tagged with the item
   groups:       ['Home', 'Subscriptions', ...]  the list of groups items are sorted into (yours to define)
   people:       [{ id, name }]  whoever you split things with
   settings:     { txnColumns: ['date','desc',...], txnEdit: false, txnSort: { k: 'date', dir: -1 }, trendMonths: 6, showInactive: false, recView: 'mine'|'full', catKinds: { category: 'spend'|'income'|'skip' } }
   splits:       o.split = { owes, who, even?, requested? } on a charge or line (owes = that person's share, who = their id; you pay the rest) · a payment's lines carry covers: { tx, part }                                       */
function migrate(d) {
  d.recurring ??= []; d.lists ??= { accounts: [], categories: [], work: [] };
  const v = d.version || 1;
  if (v < 3) {
    const nameOf = new Map(d.recurring.map(r => [r.id, r.name]));
    for (const t of d.transactions) { if (v >= 2) { t.rec = nameOf.get(t.recId) || ''; delete t.recId; } else t.rec ??= ''; } // older versions linked by id / carried extra fields
    d.recurring = d.recurring.map(r => { // fill amount + due day from the most recent charge when not set
      const last = d.transactions.filter(t => t.rec === r.name && t.date && t.amt != null).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const amt = r.amount ?? (last ? last.amt : null);
      return { id: r.id, name: r.name, group: r.category || '', amount: amt == null ? null : round2(Math.abs(amt)), dueDay: r.dueDay ?? (last ? +last.date.slice(8, 10) : null), active: !r.cancelled };
    });
  }
  if (v < 4) {
    d.groups ??= [];
    for (const r of d.recurring) r.group ??= r.category || ''; // an older item's category becomes its group
    for (const g of new Set(d.recurring.map(r => r.group).filter(Boolean))) if (!d.groups.includes(g)) d.groups.push(g);
    d.version = 4;
  }
  if (v < 5) { for (const r of d.recurring) { delete r.amount; delete r.estimate; } d.version = 5; } // amounts now come from the charges linked to each item
  if (v < 7) { // roommate splits no longer use named rules: drop them, keep every split's amounts and request dates
    delete d.rules; for (const r of d.recurring) delete r.rule;
    const clean = o => { if (o.split) o.split = { owes: o.split.owes || 0, ...(o.split.requested ? { requested: o.split.requested } : {}) }; };
    for (const t of d.transactions) { clean(t); for (const p of t.parts || []) clean(p); }
    d.version = 7;
  }
  if (v < 8) { // splits are with a named person: existing ones go to "Roommate" so nothing is lost
    d.people ??= []; const sp = []; for (const t of d.transactions) { if (t.split) sp.push(t); for (const p of t.parts || []) if (p.split) sp.push(p); }
    if (sp.length && !d.people.length) d.people.push({ id: 1, name: 'Roommate' });
    for (const o of sp) o.split.who ??= d.people[0].id;
    d.version = 8;
  }
  d.groups ??= []; d.settings ??= {}; d.people ??= [];
  for (const t of d.transactions) t.rec ??= '';
  return d;
}

/* ───────── status / gate / storage (JSON is the source of truth) ───────── */
const setStatus = (t, err) => { const s = $('#status'); s.textContent = t; s.className = 'status' + (err ? ' err' : ''); if (!err && /^(Saved|Exported)/.test(t)) setTimeout(() => { if (s.textContent === t) s.textContent = ''; }, 4000); };
const gate = html => { $('#export').hidden = true; $('#nav').hidden = true; $('#demobar').hidden = true; $('#view').innerHTML = `<div class="card">${html}</div>`; };
const startHtml = () => `<h2>Set up your data file</h2><p>Your transactions are saved in a JSON file you choose, and you can export to Excel any time. Open your data file, or start a new one.</p>
  <button class="btn" id="open">Open data file…</button> <button class="btn ghost" id="create">Start a new data file…</button>
  <p class="muted small">Just looking? <a href="#" id="sample">Try it with sample data</a> — a made-up budget to click around in. Nothing is saved.</p>`;
const emptyData = () => ({ version: 8, updated: '', groups: [], people: [], settings: {}, lists: { accounts: ['Checking', 'Savings', 'Credit Card'], categories: ['Food & Dining', 'Shopping', 'Bills & Utilities', 'Transportation', 'Entertainment', 'Income', 'Transfer', 'Other'] }, recurring: [], transactions: [] });
const XLSX_TYPE = [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
const JSON_TYPE = [{ description: 'Budget data (JSON)', accept: { 'application/json': ['.json'] } }];
const serialize = d => {
  const L = o => JSON.stringify(o), rows = a => a.map(x => '  ' + L(x)).join(',\n');
  return `{\n "version": ${d.version || 8},\n "updated": ${L(d.updated || new Date().toISOString())},\n "groups": ${L(d.groups || [])},\n "people": ${L(d.people || [])},\n "settings": ${L(d.settings || {})},\n "lists": ${L(d.lists)},\n "recurring": [\n${rows(d.recurring)}\n ],\n "transactions": [\n${rows(d.transactions)}\n ]\n}\n`;
};
const parseData = txt => {
  let d; try { d = JSON.parse(txt); } catch { throw new Error('That is not a JSON data file. Pick the .json file, not the Excel workbook.'); }
  if (!d || !Array.isArray(d.transactions)) throw new Error('That file is not a budget data file.');
  return migrate(d);
};

const tourDone = () => { try { return localStorage.getItem('tourDone') === '1'; } catch { return true; } };
const markTourDone = () => { try { localStorage.setItem('tourDone', '1'); } catch {} };
function sampleData() { // the made-up budget, with its dates shifted so the newest month is this month (and nothing is in the future)
  const d = JSON.parse(JSON.stringify(window.SAMPLE_DATA)), T = today(), base = d.transactions.reduce((m, t) => (t.date > m ? t.date : m), '').slice(0, 7), cur = T.slice(0, 7);
  const n = (+cur.slice(0, 4) - +base.slice(0, 4)) * 12 + (+cur.slice(5, 7) - +base.slice(5, 7)), sh = ds => { const x = mk(+ds.slice(0, 4), +ds.slice(5, 7) + n, +ds.slice(8, 10)); return x > T ? T : x; };
  for (const t of d.transactions) { t.date = sh(t.date); for (const o of [t, ...(t.parts || [])]) if (o.split?.requested) o.split.requested = sh(o.split.requested); }
  d.updated = new Date().toISOString(); return d;
}
function enterDemo(withTour, keep) {
  if (!window.SAMPLE_DATA) return setStatus('The sample data file (sample.js) is missing.', true);
  demo = true; try { sessionStorage.setItem('demo', '1'); } catch {}
  if (!keep) { closeCard(); Object.assign(F, { q: '', month: '', cat: '', review: false, rec: '', split: '', limit: 300 }); view = 'dashboard'; }
  D = migrate(sampleData()); $('#file').textContent = 'Sample data'; render();
  if (withTour) startTour();
}
async function exitDemo() { demo = false; try { sessionStorage.removeItem('demo'); } catch {} D = null; closeCard(); Object.assign(F, { q: '', month: '', cat: '', review: false, rec: '', split: '', limit: 300 }); view = 'dashboard'; $('#file').textContent = ''; setStatus(''); await boot(); }
async function boot() {
  try { if (sessionStorage.getItem('demo') === '1' && window.SAMPLE_DATA) return enterDemo(false, true); } catch {}
  if (!('showOpenFilePicker' in window)) return gate('<h2>Chrome or Edge required</h2><p>Saving to a file on your computer needs the File System Access API, which this browser doesn\'t have.</p><p class="muted small">You can still <a href="#" id="sample">look around with sample data</a> (nothing is saved).</p>');
  try { handle = await kv('readonly', s => s.get('handle')); } catch { handle = null; }
  if (!handle || typeof handle.queryPermission !== 'function') { freshUser = !tourDone(); return gate(startHtml()); }
  if (!tourDone()) markTourDone(); // someone who already uses the app doesn't need the first-run tour
  let perm = 'prompt'; try { perm = await handle.queryPermission({ mode: 'readwrite' }); } catch {}
  if (perm === 'granted') return start();
  gate(`<h2>Reconnect</h2><p>${esc(handle.name)}</p><button class="btn" id="reconnect">Allow access</button> <button class="btn ghost" id="open">Open a different file…</button>`);
}
document.addEventListener('click', async e => {
  const id = e.target.id; if (!id) return;
  try {
    if (id === 'sample') { e.preventDefault(); enterDemo(freshUser && !tourDone()); }
    else if (id === 'demoexit') await exitDemo();
    else if (id === 'demotour') startTour();
    else if (id === 'create') { // step 2
      const h = await showSaveFilePicker({ suggestedName: 'budget-data.json', types: JSON_TYPE });
      const w = await h.createWritable(); await w.write(serialize(pending || emptyData())); await w.close();
      handle = h; pending = null; await kv('readwrite', s => s.put(h, 'handle')); start();
    } else if (id === 'open') {
      const [h] = await showOpenFilePicker({ types: JSON_TYPE });
      if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
      parseData(await (await h.getFile()).text()); // make sure it really is a data file before remembering it
      handle = h; await kv('readwrite', s => s.put(h, 'handle')); start();
    } else if (id === 'reconnect') {
      if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') start();
    } else if (id === 'export') await exportXlsx();
  } catch (err) { if (err.name !== 'AbortError') setStatus(err.message, true); }
});
async function start() {
  $('#file').textContent = handle.name;
  try { await reload(); } catch (e) { // not a usable data file (e.g. a link remembered from an older version): forget it and start over
    handle = null; D = null; try { await kv('readwrite', s => s.delete('handle')); } catch {}
    $('#file').textContent = '';
    return gate(`<p><b>Couldn't open the remembered file.</b> ${esc(e.message)}</p>` + startHtml());
  }
  render();
  if (freshUser && !tourDone()) startTour();
}
async function reload() { const file = await handle.getFile(); D = parseData(await file.text()); mtime = file.lastModified; }
window.addEventListener('focus', async () => { // pick up changes made to the data file elsewhere
  if (demo || !handle || !D || document.activeElement?.closest?.('td')) return;
  try { const f = await handle.getFile(); if (f.lastModified !== mtime) { await reload(); render(); } } catch {}
});

/* every edit changes the data and writes the JSON file straight away */
function commit(fn, { redraw = true } = {}) {
  queue = queue.then(async () => {
    if (demo) { // sample data: changes live only in memory
      try { fn(D); setStatus('Sample — not saved'); if (redraw) render(); } catch (err) { setStatus(err.message, true); render(); }
      return;
    }
    if (!handle) return;
    try {
      setStatus('Saving…');
      const f = await handle.getFile(); if (f.lastModified !== mtime) D = parseData(await f.text()); // someone else changed it: start from theirs
      fn(D); D.updated = new Date().toISOString();
      const w = await handle.createWritable(); await w.write(serialize(D)); await w.close();
      mtime = (await handle.getFile()).lastModified; setStatus('Saved');
      if (redraw) render();
    } catch (err) {
      setStatus(err.message, true);
      try { await reload(); } catch {} render();
    }
  });
  return queue;
}

/* export: write the transactions into an Excel workbook (pivots, charts etc. in it are left alone) */
async function exportXlsx() {
  const target = await showSaveFilePicker({ suggestedName: 'Budget Creation.xlsx', types: XLSX_TYPE }); // first, while the click is fresh
  setStatus('Exporting…');
  let base = null;
  try { const f = await target.getFile(); if (f.size) { await Workbook.load(f); base = f; } } catch {} // picked an existing workbook: patch what's in it now
  if (!base) { const t = await kv('readonly', s => s.get('template')); if (!t) throw new Error('No Excel template stored. Import a workbook first, or export onto your existing workbook.'); base = new Blob([t]); }
  const wb = await Workbook.load(base); await wb.replaceTransactions(D.transactions.map(t => (t.parts || []).length ? { ...t, notes: [t.notes, 'Split: ' + t.parts.map(p => `${p.desc || 'line'} ${money(p.amt)}`).join('; ')].filter(Boolean).join(' | ') } : t)); // one row per bank charge; any split is spelled out in Notes
  const w = await target.createWritable(); await w.write(await wb.toBytes()); await w.close();
  setStatus('Exported ✓ — in Excel use Data → Refresh All');
}

/* ───────── table helpers: fixed, draggable column widths + spreadsheet-style keys ───────── */
const TABLES = { // [id, label, default width]
  rec: [['dueDay', 'Due', 122], ['name', 'Name', 150], ['group', 'Group', 110], ['repeats', 'Repeats', 92], ['monthly', 'Monthly', 120], ['last', 'Last charge', 160], ['next', 'Next charge', 100], ['url', 'Pay link', 100], ['active', 'Active', 50], ['view', 'Charges', 76], ['del', '', 36]],
};
const savedWidths = key => { try { const m = JSON.parse(localStorage.getItem('cw:' + key)); return m && !Array.isArray(m) ? m : {}; } catch { return {}; } };
function tableHtml(key, bodyId, cols, sort, fit) { // sort (optional) = { k, dir } makes the headers clickable · fit = the columns share the window's width instead of having a fixed one (so the page never scrolls sideways)
  const saved = savedWidths(key), w = c => saved[c[0]] || c[2], total = cols.reduce((a, c) => a + w(c), 0);
  return `<div class="wrap"><table data-key="${key}"${fit ? ' data-fit="1"' : ''} style="width:${fit ? '100%' : total + 'px'}"><colgroup>${cols.map(c => `<col data-k="${c[0]}" data-dw="${c[2]}" style="width:${fit ? (w(c) / total * 100).toFixed(3) + '%' : w(c) + 'px'}">`).join('')}</colgroup><thead><tr>${cols.map(c => `<th${sort && c[0] !== 'open' ? ` data-k="${c[0]}" class="sortable" title="Click to sort"` : ''}>${c[1]}${sort && sort.k === c[0] ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}<i class="rz" title="Drag to resize · double-click to reset"></i></th>`).join('')}</tr></thead><tbody id="${bodyId}"></tbody></table></div>`;
}
function setColWidth(table, i, w, save = true) {
  const cols = [...table.querySelectorAll('col')], ths = [...table.querySelectorAll('thead th')];
  if (table.dataset.fit) { // columns share the window: work in proportions, and keep the whole row's widths so the others don't jump
    const px = cols.map((c, j) => (j === i ? w : ths[j].offsetWidth)), tot = px.reduce((a, b) => a + b, 0);
    cols.forEach((c, j) => { c.style.width = (px[j] / tot * 100).toFixed(3) + '%'; });
    if (save) try { const m = {}; cols.forEach((c, j) => { m[c.dataset.k] = Math.round(px[j]); }); localStorage.setItem('cw:' + table.dataset.key, JSON.stringify(m)); } catch {}
    return;
  }
  cols[i].style.width = w + 'px';
  table.style.width = cols.reduce((a, c) => a + parseFloat(c.style.width), 0) + 'px';
  if (save) try { const m = savedWidths(table.dataset.key); m[cols[i].dataset.k] = w; localStorage.setItem('cw:' + table.dataset.key, JSON.stringify(m)); } catch {}
}
document.addEventListener('pointerdown', e => {
  const h = e.target.closest?.('.rz'); if (!h) return; e.preventDefault();
  const th = h.parentElement, table = th.closest('table'), i = [...th.parentElement.children].indexOf(th), x0 = e.clientX, w0 = th.offsetWidth;
  const move = ev => setColWidth(table, i, Math.max(50, w0 + ev.clientX - x0), false);
  const up = ev => { removeEventListener('pointermove', move); setColWidth(table, i, Math.max(50, w0 + ev.clientX - x0)); };
  addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true });
});
document.addEventListener('dblclick', e => {
  const h = e.target.closest?.('.rz'); if (!h) return; const th = h.parentElement, table = th.closest('table'), i = [...th.parentElement.children].indexOf(th);
  setColWidth(table, i, +table.querySelectorAll('col')[i].dataset.dw);
});
function cellKeys(tb) { // click selects text · Enter = save & go down (Shift+Enter up) · Esc = undo
  tb.addEventListener('focusin', e => { const el = e.target; if (!el.dataset?.f) return; el._orig = el.type === 'checkbox' ? el.checked : el.value; if (el.tagName === 'INPUT' && ['text', 'number'].includes(el.type)) el.select(); });
  tb.addEventListener('keydown', e => {
    const el = e.target; if (!el.dataset?.f) return;
    if (e.key === 'Escape') { if (el._orig === undefined) return el.blur(); if (el.type === 'checkbox') el.checked = el._orig; else el.value = el._orig; el.blur(); }
    else if (e.key === 'Enter' && el.tagName !== 'SELECT' && !e.isComposing) {
      e.preventDefault(); let next = el.closest('tr'); do { next = e.shiftKey ? next.previousElementSibling : next.nextElementSibling; } while (next && !next.dataset.id); // skip group header rows
      el.blur(); next?.querySelector(`[data-f="${el.dataset.f}"]`)?.focus();
    }
  });
}
const flash = (el, p) => p.then(() => { if (el.isConnected && !$('#status').classList.contains('err')) { el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 900); } });

/* ───────── render / navigation ───────── */
function render() {
  if (!D) return;
  $('#export').hidden = demo; $('#nav').hidden = false; $('#demobar').hidden = !demo;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  try { sessionStorage.setItem('view', view); sessionStorage.setItem('filters', JSON.stringify(F)); } catch {}
  const a = document.activeElement, tr = a?.closest?.('#view tr'), key = tr && a.dataset?.f ? [tr.dataset.id, a.dataset.f] : null; // keep focus across redraws
  (view === 'settings' ? vSettings : view === 'dashboard' ? vDashboard : view === 'recurring' ? vRecurring : view === 'trends' ? vTrends : view === 'owed' ? vOwed : vTransactions)();
  if (key) $(`#view tr[data-id="${key[0]}"] [data-f="${key[1]}"]`)?.focus();
  if (cardId != null) { if (view === 'transactions' || view === 'owed') renderCard(); else closeCard(); } // an open card follows the data
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { closeCard(); view = b.dataset.view; if (view === 'transactions') F.rec = ''; /* the tab shows everything; only Recurring → View filters */ if (view === 'recurring') recOrder = null; render(); } });

/* ───────── transactions: a compact list; click a row for its card ───────── */
const DEFAULT_COLS = ['date', 'desc', 'cat', 'amt', 'from'], LOCKED = ['desc', 'amt'];
const txnSel = (list, f) => t => comboHtml(f, f, t[f]);
const TXN_COLS = { // what each optional column shows (read) and how it edits (edit)
  date: { h: 'Date', w: 115, read: t => fmt(t.date), edit: t => `<input type="date" data-f="date" value="${t.date}">` },
  desc: { h: 'Description', w: 340, read: t => esc(t.desc) + ((t.parts || []).length ? ` <span class="chip" title="Split into ${t.parts.length} line items">÷${t.parts.length}</span>` : ''), edit: t => `<input data-f="desc" value="${esc(t.desc)}" title="${esc(t.desc)}">` },
  cat: { h: 'Category', w: 170, read: t => esc(t.cat), edit: txnSel(() => D.lists.categories, 'cat') },
  amt: { h: 'Amount', w: 120, num: true, read: t => `<span class="${t.amt < 0 ? 'neg' : 'pos'}">${money(t.amt)}</span>`, edit: t => `<input type="number" step="0.01" data-f="amt" class="num${t.amt < 0 ? ' neg' : ' pos'}" value="${t.amt ?? ''}">` },
  from: { h: 'From', w: 140, read: t => esc(t.from), edit: txnSel(() => D.lists.accounts, 'from') },
  to: { h: 'To', w: 140, read: t => esc(t.to), edit: txnSel(() => D.lists.accounts, 'to') },
  split: { h: 'Split with', w: 150, read: t => esc(splitNames(t)), edit: t => esc(splitNames(t)) },
  rec: { h: 'Recurring', w: 190, read: t => esc(t.rec), edit: txnSel(() => D.recurring.map(r => r.name).filter(Boolean), 'rec') },
  notes: { h: 'Notes', w: 240, read: t => esc(String(t.notes ?? '').replace(/\s+/g, ' ')), edit: t => `<input data-f="notes" value="${esc(t.notes)}">` },
};
const splitNames = t => [...new Set([t, ...(t.parts || [])].filter(o => o.split).map(o => whoName(D, o.split.who)))].join(', ');
const txnCols = () => { const s = D.settings?.txnColumns, keys = Array.isArray(s) ? s.filter(k => TXN_COLS[k]) : [...DEFAULT_COLS]; for (const k of LOCKED) if (!keys.includes(k)) keys.push(k); return Object.keys(TXN_COLS).filter(k => keys.includes(k)); };
const txnEdit = () => !!D.settings?.txnEdit;
const txnSort = () => { const s = D.settings?.txnSort; return s && (TXN_COLS[s.k] || s.k === 'counted') && (s.dir === 1 || s.dir === -1) ? s : { k: 'date', dir: -1 }; };
const txnCmp = () => { // empty values always sort last
  const { k, dir } = txnSort(), val = t => k === 'counted' ? countedParts(t, F.rec)?.kept : k === 'amt' ? t.amt : k === 'split' ? splitNames(t).toLowerCase() : String(t[k] ?? '').toLowerCase();
  const tie = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id); // equal values: newest first
  return (a, b) => { const x = val(a), y = val(b), xe = x == null || x === '', ye = y == null || y === ''; if (xe || ye) return xe === ye ? tie(a, b) : xe ? 1 : -1; const r = x < y ? -1 : x > y ? 1 : 0; return r ? r * dir : tie(a, b); };
};
const setSetting = (k, v) => commit(d => { d.settings = { ...(d.settings || {}), [k]: v }; });
const filtersOn = () => !!(F.q || F.month || F.cat || F.review || F.rec || F.split);
const splitOk = t => { // the Transactions split filter
  if (!F.split) return true; const os = [t, ...(t.parts || [])].filter(o => o.split);
  return F.split === 'none' ? !os.length : F.split === 'any' ? os.length > 0 : os.some(o => 'p' + o.split.who === F.split);
};
const hasTag = t => !!t.rec || (t.parts || []).some(p => p.rec);
const needsReview = t => t.cat === 'Unknown' || ((t.cat === 'Subscription' || t.cat === 'Bills & Utilities') && !hasTag(t));
// what a transaction contributes to a recurring item: cost = everything tagged, kept = the part not excluded from the calculations
const countedParts = (t, name) => {
  const ps = t.parts || [], sum = a => round2(-a.reduce((s, p) => s + (p.amt || 0), 0));
  if (ps.length) { const m = ps.filter(p => p.rec === name); return m.length ? { cost: sum(m), kept: sum(m.filter(p => !p.excluded)) } : null; }
  if (t.rec !== name) return null; const cost = round2(-(t.amt || 0)); return { cost, kept: t.excluded ? 0 : cost };
};
const counted = (t, name) => countedParts(t, name)?.cost ?? null;
function countedCell(t) { // the "Counted" column on the filtered list, with a button to exclude / include the charge
  const cp = countedParts(t, F.rec), ex = round2(cp.cost - cp.kept), isEx = (t.parts || []).length ? t.parts.filter(p => p.rec === F.rec).every(p => p.excluded) : !!t.excluded;
  const txt = isEx ? `<span class="excl" title="Excluded from the calculations — still in the history">${money(cp.cost)}</span>` : ex ? `${money(cp.kept)} <span class="muted">+${money(ex)} excl.</span>` : money(cp.cost);
  return `<td class="t num">${txt} <button class="x" data-act="excl" title="${isEx ? 'Include in the calculations again' : 'Exclude from the calculations (keeps it in the history)'}">${isEx ? '↺' : '⊘'}</button></td>`;
}
function toggleExcluded(id) { // flip whether this charge (or, on a split charge, its lines for the filtered item) counts toward the item
  const name = F.rec; if (!name) return;
  commit(d => {
    const t = d.transactions.find(x => x.id === id); if (!t) throw new Error('That transaction no longer exists — reloaded.');
    const set = (o, on) => { if (on) o.excluded = true; else delete o.excluded; };
    if ((t.parts || []).length) { const ps = t.parts.filter(p => p.rec === name), on = !ps.every(p => p.excluded); ps.forEach(p => set(p, on)); } else set(t, !t.excluded);
  });
}
const partsSum = t => round2((t.parts || []).reduce((a, p) => a + (p.amt || 0), 0));
let showCols = false, cardId = null, cardIds = [], cardNew = null;

function vTransactions() {
  if (F.rec && !D.recurring.some(r => r.name === F.rec)) F.rec = ''; // the item was renamed or deleted
  const months = [...new Set(D.transactions.map(t => t.date.slice(0, 7)))].sort().reverse(), cols = txnCols();
  $('#view').innerHTML = `
  <div class="bar">
    <button class="btn" id="add">+ Add</button>
    <input id="q" type="search" placeholder="Search…" value="${esc(F.q)}">
    <select id="fm"><option value="">All months</option>${months.map(m => `<option${m === F.month ? ' selected' : ''}>${m}</option>`).join('')}</select>
    <select id="fc"><option value="">All categories</option>${opts(D.lists.categories, F.cat, false)}</select>
    <select id="fs" title="Show only charges split with someone, or with one person"><option value="">Split: all</option><option value="any"${F.split === 'any' ? ' selected' : ''}>Split with anyone</option><option value="none"${F.split === 'none' ? ' selected' : ''}>Not split</option>${peopleList().map(p => `<option value="p${p.id}"${F.split === 'p' + p.id ? ' selected' : ''}>With ${esc(p.name)}</option>`).join('')}</select>
    <label><input id="fr" type="checkbox"${F.review ? ' checked' : ''}> Needs review</label>
    <button class="btn ghost sm" id="clrall" title="Clear every filter"${filtersOn() ? '' : ' hidden'}>Clear filters</button>
    ${F.rec ? `<span class="chip filt" title="Showing only the charges counted toward this recurring item">Recurring: <b>${esc(F.rec)}</b> <button class="x" id="clrrec" title="Show all transactions">✕</button></span><button class="btn ghost sm" id="backrec">‹ Recurring</button>` : ''}
    <button class="btn ghost" id="cols">Columns</button>
    <label title="Turn the list into editable cells"><input id="editmode" type="checkbox"${txnEdit() ? ' checked' : ''}> Edit in table</label>
    <span class="sum" id="sum"></span>
  </div>
  ${showCols ? `<div class="panel" id="colpanel"><b>Show columns</b> <span class="muted">— saved with your data</span><div class="chks">${Object.keys(TXN_COLS).map(k => `<label class="chk"><input type="checkbox" data-col="${k}"${cols.includes(k) ? ' checked' : ''}${LOCKED.includes(k) ? ' disabled' : ''}> ${TXN_COLS[k].h}</label>`).join('')}</div></div>` : ''}
  ${tableHtml('txn', 'tb', [...cols.map(k => [k, TXN_COLS[k].h, TXN_COLS[k].w]), ...(F.rec ? [['counted', 'Counted', 150]] : []), ['open', '', 44]], txnSort())}
  <p class="muted" id="more"></p>`;
  const redraw = () => { F.q = $('#q').value; F.month = $('#fm').value; F.cat = $('#fc').value; F.review = $('#fr').checked; F.split = $('#fs').value; F.limit = 300; $('#clrall').hidden = !filtersOn(); try { sessionStorage.setItem('filters', JSON.stringify(F)); } catch {} body(); };
  ['#q', '#fm', '#fc', '#fr', '#fs'].forEach(s => $(s).addEventListener('input', redraw));
  $('#tb').addEventListener('change', onEdit); cellKeys($('#tb'));
  $('#tb').addEventListener('click', e => { // a click on the row opens its card (in table-edit mode only the › button does, so cells can be edited)
    if (e.target.closest('input,select,textarea')) return;
    const ex = e.target.closest('[data-act=excl]'); if (ex) { toggleExcluded(+ex.closest('tr').dataset.id); return; }
    const tr = e.target.closest('tr[data-id]'); if (tr && (!txnEdit() || e.target.closest('[data-act=open]'))) openCard(+tr.dataset.id);
  });
  $('#tb').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openCard(+e.target.dataset.id); });
  $('#more').addEventListener('click', () => { F.limit += 300; body(); });
  $('table[data-key=txn] thead').addEventListener('click', e => { // click a header to sort by it; click again to flip
    if (e.target.closest('.rz')) return; const th = e.target.closest('th.sortable'); if (!th) return;
    const cur = txnSort(), k = th.dataset.k; setSetting('txnSort', { k, dir: cur.k === k ? -cur.dir : (k === 'date' || k === 'counted' ? -1 : 1) }); // dates start newest-first, amounts biggest-spend first, text A→Z
  });
  $('#add').addEventListener('click', addRow);
  $('#clrrec')?.addEventListener('click', () => { F.rec = ''; render(); });
  $('#clrall').addEventListener('click', () => { Object.assign(F, { q: '', month: '', cat: '', review: false, rec: '', split: '', limit: 300 }); render(); });
  $('#backrec')?.addEventListener('click', () => { closeCard(); view = 'recurring'; render(); });
  $('#cols').addEventListener('click', () => { showCols = !showCols; render(); });
  $('#editmode').addEventListener('change', e => setSetting('txnEdit', e.target.checked));
  const cp = $('#colpanel'); if (cp) cp.addEventListener('change', e => { const keys = [...cp.querySelectorAll('[data-col]')].filter(i => i.checked).map(i => i.dataset.col); setSetting('txnColumns', keys); });
  body();
}
function body() {
  const q = F.q.toLowerCase(), cols = txnCols(), edit = txnEdit();
  const rows = D.transactions.filter(t => (!F.month || t.date.startsWith(F.month)) && (!F.cat || t.cat === F.cat) && (!F.review || needsReview(t)) && (!F.rec || counted(t, F.rec) != null) && splitOk(t) &&
    (!q || [t.desc, t.notes, t.cat, t.rec, t.from, t.to, ...(t.parts || []).flatMap(p => [p.desc, p.rec])].some(x => String(x ?? '').toLowerCase().includes(q)))).sort(txnCmp());
  cardIds = rows.map(t => t.id);
  $('#tb').innerHTML = rows.slice(0, F.limit).map(t => `<tr data-id="${t.id}" class="${edit ? '' : 'row'}${needsReview(t) ? ' review' : ''}"${edit ? '' : ' tabindex="0"'}>`
    + cols.map(k => edit ? `<td>${TXN_COLS[k].edit(t)}</td>` : `<td class="t${TXN_COLS[k].num ? ' num' : ''}">${TXN_COLS[k].read(t)}</td>`).join('')
    + (F.rec ? countedCell(t) : '')
    + `<td class="c"><button class="x" data-act="open" title="Open">›</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 2}" class="t muted">Nothing matches.</td></tr>`;
  $('#sum').textContent = F.rec ? (() => { const cps = rows.map(t => countedParts(t, F.rec)), kept = round2(cps.reduce((a, c) => a + c.kept, 0)), nEx = cps.filter(c => c.cost !== c.kept).length; return `${rows.length} charge${rows.length === 1 ? '' : 's'} · ${money(kept)} counted${nEx ? ` · ${nEx} excluded` : ''}`; })() : `${rows.length} rows · net ${money(round2(rows.reduce((a, t) => a + (t.amt || 0), 0)))}`;
  $('#more').textContent = rows.length > F.limit ? `Showing ${F.limit} of ${rows.length} — click to show more` : '';
  if (cardId != null) updCardNav();
}
function onEdit(e) { // editing a cell in table-edit mode
  const el = e.target, f = el.dataset.f; if (!f) return; const id = +el.closest('tr').dataset.id; let v = el.value;
  if (f === 'date' && !v) return;
  if (f === 'amt') v = v === '' ? null : round2(+v);
  flash(el, commit(d => { const t = d.transactions.find(x => x.id === id); if (!t) throw new Error('That transaction no longer exists — reloaded.'); t[f] = v; if (f === 'rec') delete t.excluded; if (!(t.parts || []).length) { if (f === 'amt') resplit(d, t); } }, { redraw: false }));
  if (f === 'amt') el.className = 'num ' + (v < 0 ? 'neg' : 'pos');
}
async function addRow() {
  Object.assign(F, { q: '', month: '', cat: '', review: false, rec: '' });
  let id; await commit(d => { id = d.transactions.reduce((m, t) => Math.max(m, t.id), 0) + 1; d.transactions.push({ id, date: today(), desc: '', cat: '', amt: null, from: '', to: '', notes: '', work: '', rec: '' }); });
  cardNew = id; openCard(id); $('#drawer [data-f="desc"]')?.focus();
}

/* ───────── the transaction card (slide-in panel) ───────── */
function drawer() {
  let s = $('#scrim');
  if (!s) {
    s = document.createElement('div'); s.id = 'scrim'; s.className = 'scrim'; s.hidden = true; s.innerHTML = '<aside class="drawer" id="drawer"></aside>'; document.body.append(s);
    s.addEventListener('mousedown', e => { if (e.target === s) closeCard(); });
    $('#drawer').addEventListener('change', onCardEdit); $('#drawer').addEventListener('click', onCardClick);
    $('#drawer').addEventListener('keydown', e => { // Enter in the last line's amount saves it and starts the next line
      if (e.key !== 'Enter' || !e.target.matches('[data-f=pamt]') || e.target.value === '') return;
      const lines = $('#drawer').querySelectorAll('.line'); if (e.target.closest('.line') !== lines[lines.length - 1]) return;
      e.preventDefault(); e.target.blur(); $('#drawer [data-act=padd]')?.click();
    });
  }
  return s;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && cardId != null && !e.defaultPrevented) closeCard(); });
function openCard(id) { cardId = id; drawer().hidden = false; renderCard(); }
function closeCard() {
  closeCalc();
  if (cardId == null) return;
  document.activeElement?.blur?.(); // let a half-typed field save first
  const id = cardId, t = D?.transactions.find(x => x.id === id); cardId = null; $('#scrim').hidden = true;
  if (cardNew === id) { cardNew = null; if (t && !t.desc && t.amt == null && !(t.parts || []).length && !t.notes) commit(d => { d.transactions = d.transactions.filter(x => x.id !== id); }); } // an untouched new card leaves nothing behind
}
function remainder(t) { const rem = round2((t.amt || 0) - partsSum(t)), off = Math.abs(rem) > 0.004, over = off && rem * (Math.sign(t.amt) || -1) < 0; return { rem, off, over }; }
function restHtml(t) {
  const { rem, off, over } = remainder(t), ps = t.parts || [], inc = (t.amt || 0) > 0;
  if (!ps.length) return inc ? '<span class="muted">Match this payment to what you\'re owed: use a “Cover request” button, or add a line.</span>' : '<span class="muted">Split this charge into line items — e.g. rent, electric, water.</span>';
  const sh = ps.filter(p => p.split), owes = round2(sh.reduce((a, p) => a + (p.split.owes || 0), 0));
  const who = sh.length && !inc ? `<span class="muted">Owed to you <b>${money(owes)}</b> · You pay <b>${money(round2(Math.abs(t.amt || 0) - owes))}</b></span>` : '';
  return `<span class="${over ? 'neg' : 'muted'}">${off ? `${over ? 'Over by' : 'Unallocated'} <b>${money(over ? Math.abs(rem) : rem)}</b>` : 'Fully allocated ✓'}</span>${who ? ' · ' + who : ''}`;
}
function updCardNav() { const el = $('#cpos'); if (!el) return; const i = cardIds.indexOf(cardId); el.textContent = i < 0 ? '' : `${i + 1} of ${cardIds.length}`; $('#cprev').disabled = i <= 0; $('#cnext').disabled = i < 0 || i >= cardIds.length - 1; }
// split controls for a charge or one of its lines: No split / Split, both people's amounts, and the request state
function sumHtml(o, key, items) { // a split charge or line: both people's amounts (type either; a calculator beside each) and where the request stands
  const sp = o.split; if (!sp) return '';
  const base = Math.abs(o.amt || 0), it = (items || new Map(owedItems().map(i => [i.key, i]))).get(key), pid = +key.split(':')[1], pfx = pid ? 'p' : '';
  const act = it && it.out > 0.004 ? `<button class="btn ${it.requested ? 'ghost ' : ''}sm" data-act="sreq" data-key="${key}">${it.requested ? 'Clear request' : 'Mark requested'}</button>` : '';
  const field = (f, who, v, label) => `<span class="amt"><span class="who" title="${label}">${label}</span><input type="number" step="0.01" min="0" max="${base}" data-f="${pfx}${f}" class="num" value="${v}"><button type="button" class="calcbtn" data-act="calc" data-who="${who}" data-pid="${pid}" title="Calculator">${CALC_ICON}</button></span>`;
  return `<span class="manual">${field('share', 'them', sp.owes, esc(whoName(D, sp.who)))}${field('yours', 'you', round2(base - sp.owes), 'You')}</span> ${it ? statusHtml(it) : ''} ${act}`;
}
const splitSel = (t, p) => { // No split, or split with one of your people (or someone new)
  const o = p || t, pfx = p ? 'p' : '', cur = o.split ? o.split.who : null, ppl = peopleList();
  return `<select data-f="${pfx}split" title="Split this with someone"><option value="">No split</option>${ppl.map(x => `<option value="p${x.id}"${cur === x.id ? ' selected' : ''}>With ${esc(x.name)}</option>`).join('')}${cur != null && !ppl.some(x => x.id === cur) ? `<option value="p${cur}" selected>With ${esc(whoName(D, cur))}</option>` : ''}<option value="__new">With someone new…</option></select>`;
};
const splitSumEl = (t, p, items) => { const o = p || t, key = `${t.id}:${p ? p.id : 0}`; return `<span class="splitsum" data-sum="${key}">${sumHtml(o, key, items)}</span>`; };
function splitCtl(t, p, items) { return `<div class="splitrow">${splitSel(t, p)}${splitSumEl(t, p, items)}</div>`; }
function updSums() { // refresh the split summaries in an open card without rebuilding it (so typing isn't interrupted)
  const t = D.transactions.find(x => x.id === cardId); if (!t) return; const items = new Map(owedItems().map(i => [i.key, i]));
  document.querySelectorAll('#drawer [data-sum]').forEach(el => { if (el.contains(document.activeElement)) return; /* never replace a field being typed in */ const pid = +el.dataset.sum.split(':')[1], o = pid ? (t.parts || []).find(p => p.id === pid) : t; if (o) el.innerHTML = sumHtml(o, el.dataset.sum, items); });
}
// on an incoming payment: each line says which owed item it settles
function coverLine(t, p, items) {
  const cur = p.covers ? `${p.covers.tx}:${p.covers.part || 0}` : '', list = [...items.values()].filter(i => i.out > 0.004 || i.key === cur);
  return `<div class="line" data-pid="${p.id}"><input data-f="pdesc" value="${esc(p.desc)}" placeholder="What this covers…"><input type="number" step="0.01" data-f="pamt" class="num" value="${p.amt ?? ''}">
    <select data-f="pcover" title="Which owed item this settles"><option value="">Not matched to an owed item</option>${list.map(i => `<option value="${i.key}"${i.key === cur ? ' selected' : ''}>${peopleList().length > 1 ? esc(whoName(D, i.who)) + ' · ' : ''}${fmt(i.date)} · ${esc(i.desc)} — ${money(i.key === cur ? i.owes : i.out)} ${i.key === cur ? 'covered' : 'owed'}${i.requested ? ` (requested ${fmt(i.requested)})` : ''}</option>`).join('')}</select>
    <button class="x" data-act="pdel" title="Remove line">✕</button></div>`;
}
function coverButtons(t, items) { // one button per request that still has something owed
  const mine = new Set((t.parts || []).filter(p => p.covers).map(p => `${p.covers.tx}:${p.covers.part || 0}`)), by = {}, many = peopleList().length > 1;
  for (const i of items.values()) if (i.requested && i.out > 0.004 && !mine.has(i.key)) (by[`${i.requested}|${i.who}`] || (by[`${i.requested}|${i.who}`] = [])).push(i); // one request = one person on one day
  return Object.keys(by).sort().map(k => { const [dt, who] = k.split('|'); return `<button class="btn sm" data-act="coverreq" data-date="${dt}" data-who="${who}" title="Add a line for each item still owed from that request">Cover ${many ? esc(whoName(D, +who)) + '’s request' : 'request'} of ${fmt(dt)} · ${money(sumOf(by[k].map(i => i.out)))}</button>`; }).join('');
}
function renderCard() {
  const t = D.transactions.find(x => x.id === cardId); if (!t) return closeCard();
  const L = D.lists, names = D.recurring.map(r => r.name).filter(Boolean), ps = t.parts || [], a = document.activeElement, incoming = (t.amt || 0) > 0;
  const items = new Map(owedItems().map(i => [i.key, i]));
  const key = a && $('#drawer').contains(a) && a.dataset?.f ? [a.dataset.f, a.closest('.line')?.dataset.pid || ''] : null;
  const sel = (f, list, label) => `<label>${label}${comboHtml(f, f, t[f])}</label>`;
  const sug = suggestFor(t);
  const expLine = p => `<div class="line" data-pid="${p.id}"><input data-f="pdesc" value="${esc(p.desc)}" placeholder="Line item…"><input type="number" step="0.01" data-f="pamt" class="num" value="${p.amt ?? ''}">
      <div class="cell">${comboHtml('prec', 'rec', p.rec, ' title="Recurring item"')}${p.rec ? `<label class="mini" title="Leave this out of “${esc(p.rec)}” calculations (it stays in the history)"><input type="checkbox" data-f="pexcl"${p.excluded ? ' checked' : ''}> exclude</label>` : ''}</div>
      <div class="cell">${splitSel(t, p)}</div><div class="cell">${splitSumEl(t, p, items)}</div><button class="x" data-act="pdel" title="Remove line">✕</button></div>`;
  const table = !ps.length ? '' : incoming
    ? `<div class="lgrid cover"><div class="lhead"><span>Covers</span><span>Amount</span><span>Settles</span><span></span></div>${ps.map(p => coverLine(t, p, items)).join('')}</div>`
    : `<div class="lgrid"><div class="lhead"><span>Description</span><span>Amount</span><span>Recurring item</span><span>Split</span><span>Shares</span><span></span></div>${ps.map(expLine).join('')}</div>`;
  $('#drawer').innerHTML = `
  <div class="dh"><button class="btn ghost sm" id="cprev" data-act="prev" title="Previous">‹</button><button class="btn ghost sm" id="cnext" data-act="next" title="Next">›</button><span class="muted" id="cpos"></span><button class="x" data-act="close" style="margin-left:auto" title="Close (Esc)">✕</button></div>
  <div class="cgrid">
    <label class="span3">Description${comboHtml('desc', 'desc', t.desc)}</label>
    ${sug ? `<div class="span3 sugg">Looks like <b>${esc(sug.from.desc)}</b>: ${sug.fill.map(([k, v]) => `${esc(v)}`).join(' · ')} <button class="btn sm" data-act="suggest" title="Fill the empty fields from that transaction">Fill these in</button></div>` : ''}
    <label>Amount<input type="number" step="0.01" data-f="amt" value="${t.amt ?? ''}"></label>
    <label>Date<input type="date" data-f="date" value="${t.date}"></label>
    ${sel('cat', L.categories, 'Category')}
    ${sel('rec', names, 'Recurring item')}
    ${sel('from', L.accounts, 'From account')}
    ${sel('to', L.accounts, 'To account')}
    ${t.rec && !ps.length ? `<label class="row span2"><input type="checkbox" data-f="excluded"${t.excluded ? ' checked' : ''}> Exclude from “${esc(t.rec)}” calculations <span class="muted">(stays in the history)</span></label>` : ''}
    ${!incoming && !ps.length ? `<div class="splitwrap span3"><span class="lbl">Split with someone</span>${splitCtl(t, null, items)}</div>` : ''}
    <label class="span3">Notes<textarea data-f="notes" rows="2">${esc(t.notes)}</textarea></label>
  </div>
  <div class="lines"><div class="lh"><b>${incoming ? 'Covers' : 'Line items'}</b><span class="lbtns">${incoming ? coverButtons(t, items) : ''}<button class="btn ghost sm" data-act="padd">+ Add line</button></span></div>
    ${table}
    <div class="rest" id="crest">${restHtml(t)}</div><p class="muted small">${incoming ? 'Each line settles one thing you are owed. Nothing unallocated means this payment is fully matched.' : "Line items use this charge's category. Press Enter in the last amount to add another line."}</p></div>
  <div class="dfoot"><button class="btn ghost" data-act="del">Delete transaction</button></div>`;
  updCardNav();
  if (key) $(`#drawer ${key[1] ? `.line[data-pid="${key[1]}"] ` : ''}[data-f="${key[0]}"]`)?.focus();
}
/* ───────── helping you fill things in: type-to-search fields, and suggestions from similar past transactions ───────── */
/* ───────── dropdowns you can type in ─────────
   comboHtml() gives a field that shows a styled list: it narrows as you type, ↑ ↓ move, and Enter, Tab or a click takes the highlighted
   (top) match. Category / account / recurring item / group fields only accept something on the list (anything else goes back).
   A description is free text: its list holds earlier descriptions, and taking one also fills the empty details from that transaction. */
const comboList = k => k === 'cat' ? D.lists?.categories || [] : k === 'from' || k === 'to' ? D.lists?.accounts || [] : k === 'rec' ? D.recurring.map(r => r.name).filter(Boolean) : k === 'group' ? D.groups || [] : k === 'desc' ? recentDescs() : [];
const comboHtml = (f, kind, val, extra = '') => `<input data-f="${f}" data-combo="${kind}" autocomplete="off" spellcheck="false" value="${esc(val)}"${kind === 'desc' ? '' : ' placeholder="Type to search…"'}${extra}>`;
let cb = null; // the open list: { inp, items, at, typed, nav }
function cbPop() { let p = $('#cbpop'); if (!p) { p = document.createElement('div'); p.id = 'cbpop'; p.className = 'cbpop'; p.hidden = true; document.body.appendChild(p); } return p; }
function cbMatches(kind, q) { // starts-with first, then contains
  q = q.trim().toLowerCase(); const all = comboList(kind); if (!q) return kind === 'desc' ? [] : all.slice(0, 60);
  const a = [], b = []; for (const x of all) { const l = x.toLowerCase(); if (l === q && kind === 'desc') continue; if (l.startsWith(q)) a.push(x); else if (l.includes(q)) b.push(x); } return [...a, ...b].slice(0, 60);
}
function cbDraw() {
  const p = cbPop(); if (!cb || !cb.items.length) { p.hidden = true; return; }
  const q = cb.typed ? cb.inp.value.trim() : '', hl = x => { const i = q ? x.toLowerCase().indexOf(q.toLowerCase()) : -1; return i < 0 ? esc(x) : esc(x.slice(0, i)) + '<mark>' + esc(x.slice(i, i + q.length)) + '</mark>' + esc(x.slice(i + q.length)); };
  p.innerHTML = cb.items.map((x, i) => `<div class="cbi${i === cb.at ? ' on' : ''}" data-i="${i}">${hl(x)}</div>`).join('');
  const r = cb.inp.getBoundingClientRect(); p.hidden = false; p.style.minWidth = Math.max(160, r.width) + 'px';
  const h = Math.min(p.scrollHeight, 260), below = innerHeight - r.bottom;
  p.style.left = Math.max(6, Math.min(r.left, innerWidth - p.offsetWidth - 6)) + 'px'; p.style.top = (below < h + 12 && r.top > h + 12 ? r.top - h - 4 : r.bottom + 3) + 'px';
  p.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function cbOpen(inp, typed) { cb = { inp, typed, at: 0, nav: false, items: cbMatches(inp.dataset.combo, typed || inp.dataset.combo !== 'desc' ? (typed ? inp.value : '') : '') }; cbDraw(); }
function cbClose() { cb = null; const p = $('#cbpop'); if (p) p.hidden = true; }
function cbResolve(kind, v) { // strict lists: what was typed becomes the best match on the list ('' clears), or null if nothing fits
  v = v.trim(); if (!v) return ''; const all = comboList(kind), lo = v.toLowerCase();
  return all.find(x => x.toLowerCase() === lo) ?? cbMatches(kind, v)[0] ?? null;
}
function cbPick(inp, val) {
  inp.value = val; cbClose();
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  if (inp.dataset.combo === 'desc') autofillFrom(inp);
}
function autofillFrom(inp) { // took an earlier description: fill what's still empty from the latest transaction with that description
  const tr = inp.closest('tr[data-id]'), id = tr ? +tr.dataset.id : cardId, line = inp.closest('.line'); if (id == null || line) return;
  const want = inp.value.trim().toLowerCase(); if (!want) return;
  commit(d => {
    const x = d.transactions.find(t => t.id === id); if (!x) return;
    const m = d.transactions.filter(t => t.id !== id && String(t.desc || '').trim().toLowerCase() === want).sort((a, b) => (a.date < b.date ? 1 : -1))[0]; if (!m) return;
    for (const f of ['cat', 'rec', 'from', 'to']) if (!x[f] && m[f]) x[f] = m[f];
    if (!x.amt && m.amt) { x.amt = m.amt; if (m.split && !(x.parts || []).length && !x.split) x.split = { ...m.split }; delete x.split?.requested; } // same amount (and the same split) as last time
  });
}
document.addEventListener('focusin', e => { const inp = e.target.closest?.('[data-combo]'); if (!inp) return; inp.dataset.prev = inp.value; cbOpen(inp, false); });
document.addEventListener('input', e => { const inp = e.target.closest?.('[data-combo]'); if (inp) cbOpen(inp, true); });
document.addEventListener('focusout', e => { if (e.target.closest?.('[data-combo]')) setTimeout(() => { if (cb && document.activeElement !== cb.inp) cbClose(); }, 0); });
document.addEventListener('mousedown', e => { const it = e.target.closest?.('.cbi'); if (it && cb) { e.preventDefault(); cbPick(cb.inp, cb.items[+it.dataset.i]); } else if (!e.target.closest?.('[data-combo]')) cbClose(); });
document.addEventListener('keydown', e => {
  const inp = e.target.closest?.('[data-combo]'); if (!inp) return; const kind = inp.dataset.combo, free = kind === 'desc';
  if (!cb || cb.inp !== inp) { if (e.key === 'ArrowDown') { cbOpen(inp, false); e.preventDefault(); } return; }
  const n = cb.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!n) return; cb.at = (cb.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; cb.nav = true; cbDraw(); e.preventDefault(); }
  else if (e.key === 'Escape') { cbClose(); e.preventDefault(); e.stopPropagation(); }
  else if (e.key === 'Enter') { if (n && (!free || cb.nav)) { cbPick(inp, cb.items[cb.at]); e.preventDefault(); e.stopPropagation(); } else cbClose(); }
  else if (e.key === 'Tab' && !e.shiftKey && n && inp.value.trim() && (cb.typed || free)) { cbPick(inp, cb.items[cb.at]); } // Tab takes the top match, and moves on
}, true);
document.addEventListener('change', e => { // before anything saves it: a list field only keeps something that's on its list
  const inp = e.target.closest?.('[data-combo]'); if (!inp || inp.dataset.combo === 'desc') return;
  const r = cbResolve(inp.dataset.combo, inp.value);
  if (r == null) { e.stopImmediatePropagation(); inp.value = inp.dataset.prev ?? ''; setStatus(inp.dataset.combo === 'group' ? 'Pick one of your groups (add more with “Edit groups”)' : inp.dataset.combo === 'rec' ? 'Pick a recurring item from the list' : 'Pick one from the list (add new ones in Settings)', true); }
  else inp.value = r;
}, true);
window.addEventListener('resize', () => cbClose());

const descKey = x => String(x || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1).slice(0, 2).join(' ');
const recentDescs = () => { const seen = new Set(), out = []; for (const t of D.transactions.slice().sort((a, b) => (a.date < b.date ? 1 : -1))) { const d = (t.desc || '').trim(); if (d && !seen.has(d)) { seen.add(d); out.push(d); if (out.length >= 200) break; } } return out; };
function suggestFor(t) { // the most recent other transaction that starts the same way, and which of its details this one is missing
  const k = descKey(t.desc); if (!k) return null;
  const recent = D.transactions.filter(x => x.id !== t.id && (x.cat || x.rec)).sort((a, b) => (a.date < b.date ? 1 : -1)), first = k.split(' ')[0];
  const m = recent.find(x => descKey(x.desc) === k) || (first.length >= 4 ? recent.find(x => descKey(x.desc).split(' ')[0] === first) : null); if (!m) return null; // the same two words, else the same first word
  const fill = ['cat', 'rec', 'from', 'to'].filter(f => m[f] && !t[f]).map(f => [f, m[f]]);
  return fill.length ? { from: m, fill } : null;
}

/* ───────── a small calculator for a custom split ───────── */
const CALC_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="5" y="3.5" width="6" height="2.6" rx=".6" fill="currentColor"/><circle cx="5.8" cy="9" r=".9" fill="currentColor"/><circle cx="8" cy="9" r=".9" fill="currentColor"/><circle cx="10.2" cy="9" r=".9" fill="currentColor"/><circle cx="5.8" cy="11.7" r=".9" fill="currentColor"/><circle cx="8" cy="11.7" r=".9" fill="currentColor"/><circle cx="10.2" cy="11.7" r=".9" fill="currentColor"/></svg>';
function calcEval(src) { // + − × ÷ and brackets, nothing else (no eval)
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/[,\s$]/g, '');
  if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;
  let i = 0;
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const op = s[i++], r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/') { const op = s[i++], r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const factor = () => {
    if (s[i] === '-') { i++; return -factor(); } if (s[i] === '+') { i++; return factor(); }
    if (s[i] === '(') { i++; const v = expr(); if (s[i++] !== ')') throw 0; return v; }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]);
  };
  try { const v = expr(); return i === s.length && isFinite(v) ? v : null; } catch { return null; }
}
let calcState = null;
function closeCalc() { document.getElementById('calc')?.remove(); document.removeEventListener('keydown', calcKeys, true); document.removeEventListener('mousedown', calcOutside, true); calcState = null; }
const calcKeys = e => { // capture phase, so Esc closes just the calculator, not the card behind it
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCalc(); }
  else if (e.key === 'Enter' && e.target.id === 'calcx') { e.preventDefault(); e.stopPropagation(); applyCalc(); }
};
const calcOutside = e => { if (!e.target.closest('#calc') && !e.target.closest('[data-act=calc]')) closeCalc(); };
function calcPreview() {
  const x = $('#calcx'), r = $('#calcr'), { base, who, name } = calcState, v = calcEval(x.value);
  if (v == null) { r.innerHTML = '<span class="neg">Not a number yet</span>'; calcState.value = null; return; }
  const val = Math.min(base, Math.max(0, round2(v))); calcState.value = val;
  r.innerHTML = `= <b>${money(val)}</b> <span class="muted">· ${who === 'them' ? 'You' : esc(name)} ${money(round2(base - val))}${v < 0 || v > base ? ' (kept within the total)' : ''}</span>`;
}
function applyCalc() { if (!calcState || calcState.value == null) return; const { pid, who, value } = calcState; closeCalc(); setShare(pid, who, value); }
function openCalc(btn) {
  closeCalc(); const pid = +btn.dataset.pid, who = btn.dataset.who, t = D.transactions.find(x => x.id === cardId), o = pid ? (t?.parts || []).find(p => p.id === pid) : t;
  if (!o || !o.split) return; const base = Math.abs(o.amt || 0), cur = who === 'them' ? o.split.owes : round2(base - o.split.owes);
  calcState = { pid, who, base, value: cur, name: whoName(D, o.split.who) };
  const el = document.createElement('div'); el.id = 'calc'; el.className = 'calc';
  el.innerHTML = `<div class="calc-t"><b>${who === 'them' ? esc(calcState.name) : 'You'}</b> <span class="muted">of ${money(base)}</span></div>
    <input id="calcx" value="${cur}" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Amount or expression">
    <div class="calc-r" id="calcr"></div>
    <div class="calc-k">${['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '⌫', '+'].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
    <div class="calc-a"><button type="button" class="btn ghost sm" data-k="C">Clear</button><button type="button" class="btn sm" data-k="=">Apply</button></div>
    <div class="calc-h">Starts at the current amount — just add to it, like <b>+75</b>.</div>`;
  document.body.append(el);
  const rc = btn.getBoundingClientRect(), w = 236, h = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, rc.left - 8)) + 'px';
  el.style.top = (rc.bottom + 6 + h > innerHeight - 8 ? Math.max(8, rc.top - h - 6) : rc.bottom + 6) + 'px';
  el.addEventListener('click', e => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return; const x = $('#calcx');
    if (k === '=') return applyCalc(); if (k === 'C') x.value = ''; else if (k === '⌫') x.value = x.value.slice(0, -1); else x.value += k;
    calcPreview(); x.focus();
  });
  $('#calcx').addEventListener('input', calcPreview);
  document.addEventListener('keydown', calcKeys, true); document.addEventListener('mousedown', calcOutside, true);
  calcPreview(); const x = $('#calcx'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); // cursor at the end, ready for "+75"
}
function setShare(pid, who, value) { // one person's amount is set; the other becomes the rest
  commit(d => {
    const t = d.transactions.find(x => x.id === cardId); if (!t) throw new Error('That transaction no longer exists — reloaded.');
    const o = pid ? (t.parts || []).find(p => p.id === pid) : t; if (!o || !o.split) return;
    const base = Math.abs(o.amt || 0), val = Math.min(base, Math.max(0, round2(value)));
    o.split = { owes: who === 'them' ? val : round2(base - val), who: o.split.who, ...(o.split.requested ? { requested: o.split.requested } : {}) };
  });
}
function onSplitEdit(el, f) { // the split menu (who), either person's typed amount, and which owed item a payment line covers
  const id = cardId, line = el.closest('.line'), pid = line ? +line.dataset.pid : 0, v = el.value; let newName = '';
  if ((f === 'split' || f === 'psplit') && v === '__new') { newName = (prompt('Who are you splitting this with? (a name, e.g. Alex)') || '').trim(); if (!newName) return renderCard(); }
  commit(d => {
    const t = d.transactions.find(x => x.id === id); if (!t) throw new Error('That transaction no longer exists — reloaded.');
    const o = pid ? (t.parts || []).find(p => p.id === pid) : t; if (!o) throw new Error('That line no longer exists — reloaded.');
    const base = Math.abs(o.amt || 0), keep = o.split?.requested ? { requested: o.split.requested } : {};
    if (f === 'split' || f === 'psplit') {
      if (v === '') delete o.split;
      else {
        let who; if (v === '__new') { d.people = d.people || []; who = d.people.reduce((m, p) => Math.max(m, p.id), 0) + 1; d.people.push({ id: who, name: newName }); } else who = +v.slice(1);
        o.split = o.split ? { ...o.split, who } : newSplit(base, null, who); // a new split starts 50/50
      }
    } else if (['share', 'pshare', 'yours', 'pyours'].includes(f)) { // type either person's amount; the other becomes the rest
      if (o.split) { const val = Math.min(base, round2(Math.abs(+v) || 0)); o.split = { owes: f.endsWith('yours') ? round2(base - val) : val, who: o.split.who, ...keep }; }
    } else if (f === 'pcover') {
      if (!v) delete o.covers;
      else { const [tx, part] = v.split(':').map(Number); o.covers = { tx, part: part || null }; const it = owedItems().find(i => i.key === v); if (it && !o.amt) { o.amt = it.out; if (!o.desc) o.desc = it.desc; } } // a new line starts at what's still owed
    }
  });
}
function onCardEdit(e) {
  const el = e.target, f = el.dataset.f; if (!f) return;
  if (['split', 'psplit', 'share', 'pshare', 'yours', 'pyours', 'pcover'].includes(f)) return onSplitEdit(el, f);
  const id = cardId, line = el.closest('.line'); let v = el.value, wasIncoming = (D.transactions.find(x => x.id === id)?.amt || 0) > 0;
  const refresh = () => { if ($('#tb')) body(); const t = D.transactions.find(x => x.id === id); if (t && $('#crest')) $('#crest').innerHTML = restHtml(t); updSums(); if (f === 'rec' || f === 'prec' || f === 'desc' || f === 'cat' || f === 'from' || f === 'to' || (f === 'amt' && t && ((t.amt || 0) > 0) !== wasIncoming)) renderCard(); }; // an amount that turns a charge into a payment (or back) changes the whole card // update the list behind, the remainder and the split summaries, but never rebuild the card mid-typing
  if (line) {
    const pid = +line.dataset.pid, key = { pdesc: 'desc', pamt: 'amt', prec: 'rec', pexcl: 'excluded' }[f], sign = Math.sign(D.transactions.find(x => x.id === id)?.amt) || -1;
    if (f === 'pexcl') v = el.checked;
    if (f === 'pamt') { v = v === '' ? null : sign * Math.abs(round2(+v)); el.value = v ?? ''; } // same sign as the charge, so you can just type 118.20
    flash(el, commit(d => {
      const p = (d.transactions.find(x => x.id === id)?.parts || []).find(x => x.id === pid); if (!p) throw new Error('That line no longer exists — reloaded.');
      if (key === 'excluded') { if (v) p.excluded = true; else delete p.excluded; } else { p[key] = v; if (key === 'rec') delete p.excluded; if (key === 'amt') resplit(d, p); }
    }, { redraw: false }).then(refresh));
    return;
  }
  if (f === 'date' && !v) return;
  if (f === 'amt') v = v === '' ? null : round2(+v);
  flash(el, commit(d => {
    const t = d.transactions.find(x => x.id === id); if (!t) throw new Error('That transaction no longer exists — reloaded.');
    if (f === 'excluded') { if (el.checked) t.excluded = true; else delete t.excluded; }
    else { t[f] = v; if (f === 'rec') delete t.excluded; if (!(t.parts || []).length) { if (f === 'amt') resplit(d, t); } }
  }, { redraw: false }).then(refresh));
}
async function onCardClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, id = cardId, t = D.transactions.find(x => x.id === id);
  if (act === 'close') closeCard();
  else if (act === 'suggest') { const sg = t && suggestFor(t); if (sg) commit(d => { const x = d.transactions.find(q => q.id === id); if (x) for (const [k, v] of sg.fill) if (!x[k]) x[k] = v; }); }
  else if (act === 'calc') openCalc(b);
  else if (act === 'prev' || act === 'next') { const i = cardIds.indexOf(id), j = act === 'prev' ? i - 1 : i + 1; if (cardIds[j] != null) { document.activeElement?.blur?.(); cardNew = null; openCard(cardIds[j]); } }
  else if (act === 'padd') {
    let pid; await commit(d => { const x = d.transactions.find(q => q.id === id); if (!x) throw new Error('That transaction no longer exists — reloaded.'); x.parts ??= []; if (!x.parts.length) delete x.split; /* once it has lines, they carry the split */ pid = x.parts.reduce((m, p) => Math.max(m, p.id), 0) + 1; x.parts.push({ id: pid, desc: '', amt: null, rec: '' }); });
    $(`#drawer .line[data-pid="${pid}"] [data-f="pdesc"]`)?.focus();
  } else if (act === 'pdel') {
    const pid = +b.closest('.line').dataset.pid;
    commit(d => { const x = d.transactions.find(q => q.id === id); if (!x) return; x.parts = (x.parts || []).filter(p => p.id !== pid); if (!x.parts.length) delete x.parts; });
  } else if (act === 'sreq') { // mark an owed item requested (today) or clear that
    const k = b.dataset.key; commit(() => { const i = owedItems().find(x => x.key === k); if (i) { if (i.o.split.requested) delete i.o.split.requested; else i.o.split.requested = today(); } });
  } else if (act === 'coverreq') { // add a line for each item still owed from one request
    const date = b.dataset.date, who = b.dataset.who;
    commit(d => {
      const x = d.transactions.find(q => q.id === id); if (!x) throw new Error('That transaction no longer exists — reloaded.');
      x.parts ??= []; let pid = x.parts.reduce((m, p) => Math.max(m, p.id), 0); const mine = new Set(x.parts.filter(p => p.covers).map(p => `${p.covers.tx}:${p.covers.part || 0}`));
      for (const i of owedItems()) if (i.requested === date && String(i.who) === who && i.out > 0.004 && !mine.has(i.key)) x.parts.push({ id: ++pid, desc: i.desc, amt: i.out, rec: '', covers: { tx: i.tx, part: i.part || null } });
    });
  } else if (act === 'del') {
    if (confirm(`Delete "${t.desc || 'this transaction'}"${(t.parts || []).length ? ' and its line items' : ''}?`)) { cardNew = null; closeCard(); commit(d => { d.transactions = d.transactions.filter(x => x.id !== id); }); }
  }
}
// recurring-item tags live on transactions and on their line items
const retag = (d, from, to) => { if (!from) return; /* a blank name means 'no tag' — never rename that */ for (const t of d.transactions) { if (t.rec === from) t.rec = to; for (const p of t.parts || []) if (p.rec === from) p.rec = to; } };
const tagCount = name => D.transactions.reduce((a, t) => a + (t.rec === name ? 1 : 0) + (t.parts || []).filter(p => p.rec === name).length, 0);

/* ───────── splits with other people: what's owed to you, requests, and the payments that cover them ─────────
   people:       d.people = [{ id, name }] — whoever you split things with (a roommate, a parent, a friend…)
   a split:      o.split = { owes, who, even?, requested? } on a transaction (no lines) or on a line — `owes` is that person's share, `who` is their id; you pay the rest.
                 It starts 50/50 (`even`: it follows the amount if that changes); typing or calculating either amount makes it your own number.
   a payment:    an incoming transaction whose lines each carry  covers: { tx, part }  (which owed item it settles) */
const peopleList = () => D.people || [];
const whoName = (d, id) => (d.people || []).find(p => p.id === id)?.name || 'Them';
const halfOf = base => Math.floor(Math.abs(base || 0) * 50 + 1e-7) / 100; // 50/50, their half rounded down to the cent so any stray half cent is yours
const newSplit = (base, prev, who) => ({ owes: halfOf(base), who, even: true, ...(prev?.requested ? { requested: prev.requested } : {}) });
const resplit = (d, o) => { // the amount changed: an untouched 50/50 stays 50/50; a split you adjusted keeps your number (capped at the new total)
  const s = o.split; if (!s) return; const base = Math.abs(o.amt || 0);
  s.owes = s.even ? halfOf(base) : Math.min(s.owes || 0, base);
};
function owedItems() { // everything owed to you: one per split charge or split line, with what's been paid against it
  const covered = {}, items = [];
  for (const t of D.transactions) for (const p of t.parts || []) if (p.covers) { const k = `${p.covers.tx}:${p.covers.part || 0}`; covered[k] = round2((covered[k] || 0) + (p.amt || 0)); }
  const mkItem = (t, p) => {
    const o = p || t, sp = o.split, k = `${t.id}:${p ? p.id : 0}`, paid = covered[k] || 0;
    return { key: k, tx: t.id, part: p ? p.id : 0, o, who: sp.who, date: t.date, desc: (p && p.desc) || t.desc || '(no description)', parent: t.desc, total: Math.abs(o.amt || 0), owes: sp.owes || 0, requested: sp.requested || '', paid, out: round2(Math.max(0, (sp.owes || 0) - paid)) };
  };
  for (const t of D.transactions) {
    if ((t.parts || []).length) { for (const p of t.parts) if (p.split && (p.amt || 0) < 0 && p.split.owes > 0.004) items.push(mkItem(t, p)); }
    else if (t.split && (t.amt || 0) < 0 && t.split.owes > 0.004) items.push(mkItem(t, null));
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.tx - b.tx) || (a.part - b.part)));
}
const itemStatus = i => i.out <= 0.004 ? 'paid' : i.paid > 0.004 ? 'partial' : i.requested ? 'requested' : 'open';
const statusHtml = i => { const s = itemStatus(i); return s === 'paid' ? '<span class="st st-paid">Paid ✓</span>' : s === 'partial' ? `<span class="st st-part">Partial · ${money(i.paid)} of ${money(i.owes)}</span>` : s === 'requested' ? `<span class="st st-req">Requested ${fmt(i.requested)}</span>` : '<span class="st st-open">Not requested</span>'; };
const monthName = m => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
function requestText(its) { // an itemized message you can paste into whatever you use to ask
  const months = [...new Set(its.map(i => i.date.slice(0, 7)))].sort(), head = months.length === 1 ? `Here's what you owe for ${monthName(months[0])}:` : "Here's what you owe:";
  return [head, ...its.map(i => `${i.desc}${months.length > 1 ? ` (${fmt(i.date)})` : ''}: ${money(i.out)}`), `Total: ${money(round2(its.reduce((a, i) => a + i.out, 0)))}`].join('\n');
}
async function copyText(txt) { try { await navigator.clipboard.writeText(txt); setStatus('Message copied ✓'); } catch { prompt('Copy this message:', txt); } }
const markRequested = keys => commit(() => { for (const i of owedItems()) if (keys.includes(i.key) && !i.o.split.requested) i.o.split.requested = today(); });

/* ───────── the "Owed to me" tab ───────── */
const PAY_APPS = /venmo|zelle|cash ?app|paypal|apple cash/i; // common person-to-person payment apps, used only to suggest which incoming transactions might be a payback
let owedPop = null, showPeople = false, showSettled = (() => { try { return localStorage.getItem('owed-settled') === '1'; } catch { return false; } })(), personFilter = (() => { try { const v = localStorage.getItem('owed-who'); return v && v !== 'all' ? +v : 'all'; } catch { return 'all'; } })();
function vOwed() {
  const all = owedItems(), ids = [...new Set([...peopleList().map(p => p.id), ...all.map(i => i.who)])];
  personFilter = 'all'; // (each person has their own card now)
  const items = personFilter === 'all' ? all : all.filter(i => i.who === personFilter), shownIds = personFilter === 'all' ? ids : [personFilter];
  const open = items.filter(i => itemStatus(i) === 'open'), asked = items.filter(i => ['requested', 'partial'].includes(itemStatus(i)));
  const owed = sumOf(items.map(i => i.owes)), paid = sumOf(items.map(i => Math.min(i.paid, i.owes))), outstanding = round2(owed - paid);
  const hints = sumOf(all.map(i => i.out)) > 0.004 ? D.transactions.filter(t => (t.amt || 0) > 0 && (PAY_APPS.test(t.from) || PAY_APPS.test(t.desc)) && !(t.parts || []).some(p => p.covers)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5) : [];
  const byKey = new Map(all.map(i => [i.key, i])), payers = t => [...new Set(t.parts.filter(p => p.covers).map(p => byKey.get(`${p.covers.tx}:${p.covers.part || 0}`)?.who).filter(w => w != null))];
  const allPays = D.transactions.filter(t => (t.parts || []).some(p => p.covers) && (personFilter === 'all' || payers(t).includes(personFilter))).sort((a, b) => (a.date < b.date ? 1 : -1)), pays = showSettled ? allPays : allPays.slice(0, 5);
  const row = i => `<tr data-key="${i.key}"><td class="t">${fmt(i.date)}</td><td class="t link" data-open="${i.tx}" title="${esc(i.parent)} — open">${esc(i.desc)}</td><td class="t num">${money(i.total)}</td><td class="t num"><b>${money(i.owes)}</b></td><td class="t">${statusHtml(i)}</td>
    <td class="c">${i.out > 0.004 ? (i.requested ? '<button class="btn ghost sm" data-act="unreq">Clear request</button>' : '<button class="btn sm" data-act="req">Request</button>') : ''}</td></tr>`;
  const section = (m, mine) => {
    const whole = mine.filter(i => i.date.startsWith(m)), its = showSettled ? whole : whole.filter(i => i.out > 0.004), o = sumOf(whole.map(i => i.owes)), p = sumOf(whole.map(i => Math.min(i.paid, i.owes))), un = whole.filter(i => itemStatus(i) === 'open'), out = whole.filter(i => i.out > 0.004);
    return `<div class="rmsec" data-m="${m}"><div class="rmh"><h3>${monthName(m)}</h3><span class="muted">Owed <b>${money(o)}</b> · Paid <b>${money(p)}</b> · Outstanding <b>${money(round2(o - p))}</b></span>
      ${un.length ? `<button class="btn sm" data-act="reqmonth">Request this month (${un.length})</button>` : ''}${out.length ? '<button class="btn ghost sm" data-act="copymonth">Copy message</button>' : ''}</div>
      <div class="wrap"><table class="plain"><thead><tr><th>Date</th><th>Item</th><th class="r">Total</th><th class="r">Owes you</th><th>Status</th><th></th></tr></thead><tbody>${its.map(row).join('')}</tbody></table></div></div>`;
  };
  const stLine = (np, aw, p) => `${np > 0.004 ? `<span class="st st-open">${money(np)} not requested</span>` : ''}${aw > 0.004 ? `<span class="st st-req">${money(aw)} awaiting payment</span>` : ''}${p > 0.004 ? `<span class="muted">${money(p)} paid back</span>` : ''}`;
  const stats = id => { const mine = items.filter(i => i.who === id), live = mine.filter(i => i.out > 0.004), un = mine.filter(i => itemStatus(i) === 'open');
    return { mine, live, un, out: sumOf(live.map(i => i.out)), np: sumOf(un.map(i => i.out)), aw: sumOf(mine.filter(i => ['requested', 'partial'].includes(itemStatus(i))).map(i => i.out)), p: sumOf(mine.map(i => Math.min(i.paid, i.owes))) }; };
  const block = id => { // one card per person: what they owe, where it stands, and the actions; "Show items" pops their items out
    const { live, un, out, np, aw, p } = stats(id);
    return `<section class="pblock pcard" data-who="${id}">
      <div class="pc-top" data-act="pshow" title="Show the items"><div><h2>${esc(whoName(D, id))}</h2><span class="muted">${live.length ? `${live.length} item${live.length === 1 ? '' : 's'} owed` : 'All settled ✓'}</span></div><div class="pc-amt"><b class="${out > 0.004 ? '' : 'muted'}">${money(out)}</b><span>owes you</span></div></div>
      <div class="pc-st">${stLine(np, aw, p)}</div>
      <div class="pc-btns">${un.length ? `<button class="btn sm" data-act="reqperson">Request all (${un.length})</button>` : ''}${live.length ? '<button class="btn ghost sm" data-act="copyperson">Copy message</button>' : ''}<button class="btn ghost sm" data-act="pshow">Show items</button></div></section>`;
  };
  const popup = id => { // the pop-out: everything for one person, by month
    const { mine, live, un, out, np, aw, p } = stats(id), months = [...new Set(mine.filter(i => showSettled || i.out > 0.004).map(i => i.date.slice(0, 7)))].sort().reverse();
    return `<div class="opscrim" id="opscrim"><div class="oppop pblock" data-who="${id}">
      <div class="oph"><div><h2>${esc(whoName(D, id))}</h2><div class="pc-st">${stLine(np, aw, p)}</div></div><div class="pc-amt"><b class="${out > 0.004 ? '' : 'muted'}">${money(out)}</b><span>owes you</span></div><button class="x" data-act="pclose" title="Close (Esc)">✕</button></div>
      <div class="pc-btns">${un.length ? `<button class="btn sm" data-act="reqperson">Request all (${un.length})</button>` : ''}${live.length ? '<button class="btn ghost sm" data-act="copyperson">Copy message</button>' : ''}</div>
      ${months.map(m => section(m, mine)).join('') || `<p class="muted">${mine.length ? 'Nothing outstanding. Tick “Show settled” to see what has been paid.' : 'Nothing split with them yet.'}</p>`}</div></div>`;
  };
  const blocks = shownIds.filter(id => showSettled || items.some(i => i.who === id && i.out > 0.004));
  const peoplePanel = showPeople ? `<div class="panel" id="ppanel"><b>People</b> <span class="muted">— whoever you split things with</span>
    ${peopleList().map(p => `<div class="rrow" data-person="${p.id}"><input data-pn value="${esc(p.name)}" placeholder="Name"><button class="x" data-act="delperson" title="Remove this person">✕</button></div>`).join('')}
    <form class="rrow" id="pnew"><input name="n" placeholder="Add a person…" required><button class="btn sm">Add</button></form></div>` : '';
  $('#view').innerHTML = `<div id="rm">
  <div class="cards"><div><b>${money(outstanding)}</b><span>owed to you${personFilter === 'all' ? '' : ` by ${esc(whoName(D, personFilter))}`}</span></div><div><b>${money(sumOf(open.map(i => i.out)))}</b><span>not yet requested</span></div><div><b>${money(sumOf(asked.map(i => i.out)))}</b><span>requested, awaiting payment</span></div><div><b>${money(paid)}</b><span>paid back so far</span></div></div>
  <div class="bar"><label title="Also show items that are fully paid back"><input id="settled" type="checkbox"${showSettled ? ' checked' : ''}> Show settled</label><button class="btn ghost" id="people">${showPeople ? 'Hide people' : 'People'}</button></div>
  ${peoplePanel}
  ${hints.length ? `<div class="panel hint"><b>Incoming payments that aren't matched to anything yet</b>${hints.map(t => `<div class="grow"><span>${fmt(t.date)} · ${esc(t.desc.slice(0, 40))} · <b>${money(t.amt)}</b></span><button class="btn ghost sm" data-open="${t.id}">Match it…</button></div>`).join('')}</div>` : ''}
  ${blocks.length ? `<div class="pcards">${blocks.map(block).join('')}</div>` : shownIds.length ? '<p class="muted">Nothing outstanding — everyone has paid you back. Tick <b>Show settled</b> to see the history.</p>' : '<div class="card"><h2>Nothing split yet</h2><p>Open a transaction (or one of its line items) and choose <b>With someone new…</b> in the split menu. What each person owes you will collect here.</p></div>'}
  ${pays.length ? `<h2>Payments received</h2><div class="wrap"><table class="plain pays"><thead><tr><th>Date</th><th>From</th><th>Payment</th><th class="r">Amount</th><th>Covers</th></tr></thead><tbody>${pays.map(t => `<tr><td class="t">${fmt(t.date)}</td><td class="t">${payers(t).map(w => esc(whoName(D, w))).join(', ')}</td><td class="t link" data-open="${t.id}">${esc(t.desc)}</td><td class="t num">${money(t.amt)}</td><td class="t cov">${t.parts.filter(p => p.covers).map(p => { const i = byKey.get(`${p.covers.tx}:${p.covers.part || 0}`); return `${esc(i ? i.desc : p.desc || 'an item')} ${money(p.amt)}`; }).join(' · ')}</td></tr>`).join('')}</tbody></table></div>${allPays.length > pays.length ? `<p class="muted small">${allPays.length - pays.length} earlier — tick <b>Show settled</b> to see them all.</p>` : ''}` : ''}${owedPop != null && ids.includes(owedPop) ? popup(owedPop) : ''}</div>`;

  const v = $('#rm'); // a fresh element each draw, so handlers never pile up
  const setFilter = f => { personFilter = f; try { localStorage.setItem('owed-who', String(f)); } catch {} render(); };
  v.addEventListener('click', e => {
    if (e.target.id === 'opscrim') { owedPop = null; return render(); }
    const pf = e.target.closest('[data-pf]'); if (pf) return setFilter(pf.dataset.pf === 'all' ? 'all' : +pf.dataset.pf);
    const op = e.target.closest('[data-open]'); if (op) return openCard(+op.dataset.open);
    const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, tr = b.closest('tr'), sec = b.closest('.rmsec'), blk = b.closest('.pblock'), who = blk ? +blk.dataset.who : null;
    const mineOf = () => all.filter(i => i.who === who);
    if (act === 'pshow') { owedPop = who; return render(); }
    if (act === 'pclose') { owedPop = null; return render(); }
    if (act === 'req' || act === 'unreq') { const k = tr.dataset.key; if (act === 'req') markRequested([k]); else commit(() => { const i = owedItems().find(x => x.key === k); if (i) delete i.o.split.requested; }); }
    else if (act === 'reqmonth') { const its = mineOf().filter(i => i.date.startsWith(sec.dataset.m) && itemStatus(i) === 'open'); markRequested(its.map(i => i.key)).then(() => copyText(requestText(its))); }
    else if (act === 'copymonth') copyText(requestText(mineOf().filter(i => i.date.startsWith(sec.dataset.m) && i.out > 0.004)));
    else if (act === 'reqperson') { const its = mineOf().filter(i => itemStatus(i) === 'open'); markRequested(its.map(i => i.key)).then(() => copyText(requestText(its))); }
    else if (act === 'copyperson') copyText(requestText(mineOf().filter(i => i.out > 0.004)));
    else if (act === 'delperson') { const id = +b.closest('.rrow').dataset.person; if (all.some(i => i.who === id)) return setStatus('They still have splits — clear those first', true); if (confirm(`Remove ${whoName(D, id)}?`)) commit(d => { d.people = d.people.filter(p => p.id !== id); }); }
  });
  $('#people').addEventListener('click', () => { showPeople = !showPeople; render(); });
  $('#settled').addEventListener('change', e => { showSettled = e.target.checked; try { localStorage.setItem('owed-settled', showSettled ? '1' : '0'); } catch {} render(); });
  const pp = $('#ppanel');
  if (pp) {
    pp.addEventListener('change', e => { if (!e.target.matches('[data-pn]')) return; const id = +e.target.closest('.rrow').dataset.person, name = e.target.value.trim(); commit(d => { if (!name) throw new Error('A person needs a name.'); const p = d.people.find(x => x.id === id); if (!p) throw new Error('That person no longer exists — reloaded.'); p.name = name; }); });
    $('#pnew').addEventListener('submit', e => { e.preventDefault(); const n = e.target.n.value.trim(); if (n) commit(d => { (d.people || (d.people = [])).push({ id: d.people.reduce((m, p) => Math.max(m, p.id), 0) + 1, name: n }); }); });
  }
}

/* ───────── recurring: what you pay each month, worked out from the charges linked to each item ───────── */
const nextYearly = (month, day) => { const T = today(), y = +T.slice(0, 4), d = mk(y, month, day); return d >= T ? d : mk(y + 1, month, day); };
const nextOf = i => (i.isYearly ? (i.month && i.day ? nextYearly(i.month, i.day) : '') : i.day ? nextCharge(i.day) : '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nextCharge = day => { const T = today(), y = +T.slice(0, 4), m = +T.slice(5, 7), d = mk(y, m, day); return d >= T ? d : mk(y, m + 1, day); };
const sumOf = a => round2(a.reduce((s, x) => s + (x || 0), 0));
function chargesByItem() { // { itemName: [{ date, cost, owes, mine, excluded }, …] newest first }. cost = the full charge, owes = the other person's share of it, mine = cost − owes. A charge with line items counts through its lines only, so nothing is counted twice
  const out = {}, add = (name, date, cost, excluded, owes) => { if (name) (out[name] || (out[name] = [])).push({ date, cost, owes: owes || 0, mine: round2(cost - (owes || 0)), excluded: !!excluded }); };
  for (const t of D.transactions) { if ((t.parts || []).length) for (const p of t.parts) add(p.rec, t.date, -(p.amt || 0), p.excluded, p.split?.owes); else add(t.rec, t.date, -(t.amt || 0), t.excluded, t.split?.owes); }
  for (const k in out) out[k].sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}
const viewField = () => (D.settings?.recView === 'full' ? 'cost' : 'mine'); // Recurring and Trends show your share unless you pick the full amount
const rviewSel = () => `<label>Show <select id="rview"><option value="mine"${viewField() === 'mine' ? ' selected' : ''}>My share</option><option value="full"${viewField() === 'cost' ? ' selected' : ''}>Full amount</option></select></label>`;
function actualsByItem(ch = chargesByItem(), keptOnly = false, field = 'cost') { // { itemName: { 'YYYY-MM': amount } } — keptOnly leaves out charges you excluded from the calculations
  const out = {};
  for (const [name, list] of Object.entries(ch)) for (const c of list) { if (keptOnly && c.excluded) continue; const o = out[name] || (out[name] = {}), m = c.date.slice(0, 7); o[m] = round2((o[m] || 0) + c[field]); }
  return out;
}
// an item's monthly cost = the average of its last 3 months of linked charges ("variable" when those months differ); its day comes from you, or from its last charge
function derive(r, ch, only) { // only = 'mine' | 'cost' to ignore the Show setting
  const all = ch[r.name] || [], list = all.filter(c => !c.excluded), excluded = all.length - list.length, field = only || viewField();
  const avg3 = f => { const m = {}; for (const c of list) { const k = c.date.slice(0, 7); m[k] = round2((m[k] || 0) + c[f]); } const v = Object.keys(m).sort().slice(-3).map(k => m[k]); return { avg: v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null, varies: v.length > 1 && v.some(x => Math.abs(x - v[0]) > 0.005), months: Object.keys(m).length }; };
  const yearly = r.period === 'year', yr = f => { const d = list[0]?.date; return d ? round2(list.filter(c => c.date === d).reduce((x, c) => x + c[f], 0)) : null; }; // a yearly item: its latest charge, shown as a monthly share (÷ 12)
  const mo12 = f => (yr(f) == null ? null : round2(yr(f) / 12));
  const shown = yearly ? { avg: mo12(field), varies: false, months: list.length ? 1 : 0 } : avg3(field), full = yearly ? { avg: mo12('cost') } : avg3('cost'), lastDay = list[0]?.date;
  const last = lastDay ? { date: lastDay, cost: round2(list.filter(c => c.date === lastDay).reduce((x, c) => x + c[field], 0)) } : null; // everything charged on the newest day (a split charge's lines add up)
  return { monthly: shown.avg, full: full.avg, shared: shown.avg != null && full.avg != null && Math.abs(full.avg - shown.avg) > 0.004, last, variable: shown.varies, day: r.dueDay || (lastDay ? +lastDay.slice(8, 10) : null), guessed: !r.dueDay && !!lastDay, months: shown.months, excluded,
    isYearly: yearly, yearly: yearly ? yr(field) : null, yearlyFull: yearly ? yr('cost') : null, month: yearly ? r.dueMonth || (lastDay ? +lastDay.slice(5, 7) : null) : null, guessedMonth: yearly && !r.dueMonth && !!lastDay };
}
let collapsed = {}; try { collapsed = JSON.parse(localStorage.getItem('rec-collapsed')) || {}; } catch {}
const isCollapsed = key => collapsed[key] ?? (key === '#inactive'); // inactive items start folded away
let showGroups = false;

function showCharges(r) { // jump to Transactions, filtered to what's counted toward this item
  if (!r || !r.name) return;
  Object.assign(F, { q: '', month: '', cat: '', review: false, rec: r.name, split: '', limit: 300 }); closeCard(); view = 'transactions'; render(); scrollTo(0, 0);
}
const safeUrl = u => { u = String(u || '').trim(); if (!u) return ''; if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u; try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } }; // only web links
function recRow(r, i) {
  return `<tr data-id="${r.id}"${r.active ? '' : ' class="dim"'}>
    <td>${i.isYearly ? `<div class="linkcell"><select data-f="dueMonth" title="The month it's charged each year (grey = guessed from the last charge)" class="${r.dueMonth ? '' : 'guess'}"><option value="">${i.guessedMonth ? MONTHS[i.month - 1] : ''}</option>${MONTHS.map((m, n) => `<option value="${n + 1}"${r.dueMonth === n + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select><input type="number" min="1" max="31" data-f="dueDay" class="num" value="${r.dueDay ?? ''}" placeholder="${i.guessed ? i.day : ''}" title="Day of the month it's charged. Grey = guessed from the last charge."></div>` : `<input type="number" min="1" max="31" data-f="dueDay" class="num" value="${r.dueDay ?? ''}" placeholder="${i.guessed ? i.day : ''}" title="Day of the month it's charged. Grey = guessed from the last charge.">`}</td>
    <td><input data-f="name" value="${esc(r.name)}" title="${esc(r.name)}"></td>
    <td>${comboHtml('group', 'group', r.group)}</td>
    <td><select data-f="period" title="How often it's charged"><option value=""${r.period ? '' : ' selected'}>Monthly</option><option value="year"${r.period === 'year' ? ' selected' : ''}>Yearly</option></select></td>
    <td class="t num">${i.monthly == null ? `<span class="muted" title="Tag a transaction or line item with this item and its amount appears here">${i.excluded ? 'all charges excluded' : 'no charges linked'}</span>` : `${i.variable ? '<span title="Varies month to month — average of the last 3">~</span>' : ''}${money(i.monthly)}${i.isYearly ? ` <span class="shr" title="A yearly charge of ${money(i.yearly)}, counted here as a twelfth each month">/yr</span>` : ''}${i.shared ? ` <span class="shr" title="Your share of ${money(i.full)} — switch to Full amount to see the whole bill">÷</span>` : ''}`}</td>
    <td class="t">${i.last ? `${fmt(i.last.date)} · ${money(i.last.cost)}` : ''}</td>
    <td class="t">${r.active && nextOf(i) ? fmt(nextOf(i)) : ''}</td>
    <td><div class="linkcell"><input data-f="url" value="${esc(r.url || '')}" placeholder="Where you pay it…" title="A link to the page where you pay this">${safeUrl(r.url) ? `<a class="go" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer" title="Open ${esc(r.url)}">↗</a>` : ''}</div></td>
    <td class="c"><input type="checkbox" data-f="active"${r.active ? ' checked' : ''}></td>
    <td class="c"><button class="btn ghost sm" data-act="view" title="Show the transactions counted toward this item">View ›</button></td>
    <td class="c"><button class="x" data-act="del" title="Delete">✕</button></td></tr>`;
}
function vRecurring() {
  const items = D.recurring, ch = chargesByItem(), info = new Map(items.map(r => [r.id, derive(r, ch)])), active = items.filter(r => r.active);
  if (!recOrder) recOrder = items.slice().sort((a, b) => ((info.get(a.id).day || 99) - (info.get(b.id).day || 99)) || a.name.localeCompare(b.name)).map(r => r.id); // by day of month; kept stable while you edit
  for (const r of items) if (!recOrder.includes(r.id)) recOrder.push(r.id);
  const byId = new Map(items.map(r => [r.id, r])), ordered = recOrder.filter(id => byId.has(id)).map(id => byId.get(id));
  const total = sumOf(active.map(r => info.get(r.id).monthly)), unlinked = active.filter(r => info.get(r.id).monthly == null).length;
  const up = active.filter(r => nextOf(info.get(r.id))).map(r => ({ r, i: info.get(r.id), date: nextOf(info.get(r.id)) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];

  const names = D.groups.slice(); for (const r of ordered) if (r.active && r.group && !names.includes(r.group)) names.push(r.group); // a group named in the data but missing from the list still shows
  const sections = names.map(g => ({ key: g, name: g, items: ordered.filter(r => r.active && r.group === g) }));
  const loose = ordered.filter(r => r.active && !r.group); if (loose.length) sections.push({ key: '#none', name: 'Ungrouped', items: loose });
  const off = ordered.filter(r => !r.active), showOff = !!D.settings?.showInactive, offCount = off.length; if (off.length && showOff) sections.push({ key: '#inactive', name: 'Inactive', items: off, inactive: true });

  $('#view').innerHTML = `
  <div class="cards"><div><b>${money(total)}</b><span>per month · ${viewField() === 'cost' ? 'full amount' : 'your share'}${unlinked ? ` · ${unlinked} item${unlinked === 1 ? '' : 's'} with no charges linked yet` : ''}</span></div>
    ${incomeCardHtml(today().slice(0, 7))}
    <div><b>${up ? fmt(up.date) : '—'}</b><span>${up ? `next up: ${esc(up.r.name)} · ${money(up.i.yearly ?? up.i.monthly)}` : 'next charge'}</span></div></div>
  <div class="bar"><button class="btn" id="addrec">+ Add item</button><button class="btn ghost" id="grp">${showGroups ? 'Hide groups' : 'Edit groups'}</button>
    <button class="btn ghost" id="expall">Expand all</button><button class="btn ghost" id="colall">Collapse all</button>
    <label title="Inactive items are hidden unless this is ticked"><input id="showoff" type="checkbox"${showOff ? ' checked' : ''}> Show inactive${offCount ? ` (${offCount})` : ''}</label>${rviewSel()} ${incomeSelHtml()}</div>
  ${showGroups ? `<div class="panel" id="gpanel"><b>Groups</b> <span class="muted">— the categories your items are sorted into</span>
    ${D.groups.map(g => `<div class="grow" data-g="${esc(g)}"><input data-gname value="${esc(g)}"><button class="btn ghost sm" data-act="gup" title="Move up">↑</button><button class="btn ghost sm" data-act="gdown" title="Move down">↓</button><button class="x" data-act="gdel" title="Delete group">✕</button></div>`).join('')}
    <form class="grow" id="gnew"><input name="g" placeholder="New group…" required><button class="btn sm">Add</button></form></div>` : ''}
  ${tableHtml('rec', 'rb', TABLES.rec, null, true)}`;

  $('#rb').innerHTML = sections.map(s => {
    const n = s.items.length, col = isCollapsed(s.key), sub = s.inactive ? '' : `<span class="gt">${money(sumOf(s.items.map(r => info.get(r.id).monthly)))}</span>`;
    return `<tr class="grp" data-key="${esc(s.key)}"><td colspan="11"><div class="gh"><button class="tog" data-act="tog" title="Show / hide">${col ? '▸' : '▾'}</button><b>${esc(s.name)}</b><span class="muted">${n} item${n === 1 ? '' : 's'}</span>${sub}${s.inactive ? '' : '<button class="btn ghost sm" data-act="addto">+ Add</button>'}</div></td></tr>` + (col ? '' : s.items.map(r => recRow(r, info.get(r.id))).join(''));
  }).join('') || '<tr><td colspan="11" class="t muted">No recurring items yet.</td></tr>';
  cellKeys($('#rb'));

  const add = async group => {
    let id; await commit(d => { id = d.recurring.reduce((m, r) => Math.max(m, r.id), 0) + 1; d.recurring.push({ id, name: '', group, dueDay: null, active: true }); });
    $(`tr[data-id="${id}"] [data-f="name"]`)?.focus();
  };
  $('#addrec').addEventListener('click', () => add(''));
  const foldAll = to => { for (const s of sections) collapsed[s.key] = to; try { localStorage.setItem('rec-collapsed', JSON.stringify(collapsed)); } catch {} render(); };
  $('#expall').addEventListener('click', () => foldAll(false)); $('#colall').addEventListener('click', () => foldAll(true));
  $('#showoff').addEventListener('change', e => setSetting('showInactive', e.target.checked));
  $('#rview').addEventListener('change', e => setSetting('recView', e.target.value));
  wireIncomeSel();
  $('#grp').addEventListener('click', () => { showGroups = !showGroups; render(); });

  $('#rb').addEventListener('change', e => {
    const el = e.target, f = el.dataset.f; if (!f) return; const id = +el.closest('tr').dataset.id; let v = el.value;
    if (f === 'active') v = el.checked;
    else if (f === 'dueDay') v = v === '' ? null : Math.min(31, Math.max(1, Math.round(+v)));
    else if (f === 'dueMonth') v = v === '' ? null : Math.min(12, Math.max(1, Math.round(+v)));
    else v = v.trim();
    flash(el, commit(d => {
      const r = d.recurring.find(x => x.id === id); if (!r) throw new Error('That item no longer exists — reloaded.');
      if (f === 'name' && v !== r.name) retag(d, r.name, v); // tagged transactions and line items follow the rename
      if (f === 'period' && !v) delete r.period; else r[f] = v;
    }));
  });
  $('#rb').addEventListener('click', e => { // clicking an item's read-only cells (Monthly, Last charge, Next charge) also opens its charges
    if (e.target.closest('input,select,button,a,td.c')) return; const tr = e.target.closest('tr[data-id]'); if (tr) showCharges(byId.get(+tr.dataset.id));
  });
  $('#rb').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, tr = b.closest('tr');
    if (act === 'tog') { const k = tr.dataset.key; collapsed[k] = !isCollapsed(k); try { localStorage.setItem('rec-collapsed', JSON.stringify(collapsed)); } catch {} render(); }
    else if (act === 'addto') add(tr.dataset.key);
    else if (act === 'view') showCharges(byId.get(+tr.dataset.id));
    else if (act === 'del') {
      const id = +tr.dataset.id, r = byId.get(id), n = r.name ? tagCount(r.name) : 0;
      if (confirm(`Delete "${r.name || 'this item'}"?${n ? ` Its tag on ${n} transaction${n === 1 ? '' : 's'} / line${n === 1 ? '' : 's'} will be cleared.` : ''}`))
        commit(d => { const x = d.recurring.find(q => q.id === id); if (x && x.name) retag(d, x.name, ''); d.recurring = d.recurring.filter(q => q.id !== id); });
    }
  });

  const gp = $('#gpanel');
  if (gp) {
    gp.addEventListener('change', e => { // rename a group (its items follow)
      if (!e.target.matches('[data-gname]')) return; const old = e.target.closest('.grow').dataset.g, nu = e.target.value.trim();
      if (!nu || nu === old) { e.target.value = old; return; }
      commit(d => {
        if (d.groups.some(g => g.toLowerCase() === nu.toLowerCase() && g !== old)) throw new Error(`There is already a group called "${nu}".`);
        d.groups = d.groups.map(g => (g === old ? nu : g)); for (const r of d.recurring) if (r.group === old) r.group = nu;
      });
    });
    gp.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const g = b.closest('.grow').dataset.g, act = b.dataset.act;
      if (act === 'gup' || act === 'gdown') commit(d => { const i = d.groups.indexOf(g), j = act === 'gup' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < d.groups.length) [d.groups[i], d.groups[j]] = [d.groups[j], d.groups[i]]; });
      else if (act === 'gdel') {
        const n = D.recurring.filter(r => r.group === g).length;
        if (confirm(`Delete the group "${g}"?${n ? ` Its ${n} item${n === 1 ? '' : 's'} will become ungrouped.` : ''}`)) commit(d => { d.groups = d.groups.filter(x => x !== g); for (const r of d.recurring) if (r.group === g) r.group = ''; });
      }
    });
    $('#gnew').addEventListener('submit', e => {
      e.preventDefault(); const g = e.target.g.value.trim(); if (!g) return;
      commit(d => { if (d.groups.some(x => x.toLowerCase() === g.toLowerCase())) throw new Error(`There is already a group called "${g}".`); d.groups.push(g); });
    });
  }
}

/* ───────── trends: what each recurring item actually cost, month by month ───────── */
const monthLabel = m => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'short' }) + " ’" + m.slice(2, 4);
function vTrends() {
  const N = D.settings?.trendMonths || 6, ch = chargesByItem(), field = viewField(), act = actualsByItem(ch, false, field), actK = actualsByItem(ch, true, field), T = today(), thisMonth = T.slice(0, 7);
  const window = []; for (let i = N - 1; i >= 0; i--) window.push(toISO(new Date(+T.slice(0, 4), +T.slice(5, 7) - 1 - i, 1)).slice(0, 7));
  const firstData = Object.values(act).flatMap(o => Object.keys(o)).sort()[0];
  const months = window.filter(m => !firstData || m >= firstData).length ? window.filter(m => !firstData || m >= firstData) : window.slice(-1); // no empty columns from before you had any data
  const items = D.recurring.filter(r => r.name && (r.active || months.some(m => act[r.name]?.[m] != null)));
  const names = [...D.groups]; for (const r of items) if (r.active && r.group && !names.includes(r.group)) names.push(r.group);
  const sections = names.map(g => ({ name: g, items: items.filter(r => r.active && r.group === g) }));
  const loose = items.filter(r => r.active && !r.group); if (loose.length) sections.push({ name: 'Ungrouped', items: loose });
  const off = items.filter(r => !r.active); if (off.length) sections.push({ name: 'Inactive', items: off });

  const val = (r, m) => act[r.name]?.[m] ?? null;
  const avgOf = vals => { const v = vals.filter(x => x != null); return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const sum = vals => { const v = vals.filter(x => x != null); return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null; };
  const kv = (r, m) => actK[r.name]?.[m] ?? null;
  const cell = (v, k, avg, n, missing) => v == null ? `<td class="r ${missing ? 'miss' : 'none'}">${missing ? '–' : ''}</td>` : (k == null || Math.abs(k - v) > 0.004) ? `<td class="r ex" title="Includes ${money(round2(v - (k || 0)))} you excluded from the calculations">${money(v)}</td>` : `<td class="r${n > 1 && avg && k > avg * 1.25 ? ' hi' : ''}">${money(v)}</td>`;
  const itemRow = r => {
    const vals = months.map(m => val(r, m)), kept = months.map(m => kv(r, m)), avg = avgOf(kept), n = kept.filter(x => x != null).length, first = Object.keys(act[r.name] || {}).sort()[0];
    return `<tr><td class="t">${esc(r.name)}</td>` + months.map((m, i) => cell(vals[i], kept[i], avg, n, vals[i] == null && first && m > first && m < thisMonth)).join('') + `<td class="r"><b>${avg == null ? '' : money(avg)}</b></td></tr>`;
  };
  const sumRow = (label, its, cls) => {
    const vals = months.map(m => sum(its.map(r => val(r, m)))), keptVals = months.map(m => sum(its.map(r => kv(r, m))));
    return `<tr class="${cls}"><td class="t"><b>${esc(label)}</b></td>` + vals.map(v => `<td class="r">${v == null ? '' : money(v)}</td>`).join('') + `<td class="r"><b>${avgOf(keptVals) == null ? '' : money(avgOf(keptVals))}</b></td></tr>`;
  };
  const body = sections.filter(s => s.items.length).map(s => sumRow(s.name, s.items, 'grp') + s.items.map(itemRow).join('')).join('');
  $('#view').innerHTML = `
  <div class="bar"><label>Show <select id="tm">${[3, 6, 12].map(n => `<option value="${n}"${n === N ? ' selected' : ''}>last ${n} months</option>`).join('')}</select></label>${rviewSel()}
    <span class="muted">What each item actually cost, from charges and line items tagged to it. Amber = well above its own average · red dash = no charge that month · struck through = includes a charge you excluded (shown in the history, left out of the average).</span></div>
  ${firstData ? `<div class="wrap"><table class="trend"><thead><tr><th>Item</th>${months.map(m => `<th class="r">${monthLabel(m)}</th>`).join('')}<th class="r">Average</th></tr></thead>
    <tbody>${body}${sumRow('All items', items, 'tot')}</tbody></table></div>` : '<div class="card"><h2>Nothing to show yet</h2><p>Tag transactions, or line items on a split charge, with a recurring item and their monthly amounts will appear here.</p></div>'}`;
  $('#tm').addEventListener('change', e => setSetting('trendMonths', +e.target.value));
  $('#rview').addEventListener('change', e => setSetting('recView', e.target.value));
}

/* ───────── display options: light / dark, and hiding dollar amounts ───────── */
const THEMES = [['', 'Match my computer'], ['light', 'Light'], ['dark', 'Dark']];
const themeNow = () => { try { return localStorage.getItem('theme') || ''; } catch { return ''; } };
function setTheme(t) { try { t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme'); } catch {} if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
$('#theme').addEventListener('click', () => { const dark = themeNow() ? themeNow() === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; setTheme(dark ? 'light' : 'dark'); if (view === 'settings') render(); });
let hiding = false; try { hiding = localStorage.getItem('hide') === '1'; } catch {}
const AMT_G = /-?\$\d[\d,]*(?:\.\d+)?/g, AMT_1 = /-?\$\d[\d,]*(?:\.\d+)?/;
const amtObserver = new MutationObserver(() => maskAmounts());
function maskAmounts() { // replace every dollar amount on screen with $••• (text and tooltips); turning it off redraws the page
  if (!hiding) return; amtObserver.disconnect();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) if (AMT_1.test(n.nodeValue) && n.parentElement && !/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) n.nodeValue = n.nodeValue.replace(AMT_G, () => '$•••');
  for (const el of document.querySelectorAll('[title]')) if (AMT_1.test(el.title)) el.title = el.title.replace(AMT_G, () => '$•••');
  amtObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] });
}
function setHide(on, redraw = true) {
  hiding = on; try { localStorage.setItem('hide', on ? '1' : '0'); } catch {}
  document.body.classList.toggle('hide-amts', on); $('#hide').classList.toggle('on', on); $('#hide').title = on ? 'Amounts are hidden — click to show them' : 'Hide dollar amounts (for showing the app to someone)';
  if (on) maskAmounts(); else { amtObserver.disconnect(); if (redraw && D) render(); }
}
$('#tourbtn').addEventListener('click', () => startTour());
$('#hide').addEventListener('click', () => { setHide(!hiding); if (view === 'settings') render(); });
setHide(hiding, false);

/* ───────── first-run tour ───────── */
const TOUR = [
  { view: 'dashboard', sel: '#nav [data-view=dashboard]', t: 'Dashboard', d: 'A month at a glance: what you spent, what recurring charges are still to come, where the money went, and who owes you.' },
  { view: 'transactions', sel: '#nav [data-view=transactions]', t: 'Transactions', d: 'Every transaction. Click a row to open it, split it with someone, add line items or tag it to a recurring item. Search and filters are above the list.' },
  { view: 'transactions', sel: '#add', t: 'Add a transaction', d: 'Click <b>+ Add</b> to start one. Type a description: your earlier ones appear, and <b>Tab</b> takes the top match and fills the category, accounts and amount for you. Category, accounts and recurring item are type-to-search lists too.' },
  { view: 'transactions', open: true, sel: '#drawer [data-f=cat]', t: "A transaction's card", d: 'Click any row to open its card like this one. Fields save as you leave them, and ‹ › step through the list.' },
  { view: 'transactions', open: true, sel: '#drawer [data-f=split]', t: 'Split it with someone', d: 'Choose <b>With someone new…</b> (or a person you already added) to split a charge. It starts 50/50: type either share, or use the calculator button for something like +75. It then shows up under <b>Owed to me</b>, where you request and track the payback. Use <b>+ Add line</b> to split one charge into line items.' },
  { view: 'recurring', sel: '#nav [data-view=recurring]', t: 'Recurring', d: 'Your monthly commitments. Tag transactions with an item and its monthly amount works itself out; there is nothing to type. Add a link to where you pay each one.' },
  { view: 'owed', sel: '#nav [data-view=owed]', t: 'Owed to me', d: 'Split a charge with someone and it collects here. Request what they owe, copy a message to send them, and match the payments you receive.' },
  { view: 'trends', sel: '#nav [data-view=trends]', t: 'Trends', d: 'What each recurring item actually cost, month by month, so a bill that crept up stands out.' },
  { view: 'settings', sel: '#nav [data-view=settings]', t: 'Settings', d: 'Your own categories and accounts, light or dark, and the sample data. Nothing here is specific to anyone.' },
  { sel: '#hide', t: 'Hide amounts', d: 'Showing someone the app? Click this to replace every dollar amount with $•••. Click again to bring them back.' },
  { sel: '#theme', t: 'Light or dark', d: 'Switch the look here.' },
  { sel: '#tourbtn', t: 'That\'s the tour', d: 'Take it again any time with this ? button, or from Settings.' },
];
let tourAt = -1, tourDir = 1;
function endTour() { if (cardId != null && TOUR[tourAt]?.open) closeCard(); tourAt = -1; document.querySelectorAll('.tour-hl').forEach(e => e.classList.remove('tour-hl')); $('#tour')?.remove(); markTourDone(); }
function tourStep(i) {
  if (i >= TOUR.length) return endTour();
  i = Math.max(0, i); tourDir = i >= tourAt ? 1 : -1; const prevStep = TOUR[tourAt]; tourAt = i; const st = TOUR[i];
  document.querySelectorAll('.tour-hl').forEach(e => e.classList.remove('tour-hl'));
  if (st.view && view !== st.view) { closeCard(); view = st.view; render(); }
  if (st.open) { // show a real transaction's card (nothing is changed), one you can split
    const ex = D.transactions.find(t => (t.amt || 0) < 0 && !(t.parts || []).length) || D.transactions[0];
    if (!ex) { return tourStep(i + (tourDir < 0 ? -1 : 1)); }
    if (cardId !== ex.id) { cardNew = null; openCard(ex.id); }
  } else if (cardId != null && prevStep?.open) closeCard();
  scrollTo(0, 0);
  const el = st.sel ? $(st.sel) : null; el?.classList.add('tour-hl');
  let box = $('#tour'); if (!box) { box = document.createElement('div'); box.id = 'tour'; box.className = 'tour'; document.body.appendChild(box); }
  const last = i === TOUR.length - 1;
  box.innerHTML = `<b>${st.t}</b><p>${st.d}${last && demo ? ' You\'re looking at made-up sample data; use <b>Exit sample data</b> at the top when you\'re ready to use your own.' : ''}</p><div class="trow"><span class="muted">${i + 1} of ${TOUR.length}</span><span><button class="btn ghost sm" data-t="skip">Skip</button> ${i ? '<button class="btn ghost sm" data-t="back">Back</button> ' : ''}<button class="btn sm" data-t="next">${last ? 'Done' : 'Next'}</button></span></div>`;
  const r = el?.getBoundingClientRect();
  const vw = innerWidth || 1000, vh = innerHeight || 700; // (guards against a window that reports no size yet)
  box.style.top = (r ? Math.max(8, Math.min(r.bottom + 14, vh - 190)) : vh * 0.32) + 'px';
  box.style.left = (r ? Math.max(12, Math.min(r.left, vw - 352)) : Math.max(12, (vw - 340) / 2)) + 'px';
}
function startTour() { if (D) tourStep(0); }
document.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'skip') endTour(); else tourStep(tourAt + (b.dataset.t === 'back' ? -1 : 1)); });
document.addEventListener('keydown', e => { if (tourAt >= 0 && e.key === 'Escape') endTour(); else if (e.key === 'Escape' && owedPop != null && view === 'owed' && cardId == null && !cb) { owedPop = null; render(); } });

/* ───────── settings: appearance and your own lists ───────── */
const LISTS = [['categories', 'Categories', 'What a transaction is for'], ['accounts', 'Accounts', 'Where money comes from and goes to']];
function vSettings() {
  const L = D.lists || {};
  const listPanel = ([k, title, hint]) => `<section class="dsec" data-list="${k}"><h2>${title}</h2><p class="muted small">${hint}. Renaming one updates your transactions; removing one leaves them as they are.</p>
    ${(L[k] || []).map((n, i) => `<div class="rrow" data-i="${i}"><input data-ln value="${esc(n)}"><button class="btn ghost sm" data-act="lup" title="Move up">↑</button><button class="btn ghost sm" data-act="ldown" title="Move down">↓</button><button class="x" data-act="ldel" title="Remove">✕</button></div>`).join('')}
    <form class="rrow" data-lnew><input name="n" placeholder="Add one…" required><button class="btn sm">Add</button></form></section>`;
  $('#view').innerHTML = `<div id="set">
  <div class="dgrid"><section class="dsec"><h2>Appearance</h2>
      <div class="rrow"><label>Theme <select id="sthe">${THEMES.map(([v, l]) => `<option value="${v}"${themeNow() === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="rrow"><label title="Replaces every dollar amount with $••• so you can show someone the app"><input id="shide" type="checkbox"${hiding ? ' checked' : ''}> Hide dollar amounts</label></div></section>
    <section class="dsec"><h2>Your data</h2><p class="muted small">${demo ? 'You are looking at the <b>sample data</b> (made up, not saved).' : `Saved in <b>${esc(handle?.name || 'your data file')}</b>.`} ${D.transactions.length} transactions · ${D.recurring.length} recurring items.</p></section>
    <section class="dsec"><h2>Sample data &amp; tour</h2><p class="muted small">Look around a made-up budget without touching your own data, for trying the app or showing it to someone. Nothing in it is saved. (The same sample is in <b>sample-data.json</b>, which you can also open like any data file.)</p>
      <div class="rrow">${demo ? '<button class="btn" id="sexit">Back to my data</button>' : '<button class="btn ghost" id="sdemo">Look at the sample data</button>'}<button class="btn ghost" id="stour">Take the tour</button></div></section></div>
  <div class="dgrid">${LISTS.map(listPanel).join('')}</div></div>`;
  const root = $('#set');
  $('#sthe').addEventListener('change', e => { setTheme(e.target.value); });
  $('#sdemo')?.addEventListener('click', () => enterDemo(false)); $('#sexit')?.addEventListener('click', () => exitDemo()); $('#stour').addEventListener('click', () => startTour());
  $('#shide').addEventListener('change', e => { setHide(e.target.checked); if (view === 'settings') render(); });
  const edit = (k, fn) => commit(d => { d.lists = d.lists || {}; d.lists[k] = d.lists[k] || []; fn(d.lists[k], d); });
  const rename = (d, k, from, to) => { // a renamed category/account follows through every transaction
    for (const t of d.transactions) { if (k === 'categories' && t.cat === from) t.cat = to; if (k === 'accounts') { if (t.from === from) t.from = to; if (t.to === from) t.to = to; } }
    if (k === 'categories' && d.settings?.catKinds && from in d.settings.catKinds) { d.settings.catKinds[to] = d.settings.catKinds[from]; delete d.settings.catKinds[from]; }
  };
  root.addEventListener('change', e => {
    const inp = e.target.closest('[data-ln]'); if (!inp) return; const row = inp.closest('.rrow'), k = inp.closest('[data-list]').dataset.list, i = +row.dataset.i, v = inp.value.trim();
    edit(k, (a, d) => { if (!v) throw new Error('A name can’t be empty.'); if (a.includes(v) && a[i] !== v) throw new Error(`“${v}” is already in the list.`); const old = a[i]; a[i] = v; rename(d, k, old, v); });
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const row = b.closest('.rrow'), k = b.closest('[data-list]').dataset.list, i = +row.dataset.i, act = b.dataset.act;
    if (act === 'ldel') {
      const name = (L[k] || [])[i], used = D.transactions.filter(t => (k === 'categories' ? t.cat === name : t.from === name || t.to === name)).length;
      if (used && !confirm(`${used} transaction${used === 1 ? '' : 's'} use “${name}”. They'll keep it, but it won't be in the list any more. Remove it?`)) return;
      edit(k, a => { a.splice(i, 1); });
    } else if (act === 'lup' && i > 0) edit(k, a => { [a[i - 1], a[i]] = [a[i], a[i - 1]]; });
    else if (act === 'ldown') edit(k, a => { if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; });
  });
  root.addEventListener('submit', e => { const f = e.target.closest('[data-lnew]'); if (!f) return; e.preventDefault(); const k = f.closest('[data-list]').dataset.list, v = f.n.value.trim(); if (v) edit(k, a => { if (a.includes(v)) throw new Error(`“${v}” is already in the list.`); a.push(v); }); });
}

/* ───────── recurring vs income ───────── */
const INCOME_BASES = [['this', 'This month'], ['last', 'Last month'], ['avg3', '3-month average'], ['fixed', 'A fixed amount']];
const incomeBasis = () => (INCOME_BASES.some(b => b[0] === D.settings?.incomeBasis) ? D.settings.incomeBasis : 'this');
const monthAdd = (m, n) => toISO(new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)).slice(0, 7);
const covered = m => { const first = D.transactions.reduce((a, t) => (t.date < a ? t.date : a), '9999'); return first <= m + '-07'; }; // a month your data covers from near its start
function incomeFor(M) { // { amt, label } — the income to compare recurring against, from the categories you marked as Income (or a fixed amount you enter)
  const b = incomeBasis(), isNow = M === today().slice(0, 7), inc = m => flows(m, '', false).income;
  if (b === 'fixed') { const v = +D.settings?.incomeFixed || 0; return { amt: v > 0 ? v : null, label: 'expected amount' }; }
  if (!D.settings?.catKinds) return { amt: null, label: '', unset: true };
  if (b === 'this') return { amt: inc(M) > 0 ? inc(M) : null, label: isNow ? 'this month' : monthName(M) };
  if (b === 'last') { const m = monthAdd(M, -1); return { amt: covered(m) && inc(m) > 0 ? inc(m) : null, label: monthName(m).split(' ')[0] }; }
  const ms = [1, 2, 3].map(n => monthAdd(M, -n)).filter(covered), v = ms.map(inc).filter(x => x > 0);
  return { amt: v.length ? round2(v.reduce((a, x) => a + x, 0) / v.length) : null, label: v.length === 1 ? '1 month with income' : `${v.length}-month average` };
}
const commitments = ch => { ch = ch || chargesByItem(); return sumOf(D.recurring.filter(r => r.active).map(r => derive(r, ch, 'mine').monthly)); }; // your share of every active item
function incomeCardHtml(M, link) { // recurring (your share) as a share of income: the % and a small bar; the amounts are in the tooltip
  const c = commitments(), inc = incomeFor(M), pct = inc.amt ? Math.round(c / inc.amt * 100) : null;
  const tip = pct == null ? '' : `${money(c)} of ${money(inc.amt)} (${inc.label})`;
  const body = inc.unset ? '<b>—</b><span>Mark your income categories to compare</span>'
    : pct == null ? `<b>—</b><span>${inc.label === 'expected amount' ? 'Enter your monthly income' : /average$/.test(inc.label) ? 'No earlier month with income' : `No income in ${esc(inc.label)}`}</span>`
    : `<b${pct > 100 ? ' class="neg"' : ''}>${pct}%</b><span class="k">of income · ${esc(inc.label)}</span><i class="meter"><u style="width:${Math.min(100, pct)}%"></u></i><span>${money(round2(inc.amt - c))} left over</span>`;
  return `<div class="inc${link ? ' lnk' : ''}"${link ? ' data-go="recurring"' : ''} title="${esc(link ? (tip ? tip + ' — ' : '') + 'Change what it is compared with on the Recurring page' : tip)}">${body}</div>`;
}
const incomeSelHtml = () => `<label>Compare with income <select id="ibasis">${INCOME_BASES.map(([v, l]) => `<option value="${v}"${incomeBasis() === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>${incomeBasis() === 'fixed' ? `<input id="ifixed" type="number" min="0" step="0.01" class="num" style="width:130px" placeholder="Monthly income" value="${D.settings?.incomeFixed || ''}">` : ''}`;
const wireIncomeSel = () => { $('#ibasis')?.addEventListener('change', e => setSetting('incomeBasis', e.target.value)); $('#ifixed')?.addEventListener('change', e => setSetting('incomeFixed', Math.max(0, +e.target.value || 0))); };

/* ───────── dashboard: a month at a glance ───────── */
let dashMonth = '', showCats = false;
const KINDS = [['spend', 'Spending'], ['income', 'Income'], ['skip', 'Ignore (e.g. transfers)']];
const catKind = c => D.settings?.catKinds?.[c] || 'spend'; // what each category means to the dashboard: spending, income, or left out (transfers between your accounts)
const catNames = () => { const s = new Set(D.lists?.categories || []); for (const t of D.transactions) if (t.cat) s.add(t.cat); return [...s]; };
function flows(month, upTo, full) { // spent / income / spent-by-category for one month. Spending is your share unless `full`; payments someone made to pay you back are never income
  const out = { spent: 0, income: 0, cats: {} };
  for (const t of D.transactions) {
    if (!t.date.startsWith(month) || (upTo && t.date.slice(8) > upTo)) continue;
    if ((t.parts || []).some(p => p.covers)) continue; // a payback for something you fronted
    const k = catKind(t.cat), amt = t.amt || 0; if (k === 'skip') continue;
    if (k === 'income') { out.income += amt; continue; }
    const owes = full || amt >= 0 ? 0 : (t.parts || []).length ? t.parts.reduce((s, p) => s + ((p.amt || 0) < 0 ? p.split?.owes || 0 : 0), 0) : (t.split?.owes || 0);
    const mine = -amt - Math.min(owes, Math.max(0, -amt)), c = t.cat || '';
    out.spent += mine; out.cats[c] = (out.cats[c] || 0) + mine;
  }
  out.spent = round2(out.spent); out.income = round2(out.income); for (const c in out.cats) out.cats[c] = round2(out.cats[c]);
  return out;
}
function vDashboard() {
  const T = today(), thisMonth = T.slice(0, 7), M = dashMonth || thisMonth, full = viewField() === 'cost';
  const months = [...new Set([thisMonth, M, ...D.transactions.map(t => t.date.slice(0, 7))])].sort().reverse(), at = months.indexOf(M);
  const prev = toISO(new Date(+M.slice(0, 4), +M.slice(5, 7) - 2, 1)).slice(0, 7), upTo = M === thisMonth ? T.slice(8) : '';
  const cur = flows(M, '', full), was = flows(prev, upTo, full), net = round2(cur.income - cur.spent), diff = round2(cur.spent - was.spent);
  const incB = incomeFor(M), pctSp = incB.amt ? Math.round(cur.spent / incB.amt * 100) : null;
  const first = D.transactions.reduce((m, t) => (t.date < m ? t.date : m), '9999'), hasPrev = first <= prev + '-07'; // only compare with a month your data covers from near its start
  // recurring items that haven't been charged in this month yet
  const ch = chargesByItem(), y = +M.slice(0, 4), mo = +M.slice(5, 7);
  const due = D.recurring.filter(r => r.active && r.name).map(r => ({ r, i: derive(r, ch) })).filter(x => x.i.day && !(ch[x.r.name] || []).some(c => !c.excluded && c.date.startsWith(M)) && (ch[x.r.name] || []).some(c => c.date.slice(0, 7) <= M)) // not before its first charge
    .filter(x => !x.i.isYearly || x.i.month === mo).map(x => ({ ...x, date: mk(y, mo, x.i.day) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const late = x => M < thisMonth || (M === thisMonth && x.date < T), coming = due.filter(x => !late(x)), toCome = sumOf(coming.map(x => x.i.yearly ?? x.i.monthly));
  const cats = Object.entries(cur.cats).sort((a, b) => b[1] - a[1]), top = Math.max(0, ...cats.map(c => c[1]));
  const owed = owedItems(), owedTotal = sumOf(owed.map(i => i.out)), byWho = {}; for (const i of owed) if (i.out > 0.004) byWho[i.who] = round2((byWho[i.who] || 0) + i.out);
  const review = D.transactions.filter(t => t.date.startsWith(M) && needsReview(t)).length, setUp = !D.settings?.catKinds;
  const kindSel = c => `<select data-ck="${esc(c)}">${KINDS.map(([v, l]) => `<option value="${v}"${catKind(c) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;

  $('#view').innerHTML = `<div id="dash">
  <div class="bar"><button class="btn ghost sm" id="dprev" title="Earlier month"${at >= months.length - 1 ? ' disabled' : ''}>‹</button>
    <select id="dmonth">${months.map(m => `<option value="${m}"${m === M ? ' selected' : ''}>${monthName(m)}</option>`).join('')}</select>
    <button class="btn ghost sm" id="dnext" title="Later month"${at <= 0 ? ' disabled' : ''}>›</button>
    ${rviewSel()} ${incomeSelHtml()} <button class="btn ghost sm" id="dcats">${showCats ? 'Hide categories' : 'Categories'}</button></div>
  ${setUp && !showCats ? `<div class="panel hint"><div class="grow"><span>Say which categories are <b>income</b> and which are <b>transfers between your accounts</b> (to leave out), or those will be counted as spending.</span> <button class="btn sm" id="dsetup">Set up</button></div></div>` : ''}
  ${showCats ? `<div class="panel"><b>What each category means</b><p class="muted small">Spending is what you spent, income is money in, and “Ignore” leaves it out entirely (moving money between your own accounts, paying a card, and so on). Payments from people paying you back are never counted as income.</p>${catNames().map(c => `<div class="rrow"><span class="t">${esc(c)}</span>${kindSel(c)}</div>`).join('')}</div>` : ''}
  <div class="cards kpi">
    <div class="inc"><span class="k">Spent of income${incB.amt ? ' · ' + esc(incB.label) : ''}${full ? ' · full amount' : ''}</span>${pctSp != null ? `<b${pctSp > 100 ? ' class="neg"' : ''}>${pctSp}%</b><i class="meter"><u style="width:${Math.max(0, Math.min(100, pctSp))}%"></u></i><span class="d">${money(cur.spent)} of ${money(incB.amt)}</span>` : `<b>${money(cur.spent)}</b><span class="d">${incB.unset ? 'Mark your income categories to compare' : incB.label === 'expected amount' ? 'Enter your monthly income to compare' : 'No income for that choice. Try another below.'}</span>`}${hasPrev && (cur.spent || was.spent) ? `<span class="d ${diff > 0 ? 'bad' : diff < 0 ? 'good' : ''}">${diff === 0 ? 'Same as' : `${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than`} ${monthName(prev).split(' ')[0]}${upTo ? ' so far' : ''}</span>` : ''}</div>
    <div><span class="k">Net</span><b class="${net < 0 ? 'neg' : ''}">${money(net)}</b><span class="d">Money in minus spent</span></div>
    <div><span class="k">Still to come</span><b>${money(toCome)}</b><span class="d">${coming.length} recurring charge${coming.length === 1 ? '' : 's'}</span></div>
    ${incomeCardHtml(M, true)}</div>
  <div class="dgrid">
    <section class="dsec"><h2>Recurring not yet charged</h2>
      ${due.length ? due.map(x => `<div class="drow${late(x) ? ' late' : ''}"><span class="t">${fmt(x.date)}</span><span class="t">${esc(x.r.name)}${safeUrl(x.r.url) ? ` <a class="go sm" href="${esc(safeUrl(x.r.url))}" target="_blank" rel="noopener noreferrer" title="Open ${esc(x.r.url)}">↗</a>` : ''}${late(x) ? ` <span class="muted">${M < thisMonth ? 'no charge found' : 'not seen yet'}</span>` : ''}</span><span class="num">${(x.i.yearly ?? x.i.monthly) == null ? '' : money(x.i.yearly ?? x.i.monthly)}</span></div>`).join('') : '<p class="muted">Every recurring item with a due day has been charged this month.</p>'}</section>
    <section class="dsec"><h2>Spending by category</h2>
      ${cats.length ? cats.map(([c, v]) => `<button class="brow" data-cat="${esc(c)}" title="See these transactions"><span class="t">${esc(c || 'Uncategorized')}</span><span class="track"><i style="width:${top > 0 && v > 0 ? Math.max(2, Math.round(v / top * 100)) : 0}%"></i></span><span class="num">${money(v)}</span></button>`).join('') : '<p class="muted">Nothing spent in this month.</p>'}</section></div>
  <div class="dgrid">
    <section class="dsec"><h2>Owed to me</h2>
      ${owedTotal > 0.004 ? `<p><b>${money(owedTotal)}</b> <span class="muted">still owed to you</span></p>${Object.entries(byWho).map(([w, v]) => `<div class="drow"><span class="t">${esc(whoName(D, +w))}</span><span></span><span class="num">${money(v)}</span></div>`).join('')}` : '<p class="muted">Nobody owes you anything right now.</p>'}
      <button class="btn ghost sm" data-go="owed">Open ›</button></section>
    ${review ? `<section class="dsec"><h2>Needs a look</h2><p><b>${review}</b> transaction${review === 1 ? '' : 's'} in ${monthName(M)} ${review === 1 ? 'needs' : 'need'} review.</p><button class="btn ghost sm" data-go="review">Review them ›</button></section>` : ''}</div></div>`;

  const go = m => { dashMonth = m === thisMonth ? '' : m; render(); };
  $('#dmonth').addEventListener('change', e => go(e.target.value));
  $('#dprev').addEventListener('click', () => go(months[at + 1]));
  $('#dnext').addEventListener('click', () => go(months[at - 1]));
  $('#rview').addEventListener('change', e => setSetting('recView', e.target.value));
  wireIncomeSel();
  $('#dcats').addEventListener('click', () => { showCats = !showCats; render(); });
  $('#dsetup')?.addEventListener('click', () => { showCats = true; render(); });
  $('#dash').addEventListener('change', e => { const s = e.target.closest('[data-ck]'); if (!s) return; const m = {}; for (const c of catNames()) m[c] = catKind(c); m[s.dataset.ck] = s.value; setSetting('catKinds', m); });
  $('#dash').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'), g = e.target.closest('[data-go]');
    if (b) { Object.assign(F, { q: '', month: M, cat: b.dataset.cat, review: false, rec: '', split: '', limit: 300 }); view = 'transactions'; render(); scrollTo(0, 0); }
    else if (g) { if (g.dataset.go === 'review') { Object.assign(F, { q: '', month: M, cat: '', review: true, rec: '', split: '', limit: 300 }); view = 'transactions'; } else view = g.dataset.go; render(); scrollTo(0, 0); }
  });
}

boot();
})();
