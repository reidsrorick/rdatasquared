/* ===================================================================
   app.js — Shared state, filter/category logic, event wiring, bootstrap
   Loaded last so all other modules are already defined.
   Depends on: utils.js, storage.js, api.js, grid.js, views.js, ui.js
   =================================================================== */

"use strict";

// ---------------------------------------------------------------------------
// Shared state — globals read by every other module
// ---------------------------------------------------------------------------

let gridApi               = null;
let rowData               = [];
let activePreset          = "all";
let activeCategoryFilters = [];    // [] = implicit show-all
let activeDateFilter      = "all";
let dateCustomFrom        = "";
let dateCustomTo          = "";
let addingNewRow          = false;
let detailRowData         = null;
let wrapText              = false;
let hiddenColumns         = {};
let hiddenRowIds          = new Set();
let showHiddenRows        = false;
let showSnoozed           = false;
let snoozedItems          = {};
let condFmtRules          = [];

// ---------------------------------------------------------------------------
// Category dropdown
// ---------------------------------------------------------------------------

function updateCategoryFilterLabel() {
  const label = document.getElementById("category-filter-label");
  if (!label) return;
  if (activeCategoryFilters.length === 0) label.textContent = "All Categories";
  else if (activeCategoryFilters.length === 1) label.textContent = activeCategoryFilters[0];
  else label.textContent = `${activeCategoryFilters.length} Categories`;
}

function updateCategoryDropdown() {
  const menu = document.getElementById("cat-filter-menu");
  if (!menu) return;
  const cats = [...new Set(rowData.map(r => r.category || "").filter(Boolean))].sort();

  const allChecked = activeCategoryFilters.length === 0;
  menu.innerHTML = `
    <label class="col-picker-item cat-filter-item cat-filter-all">
      <input type="checkbox" class="col-picker-cb cat-filter-cb cat-filter-all-cb"
             ${allChecked ? "checked" : ""} />
      <span>All Categories</span>
    </label>
    <div class="cat-filter-divider"></div>
  ` + cats.map(c => `
    <label class="col-picker-item cat-filter-item">
      <input type="checkbox" class="col-picker-cb cat-filter-cb" data-cat="${esc(c)}"
             ${(activeCategoryFilters.length === 0 || activeCategoryFilters.includes(c)) ? "checked" : ""} />
      <span>${esc(c)}</span>
    </label>
  `).join("");

  // "All" checkbox: checked = implicit show-all; unchecked = explicit-all (so user can uncheck cats)
  menu.querySelector(".cat-filter-all-cb").addEventListener("change", e => {
    activeCategoryFilters = e.target.checked ? [] : [...cats];
    // Rebuild the dropdown from authoritative state — safer than manually toggling each cb.checked
    updateCategoryDropdown();
    updateCategoryFilterLabel();
    gridApi?.onFilterChanged();
    saveFiltersToStorage();
    updateRowCount();
  });

  menu.querySelectorAll(".cat-filter-cb:not(.cat-filter-all-cb)").forEach(cb => {
    cb.addEventListener("change", () => {
      const cat = cb.dataset.cat;
      if (activeCategoryFilters.length === 0) {
        activeCategoryFilters = cats.filter(c => c !== cat);
      } else if (cb.checked) {
        if (!activeCategoryFilters.includes(cat)) activeCategoryFilters.push(cat);
      } else {
        activeCategoryFilters = activeCategoryFilters.filter(c => c !== cat);
      }
      // "All" is checked only when back in implicit show-all state
      menu.querySelector(".cat-filter-all-cb").checked = activeCategoryFilters.length === 0;
      updateCategoryFilterLabel();
      gridApi?.onFilterChanged();
      saveFiltersToStorage();
      updateRowCount();
    });
  });
}

// ---------------------------------------------------------------------------
// Filter presets
// ---------------------------------------------------------------------------

function applyPreset(preset) {
  activePreset = preset;
  gridApi?.onFilterChanged();
  saveFiltersToStorage();
  updateRowCount();
}

function activatePreset(preset) {
  activePreset = preset;
  document.querySelectorAll(".preset-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.preset === preset)
  );
  applyPreset(preset);
}

function clearAllFilters() {
  activeCategoryFilters = [];
  activeDateFilter      = "all";
  dateCustomFrom        = "";
  dateCustomTo          = "";
  updateCategoryFilterLabel();
  const dateSel = document.getElementById("date-filter");
  if (dateSel) dateSel.value = "all";
  const rangeEl = document.getElementById("date-custom-range");
  if (rangeEl) rangeEl.style.display = "none";
  const fromEl  = document.getElementById("date-custom-from");
  const toEl    = document.getElementById("date-custom-to");
  if (fromEl) fromEl.value = "";
  if (toEl)   toEl.value   = "";
  document.querySelectorAll(".cat-filter-cb").forEach(cb => { cb.checked = false; });
}

function clearAllFiltersUI() {
  clearAllFilters();
  activatePreset("all");
  const qf = document.getElementById("quick-filter");
  if (qf) { qf.value = ""; gridApi?.setGridOption("quickFilterText", ""); }
  gridApi?.onFilterChanged();
  saveFiltersToStorage();
  updateRowCount();
}

// ---------------------------------------------------------------------------
// Filter persistence — restore (reads storage + updates DOM + triggers grid)
// ---------------------------------------------------------------------------

function restoreFiltersFromStorage() {
  let state;
  try { state = JSON.parse(localStorage.getItem("wt-filters") || "{}"); }
  catch { return; }

  const qf = document.getElementById("quick-filter");
  if (qf && state.quick) {
    qf.value = state.quick;
    gridApi?.setGridOption("quickFilterText", state.quick);
  }

  if (Array.isArray(state.categories) && state.categories.length > 0) {
    const validCats = new Set(rowData.map(r => r.category || "").filter(Boolean));
    activeCategoryFilters = state.categories.filter(c => validCats.has(c));
    updateCategoryDropdown();
    updateCategoryFilterLabel();
  }

  const dateSel = document.getElementById("date-filter");
  if (dateSel && state.date && state.date !== "all") {
    activeDateFilter = state.date;
    dateSel.value    = state.date;
  }

  if (state.preset && state.preset !== "all") {
    activatePreset(state.preset);
  } else {
    gridApi?.onFilterChanged();
  }
}

// ---------------------------------------------------------------------------
// Add new row
// ---------------------------------------------------------------------------

function seedRowFromFilters() {
  const today    = fmtDate(new Date());
  const tomorrow = fmtDate(new Date(Date.now() + 86_400_000));
  const seed     = {};
  switch (activePreset) {
    case "due_today":    seed.date = today;    break;
    case "due_tomorrow": seed.date = tomorrow; break;
    case "past_due":     seed.date = today;    break;
    case "open":         seed.completed = false; break;
  }
  if (!seed.date) {
    if (activeDateFilter === "today")    seed.date = today;
    if (activeDateFilter === "tomorrow") seed.date = tomorrow;
  }
  if (activeCategoryFilters.length >= 1) seed.category = activeCategoryFilters[0];
  return seed;
}

function addNewRow() {
  const now    = fmtDateTime(new Date());
  const newRow = {
    item: "", category: "", date: "", time: "", sort: 0,
    description: "", completed: false, date_completed: "",
    last_modified: now, deleted: false,
    ...seedRowFromFilters(),
  };
  addingNewRow = true;
  gridApi.onFilterChanged();
  const result    = gridApi.applyTransaction({ add: [newRow], addIndex: 0 });
  const addedNode = result?.add?.[0];
  if (addedNode) {
    gridApi.ensureNodeVisible(addedNode, "top");
    gridApi.startEditingCell({ rowIndex: addedNode.rowIndex, colKey: "item" });
  }
  saveRow(newRow).then(saved => {
    addingNewRow = false;
    if (saved) Object.assign(newRow, saved);
    if (newRow.id) setNotifOff(newRow.id, true);
    gridApi.applyTransaction({ update: [newRow] });
    gridApi.onFilterChanged();
    updateRowCount();
    openDetailPanel(newRow);
  });
}

// ---------------------------------------------------------------------------
// Bulk delete (wraps bulkAction with a confirmation dialog)
// ---------------------------------------------------------------------------

function bulkDelete() {
  const sel = gridApi.getSelectedRows();
  if (!sel.length) return;
  confirm$("Delete selected rows?", `Move ${sel.length} row(s) to trash?`, () => bulkAction("delete"));
}

// ---------------------------------------------------------------------------
// Export settings modal
// ---------------------------------------------------------------------------

async function openExportSettingsModal() {
  // Open modal immediately (synchronously) so it can't be blocked by async work below
  showModal("modal-export-settings");

  const settings = getExportSettings();

  // Populate format radio
  const fmt = settings.format || "json";
  document.querySelectorAll("input[name='exp-fmt']").forEach(r => { r.checked = (r.value === fmt); });

  // Filename
  const fnEl = document.getElementById("exp-filename");
  if (fnEl) fnEl.value = settings.filename || "work-tracker-export";

  // Extension label
  const extEl = document.getElementById("exp-filename-ext");
  if (extEl) extEl.textContent = fmt === "csv" ? ".csv" : ".json";

  // Show/hide FSA-specific controls
  const warn      = document.getElementById("exp-no-fsa-warning");
  const chooseBtn = document.getElementById("btn-choose-export-folder");
  if (warn)      warn.style.display      = window.showDirectoryPicker ? "none" : "block";
  if (chooseBtn) chooseBtn.style.display = window.showDirectoryPicker ? ""     : "none";

  // Folder name — try stored handle first (async), fall back to saved settings
  let folderName = settings.folderName || null;
  _updateExportFolderDisplay(folderName); // show what we know immediately
  try {
    const h = await getExportDirHandle();
    if (h) { folderName = h.name; _updateExportFolderDisplay(folderName); }
  } catch (_) {}
}

function _updateExportFolderDisplay(folderName) {
  const display  = document.getElementById("exp-folder-display");
  const clearBtn = document.getElementById("btn-clear-export-folder");
  if (display) display.textContent = folderName || "Not set";
  if (clearBtn) clearBtn.style.display = folderName ? "" : "none";
}

function _updateExportButtonLabel() {
  const settings = getExportSettings();
  const btn = document.getElementById("btn-export-default");
  if (!btn) return;
  if (settings.folderName) {
    const ext  = (settings.format || "json") === "csv" ? ".csv" : ".json";
    const name = (settings.filename || "work-tracker-export") + ext;
    btn.title = `Export to ${settings.folderName}/${name}`;
    btn.classList.add("btn-export-configured");
  } else {
    btn.title = "";
    btn.classList.remove("btn-export-configured");
  }
}

// ---------------------------------------------------------------------------
// Bootstrap — wire all UI events after DOM is ready
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  loadWrapText();
  loadColumnVisibility();
  loadHiddenRows();
  loadSnoozedItems();
  loadCondFmt();

  // Seed snooze badge
  (() => {
    const cnt   = activeSnoozedCount();
    const badge = document.getElementById("snoozed-badge");
    if (badge) { badge.textContent = cnt; badge.style.display = cnt > 0 ? "" : "none"; }
  })();

  initGrid();
  initNotifications();
  _updateExportButtonLabel();

  // ── Navbar ──────────────────────────────────────────────────────────────
  document.querySelectorAll(".nav-btn").forEach(btn =>
    btn.addEventListener("click", () => switchView(btn.dataset.view))
  );
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-new-row").addEventListener("click", addNewRow);
  document.getElementById("btn-refresh-grid")?.addEventListener("click", () => {
    const btn = document.getElementById("btn-refresh-grid");
    btn?.classList.add("spinning");
    loadRows().finally(() => btn?.classList.remove("spinning"));
  });

  // ── Preset tabs ─────────────────────────────────────────────────────────
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyPreset(btn.dataset.preset);
    });
  });

  // ── Quick search ─────────────────────────────────────────────────────────
  document.getElementById("quick-filter").addEventListener("input", e => {
    gridApi?.setGridOption("quickFilterText", e.target.value);
    saveFiltersToStorage();
    updateRowCount();
  });

  // ── Wrap text ─────────────────────────────────────────────────────────
  const wrapBtn = document.getElementById("btn-wrap-text");
  wrapBtn.classList.toggle("active", wrapText);
  wrapBtn.addEventListener("click", toggleWrapText);

  // ── Date filter ──────────────────────────────────────────────────────────
  document.getElementById("date-filter").addEventListener("change", e => {
    activeDateFilter = e.target.value;
    const rangeEl    = document.getElementById("date-custom-range");
    const fromEl     = document.getElementById("date-custom-from");
    const toEl       = document.getElementById("date-custom-to");
    const sepEl      = document.getElementById("date-custom-sep");
    const needsFrom  = ["before", "between"].includes(activeDateFilter);
    const needsTo    = ["after",  "between"].includes(activeDateFilter);
    const needsCustom = needsFrom || needsTo;
    if (rangeEl) rangeEl.style.display = needsCustom ? "flex" : "none";
    if (fromEl)  fromEl.style.display  = needsFrom   ? ""     : "none";
    if (toEl)    toEl.style.display    = needsTo      ? ""     : "none";
    if (sepEl)   sepEl.style.display   = (needsFrom && needsTo) ? "" : "none";
    if (fromEl) fromEl.placeholder = activeDateFilter === "between" ? "From" : "Date";
    gridApi?.onFilterChanged();
    saveFiltersToStorage();
    updateRowCount();
  });
  document.getElementById("date-custom-from")?.addEventListener("change", e => {
    dateCustomFrom = e.target.value;
    gridApi?.onFilterChanged();
    updateRowCount();
  });
  document.getElementById("date-custom-to")?.addEventListener("change", e => {
    dateCustomTo = e.target.value;
    gridApi?.onFilterChanged();
    updateRowCount();
  });

  // ── Undo / redo ─────────────────────────────────────────────────────────
  document.getElementById("btn-undo").addEventListener("click", () => gridApi?.undoCellEditing());
  document.getElementById("btn-redo").addEventListener("click", () => gridApi?.redoCellEditing());

  // ── Trash ────────────────────────────────────────────────────────────────
  document.getElementById("btn-show-deleted").addEventListener("click", showDeletedModal);
  document.getElementById("btn-empty-trash").addEventListener("click", emptyTrash);

  // ── Bulk action bar ───────────────────────────────────────────────────────
  document.getElementById("btn-bulk-complete").addEventListener("click",    () => bulkAction("complete"));
  document.getElementById("btn-bulk-incomplete").addEventListener("click",  () => bulkAction("incomplete"));
  document.getElementById("btn-bulk-hide").addEventListener("click",        () => bulkToggleHide(true));
  document.getElementById("btn-bulk-unhide").addEventListener("click",      () => bulkToggleHide(false));
  document.getElementById("btn-bulk-snooze")?.addEventListener("click",    bulkSnooze);
  document.getElementById("btn-bulk-move-today")?.addEventListener("click", bulkMoveToToday);
  document.getElementById("btn-bulk-delete").addEventListener("click",      bulkDelete);
  document.getElementById("btn-deselect").addEventListener("click",         () => gridApi?.deselectAll());

  // ── Bottom add-row ────────────────────────────────────────────────────────
  document.getElementById("btn-grid-add-bottom")?.addEventListener("click", addNewRow);

  // ── Import ────────────────────────────────────────────────────────────────
  document.getElementById("btn-import-csv")?.addEventListener("click",  openImportModal);
  document.getElementById("btn-import-json")?.addEventListener("click", openImportModal);
  document.getElementById("file-input").addEventListener("change", e => {
    if (e.target.files[0]) setImportFile(e.target.files[0]);
  });
  document.getElementById("btn-import-confirm").addEventListener("click", doImport);
  const dz = document.getElementById("drop-zone");
  dz.addEventListener("dragover",  e => { e.preventDefault(); dz.classList.add("drag-over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
  dz.addEventListener("drop", e => {
    e.preventDefault();
    dz.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) setImportFile(e.dataTransfer.files[0]);
  });

  // ── Export ────────────────────────────────────────────────────────────────
  document.getElementById("btn-export-csv")?.addEventListener("click",   () => exportData("csv"));
  document.getElementById("btn-export-excel")?.addEventListener("click", () => exportData("excel"));
  document.getElementById("btn-export-json")?.addEventListener("click",  () => exportData("json"));

  // Export main button — use default path if configured, else open the dropdown
  document.getElementById("btn-export-default")?.addEventListener("click", e => {
    e.stopPropagation();
    const settings = getExportSettings();
    if (settings.folderName) {
      document.getElementById("export-dropdown")?.classList.remove("open");
      exportToDefault();
    } else {
      document.querySelectorAll(".dropdown.open").forEach(o => {
        if (o.id !== "export-dropdown") o.classList.remove("open");
      });
      document.getElementById("export-dropdown")?.classList.toggle("open");
    }
  });

  // Export caret — handled by the generic .dropdown-toggle handler above

  // ── Export Settings modal ─────────────────────────────────────────────────
  document.getElementById("btn-open-export-settings")?.addEventListener("click", openExportSettingsModal);

  document.querySelectorAll("input[name='exp-fmt']").forEach(r =>
    r.addEventListener("change", () => {
      document.getElementById("exp-filename-ext").textContent =
        r.value === "json" ? ".json" : ".csv";
    })
  );

  document.getElementById("btn-choose-export-folder")?.addEventListener("click", async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await saveExportDirHandle(handle);
      _updateExportFolderDisplay(handle.name);
    } catch (err) {
      if (err.name !== "AbortError") toast("Could not select folder: " + err.message, "error");
    }
  });

  document.getElementById("btn-clear-export-folder")?.addEventListener("click", async () => {
    await clearExportDirHandle();
    const settings = getExportSettings();
    delete settings.folderName;
    saveExportSettings(settings);
    _updateExportFolderDisplay(null);
    _updateExportButtonLabel();
  });

  document.getElementById("btn-save-export-settings")?.addEventListener("click", async () => {
    const fmt      = document.querySelector("input[name='exp-fmt']:checked")?.value || "json";
    const filename = (document.getElementById("exp-filename")?.value || "work-tracker-export").trim();
    let   folderName = null;
    try {
      const h = await getExportDirHandle();
      if (h) folderName = h.name;
    } catch (_) {}
    // folderName from the display in case handle was just chosen
    const displayed = document.getElementById("exp-folder-display")?.textContent;
    if (displayed && displayed !== "Not set") folderName = displayed;

    saveExportSettings({ format: fmt, filename: filename || "work-tracker-export", folderName });
    hideModal("modal-export-settings");
    _updateExportButtonLabel();
    toast("Export settings saved", "success");
  });

  // ── Detail panel ─────────────────────────────────────────────────────────
  document.getElementById("btn-detail-close").addEventListener("click", closeDetailPanel);
  document.getElementById("btn-detail-save").addEventListener("click",  saveDetailPanel);
  document.getElementById("btn-detail-duplicate")?.addEventListener("click", () => { if (detailRowData) duplicateRow(detailRowData); });
  document.getElementById("btn-detail-date-today")?.addEventListener("click", () => {
    const inp = document.getElementById("detail-date");
    if (inp) inp.value = fmtDate(new Date());
  });
  document.getElementById("btn-log-followup")?.addEventListener("click", logFollowUp);
  document.getElementById("followup-note-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); logFollowUp(); }
  });
  document.getElementById("btn-detail-delete").addEventListener("click", () => {
    if (!detailRowData?.id) return;
    confirm$("Delete item?", `Move "${detailRowData.item || "this item"}" to trash?`, async () => {
      await fetch(`/api/rows/${detailRowData.id}/delete`, { method: "POST" });
      toast("Item moved to trash", "info");
      closeDetailPanel();
      await loadRows();
      updateDeletedBadge();
    });
  });

  const detailItemEl = document.getElementById("detail-item");
  detailItemEl.addEventListener("input", () => autoResizeTextarea(detailItemEl));

  document.getElementById("detail-link").addEventListener("input", e => {
    const btn = document.getElementById("detail-link-open");
    btn.href          = e.target.value;
    btn.style.display = e.target.value ? "" : "none";
  });

  document.getElementById("detail-notif-enabled")?.addEventListener("change", e => {
    if (detailRowData?.id) {
      setNotifOff(detailRowData.id, !e.target.checked);
      const timeInp = document.getElementById("detail-notif-time");
      if (timeInp) timeInp.disabled = !e.target.checked;
    }
  });
  document.getElementById("detail-notif-time")?.addEventListener("change", e => {
    if (detailRowData?.id) setNotifTime(detailRowData.id, e.target.value);
  });

  document.getElementById("detail-recur-on")?.addEventListener("change", e => {
    const disabled = !e.target.checked;
    document.getElementById("detail-recur-count").disabled = disabled;
    document.getElementById("detail-recur-unit").disabled  = disabled;
  });

  document.getElementById("detail-completed").addEventListener("change", e => {
    const done   = e.target.checked;
    const today  = fmtDate(new Date());
    const dcField = document.getElementById("detail-date-completed");
    document.getElementById("detail-done-badge").style.display = done ? "" : "none";
    document.getElementById("detail-open-badge").style.display = done ? "none" : "";
    if (done && !dcField.value) dcField.value = today;
    if (!done) dcField.value = "";
  });

  // ── Dashboard ─────────────────────────────────────────────────────────────
  document.querySelectorAll(".stat-card--clickable").forEach(card => {
    card.addEventListener("click", () => {
      const preset = card.dataset.navPreset;
      if (preset) { switchView("grid"); setTimeout(() => activatePreset(preset), 60); }
    });
  });
  document.getElementById("btn-refresh-dashboard").addEventListener("click", loadDashboard);

  // ── Conditional formatting ────────────────────────────────────────────────
  document.getElementById("btn-cond-fmt")?.addEventListener("click", openCondFmtModal);
  document.getElementById("btn-add-cond-rule")?.addEventListener("click", () => {
    condFmtDraft.push({ condition: "due_today", value: "", bgColor: "#f59e0b", textColor: "#000000" });
    renderCondFmtList();
  });
  document.getElementById("btn-save-cond-fmt")?.addEventListener("click", () => {
    condFmtRules = condFmtDraft.map(r => ({ ...r }));
    saveCondFmt();
    gridApi?.redrawRows();
    document.getElementById("modal-cond-fmt").classList.add("hidden");
    toast("Formatting rules saved.", "success");
  });

  // ── Clear filters ─────────────────────────────────────────────────────────
  document.getElementById("btn-clear-filters")?.addEventListener("click", clearAllFiltersUI);

  // ── Column picker ─────────────────────────────────────────────────────────
  initColumnPicker();

  // ── Calendar nav ──────────────────────────────────────────────────────────
  document.getElementById("btn-cal-prev")?.addEventListener("click",  () => calNavMonth(-1));
  document.getElementById("btn-cal-next")?.addEventListener("click",  () => calNavMonth(1));
  document.getElementById("btn-cal-today")?.addEventListener("click", () => {
    calYear  = new Date().getFullYear();
    calMonth = new Date().getMonth();
    renderCalendar();
  });

  function syncCalModeButtons() {
    document.querySelectorAll(".cal-mode-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.mode === calMode)
    );
  }
  syncCalModeButtons();
  document.querySelectorAll(".cal-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      calMode = btn.dataset.mode;
      localStorage.setItem("wt-cal-mode", calMode);
      syncCalModeButtons();
      renderCalendar();
    });
  });

  // ── Hidden-rows toggle ────────────────────────────────────────────────────
  document.getElementById("btn-show-hidden")?.addEventListener("click", () => {
    showHiddenRows = !showHiddenRows;
    document.getElementById("btn-show-hidden")?.classList.toggle("active", showHiddenRows);
    gridApi?.onFilterChanged();
    updateRowCount();
  });

  // ── Snoozed toggle ────────────────────────────────────────────────────────
  document.getElementById("btn-show-snoozed")?.addEventListener("click", () => {
    showSnoozed = !showSnoozed;
    document.getElementById("btn-show-snoozed")?.classList.toggle("active", showSnoozed);
    const badge = document.getElementById("snoozed-badge");
    if (badge) {
      const cnt = activeSnoozedCount();
      badge.textContent = cnt;
      badge.style.display = cnt > 0 ? "" : "none";
    }
    gridApi?.onFilterChanged();
    gridApi?.redrawRows();
    updateRowCount();
  });

  // ── Right-click context menu ──────────────────────────────────────────────
  const rowContextMenu = document.getElementById("row-context-menu");
  let ctxRowData = null;
  document.getElementById("grid-container")?.addEventListener("contextmenu", e => {
    e.preventDefault();
    const rowEl = e.target.closest(".ag-row");
    if (!rowEl) return;
    const rowIdx = parseInt(rowEl.getAttribute("row-index"));
    if (isNaN(rowIdx)) return;
    const node = gridApi?.getDisplayedRowAtIndex(rowIdx);
    if (!node?.data?.id) return;
    ctxRowData = node.data;
    const isHidden  = hiddenRowIds.has(ctxRowData.id);
    const isSnoozed = isSnoozeActive(ctxRowData.id);
    document.getElementById("ctx-hide-row").textContent   = isHidden  ? "Unhide Row" : "Hide Row";
    document.getElementById("ctx-snooze-row").textContent = isSnoozed ? "Unsnooze"   : "Snooze";
    rowContextMenu.style.display = "block";
    rowContextMenu.style.left    = e.pageX + "px";
    rowContextMenu.style.top     = e.pageY + "px";
  });
  document.getElementById("ctx-hide-row")?.addEventListener("click", () => {
    if (ctxRowData?.id) toggleHideRow(ctxRowData.id);
    rowContextMenu.style.display = "none";
  });
  document.getElementById("ctx-snooze-row")?.addEventListener("click", () => {
    if (ctxRowData?.id) {
      if (isSnoozeActive(ctxRowData.id)) unsnoozeRow(ctxRowData.id);
      else snoozeRow(ctxRowData.id, 1);
      const badge = document.getElementById("snoozed-badge");
      if (badge) {
        const cnt = activeSnoozedCount();
        badge.textContent = cnt;
        badge.style.display = cnt > 0 ? "" : "none";
      }
      if (detailRowData?.id === ctxRowData.id) populateDetailPanel(detailRowData);
    }
    rowContextMenu.style.display = "none";
  });
  document.getElementById("ctx-duplicate")?.addEventListener("click", () => {
    if (ctxRowData) duplicateRow(ctxRowData);
    rowContextMenu.style.display = "none";
  });
  document.getElementById("ctx-open-detail")?.addEventListener("click", () => {
    if (ctxRowData) openDetailPanel(ctxRowData);
    rowContextMenu.style.display = "none";
  });
  document.addEventListener("click", () => { rowContextMenu.style.display = "none"; });

  // ── Detail panel snooze button ────────────────────────────────────────────
  document.getElementById("btn-detail-snooze")?.addEventListener("click", e => {
    e.stopPropagation();
    if (!detailRowData?.id) return;
    if (isSnoozeActive(detailRowData.id)) {
      unsnoozeRow(detailRowData.id);
      const badge = document.getElementById("snoozed-badge");
      if (badge) { const cnt = activeSnoozedCount(); badge.textContent = cnt; badge.style.display = cnt > 0 ? "" : "none"; }
      populateDetailPanel(detailRowData);
    } else {
      const pop = document.getElementById("snooze-popover");
      if (pop) pop.style.display = pop.style.display === "none" ? "flex" : "none";
    }
  });
  // Pre-fill snooze datetime when popover opens
  document.getElementById("btn-detail-snooze")?.addEventListener("click", () => {
    const dt = document.getElementById("snooze-until-dt");
    if (dt && !dt.value) {
      const tmr = new Date(); tmr.setDate(tmr.getDate() + 1); tmr.setHours(8, 0, 0, 0);
      dt.value = fmtDate(tmr) + "T08:00";
    }
  }, true); // capture phase

  document.getElementById("btn-snooze-confirm")?.addEventListener("click", () => {
    if (!detailRowData?.id) return;
    const dtVal = document.getElementById("snooze-until-dt")?.value;
    if (!dtVal) { toast("Please pick a date/time.", "error"); return; }
    snoozedItems[detailRowData.id] = dtVal.replace("T", " ");
    saveSnoozedItems();
    gridApi?.onFilterChanged(); gridApi?.redrawRows(); updateRowCount();
    document.getElementById("snooze-popover").style.display = "none";
    const badge = document.getElementById("snoozed-badge");
    if (badge) { const cnt = activeSnoozedCount(); badge.textContent = cnt; badge.style.display = cnt > 0 ? "" : "none"; }
    populateDetailPanel(detailRowData);
    toast(`Snoozed until ${dtVal.replace("T", " ")}.`, "success");
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".snooze-wrap")) {
      const pop = document.getElementById("snooze-popover");
      if (pop) pop.style.display = "none";
    }
  });

  // ── Week nav ──────────────────────────────────────────────────────────────
  document.getElementById("btn-week-prev")?.addEventListener("click",  () => { weekOffset--; renderWeekView(); });
  document.getElementById("btn-week-next")?.addEventListener("click",  () => { weekOffset++; renderWeekView(); });
  document.getElementById("btn-week-today")?.addEventListener("click", () => { weekOffset = 0; renderWeekView(); });

  // ── Cal/Week hide-completed toggle (shared state) ─────────────────────────
  function syncHideDoneButtons() {
    document.getElementById("btn-cal-hide-done")?.classList.toggle("active", calHideCompleted);
    document.getElementById("btn-week-hide-done")?.classList.toggle("active", calHideCompleted);
  }
  syncHideDoneButtons();
  function toggleHideDone() {
    calHideCompleted = !calHideCompleted;
    localStorage.setItem("wt-cal-hide-done", calHideCompleted ? "1" : "0");
    syncHideDoneButtons();
    const calActive  = document.getElementById("view-calendar")?.classList.contains("active");
    const weekActive = document.getElementById("view-week")?.classList.contains("active");
    if (calActive)  renderCalendar();
    if (weekActive) renderWeekView();
  }
  document.getElementById("btn-cal-hide-done")?.addEventListener("click",  toggleHideDone);
  document.getElementById("btn-week-hide-done")?.addEventListener("click", toggleHideDone);

  // ── Cal/Week search ───────────────────────────────────────────────────────
  document.getElementById("cal-search")?.addEventListener("input", e => {
    calSearch = e.target.value;
    renderCalendar();
  });
  document.getElementById("week-search")?.addEventListener("input", e => {
    weekSearch = e.target.value;
    renderWeekView();
  });

  // ── Week mode toggle ──────────────────────────────────────────────────────
  document.querySelectorAll(".week-mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === weekMode);
    btn.addEventListener("click", () => {
      weekMode = btn.dataset.mode;
      localStorage.setItem("wt-week-mode", weekMode);
      document.querySelectorAll(".week-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === weekMode));
      renderWeekView();
    });
  });

  // ── Modal close buttons ───────────────────────────────────────────────────
  document.querySelectorAll("[data-close]").forEach(btn =>
    btn.addEventListener("click", () => hideModal(btn.dataset.close))
  );
  document.querySelectorAll(".modal-overlay").forEach(overlay =>
    overlay.addEventListener("click", e => { if (e.target === overlay) hideModal(overlay.id); })
  );

  // ── Dropdowns ─────────────────────────────────────────────────────────────
  document.querySelectorAll(".dropdown").forEach(dd => {
    dd.querySelector(".dropdown-toggle")?.addEventListener("click", e => {
      e.stopPropagation();
      document.querySelectorAll(".dropdown.open").forEach(o => { if (o !== dd) o.classList.remove("open"); });
      dd.classList.toggle("open");
    });
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".dropdown-persist")) {
      document.querySelectorAll(".dropdown.open").forEach(d => d.classList.remove("open"));
    }
  });

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  document.addEventListener("keydown", e => {
    const inInput = document.activeElement.matches("input,textarea,select");
    if (e.ctrlKey && e.key === "s") {
      const panel = document.getElementById("detail-panel");
      if (panel && !panel.classList.contains("hidden") && detailRowData) {
        e.preventDefault();
        saveDetailPanel();
      }
    }
    if (e.ctrlKey && !e.shiftKey && e.key === "z" && !inInput) {
      e.preventDefault(); gridApi?.undoCellEditing();
    }
    if ((e.ctrlKey && e.key === "y") || (e.ctrlKey && e.shiftKey && e.key === "Z")) {
      if (!inInput) { e.preventDefault(); gridApi?.redoCellEditing(); }
    }
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => hideModal(m.id));
      document.querySelectorAll(".dropdown.open").forEach(d => d.classList.remove("open"));
      closeDetailPanel();
    }
  });
});
