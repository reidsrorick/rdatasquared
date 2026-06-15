/* ═══════════════════════════════════════════════════════════════════
   Team Scheduler — app.js
   Vanilla ES6 · No frameworks · Full localStorage persistence
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Constants ──────────────────────────────────────────────────── */
const STORAGE_KEY   = 'teamScheduler_v2';
const GROUPS_KEY    = 'teamScheduler_groups_v1';
const SCHEMA_VER    = 2;
const STATUSES      = ['blank', 'free', 'busy', 'tentative'];
const STATUS_LABELS = { blank: '—', free: 'Free', busy: 'Busy', tentative: 'Tent.' };
const TIME_SLOTS    = (() => {
  const slots = [];
  for (let h = 9; h < 17; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots; // 9:00 – 16:30 → 16 slots
})();

/* ─── Default seed data ──────────────────────────────────────────── */
function seedData() {
  const today = new Date();
  const days  = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    // skip weekends for seed
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    days.push(fmt(d));
  }

  const participants = ['Person 1', 'Person 2', 'Person 3'];
  const schedule = {};

  days.forEach(date => {
    schedule[date] = {};
    participants.forEach(p => {
      schedule[date][p] = {};
      TIME_SLOTS.forEach(t => { schedule[date][p][t] = 'blank'; });
    });
  });

  const participantTypes = {};
  participants.forEach(p => { participantTypes[p] = 'required'; });

  return { schemaVersion: SCHEMA_VER, participants, participantTypes, days, schedule, theme: 'light', filterActive: false };
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ═══════════════════════════════════════════════════════════════════
   StorageManager
   ═══════════════════════════════════════════════════════════════════ */
class StorageManager {
  constructor(key) {
    this.key = key;
    this._saveTimer = null;
  }

  saveData(state) {
    try {
      const payload = JSON.stringify({ ...state, _savedAt: Date.now() });
      localStorage.setItem(this.key, payload);
      return true;
    } catch (e) {
      console.error('Save failed', e);
      return false;
    }
  }

  loadData() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return this._migrate(parsed);
    } catch (e) {
      console.warn('Storage corrupted, using defaults', e);
      return null;
    }
  }

  _migrate(data) {
    if (!data || typeof data !== 'object') return null;
    // v1 → v2: ensure days array order preserved
    if (!data.schemaVersion || data.schemaVersion < 2) {
      data.schemaVersion = SCHEMA_VER;
    }
    // validate required keys
    if (!Array.isArray(data.participants) || !Array.isArray(data.days) || typeof data.schedule !== 'object') {
      return null;
    }
    return data;
  }

  autoSave(state, onSave) {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const ok = this.saveData(state);
      if (ok && onSave) onSave();
    }, 400);
  }

  resetStorage() {
    localStorage.removeItem(this.key);
  }

  exportBackup(state) {
    return JSON.stringify(state, null, 2);
  }

  importBackup(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      return this._migrate(parsed);
    } catch {
      return null;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Toast
   ═══════════════════════════════════════════════════════════════════ */
class Toast {
  static show(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Scheduler (main app class)
   ═══════════════════════════════════════════════════════════════════ */
class Scheduler {
  constructor() {
    this.storage              = new StorageManager(STORAGE_KEY);
    this.state                = null;
    this.filterActive         = false;
    this.searchQuery          = '';
    this._dragging             = false;
    this._dragStatus           = null;
    this._highlightedParticipant = null;

    this._init();
  }

  /* ── Lifecycle ─────────────────────────────────────────────────── */
  _init() {
    const saved = this.storage.loadData();
    this.state  = saved || seedData();

    this._repairSlots(); // backfill any missing time slots from old data

    // sync theme
    if (this.state.theme === 'dark') document.body.classList.add('dark-mode');
    this.filterActive = !!this.state.filterActive;

    this._bindUI();
    this._render();
    this._updateSaveIndicator('saved');
  }

  // Ensures every day/participant has all TIME_SLOTS and participantTypes exist
  _repairSlots() {
    if (!this.state.participantTypes) this.state.participantTypes = {};
    this.state.participants.forEach(p => {
      if (!this.state.participantTypes[p]) this.state.participantTypes[p] = 'required';
    });
    this.state.days.forEach(date => {
      if (!this.state.schedule[date]) this.state.schedule[date] = {};
      this.state.participants.forEach(p => {
        if (!this.state.schedule[date][p]) this.state.schedule[date][p] = {};
        TIME_SLOTS.forEach(t => {
          if (this.state.schedule[date][p][t] === undefined) {
            this.state.schedule[date][p][t] = 'blank';
          }
        });
      });
    });
  }

  _save() {
    this._updateSaveIndicator('saving');
    this.storage.autoSave(this.state, () => this._updateSaveIndicator('saved'));
  }

  _updateSaveIndicator(status) {
    const el = document.getElementById('save-indicator');
    el.className = `save-indicator ${status}`;
    if (status === 'saved') {
      const t = new Date();
      el.textContent = `Saved ${t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
    } else {
      el.textContent = 'Saving…';
    }
  }

  /* ── Bind UI events ────────────────────────────────────────────── */
  _bindUI() {
    // Dark mode
    document.getElementById('toggle-dark').addEventListener('click', () => this._toggleDark());

    // Filter
    document.getElementById('toggle-filter').addEventListener('click', () => this._toggleFilter());

    // Search
    document.getElementById('search-input').addEventListener('input', e => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this._applySearchFilter();
    });

    // Add day
    document.getElementById('btn-add-day').addEventListener('click', () => this._openDayModal());

    // People panel
    document.getElementById('btn-add-participant').addEventListener('click', () => this._openPeopleModal());
    document.getElementById('ppl-close').addEventListener('click', () => this._closeModal('people-modal'));
    document.getElementById('ppl-add-btn').addEventListener('click', () => this._addPersonRow());
    document.getElementById('people-modal').addEventListener('click', e => {
      if (e.target.id === 'people-modal') this._closeModal('people-modal');
    });

    // Groups
    document.getElementById('btn-groups').addEventListener('click', () => this._openGroupsModal());
    document.getElementById('gm-close').addEventListener('click',   () => this._closeModal('groups-modal'));
    document.getElementById('gm-save-btn').addEventListener('click',() => this._saveGroup());
    document.getElementById('gm-name-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._saveGroup();
    });
    document.getElementById('groups-modal').addEventListener('click', e => {
      if (e.target.id === 'groups-modal') this._closeModal('groups-modal');
    });

    // Export CSV
    document.getElementById('btn-export-csv').addEventListener('click', () => this._exportCSV());

    // Export JSON
    document.getElementById('btn-export-json').addEventListener('click', () => this._exportJSON());

    // Import JSON
    document.getElementById('btn-import-json').addEventListener('click', () => this._openImportModal());

    // Reset
    document.getElementById('btn-reset').addEventListener('click', () => this._openResetModal());

    // Reset modal
    document.getElementById('modal-cancel').addEventListener('click',  () => this._closeModal('modal-overlay'));
    document.getElementById('modal-confirm').addEventListener('click', () => this._confirmReset());


    // Day modal
    document.getElementById('dm-cancel').addEventListener('click',  () => this._closeModal('day-modal'));
    document.getElementById('dm-confirm').addEventListener('click', () => this._addDay());
    document.getElementById('day-date-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._addDay();
    });

    // Import modal
    document.getElementById('im-cancel').addEventListener('click',  () => this._closeModal('import-modal'));
    document.getElementById('im-confirm').addEventListener('click', () => this._importJSON());

    // Close modals on overlay click
    ['modal-overlay','day-modal','import-modal'].forEach(id => {
      document.getElementById(id).addEventListener('click', e => {
        if (e.target.id === id) this._closeModal(id);
      });
    });

    // Meeting finder
    document.getElementById('btn-find-meeting').addEventListener('click', () => this._toggleMeetingFinder());
    document.getElementById('mf-close-btn').addEventListener('click',     () => this._closeMeetingFinder());
    document.getElementById('mf-search-btn').addEventListener('click',    () => this._runMeetingSearch());
    document.getElementById('mf-clear-btn').addEventListener('click',     () => this._clearMeetingResults());

    // Duration pill buttons
    document.querySelectorAll('.mf-dur-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mf-dur-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isCustom = btn.dataset.minutes === 'custom';
        document.getElementById('mf-custom-input').classList.toggle('hidden', !isCustom);
        document.getElementById('mf-custom-label').classList.toggle('hidden', !isCustom);
      });
    });

    // Global mouseup to end drag
    document.addEventListener('mouseup', () => { this._dragging = false; this._dragStatus = null; });
  }

  /* ── Render ────────────────────────────────────────────────────── */
  _render() {
    this._renderGrid();
    this._renderAnalytics();
    document.getElementById('toggle-filter').setAttribute('aria-pressed', String(this.filterActive));
  }

  _renderGrid() {
    const container = document.getElementById('grid-container');
    container.innerHTML = '';

    if (!this.state.days.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No days added yet. Click <strong>+ Day</strong> to begin.</p></div>`;
      return;
    }

    this.state.days.forEach(date => {
      container.appendChild(this._buildDayCard(date));
    });

    this._applySearchFilter();
    if (this.filterActive) this._applyAvailabilityFilter();
    this._applyColumnHighlight();
  }

  _buildDayCard(date) {
    const { participants, schedule } = this.state;

    const card = document.createElement('div');
    card.className = 'day-card';
    card.dataset.date = date;

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'day-header';
    hdr.innerHTML = `
      <div class="day-header-info">
        <div class="day-label">${fmtDisplay(date)}</div>
        <div class="day-sub">${date}</div>
      </div>
      <div class="day-header-actions">
        <button class="day-action-btn day-reset-btn" aria-label="Reset ${date}" title="Clear all slots for this day">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M10 6A4 4 0 1 1 6 2a4 4 0 0 1 2.83 1.17L10 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 1v3H7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="day-action-btn day-remove-btn" aria-label="Remove ${date}" title="Remove day">✕</button>
      </div>`;
    hdr.querySelector('.day-reset-btn').addEventListener('click',  () => this._resetDay(date));
    hdr.querySelector('.day-remove-btn').addEventListener('click', () => this._removeDay(date));
    card.appendChild(hdr);

    // Table
    const table = document.createElement('table');
    table.className = 'schedule-table';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', `Schedule for ${fmtDisplay(date)}`);

    // Thead — build entirely with DOM methods (innerHTML += destroys event listeners)
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const timeTh = document.createElement('th');
    timeTh.className = 'col-time';
    timeTh.scope = 'col';
    timeTh.textContent = 'Time';
    hr.appendChild(timeTh);
    participants.forEach(p => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.setAttribute('aria-label', p);
      th.dataset.participant = p;
      th.addEventListener('contextmenu', e => { e.preventDefault(); this._removeParticipant(p); });
      th.title = `Right-click to remove ${p}`;
      th.appendChild(this._buildParticipantHeader(p));
      hr.appendChild(th);
    });
    const reqTh = document.createElement('th');
    reqTh.scope = 'col';
    reqTh.textContent = 'Req';
    hr.appendChild(reqTh);
    const allTh = document.createElement('th');
    allTh.scope = 'col';
    allTh.textContent = 'All';
    hr.appendChild(allTh);
    thead.appendChild(hr);
    table.appendChild(thead);

    // Tbody
    const tbody = document.createElement('tbody');
    TIME_SLOTS.forEach(time => {
      const tr = document.createElement('tr');
      tr.dataset.time = time;

      // Time cell
      const tc = document.createElement('td');
      tc.className = 'time-cell';
      tc.textContent = this._fmt12(time);
      tr.appendChild(tc);

      // Participant cells
      participants.forEach(p => {
        const status = (schedule[date]?.[p]?.[time]) || 'blank';
        const td = document.createElement('td');
        const cell = document.createElement('div');
        cell.className = 'participant-cell';
        cell.dataset.status = status;
        cell.dataset.date   = date;
        cell.dataset.time   = time;
        cell.dataset.participant = p;
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('aria-label', `${p} at ${this._fmt12(time)}: ${status}`);
        cell.innerHTML = `<span class="status-label">${STATUS_LABELS[status]}</span>`;

        cell.addEventListener('click',      () => this._cycleStatus(cell));
        cell.addEventListener('mousedown',  () => {
          if (this._highlightedParticipant && cell.dataset.participant !== this._highlightedParticipant) return;
          this._dragging = true;
          this._dragStatus = this._nextStatus(cell.dataset.status);
        });
        cell.addEventListener('mouseenter', () => { if (this._dragging) this._setStatus(cell, this._dragStatus); });
        cell.addEventListener('keydown',    e  => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._cycleStatus(cell); } });

        td.appendChild(cell);
        tr.appendChild(td);
      });

      // Req + All columns
      const { reqFree, reqTotal, reqAllFree, totalFree, total, everyoneFree } = this._calcSlot(date, time);
      const slotKey = `${date}|${time}`;

      const reqTd = document.createElement('td');
      reqTd.className = `frac-cell ${reqAllFree ? 'yes' : ''}`;
      reqTd.textContent = `${reqFree}/${reqTotal}`;
      reqTd.dataset.reqCell = slotKey;
      reqTd.dataset.tooltipDate = date;
      reqTd.dataset.tooltipTime = time;
      reqTd.addEventListener('mouseenter', e => this._showTooltip(e.currentTarget));
      reqTd.addEventListener('mouseleave', () => this._hideTooltip());
      tr.appendChild(reqTd);

      const allTd = document.createElement('td');
      allTd.className = `frac-cell ${everyoneFree ? 'yes' : ''}`;
      allTd.textContent = `${totalFree}/${total}`;
      allTd.dataset.allCell = slotKey;
      allTd.dataset.tooltipDate = date;
      allTd.dataset.tooltipTime = time;
      allTd.addEventListener('mouseenter', e => this._showTooltip(e.currentTarget));
      allTd.addEventListener('mouseleave', () => this._hideTooltip());
      tr.appendChild(allTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    card.appendChild(table);
    return card;
  }

  _buildParticipantHeader(p) {
    const type = this.state.participantTypes[p] || 'required';
    const wrap = document.createElement('div');
    wrap.className = 'p-col-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'p-col-name';
    nameSpan.textContent = p;
    nameSpan.title = 'Click to highlight column';
    nameSpan.addEventListener('click', e => {
      e.stopPropagation();
      this._toggleColumnHighlight(p);
    });

    const btn = document.createElement('button');
    btn.className = `p-type-tag p-type-${type}`;
    btn.dataset.participant = p;
    btn.textContent = type === 'required' ? 'Req' : 'Opt';
    btn.setAttribute('aria-label', `Toggle type for ${p}`);
    btn.title = 'Click to toggle Required / Optional';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      this._toggleParticipantType(p);
    });

    wrap.appendChild(nameSpan);
    wrap.appendChild(btn);
    return wrap;
  }

  _toggleParticipantType(p) {
    const cur = this.state.participantTypes[p] || 'required';
    this.state.participantTypes[p] = cur === 'required' ? 'optional' : 'required';
    // Update all tag buttons for this participant across all cards
    document.querySelectorAll(`.p-type-tag[data-participant="${p}"]`).forEach(btn => {
      const t = this.state.participantTypes[p];
      btn.textContent = t === 'required' ? 'Req' : 'Opt';
      btn.className = `p-type-tag p-type-${t}`;
    });
    // Recalculate all All? cells
    this.state.days.forEach(date => {
      TIME_SLOTS.forEach(time => this._updateSlotCalcs(date, time));
    });
    this._renderAnalytics();
    this._save();
    Toast.show(`${p} set to ${this.state.participantTypes[p]}.`);
  }

  /* ── Cell interactions ─────────────────────────────────────────── */
  _cycleStatus(cell) {
    const curr = cell.dataset.status;
    const next = this._nextStatus(curr);
    this._setStatus(cell, next);
  }

  _nextStatus(curr) {
    const idx = STATUSES.indexOf(curr);
    return STATUSES[(idx + 1) % STATUSES.length];
  }

  _setStatus(cell, status) {
    if (this._highlightedParticipant && cell.dataset.participant !== this._highlightedParticipant) return;
    const { date, time, participant } = cell.dataset;
    if (!this.state.schedule[date]) this.state.schedule[date] = {};
    if (!this.state.schedule[date][participant]) this.state.schedule[date][participant] = {};
    this.state.schedule[date][participant][time] = status;

    cell.dataset.status = status;
    cell.setAttribute('aria-label', `${participant} at ${this._fmt12(time)}: ${status}`);
    cell.querySelector('.status-label').textContent = STATUS_LABELS[status];

    this._updateSlotCalcs(date, time);
    this._renderAnalytics();
    this._save();
  }

  _updateSlotCalcs(date, time) {
    const key = `${date}|${time}`;
    const { reqFree, reqTotal, reqAllFree, totalFree, total, everyoneFree } = this._calcSlot(date, time);

    const reqEl = document.querySelector(`[data-req-cell="${key}"]`);
    if (reqEl) {
      reqEl.textContent = `${reqFree}/${reqTotal}`;
      reqEl.className = `frac-cell ${reqAllFree ? 'yes' : ''}`;
    }
    const allEl = document.querySelector(`[data-all-cell="${key}"]`);
    if (allEl) {
      allEl.textContent = `${totalFree}/${total}`;
      allEl.className = `frac-cell ${everyoneFree ? 'yes' : ''}`;
    }

    if (this.filterActive) {
      const tr = reqEl?.closest('tr');
      if (tr) tr.classList.toggle('hidden-slot', !reqAllFree);
    }
  }

  _calcSlot(date, time) {
    const { participants, participantTypes, schedule } = this.state;
    const required = participants.filter(p => (participantTypes[p] || 'required') === 'required');
    let reqFree = 0;
    required.forEach(p => {
      if ((schedule[date]?.[p]?.[time] || 'blank') === 'free') reqFree++;
    });
    let totalFree = 0;
    participants.forEach(p => {
      if ((schedule[date]?.[p]?.[time] || 'blank') === 'free') totalFree++;
    });
    const reqTotal = required.length;
    return {
      reqFree, reqTotal,
      reqAllFree: reqTotal > 0 && reqFree === reqTotal,
      totalFree, total: participants.length,
      everyoneFree: participants.length > 0 && totalFree === participants.length,
    };
  }

  // Returns per-participant statuses for tooltip display
  _slotDetails(date, time) {
    const { participants, participantTypes, schedule } = this.state;
    return participants.map(p => ({
      name: p,
      type: participantTypes[p] || 'required',
      status: schedule[date]?.[p]?.[time] || 'blank',
    }));
  }

  /* ── Tooltip ───────────────────────────────────────────────────── */
  _showTooltip(cell) {
    const date = cell.dataset.tooltipDate;
    const time = cell.dataset.tooltipTime;
    if (!date || !time) return;

    const details = this._slotDetails(date, time);
    const tt = document.getElementById('slot-tooltip');

    tt.innerHTML = `
      <div class="tt-header">${this._fmt12(time)}</div>
      <div class="tt-rows">
        ${details.map(d => `
          <div class="tt-row">
            <span class="tt-status-dot tt-dot-${d.status}"></span>
            <span class="tt-name">${d.name}</span>
            <span class="tt-type-badge tt-type-${d.type}">${d.type === 'required' ? 'Req' : 'Opt'}</span>
            <span class="tt-status tt-status-${d.status}">${STATUS_LABELS[d.status]}</span>
          </div>`).join('')}
      </div>`;

    tt.hidden = false;

    // Position: above the cell, centered
    const rect = cell.getBoundingClientRect();
    const ttW  = 200;
    let left = rect.left + rect.width / 2 - ttW / 2 + window.scrollX;
    let top  = rect.top - 8 + window.scrollY;

    // Keep within viewport horizontally
    left = Math.max(8 + window.scrollX, Math.min(left, window.innerWidth - ttW - 8 + window.scrollX));

    tt.style.width = `${ttW}px`;
    tt.style.left  = `${left}px`;
    tt.style.top   = `${top}px`;
    tt.style.transform = 'translateY(-100%)';
  }

  _hideTooltip() {
    document.getElementById('slot-tooltip').hidden = true;
  }

  /* ── Analytics ─────────────────────────────────────────────────── */
  _renderAnalytics() {
    const { participants, days, schedule } = this.state;
    let totalFree = 0;
    let allFreeSlots = 0;
    const pFree = {};
    const totalSlots = days.length * TIME_SLOTS.length;

    participants.forEach(p => pFree[p] = 0);

    days.forEach(date => {
      TIME_SLOTS.forEach(time => {
        let cnt = 0;
        participants.forEach(p => {
          const s = schedule[date]?.[p]?.[time] || 'blank';
          if (s === 'free') { cnt++; pFree[p]++; totalFree++; }
        });
        const { reqAllFree } = this._calcSlot(date, time);
        if (reqAllFree) allFreeSlots++;
      });
    });

    document.getElementById('stat-free-val').textContent = totalFree;
    document.getElementById('stat-all-val').textContent  = allFreeSlots;

    let topP = '—';
    if (participants.length) {
      topP = participants.reduce((a,b) => pFree[a] >= pFree[b] ? a : b);
      const topPct = totalSlots > 0 ? Math.round((pFree[topP]/totalSlots)*100) : 0;
      topP = `${topP} (${topPct}%)`;
    }
    document.getElementById('stat-top-val').textContent = topP;

    // per-participant bars
    const pBar = document.getElementById('stat-participants');
    pBar.innerHTML = '';
    participants.forEach(p => {
      const pct = totalSlots > 0 ? Math.round((pFree[p]/totalSlots)*100) : 0;
      const div = document.createElement('div');
      div.className = 'participant-stat';
      div.innerHTML = `
        <span class="p-name">${p}</span>
        <span class="p-pct">${pct}%</span>
        <div class="p-bar-wrap"><div class="p-bar" style="width:${pct}%"></div></div>`;
      pBar.appendChild(div);
    });
  }

  /* ── Column highlight ──────────────────────────────────────────── */
  _toggleColumnHighlight(p) {
    this._highlightedParticipant = this._highlightedParticipant === p ? null : p;
    this._applyColumnHighlight();
  }

  _applyColumnHighlight() {
    const active = this._highlightedParticipant;
    document.querySelectorAll('[data-participant]').forEach(el => {
      if (!active) {
        el.classList.remove('col-active', 'col-dimmed');
      } else if (el.dataset.participant === active) {
        el.classList.add('col-active');
        el.classList.remove('col-dimmed');
      } else {
        el.classList.add('col-dimmed');
        el.classList.remove('col-active');
      }
    });
  }

  /* ── Filters ───────────────────────────────────────────────────── */
  _toggleFilter() {
    this.filterActive = !this.filterActive;
    this.state.filterActive = this.filterActive;
    document.getElementById('toggle-filter').setAttribute('aria-pressed', String(this.filterActive));
    this._applyAvailabilityFilter();
    this._save();
  }

  _applyAvailabilityFilter() {
    document.querySelectorAll('.schedule-table tbody tr').forEach(tr => {
      const date = tr.closest('.day-card')?.dataset.date;
      const time = tr.dataset.time;
      if (!date || !time) return;
      const { reqAllFree } = this._calcSlot(date, time);
      if (this.filterActive) {
        tr.classList.toggle('hidden-slot', !reqAllFree);
      } else {
        tr.classList.remove('hidden-slot');
      }
    });
  }

  _applySearchFilter() {
    const q = this.searchQuery;
    document.querySelectorAll('.day-card').forEach(card => {
      const date  = card.dataset.date;
      const label = fmtDisplay(date).toLowerCase();
      const matchDate = !q || date.includes(q) || label.includes(q);

      // check if any participant matches
      const matchParticipant = !q || this.state.participants.some(p => p.toLowerCase().includes(q));

      card.classList.toggle('hidden-day', !matchDate && !matchParticipant);

      // dim non-matching participant columns
      if (q && matchDate) {
        const ths = card.querySelectorAll('thead th:not(.col-time)');
        this.state.participants.forEach((p, i) => {
          const match = p.toLowerCase().includes(q);
          if (ths[i]) ths[i].style.opacity = match ? '' : '.25';
          card.querySelectorAll(`[data-participant="${p}"]`).forEach(c => {
            c.style.opacity = match ? '' : '.25';
          });
        });
      } else {
        card.querySelectorAll('[style*="opacity"]').forEach(el => el.style.opacity = '');
      }
    });
  }

  /* ── Add / Remove ──────────────────────────────────────────────── */
  _addDay() {
    const input = document.getElementById('day-date-input');
    const date  = input.value;
    if (!date) { Toast.show('Please select a date.', 'error'); return; }
    if (this.state.days.includes(date)) { Toast.show('Day already exists.', 'error'); return; }
    this.state.days.push(date);
    // init schedule slots
    if (!this.state.schedule[date]) this.state.schedule[date] = {};
    this.state.participants.forEach(p => {
      if (!this.state.schedule[date][p]) {
        this.state.schedule[date][p] = {};
        TIME_SLOTS.forEach(t => { this.state.schedule[date][p][t] = 'blank'; });
      }
    });
    this._closeModal('day-modal');
    this._render();
    this._save();
    Toast.show(`Added ${fmtDisplay(date)}.`, 'success');
  }

  _resetDay(date) {
    this.state.participants.forEach(p => {
      if (!this.state.schedule[date]) this.state.schedule[date] = {};
      this.state.schedule[date][p] = {};
      TIME_SLOTS.forEach(t => { this.state.schedule[date][p][t] = 'blank'; });
    });
    // Rebuild just this card
    const old = document.querySelector(`.day-card[data-date="${date}"]`);
    if (old) old.replaceWith(this._buildDayCard(date));
    if (this.filterActive) this._applyAvailabilityFilter();
    this._renderAnalytics();
    this._save();
    Toast.show(`${fmtDisplay(date)} cleared.`);
  }

  _removeDay(date) {
    this.state.days = this.state.days.filter(d => d !== date);
    delete this.state.schedule[date];
    this._render();
    this._save();
    Toast.show(`Removed ${fmtDisplay(date)}.`);
  }

  /* ── People Modal ──────────────────────────────────────────────── */
  _openPeopleModal() {
    const list = document.getElementById('ppl-list');
    list.innerHTML = '';
    this.state.participants.forEach(p => list.appendChild(this._buildPersonRow(p)));
    this._openModal('people-modal');
    setTimeout(() => {
      const first = list.querySelector('.ppl-name-input');
      if (first) first.focus();
    }, 50);
  }

  _buildPersonRow(name) {
    const type = this.state.participantTypes[name] || 'required';
    const row  = document.createElement('div');
    row.className = 'ppl-row';
    row.dataset.originalName = name;

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'ppl-name-input modal-input';
    input.value       = name;
    input.placeholder = 'Name…';

    const applyRename = () => {
      const newName = input.value.trim();
      const oldName = row.dataset.originalName;
      if (!newName) { input.value = oldName; return; }
      if (newName === oldName) return;
      if (this.state.participants.includes(newName)) {
        Toast.show('Name already exists.', 'error');
        input.value = oldName;
        return;
      }
      this._applyRename(oldName, newName);
      row.dataset.originalName = newName;
    };
    input.addEventListener('blur',    applyRename);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = row.dataset.originalName; input.blur(); }
    });

    const typeBtn = document.createElement('button');
    typeBtn.className = `btn p-type-tag p-type-${type}`;
    typeBtn.textContent = type === 'required' ? 'Req' : 'Opt';
    typeBtn.title = 'Toggle Required / Optional';
    typeBtn.addEventListener('click', () => {
      const curName = row.dataset.originalName;
      this._toggleParticipantType(curName);
      const newType = this.state.participantTypes[curName];
      typeBtn.textContent = newType === 'required' ? 'Req' : 'Opt';
      typeBtn.className   = `btn p-type-tag p-type-${newType}`;
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost ppl-del-btn';
    delBtn.title     = 'Remove person';
    delBtn.innerHTML = '✕';
    delBtn.addEventListener('click', () => {
      const curName = row.dataset.originalName;
      this._removeParticipantDirect(curName);
      row.remove();
    });

    row.appendChild(input);
    row.appendChild(typeBtn);
    row.appendChild(delBtn);
    return row;
  }

  _addPersonRow() {
    const list = document.getElementById('ppl-list');
    const row  = document.createElement('div');
    row.className = 'ppl-row';
    row.dataset.originalName = '';

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'ppl-name-input modal-input';
    input.value       = '';
    input.placeholder = 'Name…';

    const typeBtn = document.createElement('button');
    typeBtn.className   = 'btn p-type-tag p-type-required';
    typeBtn.textContent = 'Req';
    typeBtn.title       = 'Toggle Required / Optional';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost ppl-del-btn';
    delBtn.title     = 'Remove person';
    delBtn.innerHTML = '✕';
    delBtn.addEventListener('click', () => row.remove());

    const commitNew = () => {
      const name = input.value.trim();
      if (!name) { row.remove(); return; }
      if (this.state.participants.includes(name)) {
        Toast.show('Name already exists.', 'error');
        setTimeout(() => input.focus(), 0);
        return;
      }
      this.state.participants.push(name);
      this.state.participantTypes[name] = 'required';
      this.state.days.forEach(date => {
        if (!this.state.schedule[date]) this.state.schedule[date] = {};
        this.state.schedule[date][name] = {};
        TIME_SLOTS.forEach(t => { this.state.schedule[date][name][t] = 'blank'; });
      });
      this._render();
      this._save();
      Toast.show(`Added ${name}.`, 'success');

      // Convert to a committed row in place
      row.dataset.originalName = name;
      input.removeEventListener('blur', commitNew);
      const applyRename = () => {
        const newName = input.value.trim();
        const oldName = row.dataset.originalName;
        if (!newName) { input.value = oldName; return; }
        if (newName === oldName) return;
        if (this.state.participants.includes(newName)) {
          Toast.show('Name already exists.', 'error');
          input.value = oldName;
          return;
        }
        this._applyRename(oldName, newName);
        row.dataset.originalName = newName;
      };
      input.addEventListener('blur', applyRename);

      typeBtn.addEventListener('click', () => {
        const curName = row.dataset.originalName;
        this._toggleParticipantType(curName);
        const newType = this.state.participantTypes[curName];
        typeBtn.textContent = newType === 'required' ? 'Req' : 'Opt';
        typeBtn.className   = `btn p-type-tag p-type-${newType}`;
      });

      delBtn.removeEventListener('click', delBtn._tempDel);
      delBtn.addEventListener('click', () => {
        this._removeParticipantDirect(row.dataset.originalName);
        row.remove();
      });
    };

    input.addEventListener('blur',    commitNew);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { row.remove(); }
    });

    row.appendChild(input);
    row.appendChild(typeBtn);
    row.appendChild(delBtn);
    list.appendChild(row);
    input.focus();
  }

  _applyRename(oldName, newName) {
    const idx = this.state.participants.indexOf(oldName);
    if (idx !== -1) this.state.participants[idx] = newName;
    this.state.participantTypes[newName] = this.state.participantTypes[oldName] || 'required';
    delete this.state.participantTypes[oldName];
    Object.keys(this.state.schedule).forEach(date => {
      if (this.state.schedule[date][oldName] !== undefined) {
        this.state.schedule[date][newName] = this.state.schedule[date][oldName];
        delete this.state.schedule[date][oldName];
      }
    });
    this._render();
    this._save();
    Toast.show(`Renamed to "${newName}".`, 'success');
  }

  _removeParticipant(name) {
    if (!confirm(`Remove participant "${name}"?`)) return;
    this._removeParticipantDirect(name);
  }

  _removeParticipantDirect(name) {
    this.state.participants = this.state.participants.filter(p => p !== name);
    delete this.state.participantTypes[name];
    Object.keys(this.state.schedule).forEach(date => { delete this.state.schedule[date][name]; });
    this._render();
    this._save();
    Toast.show(`Removed ${name}.`);
  }

  /* ── Export / Import ───────────────────────────────────────────── */
  _exportCSV() {
    const { participants, days, schedule } = this.state;
    const rows = [['Date','Time',...participants,'Req Free','All Free']];
    days.forEach(date => {
      TIME_SLOTS.forEach(time => {
        const pVals = participants.map(p => schedule[date]?.[p]?.[time] || 'blank');
        const { reqAllFree, everyoneFree } = this._calcSlot(date, time);
        rows.push([date, this._fmt12(time), ...pVals, reqAllFree ? 'YES' : 'NO', everyoneFree ? 'YES' : 'NO']);
      });
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\r\n');
    this._download('schedule.csv', csv, 'text/csv');
    Toast.show('CSV exported.', 'success');
  }

  _exportJSON() {
    const json = this.storage.exportBackup(this.state);
    this._download('schedule_backup.json', json, 'application/json');
    Toast.show('JSON backup exported.', 'success');
  }

  _importJSON() {
    const raw = document.getElementById('import-textarea').value;
    const data = this.storage.importBackup(raw);
    if (!data) { Toast.show('Invalid JSON or schema.', 'error'); return; }
    this.state = data;
    if (this.state.theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    this.filterActive = !!this.state.filterActive;
    this._closeModal('import-modal');
    this._render();
    this._save();
    Toast.show('Backup imported successfully.', 'success');
    document.getElementById('import-textarea').value = '';
  }

  _download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── Reset ─────────────────────────────────────────────────────── */
  _confirmReset() {
    this.storage.resetStorage();
    const currentTheme = this.state.theme;
    this.state        = seedData();
    this.state.theme  = currentTheme;
    this.filterActive = false;
    this.searchQuery  = '';
    document.getElementById('search-input').value = '';
    document.getElementById('toggle-filter').setAttribute('aria-pressed', 'false');
    this._closeMeetingFinder();
    this._closeModal('modal-overlay');
    this._render();
    this._save();
    Toast.show('Scheduler reset to defaults.', 'success');
  }

  /* ── Meeting Finder ────────────────────────────────────────────── */
  _toggleMeetingFinder() {
    const panel = document.getElementById('meeting-finder');
    panel.classList.toggle('hidden');
    document.getElementById('btn-find-meeting').setAttribute('aria-pressed',
      String(!panel.classList.contains('hidden')));
  }

  _closeMeetingFinder() {
    document.getElementById('meeting-finder').classList.add('hidden');
    document.getElementById('btn-find-meeting').setAttribute('aria-pressed', 'false');
    this._clearMeetingResults();
  }

  _getMeetingMinutes() {
    const active = document.querySelector('.mf-dur-btn.active');
    if (!active) return 90;
    if (active.dataset.minutes === 'custom') {
      return Math.max(30, parseInt(document.getElementById('mf-custom-input').value, 10) || 90);
    }
    return parseInt(active.dataset.minutes, 10);
  }

  _runMeetingSearch() {
    const minutes = this._getMeetingMinutes();
    const windows = this._findMeetingWindows(minutes);
    this._renderMeetingResults(windows, minutes);
  }

  _findMeetingWindows(minutes) {
    const slotsNeeded = Math.ceil(minutes / 30);
    const results = [];

    this.state.days.forEach(date => {
      for (let i = 0; i <= TIME_SLOTS.length - slotsNeeded; i++) {
        let valid = true;
        for (let j = 0; j < slotsNeeded; j++) {
          if (!this._calcSlot(date, TIME_SLOTS[i + j]).reqAllFree) { valid = false; break; }
        }
        if (valid) {
          const startSlot = TIME_SLOTS[i];
          const lastSlot  = TIME_SLOTS[i + slotsNeeded - 1];
          const [h, m]    = lastSlot.split(':').map(Number);
          const endMins   = h * 60 + m + 30;
          const endTime   = `${String(Math.floor(endMins/60)).padStart(2,'0')}:${String(endMins%60).padStart(2,'0')}`;
          results.push({ date, startSlot, endTime, slotIndices: Array.from({length: slotsNeeded}, (_,k) => i+k) });
        }
      }
    });

    return results;
  }

  _renderMeetingResults(windows, minutes) {
    const el = document.getElementById('mf-results');
    const clearBtn = document.getElementById('mf-clear-btn');
    this._clearMeetingHighlights();

    if (!windows.length) {
      el.innerHTML = `<span class="mf-empty">No ${this._fmtDuration(minutes)} windows found where all required attendees are free.</span>`;
      el.classList.remove('hidden');
      clearBtn.hidden = false;
      return;
    }

    // Group by date
    const byDate = {};
    windows.forEach(w => {
      if (!byDate[w.date]) byDate[w.date] = [];
      byDate[w.date].push(w);
    });

    let html = `<div class="mf-summary">${windows.length} window${windows.length!==1?'s':''} found for a ${this._fmtDuration(minutes)} meeting</div><div class="mf-days">`;
    Object.entries(byDate).forEach(([date, wins]) => {
      html += `<div class="mf-day-group"><span class="mf-day-label">${fmtDisplay(date)}</span><div class="mf-windows">`;
      wins.forEach(w => {
        html += `<button class="mf-window-chip" data-date="${w.date}" data-start="${w.startSlot}" data-end="${w.endTime}" data-indices="${w.slotIndices.join(',')}">${this._fmt12(w.startSlot)} – ${this._fmt12(w.endTime)}</button>`;
      });
      html += `</div></div>`;
    });
    html += `</div>`;

    el.innerHTML = html;
    el.classList.remove('hidden');
    clearBtn.hidden = false;

    // Bind chip clicks
    el.querySelectorAll('.mf-window-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const date    = chip.dataset.date;
        const indices = chip.dataset.indices.split(',').map(Number);
        this._highlightMeetingWindow(date, indices, chip);
      });
    });
  }

  _highlightMeetingWindow(date, indices, chipEl) {
    this._clearMeetingHighlights();
    if (chipEl) {
      document.querySelectorAll('.mf-window-chip').forEach(c => c.classList.remove('active'));
      chipEl.classList.add('active');
    }

    const card = document.querySelector(`.day-card[data-date="${date}"]`);
    if (!card) return;

    card.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });

    const rows = card.querySelectorAll('tbody tr');
    indices.forEach((idx, pos) => {
      const tr = rows[idx];
      if (!tr) return;
      tr.classList.add('meeting-window');
      if (pos === 0) tr.classList.add('meeting-window-start');
      if (pos === indices.length - 1) tr.classList.add('meeting-window-end');
    });
  }

  _clearMeetingHighlights() {
    document.querySelectorAll('.meeting-window, .meeting-window-start, .meeting-window-end').forEach(el => {
      el.classList.remove('meeting-window', 'meeting-window-start', 'meeting-window-end');
    });
    document.querySelectorAll('.mf-window-chip').forEach(c => c.classList.remove('active'));
  }

  _clearMeetingResults() {
    this._clearMeetingHighlights();
    document.getElementById('mf-results').classList.add('hidden');
    document.getElementById('mf-results').innerHTML = '';
    document.getElementById('mf-clear-btn').hidden = true;
  }

  _fmtDuration(minutes) {
    if (minutes < 60) return `${minutes}-min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}-hour`;
  }

  /* ── Participant Groups ─────────────────────────────────────────── */
  _loadGroups() {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}');
    } catch { return {}; }
  }

  _persistGroups(groups) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  }

  _openGroupsModal() {
    this._renderGroupsList();
    document.getElementById('gm-name-input').value = '';
    this._openModal('groups-modal');
    setTimeout(() => document.getElementById('gm-name-input').focus(), 50);
  }

  _renderGroupsList() {
    const groups = this._loadGroups();
    const list   = document.getElementById('gm-list');
    const names  = Object.keys(groups);

    if (!names.length) {
      list.innerHTML = `<div class="gm-empty">No groups saved yet.</div>`;
      return;
    }

    list.innerHTML = '';
    names.forEach(name => {
      const g    = groups[name];
      const row  = document.createElement('div');
      row.className = 'gm-row';

      const info = document.createElement('div');
      info.className = 'gm-row-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'gm-row-name';
      nameEl.textContent = name;

      const members = document.createElement('span');
      members.className = 'gm-row-members';
      members.textContent = g.participants.join(', ');

      info.appendChild(nameEl);
      info.appendChild(members);

      const actions = document.createElement('div');
      actions.className = 'gm-row-actions';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-secondary btn-xs';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => this._loadGroup(name));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost btn-xs gm-del-btn';
      delBtn.textContent = '✕';
      delBtn.title = `Delete "${name}"`;
      delBtn.addEventListener('click', () => { this._deleteGroup(name); this._renderGroupsList(); });

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  _saveGroup() {
    const input = document.getElementById('gm-name-input');
    const name  = input.value.trim();
    if (!name) { Toast.show('Enter a group name.', 'error'); return; }

    const groups = this._loadGroups();
    const isOverwrite = !!groups[name];

    groups[name] = {
      participants:     [...this.state.participants],
      participantTypes: { ...this.state.participantTypes },
    };
    this._persistGroups(groups);
    input.value = '';
    this._renderGroupsList();
    Toast.show(`Group "${name}" ${isOverwrite ? 'updated' : 'saved'}.`, 'success');
  }

  _loadGroup(name) {
    const groups = this._loadGroups();
    const g = groups[name];
    if (!g) return;

    // Merge: keep existing schedule data, add blank slots for new participants
    this.state.participants     = [...g.participants];
    this.state.participantTypes = { ...g.participantTypes };

    this.state.days.forEach(date => {
      if (!this.state.schedule[date]) this.state.schedule[date] = {};
      g.participants.forEach(p => {
        if (!this.state.schedule[date][p]) {
          this.state.schedule[date][p] = {};
          TIME_SLOTS.forEach(t => { this.state.schedule[date][p][t] = 'blank'; });
        }
      });
    });

    this._closeModal('groups-modal');
    this._render();
    this._save();
    Toast.show(`Loaded group "${name}".`, 'success');
  }

  _deleteGroup(name) {
    const groups = this._loadGroups();
    delete groups[name];
    this._persistGroups(groups);
    Toast.show(`Deleted group "${name}".`);
  }

  /* ── Dark mode ─────────────────────────────────────────────────── */
  _toggleDark() {
    const isDark = document.body.classList.toggle('dark-mode');
    this.state.theme = isDark ? 'dark' : 'light';
    const btn = document.getElementById('toggle-dark');
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    this._save();
  }

  /* ── Modals ────────────────────────────────────────────────────── */
  _openDayModal() {
    const input = document.getElementById('day-date-input');
    input.value = fmt(new Date());
    this._openModal('day-modal');
    setTimeout(() => input.focus(), 50);
  }

  _openImportModal() {
    document.getElementById('import-textarea').value = '';
    this._openModal('import-modal');
  }

  _openResetModal() {
    this._openModal('modal-overlay');
  }

  _openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
  _closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  /* ── Helpers ───────────────────────────────────────────────────── */
  _fmt12(time) {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12    = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${suffix}`;
  }
}

/* ─── Boot ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  window._scheduler = new Scheduler();
});
