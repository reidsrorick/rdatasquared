/*
 * app.js — UI, state, and wiring between the Excel file and the screen.
 */
(function () {
  'use strict';
  const { store, calc: C, FileLink } = RT;

  /* ============================================================ state */

  const S = {
    db: null,
    view: 'dashboard',
    period: C.todayISO().slice(0, 7),
    residenceId: 'all',
    billFilter: 'all',
    fileName: '',
    needsPermission: false,
    bootError: '',
    save: 'idle',        // idle | dirty | saving | saved | error
    saveError: '',
    demo: false,
  };

  try {
    const p = JSON.parse(localStorage.getItem('rt-prefs') || '{}');
    if (p.view) S.view = p.view;
    if (p.residenceId) S.residenceId = p.residenceId;
  } catch (e) { /* storage unavailable */ }
  const savePrefs = () => { try { localStorage.setItem('rt-prefs', JSON.stringify({ view: S.view, residenceId: S.residenceId })); } catch (e) { /* ignore */ } };

  /* ========================================================== helpers */

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const round2 = (n) => Math.round(n * 100) / 100;

  function money(n) {
    const cur = (S.db && S.db.settings.currency) || 'USD';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n); }
    catch (e) { return cur + ' ' + n.toFixed(2); }
  }
  function fmtDate(iso, withYear) {
    if (!iso) return '';
    const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    return d.toLocaleDateString(undefined, withYear ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
  }
  function periodLabel(p, short) {
    const d = new Date(+p.slice(0, 4), +p.slice(5, 7) - 1, 1);
    return d.toLocaleDateString(undefined, short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  }

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    bills: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    expenses: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    balances: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    residences: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    folder: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    settings: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.17-2.83L3 3"/><path d="m15 9 6-6"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const btn = (act, label, ic, cls = '', data = '') => `<button class="btn ${cls}" data-act="${act}" ${label ? `title="${esc(label)}" aria-label="${esc(label)}"` : ''} ${data}>${ic ? icon(ic) : ''}${label ? `<span class="lbl">${esc(label)}</span>` : ''}</button>`;
  const iconBtn = (act, ic, title, data = '', cls = '') => `<button class="icon-btn ${cls}" data-act="${act}" title="${esc(title)}" aria-label="${esc(title)}" ${data}>${icon(ic)}</button>`;

  const person = (id) => S.db.people.find((p) => p.id === id);
  const residence = (id) => S.db.residences.find((r) => r.id === id);
  const expense = (id) => S.db.expenses.find((e) => e.id === id);
  const initials = (name) => (String(name).trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('') || '?').toUpperCase();
  const avatar = (p, cls = '') => `<span class="avatar ${cls}" style="--c:${esc(p ? p.color : '#999')}" title="${esc(p ? p.name : '')}">${esc(p ? initials(p.name) : '?')}</span>`;
  const personTag = (id) => { const p = person(id); return p ? `<span class="person">${avatar(p)}${esc(p.name)}</span>` : '<span class="muted">—</span>'; };
  const kindBadge = (e) => (e.variable ? '<span class="badge variable" title="Amount changes each month">Variable</span>' : '<span class="badge fixed" title="Same amount every month">Fixed</span>');
  /** Normalise a user-typed website; only http(s) is ever allowed. Returns '' if unusable. */
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : ''; } catch (e) { return ''; }
  }
  /** "Portal" button that opens the expense's payment website in a new tab (nothing if none is set). */
  function portalLink(e, label = 'Portal') {
    const url = safeUrl(e.portalUrl);
    return url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Open ${esc(url)}">${icon('external')}<span class="lbl">${esc(label)}</span></a>` : '';
  }
  const CAT_COLORS = ['#5b6cff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
  const hashColor = (str) => { let h = 7; for (const ch of String(str || '?').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CAT_COLORS[h % CAT_COLORS.length]; };
  const catTag = (name) => (name ? `<span class="cat" style="--c:${hashColor(name)}">${esc(name)}</span>` : '');
  const seg = (name, items, sel) => `<div class="seg" role="radiogroup">${items.map(([v, l]) => `<label><input type="radio" name="${name}" value="${esc(v)}" ${v === sel ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
  const chip = (p, text) => `<span class="chip">${avatar(p)}${esc(text)}</span>`;
  /** Address as display lines: street, unit, "City, ST 12345", country. */
  function formatAddress(r) {
    const cityLine = [[r.city, r.state].filter(Boolean).join(', '), r.postalCode].filter(Boolean).join(' ');
    return [r.address1, r.address2, cityLine, r.country].filter(Boolean);
  }
  const activePeople = () => S.db.people.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  const scoped = (r) => S.residenceId === 'all' || r.residenceId === S.residenceId;

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3200);
  }

  /* ===================================================== persistence */

  let saveTimer = null, saving = false, pending = false;

  function setSave(state, err) {
    S.save = state; S.saveError = err || '';
    const el = $('#filechip');
    if (el) el.outerHTML = fileChip();
  }

  function fileChip() {
    let text, cls = S.save, click = '';
    const nm = esc(S.fileName || 'Workbook');
    if (S.demo) { text = 'Demo data — not saved'; cls = 'idle'; }
    else if (!FileLink.linked) { text = S.save === 'dirty' ? `Unsaved changes · ${nm}` : `${nm} (not linked — download to save)`; cls = S.save === 'dirty' ? 'dirty' : 'idle'; }
    else if (S.save === 'saving') text = 'Saving…';
    else if (S.save === 'dirty') text = 'Unsaved changes…';
    else if (S.save === 'error') { text = 'Save failed — click to retry'; click = 'data-act="retry-save"'; }
    else { text = `Saved to ${nm}`; cls = 'saved'; }
    return `<span id="filechip" class="filechip ${click ? 'clickable' : ''}" ${click} title="${esc(S.saveError || text)}"><span class="dot ${cls}"></span><span class="name">${text}</span></span>`;
  }

  function saveSoon() {
    if (!FileLink.linked) { setSave('dirty'); return; }
    setSave('dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 350);
  }

  async function flush() {
    if (!FileLink.linked) return;
    if (saving) { pending = true; return; }
    saving = true;
    setSave('saving');
    try {
      do { pending = false; await FileLink.write(S.db); } while (pending);
      setSave('saved');
    } catch (e) {
      console.error(e);
      const locked = /NoModification|NotAllowed|Security|busy|locked/i.test(e.name + ' ' + e.message);
      setSave('error', locked ? 'Could not write to the file. If it is open in Excel, close it and click here to retry.' : e.message);
      toast(locked ? 'Could not save: is the workbook open in Excel? Close it, then click the red status chip to retry.' : 'Could not save: ' + e.message, 'err');
    } finally { saving = false; }
  }

  /** Apply a change to the db, persist it, re-render. */
  function commit(mutator) {
    mutator(S.db);
    saveSoon();
    render();
  }

  async function adoptFile() {
    const db = await FileLink.read();
    S.fileName = FileLink.name;
    S.demo = false;
    S.needsPermission = false;
    if (db) {
      S.db = db;
      S.save = 'saved';
      if (db._repaired) { delete db._repaired; saveSoon(); }
    } else {
      S.db = store.newDb();
      await flush();
    }
    normalizeSelection();
  }

  function normalizeSelection() {
    if (S.residenceId !== 'all' && !residence(S.residenceId)) S.residenceId = 'all';
  }

  async function reloadFromDisk(auto) {
    if (!FileLink.linked) return;
    try {
      const db = await FileLink.read();
      if (db) { S.db = db; delete db._repaired; normalizeSelection(); setSave('saved'); render(); }
      toast(auto ? 'Workbook changed on disk — reloaded.' : 'Reloaded from workbook.', 'ok');
    } catch (e) { toast('Could not read the workbook: ' + e.message, 'err'); }
  }

  function downloadCopy() {
    const buf = store.serializeWorkbook(S.db);
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = S.fileName || 'Residence Tracker.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    if (!FileLink.linked && !S.demo) setSave('idle');
  }

  /* ============================================================ modal */

  function openModal({ title, body, submit = 'Save', onSubmit, wide = false, danger = false, extra = '', actions = {}, onOpen }) {
    const dlg = $('#modal');
    dlg.className = wide ? 'wide' : '';
    dlg.innerHTML = `
      <form method="dialog" novalidate>
        <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
        <div class="modal-body">${body}</div>
        <footer>${extra}<span class="spacer"></span>
          <button type="button" class="btn" data-close>${onSubmit ? 'Cancel' : 'Close'}</button>
          ${onSubmit ? `<button class="btn ${danger ? 'danger solid' : 'primary'}" type="submit">${esc(submit)}</button>` : ''}
        </footer>
      </form>`;
    const form = $('form', dlg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (onSubmit && onSubmit(new FormData(form), form) !== false) dlg.close();
    });
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { dlg.close(); return; }
      const a = e.target.closest('[data-modal-action]');
      if (a && actions[a.dataset.modalAction]) { if (actions[a.dataset.modalAction](form) !== false) dlg.close(); }
    });
    if (!dlg.open) dlg.showModal();
    if (onOpen) onOpen(form);
    const first = $('input:not([type=hidden]):not([type=checkbox]), select', form);
    if (first && !first.value) first.focus();
  }

  function confirmBox(title, message, label, onYes) {
    openModal({ title, body: `<p style="margin:0">${message}</p>`, submit: label, danger: true, onSubmit: () => { onYes(); } });
  }

  const field = (label, inner, cls = '', hint = '') => `<div class="field ${cls}"><label>${esc(label)}</label>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const options = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const personOptions = (sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + options(S.db.people.filter((p) => p.active || p.id === sel).map((p) => [p.id, p.name]), sel);
  const residenceOptions = (sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + options(S.db.residences.map((r) => [r.id, r.name]), sel);

  /* ============================================================ views */

  function monthNav() {
    return `<div class="monthnav">
      ${iconBtn('prev-month', 'left', 'Previous month')}
      <input type="month" id="monthInput" value="${S.period}" aria-label="Month">
      ${iconBtn('next-month', 'right', 'Next month')}
      ${btn('this-month', 'Today', '', 'sm ghost')}
    </div>`;
  }

  function emptyOnboarding() {
    const d = S.db;
    return `<div class="card"><div class="body">
      <h2>Let's get you set up</h2>
      <ol class="steps">
        <li><b>People</b> — ${d.people.length ? '✓ ' + d.people.length + ' added' : 'add everyone who shares expenses.'} ${!d.people.length ? btn('add-person', 'Add person', 'plus', 'sm') : ''}</li>
        <li><b>Residence</b> — ${d.residences.length ? '✓ ' + d.residences.length + ' added' : 'an apartment or house, and who lives there.'} ${!d.residences.length ? btn('add-residence', 'Add residence', 'plus', 'sm') : ''}</li>
        <li><b>Expenses</b> — rent / mortgage, water, wifi… and how each one is split. ${d.residences.length ? btn('add-expense', 'Add expense', 'plus', 'sm') : ''}</li>
      </ol></div></div>`;
  }

  function billStatus(b) {
    if (b.paid) return `<span class="badge paid">Paid${b.payment && b.payment.paidDate ? ' · ' + esc(fmtDate(b.payment.paidDate)) : ''}</span>`;
    if (b.billed) return `<span class="badge billed">Billed</span>` + (b.state === 'overdue' ? ' <span class="badge overdue">Overdue</span>' : '');
    return `<span class="badge ${b.state}">${{ overdue: 'Overdue', soon: 'Due soon', upcoming: 'Upcoming' }[b.state]}</span>`;
  }
  const payBtn = (b, label) => btn('pay', label || (b.paid ? 'Edit' : 'Pay'), b.paid ? 'edit' : 'check', b.paid ? 'sm ghost' : 'sm primary', `data-exp="${esc(b.expense.id)}" data-period="${b.period}" data-pay="${b.payment ? esc(b.payment.id) : ''}"`);

  function dashboardView() {
    const d = S.db;
    if (!d.people.length || !d.residences.length || !d.expenses.length) return `<div class="pagehead"><h1>Dashboard</h1></div>${emptyOnboarding()}`;
    const sum = C.periodSummary(d, S.period, S.residenceId);
    const paidCount = sum.bills.filter((b) => b.paid).length;
    const people = d.people.filter((p) => sum.byPerson[p.id] && (sum.byPerson[p.id].share > 0 || sum.byPerson[p.id].paid > 0));
    const cats = Object.entries(sum.byCategory).sort((a, b) => b[1] - a[1]);
    const catMax = cats.length ? cats[0][1] : 1;
    const palette = RT.PALETTE;
    const attention = sum.bills.filter((b) => !b.paid).slice(0, 7);
    const plan = C.simplifyDebts(C.balances(d, S.residenceId)).slice(0, 4);
    const tr = C.trend(d, S.period, S.residenceId, 12);

    return `
      <div class="pagehead"><div><div class="eyebrow">Dashboard · ${esc(S.residenceId === 'all' ? 'All residences' : (residence(S.residenceId) || {}).name || '')}</div><h1>${esc(periodLabel(S.period))}</h1></div>${monthNav()}</div>
      <div class="grid cols-4">
        <div class="card stat" style="--tone:#5b6cff"><div class="ico">${icon('wallet')}</div><div class="label">Total bills</div><div class="value">${money(sum.total)}</div><div class="sub">${sum.bills.length} bill${sum.bills.length === 1 ? '' : 's'} this month</div></div>
        <div class="card stat" style="--tone:var(--good)"><div class="ico">${icon('check')}</div><div class="label">Paid</div><div class="value">${money(sum.paid)}</div><div class="sub">${paidCount} of ${sum.bills.length} paid</div><div class="meter"><span style="width:${sum.total ? Math.min(100, (sum.paid / sum.total) * 100) : 0}%"></span></div></div>
        <div class="card stat" style="--tone:var(--warn)"><div class="ico">${icon('clock')}</div><div class="label">Outstanding</div><div class="value">${money(sum.outstanding)}</div><div class="sub">${sum.bills.length - paidCount} left to pay</div></div>
        <div class="card stat" style="--tone:${sum.overdueCount ? 'var(--bad)' : 'var(--good)'}"><div class="ico">${icon(sum.overdueCount ? 'alert' : 'check')}</div><div class="label">Overdue</div><div class="value ${sum.overdueCount ? 'bad' : ''}">${sum.overdueCount}</div><div class="sub">${sum.overdueCount ? 'needs attention' : 'all caught up'}</div></div>
      </div>

      <div class="grid cols-2">
        <section class="card"><header><h2>Needs paying</h2><span class="spacer"></span>${btn('nav', 'All bills', '', 'sm ghost', 'data-view="bills"')}</header>
          <div class="body" style="padding-top:6px">${attention.length ? `<div class="tablewrap"><table><tbody>${attention.map((b) => `
            <tr><td><b>${esc(b.expense.name)}</b><div class="muted">Due ${esc(fmtDate(b.dueDate))}</div></td>
            <td>${billStatus(b)}</td><td class="num">${money(b.amount)}</td><td class="row-actions">${portalLink(b.expense)}${payBtn(b)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing outstanding this month 🎉</div>'}</div></section>

        <section class="card"><header><h2>Settle up (all time${S.residenceId === 'all' ? '' : ', this residence'})</h2><span class="spacer"></span>${btn('nav', 'Balances', '', 'sm ghost', 'data-view="balances"')}</header>
          <div class="body" style="padding-top:6px">${plan.length ? `<div class="tablewrap"><table><tbody>${plan.map((t) => `
            <tr><td>${personTag(t.fromId)}</td><td class="muted">pays</td><td>${personTag(t.toId)}</td><td class="num"><b>${money(t.amount)}</b></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Everyone is settled up.</div>'}</div></section>

        <section class="card"><header><h2>This month by person</h2></header>
          <div class="body" style="padding-top:6px">${people.length ? `<div class="tablewrap"><table>
            <thead><tr><th>Person</th><th class="num">Share of bills</th><th class="num">Already paid out</th></tr></thead><tbody>${people.map((p) => `
            <tr><td>${personTag(p.id)}</td><td class="num">${money(sum.byPerson[p.id].share)}</td><td class="num">${money(sum.byPerson[p.id].paid)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No bills this month.</div>'}</div></section>

        <section class="card"><header><h2>By category</h2></header>
          <div class="body">${cats.length ? `<div class="bars">${cats.map(([c, v], i) => `
            <div class="bar-row"><div class="top">${catTag(c)}<span class="num">${money(v)}</span></div>
            <div class="bar"><span style="width:${Math.max(2, (v / catMax) * 100)}%; --c:${hashColor(c)}"></span></div></div>`).join('')}</div>` : '<div class="empty">No bills this month.</div>'}</div></section>
      </div>

      <section class="card"><header><h2>Last 12 months</h2><span class="spacer"></span><span class="hint">darker = paid</span></header>
        <div class="body">${trendSvg(tr)}</div></section>`;
  }

  function trendSvg(tr) {
    const W = 720, H = 150, padB = 22, padT = 6, n = tr.length, gap = 10;
    const bw = (W - gap * (n - 1)) / n;
    const max = Math.max(1, ...tr.map((t) => t.total));
    const h = (v) => ((H - padB - padT) * v) / max;
    return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly totals"><defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e5cf6"/><stop offset="1" stop-color="#5b6cff"/></linearGradient></defs><line class="grid-line" x1="0" x2="${W}" y1="${padT}" y2="${padT}"/><line class="grid-line" x1="0" x2="${W}" y1="${(H - padB + padT) / 2}" y2="${(H - padB + padT) / 2}"/>${tr.map((t, i) => {
      const x = i * (bw + gap), y = H - padB - h(t.total), yp = H - padB - h(t.paid);
      return `<g data-act="set-period" data-period="${t.period}" class="${t.period === S.period ? 't-sel' : ''}">
        <title>${esc(periodLabel(t.period))}: ${esc(money(t.total))} (${esc(money(t.paid))} paid)</title>
        <rect class="t-total" x="${x}" y="${y}" width="${bw}" height="${Math.max(0, h(t.total))}" rx="6"/>
        <rect class="t-paid" x="${x}" y="${yp}" width="${bw}" height="${Math.max(0, h(t.paid))}" rx="6"/>
        <text x="${x + bw / 2}" y="${H - 6}" ${t.period === S.period ? 'style="font-weight:700;fill:var(--text)"' : ''}>${esc(periodLabel(t.period, true))}</text></g>`;
    }).join('')}</svg>`;
  }

  function billsView() {
    const d = S.db;
    const sum = C.periodSummary(d, S.period, S.residenceId);
    let bills = sum.bills;
    if (S.billFilter === 'unpaid') bills = bills.filter((b) => !b.paid);
    if (S.billFilter === 'paid') bills = bills.filter((b) => b.paid);
    return `
      <div class="pagehead"><h1>Bills · ${esc(periodLabel(S.period))}</h1>${monthNav()}</div>
      <div class="pagehead">
        <select id="billFilter" aria-label="Filter">${options([['all', 'All bills'], ['unpaid', 'Unpaid'], ['paid', 'Paid']], S.billFilter)}</select>
        <span class="muted">${money(sum.paid)} paid of ${money(sum.total)} · ${money(sum.outstanding)} outstanding</span>
        <span class="spacer"></span>
        ${btn('add-onetime', 'One-time bill', 'plus')}
      </div>
      <div class="card"><div class="tablewrap">${bills.length ? `<table>
        <thead><tr><th>Due</th><th>Bill</th><th class="num">Amount</th><th>Split</th><th>Paid by</th><th>Status</th><th></th></tr></thead>
        <tbody>${bills.map((b) => `<tr>
          <td class="nowrap">${esc(fmtDate(b.dueDate))}</td>
          <td><b>${esc(b.expense.name)}</b> ${kindBadge(b.expense)}<div class="muted">${catTag(b.expense.category)}${S.residenceId === 'all' && residence(b.expense.residenceId) ? ' · ' + esc(residence(b.expense.residenceId).name) : ''}</div></td>
          <td class="num">${money(b.amount)}${!b.payment && b.expense.variable ? '<div class="hint">estimate</div>' : ''}</td>
          <td><div class="chips">${b.split.map((s) => chip(person(s.personId), money(s.amount))).join('')}</div></td>
          <td>${b.paid || b.paidById ? personTag(b.paidById) : '<span class="muted">—</span>'}</td>
          <td>${billStatus(b)}</td>
          <td class="row-actions">${portalLink(b.expense)}${payBtn(b)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No bills for this month.</div>'}</div></div>`;
  }

  function lastPaidNote(e) {
    const last = S.db.payments.filter((p) => p.expenseId === e.id && p.status === 'Paid')
      .sort((a, b) => (b.paidDate || b.period).localeCompare(a.paidDate || a.period))[0];
    if (!last) return '<div class="hint">No payments logged yet</div>';
    const who = person(last.paidById);
    return `<div class="hint">Last paid ${esc(fmtDate(last.paidDate || last.period + '-01', true))}${who ? ' by ' + esc(who.name.split(' ')[0]) : ''} · ${esc(money(last.amount))}</div>`;
  }

  function splitSummary(e) {
    const parts = C.participants(S.db, e);
    if (!parts.length) return '<span class="muted">nobody</span>';
    if (e.splitMethod === 'Fixed' || e.splitMethod === 'Offset') {
      return `<div class="chips">${C.splitAmounts(S.db, e, e.amount).map((s) => chip(person(s.personId), ((person(s.personId) || { name: '?' }).name.split(' ')[0]) + ' ' + money(s.amount))).join('')}</div>`;
    }
    const total = parts.reduce((a, p) => a + (e.splitMethod === 'Equal' ? 1 : Math.max(0, p.value)), 0) || parts.length;
    return `<div class="chips">${parts.map((p) => {
      const w = e.splitMethod === 'Equal' ? 1 : Math.max(0, p.value);
      const label = e.splitMethod === 'Equal' ? '' : e.splitMethod === 'Percent' ? Math.round((w / total) * 100) + '%' : w + '×';
      return chip(person(p.personId), (person(p.personId) || { name: '?' }).name.split(' ')[0] + (label ? ' ' + label : ''));
    }).join('')}</div>`;
  }

  function expensesView() {
    const d = S.db;
    const list = d.expenses.filter(scoped);
    const groups = d.residences.filter((r) => S.residenceId === 'all' || r.id === S.residenceId);
    return `
      <div class="pagehead"><h1>Expenses</h1>${btn('add-expense', 'Add expense', 'plus', 'primary')}</div>
      <p class="lede">Recurring costs and one-time bills, with how each is split. Pick from <a href="#expense-list" data-act="scroll-list">your expense list</a> or add an ad hoc one. <b>Fixed</b> = same every month, <b>Variable</b> = changes (you enter the actual amount when paying).</p>
      ${!d.residences.length ? '<div class="card"><div class="empty">Add a residence first.</div></div>' : groups.map((r) => {
        const es = list.filter((e) => e.residenceId === r.id);
        const monthly = es.reduce((a, e) => a + C.monthlyEquivalent(e), 0);
        return `<section class="card">
          <div class="group-title"><span class="tile" style="--c:${hashColor(r.id)}">${icon('residences')}</span><h2>${esc(r.name)}</h2><span class="tag">${esc(r.tenure)}</span><span class="spacer"></span><span class="pill-total">≈ ${money(monthly)} / month</span></div>
          <div class="tablewrap">${es.length ? `<table>
            <thead><tr><th>Expense</th><th class="num">Amount</th><th>Frequency</th><th>Paid by</th><th>Split</th><th></th></tr></thead>
            <tbody>${es.map((e) => `<tr class="${e.active ? '' : 'inactive'}">
              <td><b>${esc(e.name)}</b><div class="muted">${catTag(e.category)}${e.active ? '' : ' · inactive'}</div>${lastPaidNote(e)}</td>
              <td class="num">${money(e.amount)}${e.variable ? '<div class="hint">estimate</div>' : ''}<div>${kindBadge(e)}</div></td>
              <td>${esc(e.frequency)}<div class="muted">${e.frequency === 'One-time' ? esc(fmtDate(e.startDate, true)) : 'day ' + (e.dueDay || (e.startDate ? +e.startDate.slice(8) : 1))}</div></td>
              <td>${personTag(e.paidById)}</td>
              <td>${splitSummary(e)}</td>
              <td class="row-actions">${portalLink(e)}${btn('log-payment', 'Log payment', 'check', 'sm primary', `data-id="${esc(e.id)}"`)}${iconBtn('edit-expense', 'edit', 'Edit', `data-id="${esc(e.id)}"`)}${iconBtn('del-expense', 'trash', 'Delete', `data-id="${esc(e.id)}"`)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No expenses yet.</div>'}</div></section>`;
      }).join('')}
      ${expenseListCard()}`;
  }

  function expenseListCard() {
    const types = [...S.db.expenseTypes].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    return `<section class="card" id="expense-list">
      <div class="group-title"><span class="tile" style="--c:#8b5cf6">${icon('expenses')}</span><h2>Your expense list</h2><span class="muted">Quick-pick templates for the Add expense form</span><span class="spacer"></span>${btn('add-type', 'Add to list', 'plus', 'sm')}</div>
      <div class="tablewrap">${types.length ? `<table>
        <thead><tr><th>Name</th><th>Category</th><th>Amount</th><th>Frequency</th><th class="num">Typical</th><th></th></tr></thead>
        <tbody>${types.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${catTag(t.category)}</td><td>${kindBadge(t)}</td><td>${esc(t.frequency)}</td>
          <td class="num">${t.amount ? money(t.amount) : '<span class="muted">—</span>'}</td>
          <td class="row-actions">${btn('use-type', 'Use', 'plus', 'sm', `data-id="${esc(t.id)}"`)}${iconBtn('edit-type', 'edit', 'Edit', `data-id="${esc(t.id)}"`)}${iconBtn('del-type', 'trash', 'Delete', `data-id="${esc(t.id)}"`)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Your list is empty. Add common expenses here so you can pick them later.</div>'}</div></section>`;
  }

  function balancesView() {
    const d = S.db;
    const rows = C.balances(d, S.residenceId).filter((r) => person(r.personId) && (r.paid || r.owed || r.sent || r.received));
    const plan = C.simplifyDebts(C.balances(d, S.residenceId));
    const sets = d.settlements.filter((s) => S.residenceId === 'all' || s.residenceId === S.residenceId).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <div class="pagehead"><h1>Balances</h1>${btn('add-settlement', 'Record payment', 'plus', 'primary')}</div>
      <p class="lede">Based on every bill marked <b>Paid</b>: whoever paid is owed by the others according to each bill's split.${S.residenceId === 'all' ? '' : ' Showing the selected residence only.'}</p>
      <div class="grid cols-2">
        <section class="card"><header><h2>Per person</h2></header><div class="body" style="padding-top:6px"><div class="tablewrap">${rows.length ? `<table>
          <thead><tr><th>Person</th><th class="num">Paid out</th><th class="num">Their share</th><th class="num">Settled</th><th class="num">Net</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr class="clickable" data-act="person-ledger" data-id="${esc(r.personId)}" title="Click for the line-item breakdown"><td>${personTag(r.personId)}</td><td class="num">${money(r.paid)}</td><td class="num">${money(r.owed)}</td>
            <td class="num">${money(r.sent - r.received)}</td>
            <td class="num"><span class="pill ${r.net > 0.004 ? 'good' : r.net < -0.004 ? 'bad' : ''}">${r.net > 0 ? '+' : ''}${money(r.net)}</span><div class="hint">${r.net > 0.004 ? 'is owed' : r.net < -0.004 ? 'owes' : 'settled'}</div></td>
            <td class="row-actions">${btn('person-ledger', 'Details', 'right', 'sm ghost', `data-id="${esc(r.personId)}"`)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No paid bills yet.</div>'}</div></div></section>
        <section class="card"><header><h2>Suggested settle-up</h2></header><div class="body" style="padding-top:6px"><div class="tablewrap">${plan.length ? `<table><tbody>${plan.map((t) => `
          <tr><td>${personTag(t.fromId)}</td><td class="muted">pays</td><td>${personTag(t.toId)}</td><td class="num"><b>${money(t.amount)}</b></td>
          <td class="row-actions">${btn('add-settlement', 'Record', 'check', 'sm', `data-from="${esc(t.fromId)}" data-to="${esc(t.toId)}" data-amount="${t.amount}"`)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Everyone is settled up.</div>'}</div></div></section>
      </div>
      <section class="card"><header><h2>Settlement history</h2></header><div class="body" style="padding-top:6px"><div class="tablewrap">${sets.length ? `<table>
        <thead><tr><th>Date</th><th>From</th><th>To</th><th>Residence</th><th class="num">Amount</th><th>Note</th><th></th></tr></thead>
        <tbody>${sets.map((s) => `<tr><td>${esc(fmtDate(s.date, true))}</td><td>${personTag(s.fromId)}</td><td>${personTag(s.toId)}</td>
          <td>${residence(s.residenceId) ? esc(residence(s.residenceId).name) : '<span class="muted">All</span>'}</td><td class="num">${money(s.amount)}</td><td>${esc(s.note)}</td>
          <td class="row-actions">${iconBtn('del-settlement', 'trash', 'Delete', `data-id="${esc(s.id)}"`)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No settlements recorded.</div>'}</div></div></section>`;
  }

  function peopleView() {
    const d = S.db;
    return `
      <div class="pagehead"><h1>People</h1>${btn('add-person', 'Add person', 'plus', 'primary')}</div>
      <div class="card"><div class="tablewrap">${d.people.length ? `<table>
        <thead><tr><th>Name</th><th>Email</th><th>Lives at</th><th>Status</th><th></th></tr></thead>
        <tbody>${d.people.map((p) => {
          const homes = d.residents.filter((r) => r.personId === p.id).map((r) => residence(r.residenceId)).filter(Boolean);
          return `<tr class="${p.active ? '' : 'inactive'}"><td><span class="person">${avatar(p, 'lg')}<b>${esc(p.name)}</b></span></td><td>${esc(p.email)}</td>
            <td>${homes.map((h) => `<span class="tag">${esc(h.name)}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
            <td>${p.active ? '<span class="badge ok">Active</span>' : '<span class="badge off">Inactive</span>'}</td>
            <td class="row-actions">${iconBtn('edit-person', 'edit', 'Edit', `data-id="${esc(p.id)}"`)}${iconBtn('del-person', 'trash', 'Delete', `data-id="${esc(p.id)}"`)}</td></tr>`;
        }).join('')}</tbody></table>` : '<div class="empty">No people yet.</div>'}</div></div>`;
  }

  function residencesView() {
    const d = S.db;
    return `
      <div class="pagehead"><h1>Residences</h1>${btn('add-residence', 'Add residence', 'plus', 'primary')}</div>
      ${d.residences.length ? `<div class="grid cards">${d.residences.map((r) => {
        const members = d.residents.filter((x) => x.residenceId === r.id).map((x) => person(x.personId)).filter(Boolean);
        const monthly = d.expenses.filter((e) => e.residenceId === r.id).reduce((a, e) => a + C.monthlyEquivalent(e), 0);
        const c = hashColor(r.id);
        return `<article class="card res-card" style="--c:${c}">
          <div class="res-banner">${icon('residences')}<span class="tag">${esc(r.type)} · ${esc(r.tenure)}${r.endDate ? ' · ended' : ''}</span></div>
          <div class="body">
            <div style="display:flex;gap:8px;align-items:center"><h2 style="font-size:18px">${esc(r.name)}</h2><span class="spacer"></span>${iconBtn('edit-residence', 'edit', 'Edit', `data-id="${esc(r.id)}"`)}${iconBtn('del-residence', 'trash', 'Delete', `data-id="${esc(r.id)}"`)}</div>
            ${formatAddress(r).length ? `<div class="muted" style="margin-top:4px">${formatAddress(r).map(esc).join('<br>')}</div>` : ''}
            <div class="hint" style="margin-top:6px">${r.startDate ? 'Since ' + esc(fmtDate(r.startDate, true)) : ''}${r.endDate ? ' → ' + esc(fmtDate(r.endDate, true)) : ''}</div>
            <div style="margin:14px 0 0" class="chips">${members.map((p) => chip(p, p.name)).join('') || '<span class="muted">No residents yet</span>'}</div>
            <div class="res-cost"><b class="num">${money(monthly)}</b><span class="muted">/ month in recurring costs</span></div>
            ${r.notes ? `<div class="hint" style="margin-top:10px">${esc(r.notes)}</div>` : ''}
          </div></article>`;
      }).join('')}</div>` : '<div class="card"><div class="empty">No residences yet.</div></div>'}`;
  }

  /* ----------------------------------------------------------- shell */

  const NAV = [['dashboard', 'Dashboard', '#5b6cff'], ['bills', 'Bills', '#10b981'], ['expenses', 'Expenses', '#f59e0b'], ['balances', 'Balances', '#ec4899'], ['people', 'People', '#06b6d4'], ['residences', 'Residences', '#8b5cf6']];

  function shell() {
    const d = S.db;
    const views = { dashboard: dashboardView, bills: billsView, expenses: expensesView, balances: balancesView, people: peopleView, residences: residencesView };
    if (!views[S.view]) S.view = 'dashboard';
    const overdue = C.periodSummary(d, C.todayISO().slice(0, 7), S.residenceId).overdueCount;
    return `
      <header class="topbar">
        <div class="brand"><span class="logo">${icon('home')}</span><span class="brand-name">Residence Tracker</span></div>
        <select id="resSelect" aria-label="Residence">${options([['all', 'All residences'], ...d.residences.map((r) => [r.id, r.name])], S.residenceId)}</select>
        <span class="spacer"></span>
        ${fileChip()}
        ${FileLink.linked ? btn('reload', 'Reload', 'refresh', 'sm') : ''}
        ${btn('download', 'Download .xlsx', 'download', 'sm' + (!FileLink.linked && S.save === 'dirty' ? ' attn' : ''))}
        ${btn('open-file', FileLink.linked ? 'Switch file' : 'Open file', 'folder', 'sm')}
      </header>
      <div class="layout">
        <nav class="nav" aria-label="Sections">
          ${NAV.map(([k, l, tone]) => `<button class="${S.view === k ? 'active' : ''}" data-act="nav" data-view="${k}" style="--tone:${tone}"><span class="ni">${icon(k)}</span>${l}${k === 'bills' && overdue ? `<span class="count" title="${overdue} overdue this month">${overdue}</span>` : ''}</button>`).join('')}
          <hr>
          <button data-act="settings" style="--tone:#697090"><span class="ni">${icon('settings')}</span>Settings</button>
        </nav>
        <main>${views[S.view]()}</main>
      </div>`;
  }

  function welcomeView() {
    const fs = FileLink.supported();
    return `<div class="welcome">
      <div class="card hero">
        <div class="hero-top">
          <div class="brand"><span class="logo">${icon('home')}</span>Residence Tracker</div>
          <h1>Your home expenses, kept in an Excel file you own.</h1>
          <p>Track rent or mortgage, utilities, wifi and more across apartments and houses. Split each bill between people and see who owes whom.</p>
        </div>
        <div class="hero-body">
          ${S.bootError ? `<div class="callout err">${esc(S.bootError)}</div>` : ''}
          ${S.needsPermission ? `<div class="callout info">Reconnect to <b>${esc(FileLink.name)}</b>: your browser needs your OK to access it again.<div style="margin-top:8px">${btn('reconnect', 'Reconnect ' + FileLink.name, 'folder', 'primary')}</div></div>` : ''}
          <div class="actions">
            ${btn('open-file', 'Open workbook…', 'folder', 'primary')}
            ${btn('create-file', 'Create new workbook', 'plus')}
            ${btn('create-sample', 'Start with sample data', '', 'ghost')}
          </div>
          <div class="features">
            <div class="feature"><span class="tile" style="--c:#10b981">${icon('table')}</span><b>Excel is the database</b><span>Every change is saved straight into your .xlsx — and edits made in Excel show up here.</span></div>
            <div class="feature"><span class="tile" style="--c:#f59e0b">${icon('split')}</span><b>Split any way</b><span>Equal, percent, shares, fixed dollar amounts, or “$75 more than half”.</span></div>
            <div class="feature"><span class="tile" style="--c:#ec4899">${icon('balances')}</span><b>See who owes whom</b><span>Log who paid, and balances with a full line-item breakdown update instantly.</span></div>
          </div>
          ${fs ? '' : '<div class="callout">This browser can’t write to files directly. You can still open a workbook, edit, and use <b>Download .xlsx</b> to save. For automatic saving into the file, use Chrome or Edge.</div>'}
        </div>
      </div>
    </div>`;
  }

  function render() {
    const y = window.scrollY;
    $('#app').innerHTML = S.db ? shell() : welcomeView();
    window.scrollTo(0, y);
  }

  /* ========================================================== forms */

  function openPersonForm(id) {
    const p = id ? person(id) : { name: '', email: '', color: RT.PALETTE[S.db.people.length % RT.PALETTE.length], active: true };
    openModal({
      title: id ? 'Edit person' : 'Add person',
      body: `<div class="form-grid">
        ${field('Name', `<input name="name" required value="${esc(p.name)}">`, 'full')}
        ${field('Email (optional)', `<input name="email" type="email" value="${esc(p.email)}">`)}
        ${field('Color', `<input name="color" type="color" value="${esc(p.color)}">`)}
        <label class="check full"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active (shows up in new splits)</label></div>`,
      onSubmit: (fd) => {
        commit((db) => {
          const rec = id ? db.people.find((x) => x.id === id) : { id: store.uid('p') };
          Object.assign(rec, { name: fd.get('name').trim(), email: fd.get('email').trim(), color: fd.get('color'), active: fd.get('active') === 'on' });
          if (!id) db.people.push(rec);
        });
      },
    });
  }

  function deletePerson(id) {
    const p = person(id), d = S.db;
    const used = d.payments.some((x) => x.paidById === id) || d.settlements.some((s) => s.fromId === id || s.toId === id) || d.expenses.some((e) => e.paidById === id);
    if (used) {
      openModal({
        title: 'Cannot delete ' + p.name,
        body: `<p style="margin:0">${esc(p.name)} appears in payments, settlements or as a default payer, so deleting would corrupt the history. Mark them <b>inactive</b> instead — they'll disappear from new splits but history stays intact.</p>`,
        submit: 'Mark inactive',
        onSubmit: () => commit((db) => { db.people.find((x) => x.id === id).active = false; }),
      });
      return;
    }
    confirmBox('Delete person', `Delete <b>${esc(p.name)}</b>? They'll be removed from residents and splits.`, 'Delete', () => commit((db) => {
      db.people = db.people.filter((x) => x.id !== id);
      db.residents = db.residents.filter((x) => x.personId !== id);
      db.splits = db.splits.filter((x) => x.personId !== id);
    }));
  }

  function openResidenceForm(id) {
    const r = id ? residence(id) : { name: '', type: 'Apartment', tenure: 'Renting', address1: '', address2: '', city: '', state: '', postalCode: '', country: '', startDate: '', endDate: '', notes: '' };
    const members = new Set(S.db.residents.filter((x) => x.residenceId === id).map((x) => x.personId));
    openModal({
      title: id ? 'Edit residence' : 'Add residence',
      body: `<div class="form-grid">
        ${field('Name', `<input name="name" required value="${esc(r.name)}" placeholder="e.g. Maple Street Apartment">`, 'full')}
        ${field('Type', `<select name="type">${options(['Apartment', 'House', 'Condo', 'Townhouse', 'Room', 'Other'].map((x) => [x, x]), r.type)}</select>`)}
        ${field('Tenure', `<select name="tenure">${options(['Renting', 'Mortgage', 'Owned'].map((x) => [x, x]), r.tenure)}</select>`)}
        ${field('Address line 1', `<input name="address1" autocomplete="address-line1" value="${esc(r.address1)}" placeholder="Street address">`, 'full')}
        ${field('Address line 2', `<input name="address2" autocomplete="address-line2" value="${esc(r.address2)}" placeholder="Apt, unit, suite (optional)">`, 'full')}
        ${field('City', `<input name="city" autocomplete="address-level2" value="${esc(r.city)}">`)}
        ${field('State / Province', `<input name="state" autocomplete="address-level1" value="${esc(r.state)}">`)}
        ${field('ZIP / Postal code', `<input name="postalCode" autocomplete="postal-code" value="${esc(r.postalCode)}">`)}
        ${field('Country', `<input name="country" autocomplete="country-name" value="${esc(r.country)}">`)}
        ${field('Start date', `<input type="date" name="startDate" value="${esc(r.startDate)}">`)}
        ${field('End date', `<input type="date" name="endDate" value="${esc(r.endDate)}">`)}
        <div class="field full"><span class="lbl">Residents</span><div class="chips" style="gap:10px">${S.db.people.length ? S.db.people.map((p) => `
          <label class="check"><input type="checkbox" name="res_${esc(p.id)}" ${members.has(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('') : '<span class="muted">Add people first.</span>'}</div></div>
        ${field('Notes', `<textarea name="notes">${esc(r.notes)}</textarea>`, 'full')}</div>`,
      onSubmit: (fd) => {
        commit((db) => {
          const rec = id ? db.residences.find((x) => x.id === id) : { id: store.uid('r') };
          Object.assign(rec, { name: fd.get('name').trim(), type: fd.get('type'), tenure: fd.get('tenure'), address1: fd.get('address1').trim(), address2: fd.get('address2').trim(), city: fd.get('city').trim(), state: fd.get('state').trim(), postalCode: fd.get('postalCode').trim(), country: fd.get('country').trim(), startDate: fd.get('startDate'), endDate: fd.get('endDate'), notes: fd.get('notes').trim() });
          if (!id) db.residences.push(rec);
          db.residents = db.residents.filter((x) => x.residenceId !== rec.id);
          db.people.forEach((p) => { if (fd.get('res_' + p.id) === 'on') db.residents.push({ residenceId: rec.id, personId: p.id }); });
        });
      },
    });
  }

  function deleteResidence(id) {
    const r = residence(id), d = S.db;
    const exps = d.expenses.filter((e) => e.residenceId === id);
    const pays = d.payments.filter((p) => exps.some((e) => e.id === p.expenseId));
    confirmBox('Delete residence', `Delete <b>${esc(r.name)}</b> along with its <b>${exps.length}</b> expense(s) and <b>${pays.length}</b> recorded payment(s)? This cannot be undone (except by restoring your workbook).`, 'Delete everything', () => commit((db) => {
      const eids = new Set(exps.map((e) => e.id));
      db.expenses = db.expenses.filter((e) => e.residenceId !== id);
      db.payments = db.payments.filter((p) => !eids.has(p.expenseId));
      db.splits = db.splits.filter((s) => !eids.has(s.expenseId));
      db.residents = db.residents.filter((x) => x.residenceId !== id);
      db.settlements = db.settlements.filter((s) => s.residenceId !== id);
      db.residences = db.residences.filter((x) => x.id !== id);
      normalizeSelection();
    }));
  }

  function openExpenseForm(id, preset = {}) {
    const d = S.db;
    if (!d.residences.length) { toast('Add a residence first.', 'err'); openResidenceForm(); return; }
    if (!d.people.length) { toast('Add some people first.', 'err'); openPersonForm(); return; }
    const today = C.todayISO();
    const e = id ? expense(id) : Object.assign({
      residenceId: S.residenceId !== 'all' ? S.residenceId : d.residences[0].id, name: '', category: '', amount: '', frequency: 'Monthly',
      dueDay: '', startDate: S.period + '-01', endDate: '', paidById: '', splitMethod: 'Equal', variable: false, active: true, notes: '',
    }, preset);
    if (!e.amount) e.amount = '';
    const existing = new Map(d.splits.filter((s) => s.expenseId === id).map((s) => [s.personId, s.value]));
    const categories = [...new Set(['Rent', 'Mortgage', 'Utilities', 'Internet', 'Insurance', 'Taxes', 'Maintenance', 'Subscriptions', 'Groceries', 'Other', ...d.expenses.map((x) => x.category).filter(Boolean)])];

    const participantRows = (resId, method, checkedMap) => {
      const resMembers = new Set(d.residents.filter((x) => x.residenceId === resId).map((x) => x.personId));
      const people = d.people.filter((p) => p.active || checkedMap.has(p.id)).sort((a, b) => (resMembers.has(b.id) - resMembers.has(a.id)) || a.name.localeCompare(b.name));
      const useDefault = !checkedMap.size;
      return `<table class="split-table"><thead><tr><th>Include</th><th>Person</th><th class="valcol num">${{ Percent: 'Percent', Shares: 'Weight', Fixed: 'Pays exactly ($)', Offset: 'Pays more / less ($)' }[method] || ''}</th><th class="num">≈ per bill</th></tr></thead><tbody>${people.map((p) => {
        const on = useDefault ? resMembers.has(p.id) : checkedMap.has(p.id);
        let val = checkedMap.has(p.id) ? checkedMap.get(p.id) : (method === 'Percent' ? '' : 1);
        if ((method === 'Fixed' || method === 'Offset') && !val) val = '';
        return `<tr><td><input type="checkbox" name="inc_${esc(p.id)}" ${on ? 'checked' : ''}></td><td>${personTag(p.id)}</td>
          <td class="valcol num"><input type="number" step="any" ${method === 'Offset' ? '' : 'min="0"'} name="val_${esc(p.id)}" value="${esc(val)}" placeholder="${method === 'Fixed' ? 'the rest' : method === 'Offset' ? '0' : ''}"></td><td class="num preview" data-pid="${esc(p.id)}"></td></tr>`;
      }).join('')}</tbody></table>
      <div class="hint split-note"></div>`;
    };

    openModal({
      title: id ? 'Edit expense' : (preset.frequency === 'One-time' ? 'Add one-time bill' : 'Add expense'),
      wide: true,
      body: `<div class="form-grid">
        <div class="form-section">Basics</div>
        ${id ? '' : field('Start from', `<select name="templateId"><option value="">Ad hoc — type your own</option>${options(d.expenseTypes.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.id, t.name + (t.category ? ' · ' + t.category : '')]), e.templateId || '')}</select>`, 'full', 'Pick from your expense list to pre-fill, or leave as ad hoc.')}
        ${field('Name', `<input name="name" required value="${esc(e.name)}" placeholder="e.g. Rent, Water, Wi-Fi">`)}
        ${field('Residence', `<select name="residenceId" required>${residenceOptions(e.residenceId)}</select>`)}
        ${field('Category', `<input name="category" list="catlist" value="${esc(e.category)}"><datalist id="catlist">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
        ${field('Amount', `<input name="amount" type="number" step="0.01" min="0" required value="${esc(e.amount)}" placeholder="0.00">`)}
        ${field('Amount type', seg('amountType', [['Fixed', 'Fixed'], ['Variable', 'Variable']], e.variable ? 'Variable' : 'Fixed'), 'full', 'Fixed = same every month. Variable = changes; the amount is an estimate until you enter the real bill.')}
        <div class="form-section">Schedule</div>
        ${field('Frequency', `<select name="frequency">${options(['Monthly', 'Quarterly', 'Yearly', 'One-time'].map((x) => [x, x]), e.frequency)}</select>`)}
        ${field('Due day of month', `<input name="dueDay" type="number" min="1" max="31" value="${esc(e.dueDay || '')}">`, '', 'Blank = day of the start date')}
        ${field('Start date', `<input type="date" name="startDate" required value="${esc(e.startDate)}">`, '', 'First bill. Quarterly/yearly repeat from here.')}
        ${field('End date (optional)', `<input type="date" name="endDate" value="${esc(e.endDate)}">`)}
        <div class="form-section">Who pays &amp; how it's split</div>
        ${field('Usually paid by', `<select name="paidById">${personOptions(e.paidById, '— choose —')}</select>`, '', 'Default payer. You can change it per bill.')}
        ${field('Split method', `<select name="splitMethod">${options([['Equal', 'Equal'], ['Percent', 'By percent'], ['Shares', 'By shares / weight'], ['Fixed', 'Fixed $ amounts — others split the rest'], ['Offset', 'Equal, but some pay $ more / less']], e.splitMethod)}</select>`)}
        ${id ? '<div></div>' : `<label class="check" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="saveToList"> Save to my expense list</label>`}
        <div id="participants" class="split-wrap full"></div>
        <div class="form-section">Extras</div>
        ${field('Payment portal / website', `<input name="portalUrl" placeholder="e.g. https://www.mypowercompany.com/pay" value="${esc(e.portalUrl || '')}">`, 'full', 'Adds a Portal button that opens this site in a new tab. Don\'t store passwords here — the workbook is a plain file.')}
        ${field('Notes', `<textarea name="notes">${esc(e.notes)}</textarea>`, 'full')}
        <label class="check full"><input type="checkbox" name="active" ${e.active ? 'checked' : ''}> Active (inactive expenses stop generating bills)</label>
      </div>`,
      onOpen: (form) => {
        const box = $('#participants', form);
        let current = existing;
        let prevMethod = form.splitMethod.value;
        const draw = () => {
          // preserve what the user typed when only the method/amount changes
          box.innerHTML = participantRows(form.residenceId.value, form.splitMethod.value, current);
          preview();
        };
        const readCurrent = () => {
          const m = new Map();
          form.querySelectorAll('input[name^="inc_"]').forEach((cb) => { if (cb.checked) m.set(cb.name.slice(4), num(form['val_' + cb.name.slice(4)].value)); });
          return m;
        };
        const preview = () => {
          const method = form.splitMethod.value, amount = num(form.amount.value);
          form.querySelectorAll('.valcol').forEach((c) => c.classList.toggle('hidden', method === 'Equal'));
          const ids = [...form.querySelectorAll('input[name^="inc_"]')].filter((cb) => cb.checked).map((cb) => cb.name.slice(4));
          const fake = { id: '__preview', residenceId: form.residenceId.value, splitMethod: method };
          const tmp = { people: d.people, residents: [], splits: ids.map((pid) => ({ expenseId: '__preview', personId: pid, value: method === 'Equal' ? 1 : num(form['val_' + pid].value) })) };
          const amts = new Map(C.splitAmounts(tmp, fake, amount).map((s) => [s.personId, s.amount]));
          form.querySelectorAll('.preview').forEach((c) => { c.textContent = amts.has(c.dataset.pid) ? money(amts.get(c.dataset.pid)) : ''; });
          const note = form.querySelector('.split-note');
          if (method === 'Percent') {
            const tot = ids.reduce((a, pid) => a + num(form['val_' + pid].value), 0);
            note.innerHTML = Math.abs(tot - 100) < 0.01 ? `<span class="good">Total ${tot}% ✓</span>` : `<span class="bad">Total ${round2(tot)}% — percentages will be scaled to add up to 100%.</span>`;
          } else if (method === 'Fixed') {
            const vals = ids.map((pid) => num(form['val_' + pid].value));
            const fixed = round2(vals.reduce((a, b) => a + b, 0)), nFree = vals.filter((v) => !v).length;
            const rest = round2(amount - fixed);
            note.innerHTML = fixed > amount + 0.004 ? `<span class="bad">Fixed amounts (${esc(money(fixed))}) are more than the bill — they will be scaled down to fit.</span>`
              : nFree ? `Fixed ${esc(money(fixed))}; the remaining ${esc(money(rest))} ${nFree === 1 ? 'goes to the person left blank.' : `is split equally between the ${nFree} people left blank.`}`
              : Math.abs(rest) < 0.005 ? '<span class="good">Fixed amounts add up to the bill ✓</span>' : `<span class="bad">Fixed amounts are ${esc(money(Math.abs(rest)))} ${rest > 0 ? 'short of' : 'over'} the bill — they will be scaled to fit.</span>`;
          } else if (method === 'Offset') {
            note.innerHTML = 'Start from an equal split, then enter how much <b>more</b> (+) or <b>less</b> (−) someone pays. The difference comes off (or goes onto) everyone left blank. E.g. +75 on one of two people: they pay $75 more than half, the other pays $75 less.';
          } else note.textContent = method === 'Shares' ? 'Weights are relative: 2 and 1 means a 2/3 – 1/3 split.' : '';
        };
        draw();
        form.addEventListener('change', (ev) => {
          if (ev.target.name === 'templateId') {
            const t = d.expenseTypes.find((x) => x.id === ev.target.value);
            if (t) {
              form.name.value = t.name; form.category.value = t.category || ''; form.amountType.value = t.variable ? 'Variable' : 'Fixed';
              form.frequency.value = t.frequency; if (t.amount) form.amount.value = t.amount;
              preview();
            }
          }
          else if (ev.target.name === 'residenceId') { current = new Map(); draw(); }
          else if (ev.target.name === 'splitMethod') {
            const m = form.splitMethod.value, amountMode = (x) => x === 'Fixed' || x === 'Offset';
            current = readCurrent();
            if (amountMode(m)) current.forEach((v, k) => current.set(k, 0));
            else if (m === 'Percent' || m === 'Shares') current.forEach((v, k) => { if (amountMode(prevMethod) || !v) current.set(k, m === 'Percent' ? 0 : 1); });
            prevMethod = m;
            draw();
          }
          else preview();
        });
        form.addEventListener('input', (ev) => { if (ev.target.name === 'amount' || ev.target.name.startsWith('val_')) preview(); });
      },
      onSubmit: (fd, form) => {
        const chosen = [...form.querySelectorAll('input[name^="inc_"]')].filter((cb) => cb.checked).map((cb) => cb.name.slice(4));
        if (!chosen.length) { toast('Pick at least one person to share this expense.', 'err'); return false; }
        const method = fd.get('splitMethod');
        const portalRaw = fd.get('portalUrl').trim(), portalUrl = safeUrl(portalRaw);
        if (portalRaw && !portalUrl) { toast('That portal address doesn’t look like a website (try https://example.com).', 'err'); return false; }
        commit((db) => {
          const rec = id ? db.expenses.find((x) => x.id === id) : { id: store.uid('e') };
          Object.assign(rec, {
            residenceId: fd.get('residenceId'), name: fd.get('name').trim(), category: fd.get('category').trim(), amount: round2(num(fd.get('amount'))),
            frequency: fd.get('frequency'), dueDay: Math.round(num(fd.get('dueDay'))) || 0, startDate: fd.get('startDate'), endDate: fd.get('endDate'),
            paidById: fd.get('paidById'), splitMethod: method, variable: fd.get('amountType') === 'Variable', active: fd.get('active') === 'on', portalUrl, notes: fd.get('notes').trim(),
          });
          if (!id) db.expenses.push(rec);
          if (!id && fd.get('saveToList') === 'on' && !db.expenseTypes.some((t) => t.name.toLowerCase() === rec.name.toLowerCase())) {
            db.expenseTypes.push({ id: store.uid('t'), name: rec.name, category: rec.category, variable: rec.variable, frequency: rec.frequency, amount: rec.amount });
          }
          db.splits = db.splits.filter((s) => s.expenseId !== rec.id);
          chosen.forEach((pid) => db.splits.push({ expenseId: rec.id, personId: pid, value: method === 'Equal' ? 1 : num(fd.get('val_' + pid)) }));
        });
      },
    });
  }

  function openTypeForm(id) {
    const t = id ? S.db.expenseTypes.find((x) => x.id === id) : { name: '', category: '', variable: false, frequency: 'Monthly', amount: '' };
    const categories = [...new Set([...S.db.expenseTypes, ...S.db.expenses].map((x) => x.category).filter(Boolean))].sort();
    openModal({
      title: id ? 'Edit list item' : 'Add to expense list',
      body: `<div class="form-grid">
        ${field('Name', `<input name="name" required value="${esc(t.name)}" placeholder="e.g. Pest control">`, 'full')}
        ${field('Category', `<input name="category" list="typecats" value="${esc(t.category)}"><datalist id="typecats">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
        ${field('Amount type', seg('amountType', [['Fixed', 'Fixed'], ['Variable', 'Variable']], t.variable ? 'Variable' : 'Fixed'), '', 'Fixed = same every month')}
        ${field('Usual frequency', `<select name="frequency">${options(['Monthly', 'Quarterly', 'Yearly', 'One-time'].map((x) => [x, x]), t.frequency)}</select>`)}
        ${field('Typical amount (optional)', `<input name="amount" type="number" step="0.01" min="0" value="${esc(t.amount || '')}">`)}</div>
        <p class="hint" style="margin:0">List items only pre-fill the Add expense form; changing one does not alter expenses you already added.</p>`,
      onSubmit: (fd) => {
        commit((db) => {
          const rec = id ? db.expenseTypes.find((x) => x.id === id) : { id: store.uid('t') };
          Object.assign(rec, { name: fd.get('name').trim(), category: fd.get('category').trim(), variable: fd.get('amountType') === 'Variable', frequency: fd.get('frequency'), amount: round2(num(fd.get('amount'))) });
          if (!id) db.expenseTypes.push(rec);
        });
      },
    });
  }

  function deleteExpense(id) {
    const e = expense(id);
    const n = S.db.payments.filter((p) => p.expenseId === id).length;
    confirmBox('Delete expense', `Delete <b>${esc(e.name)}</b>${n ? ` and its <b>${n}</b> recorded payment(s)` : ''}? Tip: set it to inactive instead to keep history and stop future bills.`, 'Delete', () => commit((db) => {
      db.expenses = db.expenses.filter((x) => x.id !== id);
      db.payments = db.payments.filter((p) => p.expenseId !== id);
      db.splits = db.splits.filter((s) => s.expenseId !== id);
    }));
  }

  function openPayForm(expId, period, payId) {
    const e = expense(expId);
    const pay = payId ? S.db.payments.find((p) => p.id === payId) : null;
    const bill = C.billsForPeriod(S.db, period, 'all').find((b) => b.expense.id === expId && ((pay && b.payment && b.payment.id === pay.id) || (!pay && !b.payment)));
    const dflt = pay || { amount: e.amount, status: 'Paid', paidById: e.paidById, paidDate: C.todayISO(), note: '' };
    openModal({
      title: `${pay ? 'Edit payment' : 'Record payment'} · ${e.name}`,
      body: `<p class="lede">${esc(residence(e.residenceId) ? residence(e.residenceId).name : '')} · ${esc(periodLabel(period))}${bill ? ' · due ' + esc(fmtDate(bill.dueDate, true)) : ''}</p>
        <div class="form-grid">
          ${field('Amount', `<input name="amount" type="number" step="0.01" min="0" required value="${esc(dflt.amount)}">`, '', e.variable ? 'Variable bill — enter the actual amount.' : '')}
          ${field('Status', `<select name="status">${options([['Paid', 'Paid'], ['Billed', 'Billed — amount known, not paid yet']], dflt.status)}</select>`)}
          ${field('Paid by', `<select name="paidById">${personOptions(dflt.paidById, '— nobody yet —')}</select>`)}
          ${field('Paid on', `<input type="date" name="paidDate" value="${esc(dflt.paidDate)}">`)}
          ${field('Note', `<input name="note" value="${esc(dflt.note)}">`, 'full')}</div>
        <div id="splitPrev" class="chips"></div>`,
      extra: pay ? '<button type="button" class="btn danger" data-modal-action="remove">Remove record</button>' : '',
      actions: { remove: () => { commit((db) => { db.payments = db.payments.filter((p) => p.id !== payId); }); } },
      onOpen: (form) => {
        const upd = () => {
          const amts = C.splitAmounts(S.db, e, num(form.amount.value));
          $('#splitPrev', form).innerHTML = '<span class="hint" style="width:100%">Split:</span>' + amts.map((s) => chip(person(s.personId), money(s.amount))).join('');
        };
        upd(); form.amount.addEventListener('input', upd);
      },
      onSubmit: (fd) => {
        const status = fd.get('status');
        if (status === 'Paid' && !fd.get('paidById')) { toast('Choose who paid this bill.', 'err'); return false; }
        commit((db) => {
          let rec = payId ? db.payments.find((p) => p.id === payId) : null;
          if (!rec) { rec = { id: store.uid('pay'), expenseId: expId, period }; db.payments.push(rec); }
          Object.assign(rec, { amount: round2(num(fd.get('amount'))), status, paidById: fd.get('paidById'), paidDate: fd.get('paidDate'), note: fd.get('note').trim() });
        });
      },
    });
  }

  /** Line-item breakdown of one person's balance (opened from the Balances screen). */
  function openLedger(personId) {
    const p = person(personId);
    if (!p) return;
    const L = C.ledger(S.db, personId, S.residenceId);
    const first = p.name.split(' ')[0];
    const scope = S.residenceId === 'all' ? 'all residences' : ((residence(S.residenceId) || {}).name || '');
    const signed = (n) => (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + money(Math.abs(n));
    const cls = (n) => (n > 0.004 ? 'good' : n < -0.004 ? 'bad' : '');
    const paid = L.entries.filter((e) => e.kind === 'bill' && e.payerId === personId).reduce((a, e) => a + e.total, 0);
    const share = L.entries.filter((e) => e.kind === 'bill').reduce((a, e) => a + e.share, 0);
    const settled = L.entries.filter((e) => e.kind === 'settlement').reduce((a, e) => a + e.delta, 0);

    const lines = L.entries.slice().reverse().map((en) => {
      if (en.kind === 'settlement') {
        const s = en.settlement;
        return `<tr><td>${esc(fmtDate(en.date, true))}</td>
          <td><b>Settlement</b> <span class="tag">${s.fromId === personId ? 'you sent' : 'you received'}</span>${s.note ? `<div class="muted">${esc(s.note)}</div>` : ''}</td>
          <td class="num">${money(en.total)}</td><td>${personTag(s.fromId)}</td><td class="num muted">—</td>
          <td class="num"><b class="${cls(en.delta)}">${signed(en.delta)}</b></td><td class="num muted">${signed(en.running)}</td></tr>`;
      }
      const res = residence(en.expense.residenceId);
      return `<tr><td>${esc(fmtDate(en.date, true))}</td>
        <td><b>${esc(en.expense.name)}</b> <span class="muted">· ${esc(periodLabel(en.period))}</span>${S.residenceId === 'all' && res ? `<div class="muted">${esc(res.name)}</div>` : ''}
          <div class="chips" style="margin-top:4px">${en.split.map((s) => chip(person(s.personId), money(s.amount))).join('')}</div></td>
        <td class="num">${money(en.total)}</td><td>${personTag(en.payerId)}</td><td class="num">${money(en.share)}</td>
        <td class="num"><b class="${cls(en.delta)}">${signed(en.delta)}</b></td><td class="num muted">${signed(en.running)}</td></tr>`;
    }).join('');

    openModal({
      title: `${p.name} · balance breakdown`,
      wide: true,
      body: `<p class="lede">Showing ${esc(scope)}. For each bill: <b>effect = what ${esc(first)} paid − ${esc(first)}'s share</b>. Positive means others owe ${esc(first)}; negative means ${esc(first)} owes others.</p>
        <div class="grid cols-4" style="gap:10px">
          <div class="card stat"><div class="label">Paid out</div><div class="value" style="font-size:18px">${money(paid)}</div></div>
          <div class="card stat"><div class="label">${esc(first)}'s share</div><div class="value" style="font-size:18px">${money(share)}</div></div>
          <div class="card stat"><div class="label">Settled</div><div class="value" style="font-size:18px">${signed(settled)}</div></div>
          <div class="card stat"><div class="label">Net</div><div class="value ${cls(L.net)}" style="font-size:18px">${signed(L.net)}</div><div class="sub">${L.net > 0.004 ? 'is owed' : L.net < -0.004 ? 'owes' : 'settled'}</div></div>
        </div>
        ${L.pairs.length ? `<div><h2 style="margin-bottom:6px">With each person</h2><div class="tablewrap"><table><tbody>${L.pairs.map((x) => `
          <tr><td>${personTag(x.personId)}</td><td>${x.amount > 0 ? `owes ${esc(first)}` : `${esc(first)} owes them`}</td><td class="num"><b class="${x.amount > 0 ? 'good' : 'bad'}">${money(Math.abs(x.amount))}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}
        <div><h2 style="margin-bottom:6px">Line items (newest first)</h2>${lines ? `<div class="tablewrap"><table>
          <thead><tr><th>Date</th><th>Line item</th><th class="num">Bill total</th><th>Paid by</th><th class="num">${esc(first)}'s share</th><th class="num">Effect</th><th class="num">Running</th></tr></thead>
          <tbody>${lines}</tbody></table></div>` : '<div class="empty">No paid bills or settlements involve this person yet.</div>'}</div>`,
    });
  }

  /** Log a payment straight from an expense: pick the month, who paid, how much. */
  function openLogPaymentForm(expId) {
    const d = S.db, e = expense(expId);
    const today = C.todayISO(), cur = today.slice(0, 7);
    const isPaid = (p) => d.payments.some((x) => x.expenseId === e.id && x.period === p && x.status === 'Paid');
    // default month: the oldest scheduled month in the last 3 that is still unpaid, else this month
    let period = e.frequency === 'One-time' && e.startDate ? e.startDate.slice(0, 7) : cur;
    for (let i = -3; i <= 0 && e.frequency !== 'One-time'; i++) {
      const p = C.addMonths(cur, i);
      if (C.isScheduled(e, p) && !isPaid(p)) { period = p; break; }
    }
    const billedFor = (p) => d.payments.find((x) => x.expenseId === e.id && x.period === p && x.status === 'Billed');
    const b0 = billedFor(period);
    openModal({
      title: `Log a payment · ${e.name}`,
      extra: portalLink(e, 'Open portal to pay'),
      body: `<p class="lede">${esc(residence(e.residenceId) ? residence(e.residenceId).name : '')} · ${esc(e.frequency)} ${e.variable ? '(variable)' : '(fixed)'}</p>
        <div class="form-grid">
          ${field('Who paid', `<select name="paidById" required>${personOptions(e.paidById, '— choose —')}</select>`)}
          ${field('Amount paid', `<input name="amount" type="number" step="0.01" min="0" required value="${esc(b0 ? b0.amount : e.amount)}">`, '', e.variable ? 'Variable — enter the actual amount.' : '')}
          ${field('For month', `<input type="month" name="period" required pattern="\\d{4}-\\d{2}" value="${period}">`, '', 'Which month this payment covers.')}
          ${field('Paid on', `<input type="date" name="paidDate" required value="${today}">`)}
          ${field('Note', `<input name="note">`, 'full')}</div>
        <div id="logHint" class="hint"></div>
        <div id="owes" class="callout info"></div>`,
      onOpen: (form) => {
        let touched = false;
        const upd = () => {
          const amount = num(form.amount.value), payer = form.paidById.value, p = form.period.value;
          const lines = C.splitAmounts(d, e, amount).filter((s) => s.personId !== payer && s.amount > 0.004)
            .map((s) => `<b>${esc((person(s.personId) || { name: '?' }).name)}</b> owes <b>${esc((person(payer) || { name: 'the payer' }).name)}</b> ${esc(money(s.amount))}`);
          $('#owes', form).innerHTML = payer ? (lines.length ? lines.join('<br>') : 'Nobody else owes anything for this one.') : 'Choose who paid to see who owes whom.';
          const paid = d.payments.filter((x) => x.expenseId === e.id && x.period === p && x.status === 'Paid');
          $('#logHint', form).textContent = paid.length ? `Already logged for ${periodLabel(p)}: ${paid.map((x) => money(x.amount)).join(' + ')}. Saving adds another payment.`
            : billedFor(p) ? 'A billed amount exists for this month; saving marks it as paid.'
            : (!C.isScheduled(e, p) ? 'This expense is not scheduled for that month; it will be logged anyway.' : '');
        };
        form.addEventListener('input', (ev) => { if (ev.target.name === 'amount') touched = true; upd(); });
        form.addEventListener('change', (ev) => {
          if (ev.target.name === 'period' && !touched && /^\d{4}-\d{2}$/.test(form.period.value)) { const b = billedFor(form.period.value); form.amount.value = b ? b.amount : e.amount; }
          upd();
        });
        upd();
      },
      onSubmit: (fd) => {
        const p = fd.get('period');
        if (!/^\d{4}-\d{2}$/.test(p)) { toast('Pick a month like 2026-11.', 'err'); return false; }
        const amount = round2(num(fd.get('amount'))), payerId = fd.get('paidById');
        const owedLines = C.splitAmounts(S.db, e, amount).filter((s) => s.personId !== payerId && s.amount > 0.004);
        commit((db) => {
          let rec = db.payments.find((x) => x.expenseId === e.id && x.period === p && x.status === 'Billed');
          if (!rec) { rec = { id: store.uid('pay'), expenseId: e.id, period: p }; db.payments.push(rec); }
          Object.assign(rec, { amount, status: 'Paid', paidById: payerId, paidDate: fd.get('paidDate'), note: fd.get('note').trim() });
        });
        const payerName = (person(payerId) || { name: '?' }).name.split(' ')[0];
        toast(owedLines.length ? `Logged ${money(amount)} paid by ${payerName}. ` + owedLines.map((s) => `${(person(s.personId) || { name: '?' }).name.split(' ')[0]} owes ${payerName} ${money(s.amount)}`).join('; ') + '.' : `Logged ${money(amount)} paid by ${payerName}.`, 'ok');
      },
    });
  }

  function openSettlementForm(pre = {}) {
    const d = S.db;
    if (d.people.length < 2) { toast('You need at least two people to record a settlement.', 'err'); return; }
    openModal({
      title: 'Record a payment between people',
      body: `<div class="form-grid">
        ${field('From (paid)', `<select name="fromId" required>${personOptions(pre.from, '— choose —')}</select>`)}
        ${field('To (received)', `<select name="toId" required>${personOptions(pre.to, '— choose —')}</select>`)}
        ${field('Amount', `<input name="amount" type="number" step="0.01" min="0.01" required value="${esc(pre.amount || '')}">`)}
        ${field('Date', `<input name="date" type="date" required value="${C.todayISO()}">`)}
        ${field('Applies to', `<select name="residenceId">${residenceOptions(S.residenceId !== 'all' ? S.residenceId : '', 'All residences')}</select>`, 'full', 'Balances are computed per selected residence, so pick the matching one.')}
        ${field('Note', `<input name="note">`, 'full')}</div>`,
      onSubmit: (fd) => {
        if (fd.get('fromId') === fd.get('toId')) { toast('From and To must be different people.', 'err'); return false; }
        commit((db) => db.settlements.push({ id: store.uid('s'), date: fd.get('date'), residenceId: fd.get('residenceId'), fromId: fd.get('fromId'), toId: fd.get('toId'), amount: round2(num(fd.get('amount'))), note: fd.get('note').trim() }));
      },
    });
  }

  function openSettings() {
    openModal({
      title: 'Settings',
      body: `<div class="form-grid">
        ${field('Currency code', `<input name="currency" maxlength="3" required value="${esc(S.db.settings.currency)}" style="text-transform:uppercase">`, '', 'ISO code, e.g. USD, EUR, GBP, CAD')}
        <div class="field full"><span class="lbl">Workbook</span><div>${FileLink.linked ? `Linked to <b>${esc(FileLink.name)}</b>` : 'Not linked to a file on disk.'}</div>
        <span class="hint">All data lives in the workbook's sheets — People, Residences, Residents, Expenses, Splits, Payments, Settlements. Keep it closed in Excel while using the app (Excel locks open files).</span></div></div>`,
      extra: FileLink.linked ? '<button type="button" class="btn danger" data-modal-action="forget">Unlink file</button>' : '',
      actions: { forget: async () => { await FileLink.forget(); S.db = null; render(); } },
      onSubmit: (fd) => {
        const cur = fd.get('currency').trim().toUpperCase();
        try { new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }); } catch (e) { toast('Unknown currency code.', 'err'); return false; }
        commit((db) => { db.settings.currency = cur; });
      },
    });
  }

  /* ========================================================= actions */

  async function openFile() {
    try {
      if (FileLink.supported()) { await FileLink.pickOpen(); await adoptFile(); render(); }
      else $('#fileInput').click();
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'err'); }
  }

  async function createFile(sample) {
    try {
      if (FileLink.supported()) {
        await FileLink.pickCreate();
        S.db = sample ? store.sampleDb() : store.newDb();
        S.fileName = FileLink.name; S.demo = false; S.needsPermission = false;
        await flush();
      } else {
        S.db = sample ? store.sampleDb() : store.newDb();
        S.fileName = 'Residence Tracker.xlsx'; S.demo = false;
        setSave('dirty');
      }
      render();
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'err'); }
  }

  const actions = {
    nav: (el) => { S.view = el.dataset.view; savePrefs(); render(); window.scrollTo(0, 0); },
    'prev-month': () => { S.period = C.addMonths(S.period, -1); render(); },
    'next-month': () => { S.period = C.addMonths(S.period, 1); render(); },
    'this-month': () => { S.period = C.todayISO().slice(0, 7); render(); },
    'set-period': (el) => { S.period = el.dataset.period; render(); },
    pay: (el) => openPayForm(el.dataset.exp, el.dataset.period, el.dataset.pay),
    'add-expense': () => openExpenseForm(),
    'log-payment': (el) => openLogPaymentForm(el.dataset.id),
    'person-ledger': (el) => openLedger(el.dataset.id),
    'add-onetime': () => openExpenseForm(null, { frequency: 'One-time', startDate: (S.period === C.todayISO().slice(0, 7) ? C.todayISO() : S.period + '-01') }),
    'edit-expense': (el) => openExpenseForm(el.dataset.id),
    'del-expense': (el) => deleteExpense(el.dataset.id),
    'add-type': () => openTypeForm(),
    'edit-type': (el) => openTypeForm(el.dataset.id),
    'del-type': (el) => confirmBox('Remove from list', 'Remove this item from your expense list? Expenses you already added are not affected.', 'Remove', () => commit((db) => { db.expenseTypes = db.expenseTypes.filter((t) => t.id !== el.dataset.id); })),
    'use-type': (el) => { const t = S.db.expenseTypes.find((x) => x.id === el.dataset.id); if (t) openExpenseForm(null, { templateId: t.id, name: t.name, category: t.category, variable: t.variable, frequency: t.frequency, amount: t.amount || '' }); },
    'scroll-list': (el, ev) => { ev.preventDefault(); const t = $('#expense-list'); if (t) t.scrollIntoView({ behavior: 'smooth' }); },
    'add-person': () => openPersonForm(),
    'edit-person': (el) => openPersonForm(el.dataset.id),
    'del-person': (el) => deletePerson(el.dataset.id),
    'add-residence': () => openResidenceForm(),
    'edit-residence': (el) => openResidenceForm(el.dataset.id),
    'del-residence': (el) => deleteResidence(el.dataset.id),
    'add-settlement': (el) => openSettlementForm({ from: el.dataset.from, to: el.dataset.to, amount: el.dataset.amount }),
    'del-settlement': (el) => confirmBox('Delete settlement', 'Remove this recorded payment? Balances will change.', 'Delete', () => commit((db) => { db.settlements = db.settlements.filter((s) => s.id !== el.dataset.id); })),
    settings: () => openSettings(),
    'open-file': () => openFile(),
    'create-file': () => createFile(false),
    'create-sample': () => createFile(true),
    download: () => downloadCopy(),
    reload: () => reloadFromDisk(false),
    'retry-save': () => flush(),
    reconnect: async () => {
      try { await FileLink.reconnect(); await adoptFile(); render(); }
      catch (e) { S.bootError = e.message; render(); }
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('dialog') && !el.closest('#app')) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'resSelect') { S.residenceId = t.value; savePrefs(); render(); }
    else if (t.id === 'billFilter') { S.billFilter = t.value; render(); }
    else if (t.id === 'monthInput') { if (/^\d{4}-\d{2}$/.test(t.value)) { S.period = t.value; render(); } }
    else if (t.id === 'fileInput' && t.files[0]) {
      const f = t.files[0];
      f.arrayBuffer().then((buf) => {
        const db = store.parseWorkbook(buf);
        delete db._repaired;
        S.db = db; S.fileName = f.name; S.demo = false; S.save = 'idle'; normalizeSelection(); render();
      }).catch((err) => toast('Could not read that file: ' + err.message, 'err'));
      t.value = '';
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (S.db && !S.demo && (S.save === 'dirty' || S.save === 'saving' || S.save === 'error')) { e.preventDefault(); e.returnValue = ''; }
  });

  /* Pick up edits made in Excel while the app is open. */
  async function pollDisk() {
    if (document.hidden || !FileLink.linked || !S.db || saving || S.save === 'dirty' || S.save === 'error' || $('#modal').open) return;
    try { if (await FileLink.changedOnDisk()) await reloadFromDisk(true); } catch (e) { /* file busy or moved; try again later */ }
  }
  setInterval(pollDisk, 3000);
  window.addEventListener('focus', pollDisk);

  /* ============================================================ boot */

  async function boot() {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) {
      S.db = store.sampleDb(); S.demo = true; S.fileName = 'Demo.xlsx';
      if (params.get('view')) S.view = params.get('view');
      render(); return;
    }
    render();
    try {
      const st = await FileLink.restore();
      if (st === 'ready') await adoptFile();
      else if (st === 'needs-permission') S.needsPermission = true;
    } catch (e) {
      S.bootError = `Couldn't open ${FileLink.name || 'the last workbook'}: ${e.message}`;
      S.db = null;
    }
    render();
  }
  boot();
})();
