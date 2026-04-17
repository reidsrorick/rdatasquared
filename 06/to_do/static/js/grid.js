/* ===================================================================
   grid.js — AG Grid Community v31 setup
   Cell renderers/editors, column definitions, grid init,
   external filter logic, conditional formatting, column picker.
   Depends on: utils.js, storage.js
   =================================================================== */

"use strict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Columns available for show/hide (colId → display label)
const TOGGLEABLE_COLS = {
  item: "Item", category: "Category", date: "Date", time: "Time",
  sort: "Sort", description: "Description", completed: "Done?",
  link: "Link", date_completed: "Date Completed", last_modified: "Last Modified",
};

const COND_FMT_CONDITIONS = [
  { value: "past_due",     label: "Past Due (not completed)" },
  { value: "due_today",    label: "Due Today (not completed)" },
  { value: "due_tomorrow", label: "Due Tomorrow (not completed)" },
  { value: "this_week",    label: "This Week (not completed)" },
  { value: "no_date",      label: "No Date Set" },
  { value: "completed",    label: "Completed" },
  { value: "before",       label: "Before date…" },
  { value: "after",        label: "After date…" },
];

// Working draft for the cond-fmt modal (not yet applied)
let condFmtDraft = [];

// ---------------------------------------------------------------------------
// Custom cell renderers / editors
// ---------------------------------------------------------------------------

/** Checkbox renderer — clicking toggles the cell value directly */
class CheckboxRenderer {
  init(p) {
    this.p  = p;
    this.el = document.createElement("div");
    this.el.className = "cell-checkbox-wrap";
    this.cb = document.createElement("input");
    this.cb.type      = "checkbox";
    this.cb.className = "cell-checkbox";
    this.cb.checked   = !!p.value;
    this.cb.addEventListener("change", () => p.setValue(this.cb.checked));
    // Prevent the row-click handler from opening the detail panel when toggling done
    this.el.addEventListener("click", e => e.stopPropagation());
    this.el.appendChild(this.cb);
  }
  getGui()   { return this.el; }
  destroy()  {}
  refresh(p) { this.cb.checked = !!p.value; return true; }
}

/** Date picker editor */
class DateEditor {
  init(p) {
    this.el = document.createElement("input");
    this.el.type      = "date";
    this.el.className = "cell-date-editor";
    this.el.value     = p.value || "";
  }
  getGui()           { return this.el; }
  getValue()         { return this.el.value; }
  afterGuiAttached() { this.el.focus(); }
  isPopup()          { return false; }
  isCancelBeforeStart() { return false; }
  isCancelAfterEnd()    { return false; }
}

/** Date cell renderer — shows date text + a calendar icon button that opens the native picker */
class HoverDateRenderer {
  init(p) {
    this.p  = p;
    this.el = document.createElement("div");
    this.el.style.cssText = "position:relative;width:100%;height:100%;display:flex;align-items:center;gap:4px;";

    this.span = document.createElement("span");
    this.span.style.flex = "1";
    this.span.textContent = p.value || "";

    // Hidden date input — positioned offscreen so showPicker() still works
    this.input = document.createElement("input");
    this.input.type      = "date";
    this.input.className = "cell-date-editor";
    this.input.value     = p.value || "";
    this.input.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;";

    // Calendar icon button
    this.btn = document.createElement("button");
    this.btn.className   = "cell-date-btn";
    this.btn.title       = "Pick date";
    this.btn.innerHTML   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

    this.el.appendChild(this.span);
    this.el.appendChild(this.btn);
    this.el.appendChild(this.input);

    this._onBtnClick = e => {
      e.stopPropagation();
      try { this.input.showPicker?.(); } catch { this.input.click(); }
    };
    this._onChange = () => {
      p.setValue(this.input.value);
      this.span.textContent = this.input.value;
    };

    this.btn.addEventListener("click",    this._onBtnClick);
    this.input.addEventListener("change", this._onChange);
  }
  getGui()  { return this.el; }
  destroy() {
    this.btn.removeEventListener("click",    this._onBtnClick);
    this.input.removeEventListener("change", this._onChange);
  }
  refresh(p) {
    this.p = p;
    this.input.value      = p.value || "";
    this.span.textContent = p.value || "";
    return true;
  }
}

/** Time picker editor */
class TimeEditor {
  init(p) {
    this.el = document.createElement("input");
    this.el.type      = "time";
    this.el.className = "cell-time-editor";
    this.el.value     = p.value || "";
  }
  getGui()           { return this.el; }
  getValue()         { return this.el.value; }
  afterGuiAttached() { this.el.focus(); }
  isPopup()          { return false; }
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function buildColumnDefs() {
  return [
    // Row selection checkbox
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 46, minWidth: 46, maxWidth: 46,
      pinned: "left",
      resizable: false, sortable: false, filter: false,
      suppressMenu: true, lockPosition: true,
      headerClass: "ag-header-center",
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
    },
    // Database ID (stable across views/filters/sorts)
    {
      headerName: "ID",
      field: "id",
      width: 60, minWidth: 52, maxWidth: 90,
      pinned: "left",
      editable: false, sortable: true, filter: "agNumberColumnFilter",
      resizable: true, suppressMenu: false,
      headerClass: "ag-header-center",
      cellStyle: { color: "var(--text-subtle)", fontFamily: "var(--font-mono)", fontSize: "11px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" },
    },
    // Open detail panel button
    {
      headerName: "",
      width: 38, minWidth: 38, maxWidth: 38,
      pinned: "left",
      editable: false, sortable: false, filter: false,
      resizable: false, suppressMenu: true,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: p => {
        const btn = document.createElement("button");
        btn.className = "open-detail-btn";
        btn.title     = "Open detail panel";
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
        btn.addEventListener("click", e => { e.stopPropagation(); openDetailPanel(p.data); });
        return btn;
      },
    },
    {
      field: "item", headerName: "Item", minWidth: 160, flex: 2, editable: true,
      wrapText: wrapText, autoHeight: wrapText,
      cellStyle: wrapText
        ? { whiteSpace: "normal", lineHeight: "1.5", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "flex-start" }
        : { display: "flex", alignItems: "center", justifyContent: "flex-start" },
    },
    {
      field: "category", headerName: "Category", minWidth: 110, width: 140, editable: true,
      headerClass: "ag-header-center",
      cellStyle: { textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" },
    },
    {
      field: "date", headerName: "Date", width: 130, editable: true,
      cellEditor: DateEditor, cellEditorPopup: false,
      cellRenderer: HoverDateRenderer,
      headerClass: "ag-header-center",
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      comparator: (a, b) => (a || "").localeCompare(b || ""),
    },
    {
      field: "time", headerName: "Time", width: 110, editable: true,
      cellEditor: TimeEditor, cellEditorPopup: false, filter: false,
      headerClass: "ag-header-center",
      cellStyle: { textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" },
      valueFormatter: p => fmtTime12h(p.value),
    },
    {
      field: "sort", headerName: "Sort", width: 80, editable: true,
      type: "numericColumn", filter: "agNumberColumnFilter",
      valueParser: p => isNaN(parseFloat(p.newValue)) ? p.oldValue : parseFloat(p.newValue),
    },
    {
      field: "description", headerName: "Description", minWidth: 200, flex: 3, editable: true,
      wrapText: wrapText, autoHeight: wrapText,
      cellStyle: wrapText
        ? { whiteSpace: "normal", lineHeight: "1.5", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "flex-start" }
        : { display: "flex", alignItems: "center", justifyContent: "flex-start" },
    },
    {
      field: "completed", headerName: "Done?", width: 84,
      editable: false,
      cellRenderer: CheckboxRenderer,
      cellClass: "chk-col",
      headerClass: "ag-header-center",
      filter: false,
    },
    {
      field: "date_completed", headerName: "Date Completed", width: 150, editable: true,
      cellEditor: DateEditor, cellEditorPopup: false,
      cellRenderer: HoverDateRenderer,
      comparator: (a, b) => (a || "").localeCompare(b || ""),
    },
    {
      field: "link", headerName: "Link", width: 120, editable: true,
      cellRenderer: p => {
        if (!p.value) return "";
        const a = document.createElement("a");
        a.href      = p.value;
        a.target    = "_blank";
        a.rel       = "noopener noreferrer";
        a.className = "grid-link";
        a.textContent = p.value.replace(/^https?:\/\//, "");
        a.addEventListener("click", e => e.stopPropagation());
        return a;
      },
    },
    {
      field: "last_modified", headerName: "Last Modified", width: 162,
      editable: false, cellClass: "meta-col",
      headerClass: "ag-header-center",
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-subtle)", fontFamily: "var(--font-mono)", fontSize: "11.5px" },
      comparator: (a, b) => (a || "").localeCompare(b || ""),
    },
  ];
}

// ---------------------------------------------------------------------------
// External filter — combines preset + category + date range
// ---------------------------------------------------------------------------

function passesDateFilter(row) {
  if (activeDateFilter === "all") return true;
  const date     = row.date || "";
  const today    = fmtDate(new Date());
  const tomorrow = fmtDate(new Date(Date.now() + 86_400_000));

  switch (activeDateFilter) {
    case "no_date":    return !date;
    case "past_due":   return !!date && date < today;
    case "today":      return date === today;
    case "tomorrow":   return date === tomorrow;
    case "this_week":  { const { start, end } = getWeekBounds(0); return !!date && date >= start && date <= end; }
    case "next_week":  { const { start, end } = getWeekBounds(1); return !!date && date >= start && date <= end; }
    case "this_month": return !!date && date.slice(0, 7) === today.slice(0, 7);
    case "before":     return !!date && !!dateCustomFrom && date < dateCustomFrom;
    case "after":      return !!date && !!dateCustomTo   && date > dateCustomTo;
    case "between":    return !!date && !!dateCustomFrom && !!dateCustomTo && date >= dateCustomFrom && date <= dateCustomTo;
    default:           return true;
  }
}

function isExternalFilterPresent() {
  return activePreset !== "all" || activeCategoryFilters !== null || activeDateFilter !== "all"
    || hiddenRowIds.size > 0 || Object.keys(snoozedItems).length > 0 || showSnoozed;
}

function doesExternalFilterPass(node) {
  if (!node.data) return true;
  if (!node.data.id && addingNewRow) return true;
  const row = node.data;

  // Exclusive views: hidden-only or snoozed-only
  if (showHiddenRows) return hiddenRowIds.has(row.id);
  if (showSnoozed)    return isSnoozeActive(row.id);

  // Normal view: suppress hidden and snoozed rows
  if (hiddenRowIds.has(row.id)) return false;
  if (isSnoozeActive(row.id))   return false;

  const today    = fmtDate(new Date());
  const tomorrow = fmtDate(new Date(Date.now() + 86_400_000));

  switch (activePreset) {
    case "open":         if (row.completed) return false; break;
    case "completed":    if (!row.completed) return false; break;
    case "past_due":     if (row.completed || !row.date || row.date >= today) return false; break;
    case "due_today":    if (row.completed || row.date !== today) return false; break;
    case "due_tomorrow": if (row.completed || row.date !== tomorrow) return false; break;
  }

  if (activeCategoryFilters !== null && !activeCategoryFilters.includes(row.category || "")) return false;
  if (!passesDateFilter(row)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Conditional formatting
// ---------------------------------------------------------------------------

function evalCondFmt(row) {
  const today    = fmtDate(new Date());
  const tomorrow = fmtDate(new Date(Date.now() + 86_400_000));
  const { start: wkStart, end: wkEnd } = getWeekBounds(0);
  for (const rule of condFmtRules) {
    const date = row.date || "";
    let match = false;
    switch (rule.condition) {
      case "past_due":     match = !!date && date < today && !row.completed; break;
      case "due_today":    match = date === today && !row.completed; break;
      case "due_tomorrow": match = date === tomorrow && !row.completed; break;
      case "this_week":    match = !!date && date >= wkStart && date <= wkEnd && !row.completed; break;
      case "no_date":      match = !date && !row.completed; break;
      case "completed":    match = !!row.completed; break;
      case "before":       match = !!date && !!rule.value && date < rule.value; break;
      case "after":        match = !!date && !!rule.value && date > rule.value; break;
    }
    if (match) return { background: rule.bgColor || null, color: rule.textColor || null };
  }
  return null;
}

function openCondFmtModal() {
  condFmtDraft = condFmtRules.map(r => ({ ...r }));
  renderCondFmtList();
  showModal("modal-cond-fmt");
}

function renderCondFmtList() {
  const el = document.getElementById("cond-fmt-rules-list");
  if (!el) return;
  if (!condFmtDraft.length) {
    el.innerHTML = `<div class="empty-msg">No rules yet. Click "Add Rule" to create one.</div>`;
    return;
  }
  el.innerHTML = condFmtDraft.map((rule, i) => `
    <div class="cond-rule-row">
      <span class="cond-rule-num">${i + 1}</span>
      <select class="cond-rule-cond filter-select" data-idx="${i}">
        ${COND_FMT_CONDITIONS.map(c => `<option value="${c.value}" ${rule.condition === c.value ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
      </select>
      <input type="date" class="cond-rule-date filter-date-input" data-idx="${i}" value="${esc(rule.value || "")}"
        style="${["before","after"].includes(rule.condition) ? "" : "display:none"}" />
      <label class="cond-rule-color-label" title="Row background">
        <span style="font-size:11px;color:var(--text-subtle)">BG</span>
        <input type="color" class="cond-rule-bg" data-idx="${i}" value="${rule.bgColor || "#f59e0b"}" />
      </label>
      <label class="cond-rule-color-label" title="Text color">
        <span style="font-size:11px;color:var(--text-subtle)">Text</span>
        <input type="color" class="cond-rule-tc" data-idx="${i}" value="${rule.textColor || "#000000"}" />
      </label>
      <button class="cond-rule-del btn btn-ghost btn-sm icon-btn" data-idx="${i}" title="Remove rule">✕</button>
    </div>
  `).join("");

  el.querySelectorAll(".cond-rule-cond").forEach(sel => {
    sel.addEventListener("change", e => {
      const idx = parseInt(e.target.dataset.idx);
      condFmtDraft[idx].condition = e.target.value;
      const dateInp = el.querySelector(`.cond-rule-date[data-idx="${idx}"]`);
      if (dateInp) dateInp.style.display = ["before","after"].includes(e.target.value) ? "" : "none";
    });
  });
  el.querySelectorAll(".cond-rule-date").forEach(inp => {
    inp.addEventListener("change", e => { condFmtDraft[parseInt(e.target.dataset.idx)].value = e.target.value; });
  });
  el.querySelectorAll(".cond-rule-bg").forEach(inp => {
    inp.addEventListener("input", e => { condFmtDraft[parseInt(e.target.dataset.idx)].bgColor = e.target.value; });
  });
  el.querySelectorAll(".cond-rule-tc").forEach(inp => {
    inp.addEventListener("input", e => { condFmtDraft[parseInt(e.target.dataset.idx)].textColor = e.target.value; });
  });
  el.querySelectorAll(".cond-rule-del").forEach(btn => {
    btn.addEventListener("click", e => {
      condFmtDraft.splice(parseInt(e.target.closest("[data-idx]").dataset.idx), 1);
      renderCondFmtList();
    });
  });
}

// ---------------------------------------------------------------------------
// Grid initialisation
// ---------------------------------------------------------------------------

function initGrid() {
  const opts = {
    columnDefs: buildColumnDefs(),
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: "agTextColumnFilter",
      filterParams: { buttons: ["reset"], closeOnApply: true },
      editable: true,
      floatingFilter: false,
    },
    rowData: [],
    rowSelection: "multiple",
    suppressRowClickSelection: true,
    undoRedoCellEditing: true,
    undoRedoCellEditingLimit: 30,
    stopEditingWhenCellsLoseFocus: true,
    suppressCopyRowsToClipboard: false,
    multiSortKey: "ctrl",
    enterNavigatesVerticallyAfterEdit: true,
    tabToNextCell: p => {
      const allCols  = gridApi?.getAllDisplayedColumns() || [];
      const editCols = allCols.filter(c => !c.getPinned() && c.getColDef().editable !== false);
      if (!editCols.length) return null;

      const backwards = p.backwards;
      const currCol   = p.previousCellPosition?.column;
      const currRow   = p.previousCellPosition?.rowIndex ?? 0;
      const currIdx   = editCols.indexOf(currCol);
      const rowCount  = gridApi?.getDisplayedRowCount() ?? 0;

      if (backwards) {
        if (currIdx > 0) return { rowIndex: currRow, column: editCols[currIdx - 1], rowPinned: null };
        if (currRow > 0) return { rowIndex: currRow - 1, column: editCols[editCols.length - 1], rowPinned: null };
        return null;
      } else {
        if (currIdx >= 0 && currIdx < editCols.length - 1) return { rowIndex: currRow, column: editCols[currIdx + 1], rowPinned: null };
        if (currRow < rowCount - 1)                        return { rowIndex: currRow + 1, column: editCols[0], rowPinned: null };
        return null;
      }
    },

    isExternalFilterPresent,
    doesExternalFilterPass,

    getRowClass: p => {
      if (p.data?.deleted)                                return "row-deleted";
      if (isSnoozeActive(p.data?.id) && showSnoozed)     return "row-snoozed";
      if (hiddenRowIds.has(p.data?.id) && showHiddenRows) return "row-hidden";
      if (p.data?.completed)                              return "row-completed";
      return "";
    },
    getRowStyle: p => {
      if (!p.data || p.data.deleted) return null;
      return evalCondFmt(p.data);
    },

    onCellValueChanged:  onCellValueChanged,
    onSelectionChanged:  onSelectionChanged,
    onSortChanged:       () => saveSortToStorage(),
    onGridReady: () => { loadRows(); applyColumnVisibility(); restoreSortFromStorage(); },

    onCellKeyDown: e => {
      if (e.event.key === "Delete" && !e.event.target.matches("input,textarea")) {
        if (gridApi.getSelectedRows().length) bulkDelete();
      }
    },
  };

  gridApi = agGrid.createGrid(document.getElementById("grid-container"), opts);
}

// ---------------------------------------------------------------------------
// Cell value change — auto-update Last Modified, handle Completed toggle
// ---------------------------------------------------------------------------

function onCellValueChanged(p) {
  const row   = p.data;
  const field = p.column.getColId();
  if (field === "last_modified") return;

  const now   = fmtDateTime(new Date());
  const today = fmtDate(new Date());

  if (field === "completed") {
    if (p.newValue && !p.oldValue) {
      if (!row.date_completed) row.date_completed = today;
      if (row.recur_rule) spawnRecurringOccurrence(row);
    } else if (!p.newValue && p.oldValue) {
      row.date_completed = "";
    }
  }

  row.last_modified = now;
  gridApi.refreshCells({ rowNodes: [p.node], columns: ["date_completed", "last_modified"], force: true });
  gridApi.redrawRows({ rowNodes: [p.node] });

  if (detailRowData?.id === row.id) populateDetailPanel(row);
  saveRow(row);
  updateRowCount();
}

// ---------------------------------------------------------------------------
// Selection bar
// ---------------------------------------------------------------------------

function onSelectionChanged() {
  const sel = gridApi.getSelectedRows();
  const bar = document.getElementById("selection-bar");
  document.getElementById("selection-count").textContent = sel.length;
  bar.classList.toggle("hidden", sel.length === 0);
}

// ---------------------------------------------------------------------------
// Sort persistence (needs gridApi — called after grid is ready)
// ---------------------------------------------------------------------------

function restoreSortFromStorage() {
  if (!gridApi) return;
  let saved;
  try { saved = JSON.parse(localStorage.getItem("wt-sort")); } catch { saved = null; }
  const state = (saved && saved.length > 0) ? saved : DEFAULT_SORT;
  gridApi.applyColumnState({ state, defaultState: { sort: null } });
}

// ---------------------------------------------------------------------------
// Column visibility (needs gridApi)
// ---------------------------------------------------------------------------

function applyColumnVisibility() {
  if (!gridApi) return;
  Object.entries(TOGGLEABLE_COLS).forEach(([colId]) => {
    gridApi.setColumnsVisible([colId], !hiddenColumns[colId]);
  });
}

function initColumnPicker() {
  const menu = document.getElementById("col-picker-menu");
  if (!menu) return;
  menu.innerHTML = Object.entries(TOGGLEABLE_COLS).map(([colId, label]) => `
    <label class="col-picker-item">
      <input type="checkbox" class="col-picker-cb" data-col="${colId}"
             ${!hiddenColumns[colId] ? "checked" : ""} />
      <span>${esc(label)}</span>
    </label>
  `).join("");

  menu.querySelectorAll(".col-picker-cb").forEach(cb => {
    cb.addEventListener("change", e => {
      const colId = e.target.dataset.col;
      if (e.target.checked) delete hiddenColumns[colId];
      else hiddenColumns[colId] = true;
      gridApi?.setColumnsVisible([colId], e.target.checked);
      saveColumnVisibility();
    });
  });
}

// ---------------------------------------------------------------------------
// Wrap text toggle
// ---------------------------------------------------------------------------

function toggleWrapText() {
  wrapText = !wrapText;
  gridApi.setGridOption("columnDefs", buildColumnDefs());
  gridApi.resetRowHeights();
  document.getElementById("btn-wrap-text").classList.toggle("active", wrapText);
  localStorage.setItem("wt-wraptext", wrapText ? "1" : "0");
}
