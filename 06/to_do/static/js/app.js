/* ===================================================================
   app.js — Shared state, filter/category logic, event wiring, bootstrap
   Loaded last so all other modules are already defined.
   Depends on: utils.js, storage.js, api.js, grid.js, views.js, ui.js
   =================================================================== */

"use strict";

const APP_VERSION = "v6";

// ---------------------------------------------------------------------------
// Shared state — globals read by every other module
// ---------------------------------------------------------------------------

let gridApi               = null;
let rowData               = [];
let activePreset          = "all";
let activeCategoryFilters = [];    // [] with catFilterShowAll=true = show all; [] with false = show nothing
let catFilterShowAll      = true;  // true = no category filter; false = use activeCategoryFilters explicitly
let activeDateFilter      = "all";
let dateCustomFrom        = "";
let dateCustomTo          = "";
let addingNewRow          = null;   // row object currently being added (null when none)
let detailRowData         = null;
let wrapText              = false;
let hiddenColumns         = {};
let snoozedItems          = {};
let condFmtRules          = [];
let customCategories      = [];
let statusOptions         = [];   // loaded from localStorage; falls back to DEFAULT_STATUS_OPTIONS
let showSnoozedInGrid     = false;      // when true, snoozed items appear in the main grid
let hiddenDetailFields    = new Set();  // field keys hidden in the detail panel
let displayDateFormat     = "YYYY-MM-DD"; // display format for date columns (stored values stay ISO)

// ---------------------------------------------------------------------------
// Status selects — rebuild filter dropdown + detail panel select from statusOptions
// ---------------------------------------------------------------------------

function rebuildStatusSelects() {
  const detailSel = document.getElementById("detail-status");
  if (detailSel) {
    const cur = detailSel.value;
    detailSel.innerHTML = statusOptions.map(s =>
      `<option value="${esc(s.value)}">${esc(s.label)}</option>`
    ).join("");
    detailSel.value = statusOptions.some(s => s.value === cur) ? cur : "";
  }

  // Refresh grid cells so pills re-render with current options
  gridApi?.refreshCells({ columns: ["status"], force: true });
}

// ---------------------------------------------------------------------------
// Category dropdown
// ---------------------------------------------------------------------------

function updateCategoryFilterLabel() {
  const label = document.getElementById("category-filter-label");
  if (!label) return;
  if (catFilterShowAll) label.textContent = "All Categories";
  else if (activeCategoryFilters.length === 0) label.textContent = "No Categories";
  else if (activeCategoryFilters.length === 1) label.textContent = activeCategoryFilters[0];
  else label.textContent = `${activeCategoryFilters.length} Categories`;
}


function updateCategoryDropdown() {
  const menu = document.getElementById("cat-filter-menu");
  if (!menu) return;
  // Custom categories first (in defined order), then any data-only cats alphabetically
  const dataCats  = [...new Set(rowData.flatMap(r => getCategories(r)).filter(Boolean))];
  const customSet = new Set(customCategories);
  const cats = [
    ...customCategories.filter(c => dataCats.includes(c)),
    ...dataCats.filter(c => !customSet.has(c)).sort(),
  ];

  // "All" checked = catFilterShowAll=true; individual cats also visually checked.
  // Individual cats checked when in show-all mode OR explicitly included in activeCategoryFilters.
  menu.innerHTML = `
    <label class="col-picker-item cat-filter-item cat-filter-all">
      <input type="checkbox" class="col-picker-cb cat-filter-cb cat-filter-all-cb"
             ${catFilterShowAll ? "checked" : ""} />
      <span>All Categories</span>
    </label>
    <div class="cat-filter-divider"></div>
  ` + cats.map(c => `
    <label class="col-picker-item cat-filter-item">
      <input type="checkbox" class="col-picker-cb cat-filter-cb" data-cat="${esc(c)}"
             ${(catFilterShowAll || activeCategoryFilters.includes(c)) ? "checked" : ""} />
      <span>${esc(c)}</span>
    </label>
  `).join("");

  // "All" checked → show-all mode, all individual cats check.
  // "All" unchecked → explicit mode with nothing selected (shows nothing until user picks cats).
  menu.querySelector(".cat-filter-all-cb").addEventListener("change", e => {
    if (e.target.checked) {
      catFilterShowAll = true;
      activeCategoryFilters = [];
      menu.querySelectorAll(".cat-filter-cb:not(.cat-filter-all-cb)").forEach(cb => { cb.checked = true; });
    } else {
      catFilterShowAll = false;
      activeCategoryFilters = [];
      menu.querySelectorAll(".cat-filter-cb:not(.cat-filter-all-cb)").forEach(cb => { cb.checked = false; });
    }
    updateCategoryFilterLabel();
    gridApi?.onFilterChanged();
    saveFiltersToStorage();
    updateRowCount();
  });

  menu.querySelectorAll(".cat-filter-cb:not(.cat-filter-all-cb)").forEach(cb => {
    cb.addEventListener("change", () => {
      const cat = cb.dataset.cat;
      if (cb.checked) {
        catFilterShowAll = false;
        if (!activeCategoryFilters.includes(cat)) activeCategoryFilters.push(cat);
      } else {
        // If unchecking from show-all, transition to explicit-all minus this cat
        if (catFilterShowAll) {
          catFilterShowAll = false;
          activeCategoryFilters = [...cats];
        }
        activeCategoryFilters = activeCategoryFilters.filter(c => c !== cat);
      }
      // If all individual cats are now checked, snap back to show-all
      const allChecked = [...menu.querySelectorAll(".cat-filter-cb:not(.cat-filter-all-cb)")].every(c => c.checked);
      if (allChecked) { catFilterShowAll = true; activeCategoryFilters = []; }
      menu.querySelector(".cat-filter-all-cb").checked = catFilterShowAll;
      updateCategoryFilterLabel();
      gridApi?.onFilterChanged();
      saveFiltersToStorage();
      updateRowCount();
    });
  });
}

// ---------------------------------------------------------------------------
// Past-due badge
// ---------------------------------------------------------------------------

function applyDetailFieldVisibility() {
  const panel = document.getElementById("detail-panel");
  if (!panel) return;
  // Show/hide individual fields
  panel.querySelectorAll("[data-detail-field]").forEach(el => {
    el.style.display = hiddenDetailFields.has(el.dataset.detailField) ? "none" : "";
  });
  // Hide row-2 groups when all their children are hidden; show otherwise
  panel.querySelectorAll("[data-detail-row-group]").forEach(row => {
    const anyVisible = [...row.querySelectorAll("[data-detail-field]")]
      .some(f => !hiddenDetailFields.has(f.dataset.detailField));
    row.style.display = anyVisible ? "" : "none";
  });
}

function updatePastDueBadge() {
  const badge = document.getElementById("past-due-badge");
  if (!badge) return;
  const today = fmtDate(new Date());
  const count = rowData.filter(r => !r.deleted && !r.completed && r.date && r.date < today).length;
  if (count > 0) {
    badge.textContent = count;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
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
  catFilterShowAll      = true;
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

  // Restore catFilterShowAll: use saved value if present; otherwise infer from categories length
  if ('catShowAll' in state) {
    catFilterShowAll = state.catShowAll;
  } else {
    catFilterShowAll = !(Array.isArray(state.categories) && state.categories.length > 0);
  }
  if (Array.isArray(state.categories)) {
    const validCats = new Set(rowData.flatMap(r => getCategories(r)).filter(Boolean));
    activeCategoryFilters = state.categories.filter(c => validCats.has(c));
  }
  if (!catFilterShowAll || activeCategoryFilters.length > 0) {
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
  if (activeCategoryFilters.length >= 1) seed.category = JSON.stringify([activeCategoryFilters[0]]);
  return seed;
}

function addNewRow() {
  const now    = fmtDateTime(new Date());
  const newRow = {
    item: "", category: "", date: "", time: "", sort: 0,
    description: "", completed: false, date_completed: "",
    last_modified: now, created_at: now, deleted: false,
    ...seedRowFromFilters(),
  };

  // saveRow has no internal await — it mutates newRow (sets .id) and saves synchronously
  saveRow(newRow);

  rowData.push(newRow);

  try {
    addingNewRow = newRow;
    gridApi.applyTransaction({ add: [newRow], addIndex: 0 });
    addingNewRow = null;
    gridApi.onFilterChanged();
    updateCategoryDropdown();
    updateRowCount();
  } catch (_) {
    addingNewRow = null;
  }

  // Defer panel open so it runs after this click event finishes propagating to document.
  // Without the timeout the document-click handler (which closes panels on outside-clicks)
  // would fire while the panel is already open and immediately close it.
  const row = newRow;
  setTimeout(() => openDetailPanel(row), 0);
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
  loadSnoozedItems();
  loadDetailFieldPrefs();
  loadDateFormat();
  loadCondFmt();
  loadCategoryOrder();
  loadStatusOptions();

  updateSnoozeBadge();
  rebuildStatusSelects();

  initGrid();
  initCategoryCombo();
  _updateExportButtonLabel();
  updateLastExportDisplay();

  // ── Navbar ──────────────────────────────────────────────────────────────
  document.querySelectorAll(".nav-btn").forEach(btn =>
    btn.addEventListener("click", () => switchView(btn.dataset.view))
  );
  document.getElementById("btn-settings").addEventListener("click", () => {
    document.getElementById("settings-version").textContent = APP_VERSION;
    showModal("modal-settings");
  });
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

  // ── Date display format ──────────────────────────────────────────────────
  document.getElementById("date-format-select")?.addEventListener("input", e => {
    displayDateFormat = e.target.value || "YYYY-MM-DD";
    saveDateFormat();
    gridApi?.refreshCells({ columns: ["date", "date_completed"], force: true });
  });

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
  document.getElementById("btn-bulk-snooze")?.addEventListener("click", e => { e.stopPropagation(); bulkSnooze(); });
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

  document.getElementById("btn-export-default")?.addEventListener("click", () => exportToDefault());

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

  // Detail field customization
  document.getElementById("btn-detail-customize")?.addEventListener("click", e => {
    e.stopPropagation();
    const pop = document.getElementById("detail-customize-popover");
    const isOpen = pop.style.display !== "none";
    if (isOpen) { pop.style.display = "none"; return; }
    // Sync checkboxes to current hidden state
    pop.querySelectorAll(".detail-field-cb").forEach(cb => {
      cb.checked = !hiddenDetailFields.has(cb.dataset.field);
    });
    pop.style.display = "block";
  });

  document.getElementById("detail-customize-popover")?.addEventListener("change", e => {
    const cb = e.target.closest(".detail-field-cb");
    if (!cb) return;
    const field = cb.dataset.field;
    if (cb.checked) hiddenDetailFields.delete(field);
    else hiddenDetailFields.add(field);
    saveDetailFieldPrefs();
    applyDetailFieldVisibility();
  });

  document.addEventListener("click", e => {
    const pop = document.getElementById("detail-customize-popover");
    if (!pop || pop.style.display === "none") return;
    if (!document.getElementById("btn-detail-customize")?.contains(e.target) && !pop.contains(e.target)) {
      pop.style.display = "none";
    }
  });
  document.getElementById("btn-detail-save").addEventListener("click", e => { e.stopPropagation(); saveDetailPanel(); });
  document.getElementById("btn-detail-save-close").addEventListener("click", e => { e.stopPropagation(); saveDetailPanel(true); });
  document.getElementById("btn-detail-duplicate")?.addEventListener("click", () => { if (detailRowData) duplicateRow(detailRowData); });
  document.getElementById("btn-detail-date-today")?.addEventListener("click", () => {
    const inp = document.getElementById("detail-date");
    if (inp) inp.value = fmtDate(new Date());
  });
  document.getElementById("btn-log-followup")?.addEventListener("click", logFollowUp);
  document.getElementById("btn-log-followup-snooze")?.addEventListener("click", e => { e.stopPropagation(); logFollowUpAndSnooze(e.currentTarget); });

  // ── Checklist add ─────────────────────────────────────────────────────────
  document.getElementById("btn-add-checklist-item")?.addEventListener("click", addChecklistItem);
  document.getElementById("checklist-new-item")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); }
  });
  document.getElementById("followup-note-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); logFollowUp(); }
  });
  document.getElementById("btn-detail-delete").addEventListener("click", () => {
    if (!detailRowData?.id) return;
    confirm$("Delete item?", `Move "${detailRowData.item || "this item"}" to trash?`, async () => {
      const rowToDelete = detailRowData;
      rowToDelete.deleted       = true;
      rowToDelete.last_modified = fmtDateTime(new Date());
      await saveRow(rowToDelete);
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

  document.getElementById("detail-recur-on")?.addEventListener("change", e => {
    const on = e.target.checked;
    document.getElementById("detail-recur-count").disabled = !on;
    document.getElementById("detail-recur-unit").disabled  = !on;
    document.querySelector(".recur-inputs")?.classList.toggle("recur-inputs--on", on);
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

  // ── Category manager ──────────────────────────────────────────────────────
  let catDragSrcIdx = null;

  function renderCategoryList() {
    const el = document.getElementById("cat-manager-list");
    if (!el) return;
    if (!customCategories.length) {
      el.innerHTML = `<div class="empty-msg">No categories defined. Add one below or import from data.</div>`;
      return;
    }
    el.innerHTML = customCategories.map((cat, i) => `
      <div class="cat-mgr-row" draggable="true" data-idx="${i}">
        <span class="cat-mgr-handle" title="Drag to reorder">⠿</span>
        <span class="cat-mgr-name">${esc(cat)}</span>
        <button class="cat-mgr-del btn btn-ghost btn-sm icon-btn" data-idx="${i}" title="Remove">✕</button>
      </div>
    `).join("");

    el.querySelectorAll(".cat-mgr-row").forEach(row => {
      row.addEventListener("dragstart", e => {
        catDragSrcIdx = parseInt(row.dataset.idx);
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => row.classList.add("dragging"), 0);
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        el.querySelectorAll(".cat-mgr-row").forEach(r => r.classList.remove("drag-over"));
      });
      row.addEventListener("dragover",  e => e.preventDefault());
      row.addEventListener("dragenter", e => {
        e.preventDefault();
        el.querySelectorAll(".cat-mgr-row").forEach(r => r.classList.remove("drag-over"));
        if (parseInt(row.dataset.idx) !== catDragSrcIdx) row.classList.add("drag-over");
      });
      row.addEventListener("drop", e => {
        e.preventDefault();
        const targetIdx = parseInt(row.dataset.idx);
        if (catDragSrcIdx === null || catDragSrcIdx === targetIdx) return;
        const [moved] = customCategories.splice(catDragSrcIdx, 1);
        customCategories.splice(targetIdx, 0, moved);
        catDragSrcIdx = null;
        saveCategoryOrder();
        updateCategoryDropdown();
        renderCategoryList();
      });
    });

    el.querySelectorAll(".cat-mgr-del").forEach(btn => {
      btn.addEventListener("click", () => {
        customCategories.splice(parseInt(btn.dataset.idx), 1);
        saveCategoryOrder();
        updateCategoryDropdown();
        renderCategoryList();
      });
    });
  }

  // ── Manage Statuses modal ─────────────────────────────────────────────────
  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  function renderStatusList() {
    const el = document.getElementById("status-manager-list");
    if (!el) return;
    const editable = statusOptions.filter(s => s.value); // skip blank sentinel
    if (!editable.length) { el.innerHTML = `<p style="font-size:13px;color:var(--text-subtle)">No statuses yet.</p>`; return; }
    el.innerHTML = editable.map((s, i) => `
      <div class="status-mgr-row" data-idx="${i + 1}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle)">
        <span class="status-pill" style="background:${esc(s.bg)};color:${esc(s.color || '#fff')};min-width:90px;text-align:center">${esc(s.label)}</span>
        <input type="text"  class="detail-input smgr-label" data-idx="${i + 1}" value="${esc(s.label)}" style="flex:1;min-width:100px" placeholder="Label" />
        <input type="color" class="smgr-bg"    data-idx="${i + 1}" value="${s.bg    || '#6366f1'}" style="width:32px;height:28px;border-radius:4px;border:1px solid var(--border);cursor:pointer;padding:1px;background:none" title="Pill color" />
        <input type="color" class="smgr-color" data-idx="${i + 1}" value="${s.color || '#ffffff'}" style="width:32px;height:28px;border-radius:4px;border:1px solid var(--border);cursor:pointer;padding:1px;background:none" title="Text color" />
        <button class="btn btn-ghost btn-sm smgr-save"   data-idx="${i + 1}" title="Save">✓</button>
        <button class="btn btn-ghost btn-sm smgr-del icon-btn" data-idx="${i + 1}" title="Delete">✕</button>
      </div>
    `).join("");

    el.querySelectorAll(".smgr-save").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx   = parseInt(btn.dataset.idx);
        const row   = el.querySelector(`.status-mgr-row[data-idx="${idx}"]`);
        const label = row.querySelector(".smgr-label").value.trim();
        const bg    = row.querySelector(".smgr-bg").value;
        const color = row.querySelector(".smgr-color").value;
        if (!label) return;
        statusOptions[idx].label = label;
        statusOptions[idx].bg    = bg;
        statusOptions[idx].color = color;
        saveStatusOptions();
        rebuildStatusSelects();
        renderStatusList();
      });
    });

    // Live preview pill on color/label change
    el.querySelectorAll(".smgr-label,.smgr-bg,.smgr-color").forEach(inp => {
      inp.addEventListener("input", () => {
        const idx   = parseInt(inp.dataset.idx);
        const row   = el.querySelector(`.status-mgr-row[data-idx="${idx}"]`);
        const label = row.querySelector(".smgr-label").value || "…";
        const bg    = row.querySelector(".smgr-bg").value;
        const color = row.querySelector(".smgr-color").value;
        const pill  = row.querySelector(".status-pill");
        if (pill) { pill.textContent = label; pill.style.background = bg; pill.style.color = color; }
      });
    });

    el.querySelectorAll(".smgr-del").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        statusOptions.splice(idx, 1);
        saveStatusOptions();
        rebuildStatusSelects();
        renderStatusList();
      });
    });
  }

  document.getElementById("btn-manage-statuses")?.addEventListener("click", () => {
    renderStatusList();
    showModal("modal-statuses");
  });

  document.getElementById("btn-add-status")?.addEventListener("click", () => {
    const labelInp = document.getElementById("new-status-label");
    const label    = labelInp?.value.trim();
    if (!label) return;
    const bg    = document.getElementById("new-status-bg")?.value    || "#6366f1";
    const color = document.getElementById("new-status-color")?.value || "#ffffff";
    const value = slugify(label) || ("status_" + Date.now());
    if (!statusOptions.some(s => s.value === value)) {
      statusOptions.push({ value, label, bg, color });
      saveStatusOptions();
      rebuildStatusSelects();
      renderStatusList();
      if (labelInp) labelInp.value = "";
    } else {
      toast("A status with that name already exists.", "error");
    }
  });

  document.getElementById("new-status-label")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("btn-add-status")?.click(); }
  });

  document.getElementById("btn-manage-categories")?.addEventListener("click", () => {
    renderCategoryList();
    showModal("modal-categories");
  });

  document.getElementById("btn-add-category")?.addEventListener("click", () => {
    const inp = document.getElementById("new-category-input");
    const val = inp?.value.trim();
    if (!val) return;
    if (!customCategories.includes(val)) {
      customCategories.push(val);
      saveCategoryOrder();
      updateCategoryDropdown();
    }
    if (inp) inp.value = "";
    renderCategoryList();
  });

  document.getElementById("new-category-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("btn-add-category")?.click(); }
  });

  document.getElementById("btn-import-categories")?.addEventListener("click", () => {
    const dataCats = [...new Set(rowData.flatMap(r => getCategories(r)).filter(Boolean))];
    let added = 0;
    dataCats.forEach(c => { if (!customCategories.includes(c)) { customCategories.push(c); added++; } });
    if (added) { saveCategoryOrder(); updateCategoryDropdown(); }
    renderCategoryList();
    if (added) toast(`Imported ${added} categor${added > 1 ? "ies" : "y"} from data.`, "success");
    else toast("All data categories are already in the list.", "info");
  });

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


  // ── Snoozed modal ─────────────────────────────────────────────────────────
  function renderSnoozedModal(search) {
    const now = fmtSnoozeNow();
    const items = rowData
      .filter(r => !r.deleted && snoozedItems[r.id] && snoozedItems[r.id] >= now)
      .sort((a, b) => snoozedItems[a.id].localeCompare(snoozedItems[b.id]));

    const q = (search || "").toLowerCase();
    const filtered = q
      ? items.filter(r => (r.item || "").toLowerCase().includes(q) || getCategories(r).some(c => c.toLowerCase().includes(q)))
      : items;

    const list = document.getElementById("snoozed-items-list");
    if (!list) return;

    if (!filtered.length) {
      list.innerHTML = `<div class="deleted-empty">${q ? "No snoozed items match your search." : "No snoozed items."}</div>`;
      return;
    }

    list.innerHTML = filtered.map(r => `
      <div class="snoozed-item">
        <div class="snoozed-item-info">
          <div class="snoozed-item-name">${esc(r.item || "(no name)")}</div>
          <div class="snoozed-item-meta">
            ${getCategories(r).length ? `<span class="snoozed-meta-cat">${esc(getCategories(r).join(", "))}</span>` : ""}
            ${r.date ? `<span>Due: ${esc(r.date)}</span>` : ""}
            <span class="snoozed-meta-until">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              Until: ${esc(snoozedItems[r.id])}
            </span>
          </div>
        </div>
        <div class="snoozed-item-actions">
          <button class="btn btn-sm btn-secondary" onclick="navigateToRow(${r.id});hideModal('modal-snoozed')">Open</button>
          <button class="btn btn-sm btn-warning snoozed-unsnooze-btn" data-id="${r.id}">Unsnooze</button>
        </div>
      </div>
    `).join("");

    list.querySelectorAll(".snoozed-unsnooze-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        unsnoozeRow(parseInt(btn.dataset.id));
        updateSnoozeBadge();
        renderSnoozedModal(document.getElementById("snoozed-search")?.value || "");
      });
    });
  }

  document.getElementById("btn-show-snoozed")?.addEventListener("click", () => {
    showSnoozedInGrid = !showSnoozedInGrid;
    document.getElementById("btn-show-snoozed").classList.toggle("active", showSnoozedInGrid);
    gridApi?.onFilterChanged();
    updateRowCount();
  });

  document.getElementById("snoozed-search")?.addEventListener("input", e => {
    renderSnoozedModal(e.target.value);
  });

  document.getElementById("btn-unsnooze-all")?.addEventListener("click", () => {
    const now = fmtSnoozeNow();
    Object.keys(snoozedItems).forEach(id => {
      if (snoozedItems[id] >= now) delete snoozedItems[id];
    });
    saveSnoozedItems();
    gridApi?.onFilterChanged();
    gridApi?.redrawRows();
    updateRowCount();
    updateSnoozeBadge();
    renderSnoozedModal("");
    toast("All items unsnoozed.", "success");
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
    const isSnoozed = isSnoozeActive(ctxRowData.id);
    document.getElementById("ctx-snooze-row").textContent = isSnoozed
      ? `Unsnooze (until ${snoozedItems[ctxRowData.id]})`
      : "Snooze";
    rowContextMenu.style.display = "block";
    rowContextMenu.style.left    = e.pageX + "px";
    rowContextMenu.style.top     = e.pageY + "px";
  });
  document.getElementById("ctx-snooze-row")?.addEventListener("click", () => {
    if (ctxRowData?.id) {
      if (isSnoozeActive(ctxRowData.id)) unsnoozeRow(ctxRowData.id);
      else snoozeRow(ctxRowData.id, computeSnoozeUntil("tomorrow"));
      updateSnoozeBadge();
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
      updateSnoozeBadge();
      populateDetailPanel(detailRowData);
      document.getElementById("snooze-popover").style.display = "none";
    } else {
      const pop = document.getElementById("snooze-popover");
      if (pop && pop.style.display !== "none") {
        pop.style.display = "none";
      } else {
        openSnoozePopover();
      }
    }
  });

  document.querySelectorAll(".detail-snooze-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!detailRowData?.id) return;
      const untilStr = computeSnoozeUntil(btn.dataset.preset);
      if (!untilStr) return;
      snoozedItems[detailRowData.id] = untilStr;
      saveSnoozedItems();
      gridApi?.onFilterChanged(); gridApi?.redrawRows(); updateRowCount();
      document.getElementById("snooze-popover").style.display = "none";
      updateSnoozeBadge();
      populateDetailPanel(detailRowData);
      toast(`Snoozed until ${untilStr}.`, "success");
    });
  });

  document.querySelectorAll(".bulk-snooze-preset").forEach(btn => {
    btn.addEventListener("click", () => bulkSnoozeConfirm(btn.dataset.preset));
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".snooze-wrap")) {
      const pop = document.getElementById("snooze-popover");
      if (pop) pop.style.display = "none";
    }
    if (!e.target.closest("#btn-bulk-snooze") && !e.target.closest("#bulk-snooze-popover")) {
      const pop = document.getElementById("bulk-snooze-popover");
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
    // Close detail panel when clicking outside it
    const panel = document.getElementById("detail-panel");
    if (panel?.classList.contains("open") && !e.target.closest("#detail-panel") && !e.target.closest(".modal-overlay")) {
      closeDetailPanel();
    }
  });

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  document.addEventListener("keydown", e => {
    const inInput = document.activeElement.matches("input,textarea,select");
    if (e.altKey && e.key === "n" && !inInput) {
      const gridView = document.getElementById("view-grid");
      if (gridView && gridView.style.display !== "none") {
        e.preventDefault();
        addNewRow();
      }
    }
    if (e.ctrlKey && e.key === "Enter") {
      const panel = document.getElementById("detail-panel");
      if (panel && !panel.classList.contains("hidden") && detailRowData) {
        e.preventDefault();
        saveDetailPanel(true);
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
