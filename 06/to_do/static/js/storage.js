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
    preset:     activePreset,
    categories: activeCategoryFilters,
    date:       activeDateFilter,
    quick:      document.getElementById("quick-filter")?.value || "",
  };
  localStorage.setItem("wt-filters", JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Hidden rows
// ---------------------------------------------------------------------------

function loadHiddenRows() {
  try {
    const arr = JSON.parse(localStorage.getItem("wt-hidden-rows") || "[]");
    hiddenRowIds = new Set(arr);
  } catch { hiddenRowIds = new Set(); }
}

function saveHiddenRows() {
  localStorage.setItem("wt-hidden-rows", JSON.stringify([...hiddenRowIds]));
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
// Notifications
// ---------------------------------------------------------------------------

const NOTIF_KEY          = "wt-notified-today"; // set of IDs notified today
const NOTIF_OFF_KEY      = "wt-notif-off";      // set of IDs with notifications disabled
const NOTIF_TIME_KEY     = "wt-notif-times";    // { [id]: "HH:MM" } scheduled times
const NOTIF_DEFAULT_TIME = "09:00";

function getNotifOffIds() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_OFF_KEY) || "[]")); }
  catch { return new Set(); }
}

function setNotifOff(id, disabled) {
  const ids = getNotifOffIds();
  if (disabled) ids.add(id); else ids.delete(id);
  localStorage.setItem(NOTIF_OFF_KEY, JSON.stringify([...ids]));
}

function isNotifDisabled(id) { return getNotifOffIds().has(id); }

function getNotifTimes() {
  try { return JSON.parse(localStorage.getItem(NOTIF_TIME_KEY) || "{}"); }
  catch { return {}; }
}

function setNotifTime(id, time) {
  const times = getNotifTimes();
  if (time) times[id] = time; else delete times[id];
  localStorage.setItem(NOTIF_TIME_KEY, JSON.stringify(times));
}

function getNotifTime(id) {
  return getNotifTimes()[id] || NOTIF_DEFAULT_TIME;
}

function getNotifiedToday() {
  try {
    const d = JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}");
    if (d.date !== fmtDate(new Date())) return {};
    return d.ids || {};
  } catch { return {}; }
}

function markNotified(id) {
  const today = fmtDate(new Date());
  let d;
  try { d = JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}"); } catch { d = {}; }
  if (d.date !== today) d = { date: today, ids: {} };
  d.ids[id] = true;
  localStorage.setItem(NOTIF_KEY, JSON.stringify(d));
}

// ---------------------------------------------------------------------------
// Export settings
// ---------------------------------------------------------------------------

const DETAIL_FIELDS_KEY    = "wt-detail-fields";
const EXPORT_SETTINGS_KEY  = "wt-export-settings";
const LAST_EXPORT_KEY      = "wt-last-export";

function getLastExportTime() {
  return localStorage.getItem(LAST_EXPORT_KEY) || null;
}

function saveLastExportTime() {
  localStorage.setItem(LAST_EXPORT_KEY, fmtDateTime(new Date()));
}

function getDetailHiddenFields() {
  try { return JSON.parse(localStorage.getItem(DETAIL_FIELDS_KEY) || "{}"); }
  catch { return {}; }
}

function saveDetailHiddenFields(hidden) {
  localStorage.setItem(DETAIL_FIELDS_KEY, JSON.stringify(hidden));
}

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
