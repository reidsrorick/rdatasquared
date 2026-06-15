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

// ---------------------------------------------------------------------------
// Category tag-chip combobox for detail panel
// ---------------------------------------------------------------------------

// Module-level selected categories for the currently open detail panel
let _detailCategories = [];

function getCategoryComboValue() { return [..._detailCategories]; }

function initCategoryCombo() {
  const tagsEl  = document.getElementById("cat-tags");
  const input   = document.getElementById("detail-category-input");
  const list    = document.getElementById("cat-combo-list");
  const wrap    = document.getElementById("cat-tags-wrap");
  if (!tagsEl || !input || !list) return;

  let activeIdx = -1;

  // Click on the wrap area focuses the input
  wrap?.addEventListener("mousedown", e => {
    if (e.target === wrap || e.target === tagsEl) { e.preventDefault(); input.focus(); }
  });

  function allCategories() {
    const dataCats = [...new Set(
      (rowData || []).flatMap(r => getCategories(r)).filter(Boolean)
    )];
    const customSet = new Set(customCategories || []);
    return [...(customCategories || []), ...dataCats.filter(c => !customSet.has(c)).sort()];
  }

  function renderTags() {
    tagsEl.innerHTML = "";
    _detailCategories.forEach((cat, i) => {
      const chip = document.createElement("span");
      chip.className = "cat-chip";
      chip.innerHTML = `<span>${esc(cat)}</span><button type="button" class="cat-chip-remove" aria-label="Remove ${esc(cat)}">×</button>`;
      chip.querySelector(".cat-chip-remove").addEventListener("click", e => {
        e.stopPropagation();
        _detailCategories.splice(i, 1);
        renderTags();
        renderList(input.value);
      });
      tagsEl.appendChild(chip);
    });
  }

  function renderList(query) {
    const q = (query || "").trim().toLowerCase();
    const cats = allCategories().filter(c => !_detailCategories.includes(c));
    const matches = q ? cats.filter(c => c.toLowerCase().includes(q)) : cats;
    const isNew = q && !allCategories().some(c => c.toLowerCase() === q) && !_detailCategories.some(c => c.toLowerCase() === q);

    list.innerHTML = "";
    activeIdx = -1;

    matches.forEach(c => {
      const li = document.createElement("li");
      li.textContent = c;
      li.setAttribute("role", "option");
      li.addEventListener("mousedown", e => { e.preventDefault(); addTag(c); });
      list.appendChild(li);
    });

    if (isNew) {
      const li = document.createElement("li");
      li.textContent = `Add "${query.trim()}"`;
      li.className = "cat-combo-new";
      li.setAttribute("role", "option");
      li.addEventListener("mousedown", e => { e.preventDefault(); addTag(query.trim()); });
      list.appendChild(li);
    }

    const hasItems = list.children.length > 0;
    list.classList.toggle("open", hasItems);
    input.setAttribute("aria-expanded", hasItems ? "true" : "false");
  }

  function addTag(value) {
    const v = value.trim();
    if (!v || _detailCategories.includes(v)) { input.value = ""; renderList(""); return; }
    _detailCategories.push(v);
    input.value = "";
    renderTags();
    renderList("");
    input.focus();
  }

  function close() {
    list.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
    activeIdx = -1;
  }

  function moveActive(dir) {
    const items = [...list.querySelectorAll("li")];
    if (!items.length) return;
    items.forEach(li => li.removeAttribute("aria-selected"));
    activeIdx = Math.max(0, Math.min(items.length - 1, activeIdx + dir));
    items[activeIdx].setAttribute("aria-selected", "true");
    items[activeIdx].scrollIntoView({ block: "nearest" });
  }

  // Expose a way to set categories from outside (populateDetailPanel)
  initCategoryCombo._set = cats => {
    _detailCategories = [...cats];
    renderTags();
    renderList("");
    close();
  };

  input.addEventListener("input",  () => renderList(input.value));
  input.addEventListener("focus",  () => renderList(input.value));
  input.addEventListener("blur",   () => setTimeout(close, 150));

  input.addEventListener("keydown", e => {
    if (e.key === "Tab") {
      const sel   = list.querySelector("[aria-selected='true']");
      const first = list.querySelector("li:not(.cat-combo-new)");
      const target = sel || (input.value.trim() ? first : null);
      if (target) { e.preventDefault(); addTag(target.textContent.replace(/^Add "(.+)"$/, "$1")); return; }
      if (input.value.trim()) { e.preventDefault(); addTag(input.value); return; }
    }
    if (e.key === "Backspace" && !input.value && _detailCategories.length) {
      _detailCategories.pop();
      renderTags();
      renderList("");
      return;
    }
    if (!list.classList.contains("open")) return;
    if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
    else if (e.key === "ArrowUp")  { e.preventDefault(); moveActive(-1); }
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
  });
}

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
  requestAnimationFrame(() => {
    autoResizeTextarea(document.getElementById("detail-item"));
    if (!row.item) document.getElementById("detail-item").focus();
  });
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
  if (initCategoryCombo._set) initCategoryCombo._set(getCategories(row));
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

  renderChecklistItems(row);
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

async function saveDetailPanel(closeAfter = false) {
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
    category:    JSON.stringify(getCategoryComboValue()),
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
    follow_ups:     detailRowData.follow_ups || "[]",
    checklist:      detailRowData.checklist  || "[]",
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

    if (!closeAfter) return;
    document.getElementById("detail-panel").classList.remove("open");
    detailRowData = null;
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
// Checklist
// ---------------------------------------------------------------------------

function getChecklist(row) {
  try { return JSON.parse(row.checklist || "[]"); }
  catch { return []; }
}

function renderChecklistItems(row) {
  const listEl     = document.getElementById("detail-checklist-list");
  const progressEl = document.getElementById("detail-checklist-progress");
  if (!listEl) return;

  const items     = getChecklist(row);
  const doneCount = items.filter(i => i.done).length;

  if (progressEl) progressEl.textContent = items.length ? `${doneCount}/${items.length}` : "";

  if (!items.length) {
    listEl.innerHTML = `<div class="subtasks-empty">No checklist items yet.</div>`;
    return;
  }

  listEl.innerHTML = items.map((item, idx) => `
    <div class="subtask-item" data-idx="${idx}">
      <input type="checkbox" class="checklist-cb cell-checkbox" ${item.done ? "checked" : ""} data-idx="${idx}" />
      <div class="checklist-item-body">
        <span class="checklist-label${item.done ? " subtask-done" : ""}">${esc(item.label || "")}</span>
        ${item.done && item.completedAt ? `<span class="checklist-ts">${esc(item.completedAt)}</span>` : ""}
      </div>
      <button class="checklist-del btn btn-ghost btn-sm icon-btn" data-idx="${idx}" title="Remove">✕</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".checklist-cb").forEach(cb => {
    cb.addEventListener("change", () => {
      const idx  = parseInt(cb.dataset.idx);
      const arr  = getChecklist(row);
      if (!arr[idx]) return;
      arr[idx].done = cb.checked;
      if (cb.checked) arr[idx].completedAt = fmtDateTime(new Date());
      else delete arr[idx].completedAt;
      row.checklist = JSON.stringify(arr);
      saveRow(row);
      // Refresh grid badge
      gridApi?.forEachNode(node => {
        if (node.data?.id === row.id) gridApi.refreshCells({ rowNodes: [node], colIds: ["item"], force: true });
      });
      renderChecklistItems(row);
    });
  });

  listEl.querySelectorAll(".checklist-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      const arr = getChecklist(row);
      arr.splice(idx, 1);
      row.checklist = JSON.stringify(arr);
      saveRow(row);
      gridApi?.forEachNode(node => {
        if (node.data?.id === row.id) gridApi.refreshCells({ rowNodes: [node], colIds: ["item"], force: true });
      });
      renderChecklistItems(row);
    });
  });
}

function addChecklistItem() {
  if (!detailRowData?.id) return;
  const inp  = document.getElementById("checklist-new-item");
  const label = inp?.value.trim();
  if (!label) return;
  const arr = getChecklist(detailRowData);
  arr.push({ label, done: false });
  detailRowData.checklist = JSON.stringify(arr);
  saveRow(detailRowData);
  gridApi?.forEachNode(node => {
    if (node.data?.id === detailRowData.id) gridApi.refreshCells({ rowNodes: [node], colIds: ["item"], force: true });
  });
  if (inp) inp.value = "";
  renderChecklistItems(detailRowData);
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
  pop.style.display = "flex";
  // #detail-panel has a CSS transform, which makes it the containing block for position:fixed children.
  // So fixed coords must be relative to the panel, not the viewport — subtract the panel's offset.
  requestAnimationFrame(() => {
    const rect      = btn.getBoundingClientRect();
    const panelRect = (document.getElementById("detail-panel") || document.body).getBoundingClientRect();
    const popW = pop.offsetWidth  || 200;
    const popH = pop.offsetHeight || 140;
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

function computeSnoozeUntil(preset) {
  const now = new Date();
  switch (preset) {
    case "1h": {
      const d = new Date(now.getTime() + 60 * 60 * 1000);
      return fmtDateTime(d).slice(0, 16);
    }
    case "2h": {
      const d = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      return fmtDateTime(d).slice(0, 16);
    }
    case "eod": {
      const d = new Date(now);
      d.setHours(16, 0, 0, 0);
      return fmtDateTime(d).slice(0, 16);
    }
    case "tomorrow": {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(7, 0, 0, 0);
      return fmtDateTime(d).slice(0, 16);
    }
    default: return null;
  }
}

function snoozeRow(id, untilStr) {
  if (!untilStr) return;
  snoozedItems[id] = untilStr;
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

  if (pop.style.display !== "none") { pop.style.display = "none"; return; }

  pop.style.display = "flex";
  requestAnimationFrame(() => {
    const rect = btn.getBoundingClientRect();
    const popW = pop.offsetWidth || 200;
    pop.style.left = Math.max(4, rect.right - popW) + "px";
    pop.style.top  = (rect.bottom + 4) + "px";
  });
}

function bulkSnoozeConfirm(preset) {
  const selected = gridApi?.getSelectedRows() || [];
  if (!selected.length) return;
  const untilStr = computeSnoozeUntil(preset);
  if (!untilStr) return;
  selected.forEach(r => { if (r.id) snoozedItems[r.id] = untilStr; });
  saveSnoozedItems();
  document.getElementById("bulk-snooze-popover").style.display = "none";
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

