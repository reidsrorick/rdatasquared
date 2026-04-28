/* ===================================================================
   ui.js — UI components: toast, modals, detail panel, theme,
           snooze, hidden-row actions, notifications, view switching.
   Depends on: utils.js, storage.js, api.js (saveRow, loadRows, updateDeletedBadge)
   =================================================================== */

"use strict";

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<div class="toast-dot"></div><span>${esc(message)}</span>`;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => {
    el.classList.add("removing");
    el.addEventListener("animationend", () => el.remove());
  }, 3200);
}

// ---------------------------------------------------------------------------
// Save status indicator
// ---------------------------------------------------------------------------

function setSaveStatus(state) {
  const el  = document.getElementById("save-status");
  const map = {
    saving: ["save-saving", "● Saving…"],
    saved:  ["save-saved",  "● Saved"  ],
    error:  ["save-error",  "● Error"  ],
  };
  const [cls, txt] = map[state] || [];
  el.className   = cls || "";
  el.textContent = txt || "";
}

// ---------------------------------------------------------------------------
// Row count and filter summary
// ---------------------------------------------------------------------------

function updateRowCount() {
  if (!gridApi) return;
  let n = 0;
  gridApi.forEachNodeAfterFilter(() => n++);
  document.getElementById("row-count").textContent = `${n} row${n !== 1 ? "s" : ""}`;
  updateFilterSummary();
  updatePastDueBadge();
}

function updateFilterSummary() {
  const parts = [];
  if (activePreset !== "all") parts.push(document.querySelector(`.preset-btn[data-preset="${activePreset}"]`)?.textContent?.trim() || activePreset);
  if (activeCategoryFilters.length === 1) parts.push(activeCategoryFilters[0]);
  else if (activeCategoryFilters.length > 1) parts.push(`${activeCategoryFilters.length} categories`);
  if (activeDateFilter !== "all") parts.push(document.querySelector(`#date-filter option[value="${activeDateFilter}"]`)?.textContent || activeDateFilter);
  if (activeStatusFilter) parts.push(getStatusOption(activeStatusFilter).label);
  const quick = document.getElementById("quick-filter")?.value;
  if (quick) parts.push(`"${quick}"`);

  const el      = document.getElementById("active-filter-summary");
  const clrBtn  = document.getElementById("btn-clear-filters");
  const hasFilters = parts.length > 0;
  if (el)     { el.textContent = hasFilters ? `Filtered: ${parts.join(" · ")}` : ""; el.style.display = hasFilters ? "" : "none"; }
  if (clrBtn) clrBtn.disabled = !hasFilters;
}

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

function showModal(id) { document.getElementById(id).classList.remove("hidden"); }
function hideModal(id) { document.getElementById(id).classList.add("hidden"); }

function confirm$(title, message, onOk) {
  document.getElementById("confirm-title").textContent   = title;
  document.getElementById("confirm-message").textContent = message;
  showModal("modal-confirm");

  const ok  = document.getElementById("confirm-ok");
  const can = document.getElementById("confirm-cancel");
  const cleanup = () => {
    hideModal("modal-confirm");
    ok.replaceWith(ok.cloneNode(true));
    can.replaceWith(can.cloneNode(true));
  };
  document.getElementById("confirm-ok").addEventListener("click",     () => { cleanup(); onOk(); }, { once: true });
  document.getElementById("confirm-cancel").addEventListener("click", cleanup,                       { once: true });
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function loadTheme() {
  const saved = localStorage.getItem("wt-theme") || "dark";
  document.documentElement.dataset.theme = saved;
  document.getElementById("theme-icon-dark").style.display  = saved === "dark"  ? "" : "none";
  document.getElementById("theme-icon-light").style.display = saved === "light" ? "" : "none";
}

function toggleTheme() {
  const html  = document.documentElement;
  const going = html.dataset.theme === "light" ? "dark" : "light";
  html.dataset.theme = going;
  document.getElementById("theme-icon-dark").style.display  = going === "dark"  ? "" : "none";
  document.getElementById("theme-icon-light").style.display = going === "light" ? "" : "none";
  localStorage.setItem("wt-theme", going);
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------

function switchView(view) {
  document.querySelectorAll(".view").forEach(el => {
    const isTarget = el.id === `view-${view}`;
    el.style.display = isTarget ? "" : "none";
    el.classList.toggle("active", isTarget);
  });
  document.querySelectorAll(".nav-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.view === view)
  );
  if (view === "dashboard") loadDashboard();
  if (view === "calendar")  renderCalendar();
  if (view === "week")      renderWeekView();
}

// ---------------------------------------------------------------------------
// Navigate to a specific row by id
// ---------------------------------------------------------------------------

function navigateToRow(id) {
  document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => m.classList.add("hidden"));
  switchView("grid");
  setTimeout(() => {
    clearAllFilters();
    activatePreset("all");

    let targetNode = null;
    gridApi.forEachNode(node => { if (node.data?.id === id) targetNode = node; });

    if (!targetNode) { toast("Row not found (may be deleted)", "warning"); return; }
    gridApi.ensureNodeVisible(targetNode, "middle");
    targetNode.setSelected(true, true);
    gridApi.flashCells({ rowNodes: [targetNode] });
    openDetailPanel(targetNode.data);
  }, 80);
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function openDetailPanel(row) {
  if (!row) return;
  detailRowData = row;
  populateDetailPanel(row);

  const panel = document.getElementById("detail-panel");
  applyDetailFieldVisibility();
  panel.classList.add("open");
  requestAnimationFrame(() => autoResizeTextarea(document.getElementById("detail-item")));
}

function closeDetailPanel() {
  // Silently delete rows that were created blank and never given content
  if (detailRowData?.id) {
    const savedItem = (detailRowData.item || "").trim();
    const savedDesc = (detailRowData.description || "").trim();
    if (!savedItem && !savedDesc) {
      const deadRow = detailRowData;
      // Permanently remove from localStorage (blank rows have no value)
      const all = getAllItems();
      const idx = all.findIndex(r => r.id === deadRow.id);
      if (idx >= 0) { all.splice(idx, 1); _saveAllItems(all); }
      rowData = rowData.filter(r => r !== deadRow);
      gridApi?.applyTransaction({ remove: [deadRow] });
      gridApi?.onFilterChanged();
      updateRowCount();
    }
  }
  document.getElementById("detail-panel").classList.remove("open");
  detailRowData = null;
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function populateDetailPanel(row) {
  const itemEl = document.getElementById("detail-item");
  itemEl.value = row.item || "";
  document.getElementById("detail-category").value       = row.category       || "";
  document.getElementById("detail-date").value           = row.date           || "";
  document.getElementById("detail-time").value           = row.time           || "";
  document.getElementById("detail-sort").value           = row.sort           ?? "";
  document.getElementById("detail-description").value    = row.description    || "";
  document.getElementById("detail-completed").checked    = !!row.completed;
  document.getElementById("detail-date-completed").value = row.date_completed || "";
  document.getElementById("detail-status").value         = row.status         || "";

  const linkVal = row.link || "";
  document.getElementById("detail-link").value = linkVal;
  const linkOpen = document.getElementById("detail-link-open");
  linkOpen.href          = linkVal;
  linkOpen.style.display = linkVal ? "" : "none";

  const recurOn    = document.getElementById("detail-recur-on");
  const recurCount = document.getElementById("detail-recur-count");
  const recurUnit  = document.getElementById("detail-recur-unit");
  if (recurOn && recurCount && recurUnit) {
    const rule = row.recur_rule || "";
    const recurInputs = document.querySelector(".recur-inputs");
    if (rule) {
      const [n, unit]     = rule.split(":");
      recurOn.checked     = true;
      recurCount.value    = n || "1";
      recurUnit.value     = unit || "days";
      recurCount.disabled = false;
      recurUnit.disabled  = false;
      recurInputs?.classList.add("recur-inputs--on");
    } else {
      recurOn.checked     = false;
      recurCount.value    = "1";
      recurUnit.value     = "days";
      recurCount.disabled = true;
      recurUnit.disabled  = true;
      recurInputs?.classList.remove("recur-inputs--on");
    }
  }

  document.getElementById("detail-last-modified").textContent = row.last_modified || "—";
  document.getElementById("detail-created-at").textContent    = row.created_at    || "—";
  document.getElementById("detail-id").textContent            = row.id            || "—";

  // Parent task
  const parentId         = row.parent_id || null;
  const parentIdInput    = document.getElementById("detail-parent-id");
  const parentSelectedEl = document.getElementById("detail-parent-selected");
  const parentNameEl     = document.getElementById("detail-parent-name");
  const parentSearchWrap = document.getElementById("detail-parent-search-wrap");
  const parentSearchEl   = document.getElementById("detail-parent-search");
  if (parentIdInput) parentIdInput.value = parentId || "";
  if (parentId) {
    const parentRow = rowData.find(r => r.id === parentId && !r.deleted);
    if (parentNameEl) parentNameEl.textContent = parentRow ? (parentRow.item || `#${parentId}`) : `#${parentId}`;
    if (parentSelectedEl) parentSelectedEl.style.display = "";
    if (parentSearchWrap) parentSearchWrap.style.display = "none";
  } else {
    if (parentSelectedEl) parentSelectedEl.style.display = "none";
    if (parentSearchWrap) parentSearchWrap.style.display = "";
    if (parentSearchEl)   parentSearchEl.value = "";
    const dd = document.getElementById("detail-parent-dropdown");
    if (dd) dd.style.display = "none";
  }

  renderSubtasksList(row);
  renderFollowupList(row);

  const doneBadge = document.getElementById("detail-done-badge");
  const openBadge = document.getElementById("detail-open-badge");
  doneBadge.style.display = row.completed ? "" : "none";
  openBadge.style.display = row.completed ? "none" : "";

  const snoozeBtn     = document.getElementById("btn-detail-snooze");
  const snoozeUntilEl = document.getElementById("detail-snooze-until");
  if (snoozeBtn && row.id) {
    const snoozed = isSnoozeActive(row.id);
    snoozeBtn.innerHTML = snoozed
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> Unsnooze`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> Snooze`;
    snoozeBtn.classList.toggle("btn-warning", !snoozed);
    snoozeBtn.classList.toggle("btn-ghost",    snoozed);
    if (snoozeUntilEl) {
      if (snoozed && snoozedItems[row.id]) {
        snoozeUntilEl.textContent = `Until: ${snoozedItems[row.id]}`;
        snoozeUntilEl.style.display = "";
      } else {
        snoozeUntilEl.style.display = "none";
      }
    }
  }

  const panel = document.getElementById("detail-panel");
  if (panel.classList.contains("open")) {
    requestAnimationFrame(() => autoResizeTextarea(itemEl));
  }
}

async function saveDetailPanel() {
  if (!detailRowData) return;

  const panelItem = document.getElementById("detail-item").value.trim();
  const panelDesc = document.getElementById("detail-description").value.trim();
  if (!panelItem && !panelDesc) {
    toast("Item must have a name or description before saving.", "error");
    return;
  }

  const now  = fmtDateTime(new Date());
  const today = fmtDate(new Date());

  const wasCompleted = !!detailRowData.completed;
  const nowCompleted = document.getElementById("detail-completed").checked;

  Object.assign(detailRowData, {
    item:        document.getElementById("detail-item").value,
    category:    document.getElementById("detail-category").value,
    date:        document.getElementById("detail-date").value,
    time:        document.getElementById("detail-time").value,
    sort:        parseFloat(document.getElementById("detail-sort").value) || 0,
    description: document.getElementById("detail-description").value,
    link:        document.getElementById("detail-link").value,
    recur_rule: (() => {
      const on    = document.getElementById("detail-recur-on")?.checked;
      const count = document.getElementById("detail-recur-count")?.value || "1";
      const unit  = document.getElementById("detail-recur-unit")?.value  || "days";
      return on ? `${count}:${unit}` : "";
    })(),
    status:         document.getElementById("detail-status").value,
    parent_id:      parseInt(document.getElementById("detail-parent-id")?.value) || null,
    follow_ups:     detailRowData.follow_ups || "[]",
    completed:      nowCompleted,
    date_completed: (() => {
      const dc = document.getElementById("detail-date-completed").value;
      if (nowCompleted && !wasCompleted && !dc) return today;
      if (!nowCompleted && wasCompleted) return "";
      return dc;
    })(),
    last_modified: now,
  });

  const saved = await saveRow(detailRowData);
  if (saved) {
    Object.assign(detailRowData, saved);
    populateDetailPanel(detailRowData);

    gridApi.forEachNode(node => {
      if (node.data?.id === detailRowData.id) {
        Object.assign(node.data, detailRowData);
        gridApi.refreshCells({ rowNodes: [node], force: true });
        gridApi.redrawRows({ rowNodes: [node] });
      }
    });
    gridApi.onFilterChanged();
    updateRowCount();
    toast("Changes saved", "success");

    if (nowCompleted && !wasCompleted && detailRowData.recur_rule) {
      spawnRecurringOccurrence(detailRowData);
    }
  }
}

// ---------------------------------------------------------------------------
// Follow-up log
// ---------------------------------------------------------------------------

function getFollowUps(row) {
  try { return JSON.parse(row.follow_ups || "[]"); }
  catch { return []; }
}

function renderFollowupList(row) {
  const el = document.getElementById("detail-followup-list");
  if (!el) return;
  const entries = getFollowUps(row);
  if (!entries.length) {
    el.innerHTML = `<div class="followup-empty">No follow-ups logged yet.</div>`;
    return;
  }
  el.innerHTML = entries.slice().reverse().map((e, i) => {
    const realIdx = entries.length - 1 - i;
    const dtVal   = (e.ts || "").replace(" ", "T").substring(0, 16);
    return `
    <div class="followup-entry" data-idx="${realIdx}">
      <input type="datetime-local" class="followup-ts-edit detail-input" value="${esc(dtVal)}" data-idx="${realIdx}" title="Click to edit date/time" />
      <textarea class="followup-note-edit detail-input" data-idx="${realIdx}" placeholder="Note…" rows="1">${esc(e.note || "")}</textarea>
      <button class="followup-del btn btn-ghost btn-sm icon-btn" data-idx="${realIdx}" title="Remove">✕</button>
    </div>`;
  }).join("");

  el.querySelectorAll(".followup-del").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!detailRowData) return;
      const idx = parseInt(btn.dataset.idx);
      const arr = getFollowUps(detailRowData);
      arr.splice(idx, 1);
      detailRowData.follow_ups = JSON.stringify(arr);
      renderFollowupList(detailRowData);
      saveRow(detailRowData);
    });
  });
  el.querySelectorAll(".followup-ts-edit").forEach(inp => {
    inp.addEventListener("change", () => {
      if (!detailRowData) return;
      const idx = parseInt(inp.dataset.idx);
      const arr = getFollowUps(detailRowData);
      if (!arr[idx]) return;
      arr[idx].ts = inp.value.replace("T", " ");
      detailRowData.follow_ups = JSON.stringify(arr);
      saveRow(detailRowData);
    });
  });
  el.querySelectorAll(".followup-note-edit").forEach(inp => {
    // rows gives a safe initial height before paint; scrollHeight takes over on input
    inp.rows = (inp.value.match(/\n/g) || []).length + 1;
    const resize = () => { inp.style.height = "auto"; inp.style.height = inp.scrollHeight + "px"; };
    inp.addEventListener("input", resize);
    inp.addEventListener("blur", () => {
      if (!detailRowData) return;
      const idx = parseInt(inp.dataset.idx);
      const arr = getFollowUps(detailRowData);
      if (!arr[idx]) return;
      const val = inp.value.trim();
      if (val) arr[idx].note = val;
      else delete arr[idx].note;
      detailRowData.follow_ups = JSON.stringify(arr);
      saveRow(detailRowData);
    });
  });

  // Apply scrollHeight sizing once layout is ready (handles long text without explicit newlines)
  const panel = document.getElementById("detail-panel");
  const applyScrollHeights = () => {
    el.querySelectorAll(".followup-note-edit").forEach(inp => {
      inp.style.height = "auto";
      inp.style.height = inp.scrollHeight + "px";
    });
  };
  requestAnimationFrame(applyScrollHeights);
}

// ---------------------------------------------------------------------------
// Subtasks list
// ---------------------------------------------------------------------------

function renderSubtasksList(row) {
  const listEl     = document.getElementById("detail-subtasks-list");
  const progressEl = document.getElementById("detail-subtasks-progress");
  if (!listEl) return;

  const children  = rowData.filter(r => r.parent_id === row.id && !r.deleted);
  const doneCount = children.filter(r => r.completed).length;

  if (progressEl) progressEl.textContent = children.length ? `${doneCount}/${children.length}` : "";

  if (!children.length) {
    listEl.innerHTML = `<div class="subtasks-empty">No subtasks yet.</div>`;
    return;
  }

  listEl.innerHTML = children.map(c => `
    <div class="subtask-item">
      <input type="checkbox" class="subtask-cb cell-checkbox" ${c.completed ? "checked" : ""} data-id="${c.id}" />
      <button class="subtask-link${c.completed ? " subtask-done" : ""}" data-id="${c.id}">${esc(c.item || "(no name)")}</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".subtask-cb").forEach(cb => {
    cb.addEventListener("change", async () => {
      const id = parseInt(cb.dataset.id);
      const childRow = rowData.find(r => r.id === id);
      if (!childRow) return;
      childRow.completed = cb.checked;
      if (cb.checked && !childRow.date_completed) childRow.date_completed = fmtDate(new Date());
      if (!cb.checked) childRow.date_completed = "";
      await saveRow(childRow);
      gridApi?.forEachNode(node => {
        if (node.data?.id === id) {
          Object.assign(node.data, childRow);
          gridApi.refreshCells({ rowNodes: [node], force: true });
        }
      });
      // Also refresh parent row badge
      gridApi?.forEachNode(node => {
        if (node.data?.id === row.id) gridApi.refreshCells({ rowNodes: [node], colIds: ["item"], force: true });
      });
      renderSubtasksList(row);
    });
  });

  listEl.querySelectorAll(".subtask-link").forEach(btn => {
    btn.addEventListener("click", () => {
      navigateToRow(parseInt(btn.dataset.id));
    });
  });
}

async function logFollowUp() {
  if (!detailRowData?.id) return;
  const ts  = fmtDateTime(new Date());
  const inp = document.getElementById("followup-note-input");
  const note = inp?.value.trim() || "";
  const arr  = getFollowUps(detailRowData);
  arr.push(note ? { ts, note } : { ts });
  detailRowData.follow_ups = JSON.stringify(arr);
  if (inp) inp.value = "";
  renderFollowupList(detailRowData);
  await saveRow(detailRowData);
  toast("Follow-up logged.", "success");
}

function openSnoozePopover(anchorEl) {
  const btn = anchorEl || document.getElementById("btn-detail-snooze");
  const pop = document.getElementById("snooze-popover");
  if (!pop || !btn) return;
  const dt = document.getElementById("snooze-until-dt");
  if (dt && !dt.value) {
    const tmr = new Date(); tmr.setDate(tmr.getDate() + 1); tmr.setHours(8, 0, 0, 0);
    dt.value = fmtDate(tmr) + "T08:00";
  }
  pop.style.display = "flex";
  // #detail-panel has a CSS transform, which makes it the containing block for position:fixed children.
  // So fixed coords must be relative to the panel, not the viewport — subtract the panel's offset.
  requestAnimationFrame(() => {
    const rect      = btn.getBoundingClientRect();
    const panelRect = (document.getElementById("detail-panel") || document.body).getBoundingClientRect();
    const popW = pop.offsetWidth  || 220;
    const popH = pop.offsetHeight || 80;
    pop.style.left = Math.max(0, (rect.right - popW) - panelRect.left) + "px";
    pop.style.top  = (rect.top - popH - 6 - panelRect.top) + "px";
  });
}

async function logFollowUpAndSnooze(anchorEl) {
  if (!detailRowData?.id) return;
  await logFollowUp();
  openSnoozePopover(anchorEl);
}

// ---------------------------------------------------------------------------
// Snooze
// ---------------------------------------------------------------------------

function isSnoozeActive(id) {
  if (!id || !snoozedItems[id]) return false;
  return snoozedItems[id] >= fmtSnoozeNow();
}

function snoozeRow(id, days = 1) {
  const until = new Date();
  until.setDate(until.getDate() + days);
  until.setHours(23, 59, 0, 0);
  snoozedItems[id] = fmtDate(until) + " 23:59";
  saveSnoozedItems();
  gridApi?.onFilterChanged();
  gridApi?.redrawRows();
  updateRowCount();
}

function unsnoozeRow(id) {
  delete snoozedItems[id];
  saveSnoozedItems();
  gridApi?.onFilterChanged();
  gridApi?.redrawRows();
  updateRowCount();
}

function updateSnoozeBadge() {
  const badge = document.getElementById("snoozed-badge");
  if (badge) { const cnt = activeSnoozedCount(); badge.textContent = cnt; badge.style.display = cnt > 0 ? "" : "none"; }
}

function activeSnoozedCount() {
  const now = fmtSnoozeNow();
  return Object.values(snoozedItems).filter(d => d >= now).length;
}


function bulkSnooze() {
  const selected = gridApi?.getSelectedRows() || [];
  if (!selected.length) return;

  const pop = document.getElementById("bulk-snooze-popover");
  const btn = document.getElementById("btn-bulk-snooze");
  if (!pop || !btn) return;

  // Pre-fill to tomorrow 08:00
  const dt = document.getElementById("bulk-snooze-until-dt");
  if (dt && !dt.value) {
    const tmr = new Date(); tmr.setDate(tmr.getDate() + 1); tmr.setHours(8, 0, 0, 0);
    dt.value = fmtDate(tmr) + "T08:00";
  }

  if (pop.style.display !== "none") { pop.style.display = "none"; return; }

  pop.style.display = "flex";
  requestAnimationFrame(() => {
    const rect = btn.getBoundingClientRect();
    const popW = pop.offsetWidth || 220;
    pop.style.left = Math.max(4, rect.right - popW) + "px";
    pop.style.top  = (rect.bottom + 4) + "px";
  });
}

function bulkSnoozeConfirm() {
  const selected = gridApi?.getSelectedRows() || [];
  if (!selected.length) return;
  const dtVal = document.getElementById("bulk-snooze-until-dt")?.value;
  if (!dtVal) { toast("Please pick a date/time.", "error"); return; }
  const untilStr = dtVal.replace("T", " ");
  selected.forEach(r => { if (r.id) snoozedItems[r.id] = untilStr; });
  saveSnoozedItems();
  document.getElementById("bulk-snooze-popover").style.display = "none";
  document.getElementById("bulk-snooze-until-dt").value = "";
  gridApi?.deselectAll();
  gridApi?.onFilterChanged();
  gridApi?.redrawRows();
  updateRowCount();
  updateSnoozeBadge();
  toast(`${selected.length} item${selected.length > 1 ? "s" : ""} snoozed until ${untilStr}.`, "success");
}

async function bulkMoveToToday() {
  const selected = gridApi?.getSelectedRows() || [];
  if (!selected.length) return;
  const today = fmtDate(new Date());
  const now   = fmtDateTime(new Date());
  const moved = [];
  for (const r of selected) {
    if (!r.id || r.completed) continue;
    r.date          = today;
    r.last_modified = now;
    moved.push(r);
    await saveRow(r);
  }
  if (!moved.length) return;
  gridApi.applyTransaction({ update: moved });
  gridApi.deselectAll();
  gridApi.redrawRows();
  updateRowCount();
  toast(`${moved.length} item${moved.length > 1 ? "s" : ""} moved to today.`, "success");
}

