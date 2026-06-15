/* ===================================================================
   views.js — Calendar, Week, and Dashboard view rendering
   Produces HTML strings and wires view-specific interactions.
   Depends on: utils.js, api.js (createEntryOnDate, saveRow), ui.js (openDetailPanel, navigateToRow, toast)
   =================================================================== */

"use strict";

// ---------------------------------------------------------------------------
// View-level state
// ---------------------------------------------------------------------------

let calYear          = new Date().getFullYear();
let calMonth         = new Date().getMonth();   // 0-based
let weekOffset       = 0;                        // 0=current, -1=last, +1=next
let calHideCompleted = localStorage.getItem("wt-cal-hide-done") === "1";
let calSearch        = "";
let weekSearch       = "";
let calMode          = localStorage.getItem("wt-cal-mode") || "full"; // "full"=Sun-start, "work"=Mon–Fri
let weekMode         = localStorage.getItem("wt-week-mode") || "work"; // "work"=Mon-Fri, "full"=Sun-Sat

// ---------------------------------------------------------------------------
// Calendar constants
// ---------------------------------------------------------------------------

const CAL_MONTHS    = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CAL_DAYS_FULL = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CAL_DAYS_WORK = ["Mon","Tue","Wed","Thu","Fri"];

// ---------------------------------------------------------------------------
// Calendar view
// ---------------------------------------------------------------------------

function updateCalDayHeaders() {
  const container = document.getElementById("cal-day-headers");
  if (!container) return;
  const isWork = calMode === "work";
  const days   = isWork ? CAL_DAYS_WORK : CAL_DAYS_FULL;
  container.style.gridTemplateColumns = `repeat(${days.length}, 1fr)`;
  container.innerHTML = days.map((d, i) => {
    const isWeekend = !isWork && (i === 0 || i === 6);
    return `<div class="cal-day-header${isWeekend ? " cal-weekend" : ""}">${d}</div>`;
  }).join("");
}

function renderCalendar() {
  document.getElementById("cal-title").textContent = `${CAL_MONTHS[calMonth]} ${calYear}`;
  updateCalDayHeaders();

  const today    = fmtDate(new Date());
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay  = new Date(calYear, calMonth + 1, 0);
  const isWork   = calMode === "work";

  const calQ  = calSearch.toLowerCase();
  const byDate = {};
  rowData.forEach(r => {
    if (r.deleted || !r.date) return;
    if (calHideCompleted && r.completed) return;
    if (calQ && !(r.item || "").toLowerCase().includes(calQ) && !getCategories(r).some(c => c.toLowerCase().includes(calQ))) return;
    (byDate[r.date] = byDate[r.date] || []).push(r);
  });

  const cells = [];
  let numCols, numRows;

  if (isWork) {
    const firstDow  = firstDay.getDay();
    const daysToMon = firstDow === 0 ? 6 : firstDow - 1;
    const calStart  = new Date(calYear, calMonth, 1 - daysToMon);
    const lastDow   = lastDay.getDay();
    const daysToFri = lastDow === 6 ? 6 : (5 - lastDow + 7) % 7;
    const calEnd    = new Date(calYear, calMonth + 1, 0);
    calEnd.setDate(calEnd.getDate() + daysToFri);
    numCols = 5;
    numRows = Math.round((calEnd - calStart) / (7 * 86400000)) + 1;
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < 5; col++) {
        const d      = new Date(calStart);
        d.setDate(calStart.getDate() + row * 7 + col);
        const isValid = d.getMonth() === calMonth && d.getFullYear() === calYear;
        const ds      = fmtDate(d);
        cells.push({ dayNum: d.getDate(), isValid, dateStr: isValid ? ds : "", isWeekend: false });
      }
    }
  } else {
    const startDow  = firstDay.getDay();
    const totalDays = lastDay.getDate();
    numCols = 7;
    numRows = Math.ceil((startDow + totalDays) / 7);
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < 7; col++) {
        const dayNum    = row * 7 + col - startDow + 1;
        const isValid   = dayNum >= 1 && dayNum <= totalDays;
        const dateStr   = isValid ? `${calYear}-${pad2(calMonth+1)}-${pad2(dayNum)}` : "";
        const isWeekend = (col === 0 || col === 6);
        cells.push({ dayNum, isValid, dateStr, isWeekend });
      }
    }
  }

  let html = "";
  cells.forEach(({ dayNum, isValid, dateStr, isWeekend }) => {
    const isToday = dateStr === today;
    const items   = isValid ? (byDate[dateStr] || []) : [];
    html += `<div class="cal-cell${!isValid?" cal-cell--empty":""}${isToday?" cal-cell--today":""}${isWeekend?" cal-cell--weekend":""}"
                 data-date="${dateStr}"
                 ${isValid?`ondragover="event.preventDefault();this.classList.add('cal-drop-target')"
                             ondragleave="this.classList.remove('cal-drop-target')"
                             ondrop="calDropHandler(event,this)"`:""}>`;
    if (isValid) {
      html += `<div class="cal-day-num${isToday?" cal-today-num":""}">${dayNum}</div>`;
      items.forEach(r => {
        const isPast = !r.completed && r.date < today;
        const cls    = r.completed ? "cal-chip--done" : isPast ? "cal-chip--overdue" : "";
        html += `<div class="cal-chip ${cls}" data-id="${r.id}" draggable="true">${esc(r.item)}</div>`;
      });
    }
    html += `</div>`;
  });

  const calGrid = document.getElementById("cal-grid");
  calGrid.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;
  calGrid.style.gridTemplateRows    = `repeat(${numRows}, 1fr)`;
  calGrid.innerHTML = html;

  // Click chips → open detail panel
  calGrid.querySelectorAll(".cal-chip[data-id]").forEach(chip => {
    chip.addEventListener("click", e => {
      e.stopPropagation();
      const row = rowData.find(r => r.id === parseInt(chip.dataset.id));
      if (row) openDetailPanel(row);
    });
    chip.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", chip.dataset.id);
      e.dataTransfer.effectAllowed = "move";
      chip.classList.add("cal-chip--dragging");
    });
    chip.addEventListener("dragend", () => chip.classList.remove("cal-chip--dragging"));
  });

  // Double-click on a valid day cell → create new entry on that date
  calGrid.querySelectorAll(".cal-cell:not(.cal-cell--empty)").forEach(cell => {
    cell.addEventListener("dblclick", e => {
      if (e.target.closest(".cal-chip")) return;
      createEntryOnDate(cell.dataset.date);
    });
  });
}

async function calDropHandler(event, cellEl) {
  event.preventDefault();
  cellEl.classList.remove("cal-drop-target");
  const id      = parseInt(event.dataTransfer.getData("text/plain"));
  const newDate = cellEl.dataset.date;
  if (!newDate || !id) return;
  const row = rowData.find(r => r.id === id);
  if (!row || row.date === newDate) return;
  row.date          = newDate;
  row.last_modified = fmtDateTime(new Date());
  await saveRow(row);
  renderCalendar();
  if (gridApi) gridApi.applyTransaction({ update: [row] });
}

function calNavMonth(delta) {
  calMonth += delta;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  renderCalendar();
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

function getWeekStart(offset = 0) {
  const d         = new Date();
  const targetDow = weekMode === "full" ? 0 : 1;  // 0=Sun, 1=Mon
  const curr      = d.getDay();
  const diff      = (curr - targetDow + 7) % 7;
  d.setDate(d.getDate() - diff + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function renderWeekItem(r, isPast) {
  const overdue = !r.completed && isPast;
  const cls     = r.completed ? "week-item--done" : overdue ? "week-item--overdue" : "";
  return `<div class="week-item ${cls}" data-id="${r.id}" draggable="true">
    <div class="week-item-dot"></div>
    <div class="week-item-body">
      <div class="week-item-name">${esc(r.item || "(no name)")}</div>
      ${r.time     ? `<div class="week-item-time">${esc(fmtTime12h(r.time))}</div>` : ""}
      ${getCategories(r).length ? `<div class="week-item-cat">${esc(getCategories(r).join(", "))}</div>` : ""}
    </div>
  </div>`;
}

function sortByTime(items) {
  return [...items].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
  });
}

function renderWeekView() {
  const colCount   = weekMode === "work" ? 5 : 7;
  const weekStart  = getWeekStart(weekOffset);
  const days       = [];
  for (let i = 0; i < colCount; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  const today = fmtDate(new Date());
  const opts  = { month: "short", day: "numeric" };
  const endDay = days[days.length - 1];
  document.getElementById("week-title").textContent =
    `${days[0].toLocaleDateString(undefined, opts)} – ${endDay.toLocaleDateString(undefined, opts)}, ${days[0].getFullYear()}`;

  const wkQ    = weekSearch.toLowerCase();
  const byDate = {};
  rowData.forEach(r => {
    if (r.deleted) return;
    if (calHideCompleted && r.completed) return;
    if (wkQ && !(r.item || "").toLowerCase().includes(wkQ) && !getCategories(r).some(c => c.toLowerCase().includes(wkQ))) return;
    const key = r.date || "__none__";
    (byDate[key] = byDate[key] || []).push(r);
  });
  Object.keys(byDate).forEach(k => { byDate[k] = sortByTime(byDate[k]); });

  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let html = "";

  days.forEach(d => {
    const ds        = fmtDate(d);
    const isToday   = ds === today;
    const isPast    = ds < today;
    const items     = byDate[ds] || [];
    const dow       = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayLabel  = `${DAY_NAMES[dow]} ${d.getDate()}`;

    html += `<div class="week-col${isToday?" week-col--today":""}${isWeekend?" week-col--weekend":""}"
               data-date="${ds}" ondragover="event.preventDefault();this.classList.add('week-drop-target')"
               ondragleave="this.classList.remove('week-drop-target')"
               ondrop="weekDropHandler(event,this)">
      <div class="week-col-header">
        <span class="week-col-day">${dayLabel}</span>
        ${items.length ? `<span class="week-col-count">${items.length}</span>` : ""}
      </div>
      <div class="week-col-items">`;

    if (!items.length) {
      html += `<div class="week-empty">—</div>`;
    } else {
      items.forEach(r => { html += renderWeekItem(r, isPast); });
    }
    html += `</div></div>`;
  });

  // Unscheduled column
  const unscheduled = sortByTime(byDate["__none__"] || []);
  html += `<div class="week-col week-col--unscheduled"
               data-date="__none__" ondragover="event.preventDefault();this.classList.add('week-drop-target')"
               ondragleave="this.classList.remove('week-drop-target')"
               ondrop="weekDropHandler(event,this)">
    <div class="week-col-header">
      <span class="week-col-day">No Date</span>
      ${unscheduled.length ? `<span class="week-col-count">${unscheduled.length}</span>` : ""}
    </div>
    <div class="week-col-items">`;
  if (!unscheduled.length) {
    html += `<div class="week-empty">—</div>`;
  } else {
    unscheduled.forEach(r => { html += renderWeekItem(r, false); });
  }
  html += `</div></div>`;

  const grid = document.getElementById("week-grid");
  grid.style.gridTemplateColumns = `repeat(${colCount}, 1fr) 140px`;
  grid.innerHTML = html;

  grid.querySelectorAll(".week-item[data-id]").forEach(el => {
    el.addEventListener("click", () => {
      const row = rowData.find(r => r.id === parseInt(el.dataset.id));
      if (row) openDetailPanel(row);
    });
    el.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", el.dataset.id);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("week-item--dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("week-item--dragging"));
  });

  grid.querySelectorAll(".week-col:not(.week-col--unscheduled)").forEach(col => {
    col.addEventListener("dblclick", e => {
      if (e.target.closest(".week-item")) return;
      createEntryOnDate(col.dataset.date);
    });
  });
}

async function weekDropHandler(event, colEl) {
  event.preventDefault();
  colEl.classList.remove("week-drop-target");
  const id      = parseInt(event.dataTransfer.getData("text/plain"));
  const newDate = colEl.dataset.date === "__none__" ? "" : colEl.dataset.date;
  const row     = rowData.find(r => r.id === id);
  if (!row || row.date === newDate) return;
  row.date          = newDate;
  row.last_modified = fmtDateTime(new Date());
  await saveRow(row);
  renderWeekView();
  if (gridApi) gridApi.applyTransaction({ update: [row] });
}

// ---------------------------------------------------------------------------
// Dashboard — computed entirely from localStorage, no server needed
// ---------------------------------------------------------------------------

function loadDashboard() {
  const all     = getAllItems();           // includes deleted
  const active  = all.filter(r => !r.deleted);
  const today   = fmtDate(new Date());
  const tomorrow= fmtDate(new Date(Date.now() + 86_400_000));

  const total      = active.length;
  const completed  = active.filter(r => r.completed).length;
  const incomplete = active.filter(r => !r.completed).length;
  const deleted    = all.filter(r => r.deleted).length;
  const past_due   = active.filter(r => !r.completed && r.date && r.date < today).length;
  const due_today  = active.filter(r => !r.completed && r.date === today).length;
  const due_tomorrow = active.filter(r => !r.completed && r.date === tomorrow).length;
  const no_date    = active.filter(r => !r.completed && !r.date).length;

  // By-category breakdown
  const catMap = {};
  active.forEach(r => {
    const cats = getCategories(r);
    const groups = cats.length ? cats : ["(No Category)"];
    groups.forEach(cat => {
      if (!catMap[cat]) catMap[cat] = { cat, total: 0, done: 0 };
      catMap[cat].total++;
      if (r.completed) catMap[cat].done++;
    });
  });
  const by_category = Object.values(catMap).sort((a, b) => b.total - a.total);

  // Recent items (last 12 by last_modified)
  const recent = [...active]
    .sort((a, b) => (b.last_modified || "").localeCompare(a.last_modified || ""))
    .slice(0, 12);

  // Week KPIs
  function weekKPI(start, end) {
    const items = active.filter(r => r.date && r.date >= start && r.date <= end);
    return {
      total:     items.length,
      completed: items.filter(r => r.completed).length,
      open:      items.filter(r => !r.completed).length,
      start,
      end,
    };
  }
  const tw = weekKPI(...Object.values(getWeekBounds(0)));
  const nw = weekKPI(...Object.values(getWeekBounds(1)));

  // ── Render ────────────────────────────────────────────────────────────────
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("dash-total",        total);
  setText("dash-completed",    completed);
  setText("dash-incomplete",   incomplete);
  setText("dash-deleted",      deleted);
  setText("dash-past-due",     past_due);
  setText("dash-due-today",    due_today);
  setText("dash-due-tomorrow", due_tomorrow);
  setText("dash-no-date",      no_date);

  const pct = total > 0 ? Math.round(completed / total * 100) : 0;
  setText("dash-pct", pct + "%");
  const barEl = document.getElementById("dash-bar");
  if (barEl) barEl.style.width = pct + "%";

  renderCategoryChart(by_category);
  renderRecentList(recent);

  document.getElementById("dash-tw-total").textContent = tw.total;
  document.getElementById("dash-tw-done").textContent  = tw.completed;
  document.getElementById("dash-tw-open").textContent  = tw.open;
  document.getElementById("dash-tw-range").textContent = `${tw.start} – ${tw.end}`;
  const twPct = tw.total > 0 ? Math.round(tw.completed / tw.total * 100) : 0;
  document.getElementById("dash-tw-pct").textContent = twPct + "%";
  document.getElementById("dash-tw-bar").style.width  = twPct + "%";

  document.getElementById("dash-nw-total").textContent = nw.total;
  document.getElementById("dash-nw-done").textContent  = nw.completed;
  document.getElementById("dash-nw-open").textContent  = nw.open;
  document.getElementById("dash-nw-range").textContent = `${nw.start} – ${nw.end}`;
  const nwPct = nw.total > 0 ? Math.round(nw.completed / nw.total * 100) : 0;
  document.getElementById("dash-nw-pct").textContent = nwPct + "%";
  document.getElementById("dash-nw-bar").style.width  = nwPct + "%";

  const twCard = document.getElementById("dash-tw-card");
  const nwCard = document.getElementById("dash-nw-card");
  if (twCard) twCard.onclick = () => openWeekBreakdown("This Week", tw.start, tw.end);
  if (nwCard) nwCard.onclick = () => openWeekBreakdown("Next Week", nw.start, nw.end);
}

function renderCategoryChart(cats) {
  const el = document.getElementById("category-chart");
  if (!cats.length) {
    el.innerHTML = `<div class="empty-msg">No data yet</div>`;
    return;
  }
  const max = Math.max(...cats.map(c => c.total), 1);
  el.innerHTML = cats.map(c => {
    const pct  = Math.round(c.total / max * 100);
    const dpct = c.total > 0 ? Math.round((c.done || 0) / c.total * 100) : 0;
    return `
      <div class="cat-row">
        <div class="cat-header">
          <span class="cat-name" title="${esc(c.cat)}">${esc(c.cat)}</span>
          <span class="cat-count">${c.done || 0} / ${c.total}</span>
        </div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
        <div class="cat-bar-track" style="height:4px;margin-top:2px">
          <div class="cat-done-fill" style="width:${dpct}%"></div>
        </div>
      </div>`;
  }).join("");
}

function renderRecentList(items) {
  const el = document.getElementById("recent-list");
  if (!items.length) {
    el.innerHTML = `<div class="empty-msg">No items</div>`;
    return;
  }
  el.innerHTML = items.map(r => `
    <div class="recent-item" onclick="navigateToRow(${r.id})" title="Click to open in grid">
      <div class="recent-dot ${r.completed ? "done" : ""}"></div>
      <div class="recent-info">
        <div class="recent-name">${esc(r.item || "(no name)")}</div>
        <div class="recent-meta">${esc(getCategories(r).join(", ") || "—")}</div>
      </div>
      <div class="recent-time">${esc((r.last_modified || "").slice(0, 16))}</div>
    </div>
  `).join("");
}

function openWeekBreakdown(label, startDate, endDate) {
  const items = rowData.filter(r =>
    !r.deleted && r.date && r.date >= startDate && r.date <= endDate
  );

  const catMap = {};
  items.forEach(r => {
    const cats = getCategories(r);
    const groups = cats.length ? cats : ["(No Category)"];
    groups.forEach(cat => {
      if (!catMap[cat]) catMap[cat] = { total: 0, done: 0, open: 0, items: [] };
      catMap[cat].total++;
      if (r.completed) catMap[cat].done++; else catMap[cat].open++;
      if (!catMap[cat].items.includes(r)) catMap[cat].items.push(r);
    });
  });

  const cats = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);

  document.getElementById("modal-week-title").textContent = label + " — Category Breakdown";
  document.getElementById("modal-week-range").textContent = `${startDate} – ${endDate}`;

  const body = document.getElementById("modal-week-body");
  if (!cats.length) {
    body.innerHTML = `<div class="empty-msg">No items scheduled for this week.</div>`;
  } else {
    body.innerHTML = cats.map(([cat, d]) => {
      const pct    = d.total > 0 ? Math.round(d.done / d.total * 100) : 0;
      const sorted = [...d.items].sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));
      return `
        <div class="wk-cat-section">
          <div class="wk-cat-header">
            <span class="wk-cat-name">${esc(cat)}</span>
            <div class="wk-cat-pills">
              <span class="wk-cat-pill wk-cat-pill--open">${d.open} open</span>
              <span class="wk-cat-pill wk-cat-pill--done">${d.done} done</span>
              <span class="wk-cat-pill wk-cat-pill--total">${d.total} total</span>
            </div>
          </div>
          <div class="wk-cat-bar"><div class="wk-cat-bar-fill" style="width:${pct}%"></div></div>
          <div class="wk-cat-items">
            ${sorted.map(r => `
              <div class="wk-item ${r.completed ? "wk-item--done" : ""}" onclick="navigateToRow(${r.id})" title="Click to open in grid" style="cursor:pointer">
                <span class="wk-item-dot"></span>
                <span class="wk-item-name">${esc(r.item || "(no name)")}</span>
                ${r.date ? `<span class="wk-item-date">${esc(r.date)}</span>` : ""}
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  document.getElementById("modal-week-breakdown").classList.remove("hidden");
}
