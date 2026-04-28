/* ===================================================================
   storage.js — localStorage read/write only
   No DOM manipulation, no fetch, no gridApi calls.
   Depends on: utils.js (fmtDate, fmtSnoozeNow)
   =================================================================== */

"use strict";

// ---------------------------------------------------------------------------
// Sort — defaults and persistence
// ---------------------------------------------------------------------------

const DEFAULT_SORT = [
  { colId: "date", sort: "asc" },
  { colId: "time", sort: "asc" },
];

function saveSortToStorage() {
  if (!gridApi) return;
  const state = gridApi.getColumnState()
    .filter(c => c.sort)
    .map(c => ({ colId: c.colId, sort: c.sort, sortIndex: c.sortIndex }));
  localStorage.setItem("wt-sort", JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Column visibility
// ---------------------------------------------------------------------------

function loadColumnVisibility() {
  try { hiddenColumns = JSON.parse(localStorage.getItem("wt-hidden-cols") || "{}"); }
  catch { hiddenColumns = {}; }
}

function saveColumnVisibility() {
  localStorage.setItem("wt-hidden-cols", JSON.stringify(hiddenColumns));
}

// ---------------------------------------------------------------------------
// Wrap text
// ---------------------------------------------------------------------------

function loadWrapText() {
  wrapText = localStorage.getItem("wt-wraptext") === "1";
  // Button state and column defs pick up wrapText at grid init / after DOMContentLoaded
}

// ---------------------------------------------------------------------------
// Conditional formatting rules
// ---------------------------------------------------------------------------

function loadCondFmt() {
  try { condFmtRules = JSON.parse(localStorage.getItem("wt-cond-fmt") || "[]"); }
  catch { condFmtRules = []; }
}

function saveCondFmt() {
  localStorage.setItem("wt-cond-fmt", JSON.stringify(condFmtRules));
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function saveFiltersToStorage() {
  const state = {
    preset:      activePreset,
    categories:  activeCategoryFilters,
    catShowAll:  catFilterShowAll,
    date:        activeDateFilter,

    quick:       document.getElementById("quick-filter")?.value || "",
  };
  localStorage.setItem("wt-filters", JSON.stringify(state));
}


// ---------------------------------------------------------------------------
// Snoozed items
// ---------------------------------------------------------------------------

function loadSnoozedItems() {
  try {
    const stored = JSON.parse(localStorage.getItem("wt-snoozed") || "{}");
    const nowStr = fmtSnoozeNow();
    // Prune expired entries (stored value is "YYYY-MM-DD HH:MM")
    Object.keys(stored).forEach(id => { if (stored[id] < nowStr) delete stored[id]; });
    snoozedItems = stored;
    saveSnoozedItems();
  } catch { snoozedItems = {}; }
}

function saveSnoozedItems() {
  localStorage.setItem("wt-snoozed", JSON.stringify(snoozedItems));
}


// ---------------------------------------------------------------------------
// Date display format
// ---------------------------------------------------------------------------

function loadDateFormat() {
  displayDateFormat = localStorage.getItem("wt-date-format") || "YYYY-MM-DD";
  const sel = document.getElementById("date-format-select");
  if (sel) sel.value = displayDateFormat;
}

function saveDateFormat() {
  localStorage.setItem("wt-date-format", displayDateFormat);
}

// ---------------------------------------------------------------------------
// Detail panel field visibility
// ---------------------------------------------------------------------------

function loadDetailFieldPrefs() {
  try { hiddenDetailFields = new Set(JSON.parse(localStorage.getItem("wt-detail-fields") || "[]")); }
  catch { hiddenDetailFields = new Set(); }
}

function saveDetailFieldPrefs() {
  localStorage.setItem("wt-detail-fields", JSON.stringify([...hiddenDetailFields]));
}

// ---------------------------------------------------------------------------
// Collapsed parents
// ---------------------------------------------------------------------------

function loadCollapsedParents() {
  try { collapsedParents = new Set(JSON.parse(localStorage.getItem("wt-collapsed") || "[]")); }
  catch { collapsedParents = new Set(); }
}

function saveCollapsedParents() {
  localStorage.setItem("wt-collapsed", JSON.stringify([...collapsedParents]));
}

// ---------------------------------------------------------------------------
// Custom category order
// ---------------------------------------------------------------------------

function loadCategoryOrder() {
  try { customCategories = JSON.parse(localStorage.getItem("wt-categories") || "[]"); }
  catch { customCategories = []; }
}

function saveCategoryOrder() {
  localStorage.setItem("wt-categories", JSON.stringify(customCategories));
}

// ---------------------------------------------------------------------------
// Custom status options
// ---------------------------------------------------------------------------

const DEFAULT_STATUS_OPTIONS = [
  { value: "",                 label: "—",                     color: null,      bg: null },
  { value: "in_progress",      label: "In Progress",           color: "#ffffff", bg: "#3b82f6" },
  { value: "pending_followup", label: "Pending Follow Up",     color: "#ffffff", bg: "#8b5cf6" },
  { value: "waiting",          label: "Waiting on Dependency", color: "#1a1a1a", bg: "#f59e0b" },
  { value: "blocked",          label: "Blocked",               color: "#ffffff", bg: "#ef4444" },
];

function loadStatusOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem("wt-status-options") || "null");
    if (Array.isArray(saved) && saved.length) {
      // Always keep the blank "none" entry first
      statusOptions = [DEFAULT_STATUS_OPTIONS[0], ...saved.filter(s => s.value)];
    } else {
      statusOptions = [...DEFAULT_STATUS_OPTIONS];
    }
  } catch {
    statusOptions = [...DEFAULT_STATUS_OPTIONS];
  }
}

function saveStatusOptions() {
  // Persist everything except the blank sentinel
  localStorage.setItem("wt-status-options", JSON.stringify(statusOptions.filter(s => s.value)));
}

// ---------------------------------------------------------------------------
// Export settings
// ---------------------------------------------------------------------------

const EXPORT_SETTINGS_KEY = "wt-export-settings";

function getExportSettings() {
  try { return JSON.parse(localStorage.getItem(EXPORT_SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}

function saveExportSettings(settings) {
  localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// IndexedDB — File System Access API directory handle persistence
// ---------------------------------------------------------------------------

function _openExportDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("wt-fs", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("handles");
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = e => reject(e.target.error);
  });
}

async function saveExportDirHandle(handle) {
  const db = await _openExportDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, "export-dir");
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

async function getExportDirHandle() {
  const db = await _openExportDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("handles", "readonly");
    const req = tx.objectStore("handles").get("export-dir");
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function clearExportDirHandle() {
  const db = await _openExportDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").delete("export-dir");
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}
