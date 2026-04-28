/* ===================================================================
   data.js — All data operations using localStorage
   Replaces the Flask/SQLite backend entirely.
   No server needed — data lives in the browser.
   Depends on: utils.js, storage.js, ui.js (toast, setSaveStatus, showModal, hideModal, confirm$)
   =================================================================== */

"use strict";

// ---------------------------------------------------------------------------
// Internal localStorage helpers
// ---------------------------------------------------------------------------

const _DATA_KEY = "wt-rows";

function getAllItems() {
  try { return JSON.parse(localStorage.getItem(_DATA_KEY) || "[]"); }
  catch { return []; }
}

function _saveAllItems(items) {
  localStorage.setItem(_DATA_KEY, JSON.stringify(items));
}

// Simple auto-incrementing ID seeded from max existing id
let _idCounter = null;
function _nextId() {
  if (_idCounter === null) {
    const all = getAllItems();
    _idCounter = all.length > 0 ? Math.max(...all.map(r => Number(r.id) || 0)) + 1 : 1;
  }
  return _idCounter++;
}

// ---------------------------------------------------------------------------
// Load rows into grid
// ---------------------------------------------------------------------------

async function loadRows() {
  rowData = getAllItems().filter(r => !r.deleted);
  if (gridApi) gridApi.setGridOption("rowData", rowData);
  updateDeletedBadge();
  updateCategoryDropdown();
  restoreFiltersFromStorage();
  updateRowCount();
}

// ---------------------------------------------------------------------------
// Save / create a single row
// ---------------------------------------------------------------------------

async function saveRow(row) {
  setSaveStatus("saving");
  try {
    const all = getAllItems();
    const now = fmtDateTime(new Date());
    row.last_modified = now;

    if (!row.id) {
      row.id         = _nextId();
      row.created_at = now;
      all.push(row);
    } else {
      const idx = all.findIndex(r => r.id === row.id);
      if (idx >= 0) all[idx] = row;
      else          all.push(row);
    }

    _saveAllItems(all);
    setSaveStatus("saved");
    return row;
  } catch (err) {
    setSaveStatus("error");
    toast("Save failed: " + err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

async function bulkAction(action) {
  const selected = gridApi.getSelectedRows();
  if (!selected.length) return;
  const ids = selected.filter(r => r.id).map(r => r.id);
  if (!ids.length) { toast("Select saved rows first", "info"); return; }

  const all   = getAllItems();
  const now   = fmtDateTime(new Date());
  const today = fmtDate(new Date());
  const idSet = new Set(ids);

  all.forEach(r => {
    if (!idSet.has(r.id)) return;
    r.last_modified = now;
    switch (action) {
      case "complete":
        r.completed = true;
        if (!r.date_completed) r.date_completed = today;
        break;
      case "incomplete":
        r.completed      = false;
        r.date_completed = "";
        break;
      case "delete":
        r.deleted = true;
        break;
      case "restore":
        r.deleted = false;
        break;
    }
  });

  _saveAllItems(all);
  toast(`${ids.length} row(s) updated`, "success");
  gridApi.deselectAll();
  await loadRows();
}

// ---------------------------------------------------------------------------
// Trash / restore
// ---------------------------------------------------------------------------

async function showDeletedModal() {
  const deleted = getAllItems().filter(r => r.deleted);
  const list    = document.getElementById("deleted-items-list");

  if (!deleted.length) {
    list.innerHTML = `<div class="deleted-empty">No deleted items.</div>`;
  } else {
    list.innerHTML = deleted.map(r => `
      <div class="deleted-item" data-id="${r.id}">
        <div class="deleted-item-info">
          <div class="deleted-item-name">${esc(r.item || "(no name)")}</div>
          <div class="deleted-item-meta">${esc(r.category || "")} · ${esc(r.last_modified || "")}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="restoreRow(${r.id})">Restore</button>
      </div>
    `).join("");
  }
  showModal("modal-deleted");
  updateDeletedBadge();
}

async function emptyTrash() {
  confirm$("Empty Trash", "Permanently delete all trashed items? This cannot be undone.", () => {
    _saveAllItems(getAllItems().filter(r => !r.deleted));
    toast("Trash emptied", "success");
    showDeletedModal();
    updateDeletedBadge();
  });
}

async function restoreRow(id) {
  const all  = getAllItems();
  const item = all.find(r => r.id === id);
  if (item) {
    item.deleted       = false;
    item.last_modified = fmtDateTime(new Date());
    _saveAllItems(all);
  }
  toast("Row restored", "success");
  showDeletedModal();
  await loadRows();
}

function updateDeletedBadge() {
  const cnt   = getAllItems().filter(r => r.deleted).length;
  const badge = document.getElementById("deleted-badge");
  if (badge) { badge.textContent = cnt; badge.style.display = cnt > 0 ? "" : "none"; }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

let importFile = null;

function openImportModal() {
  importFile = null;
  document.getElementById("file-input").value = "";
  document.getElementById("import-file-name").classList.add("hidden");
  document.getElementById("btn-import-confirm").disabled = true;
  showModal("modal-import");
}

function setImportFile(f) {
  importFile = f;
  const nm   = document.getElementById("import-file-name");
  nm.textContent = `✓  ${f.name}  (${(f.size / 1024).toFixed(1)} KB)`;
  nm.classList.remove("hidden");
  document.getElementById("btn-import-confirm").disabled = false;
}

async function doImport() {
  if (!importFile) return;
  const mode = document.querySelector("input[name='import-mode']:checked")?.value || "append";
  const btn  = document.getElementById("btn-import-confirm");
  btn.disabled    = true;
  btn.textContent = "Importing…";

  try {
    const text     = await importFile.text();
    const filename = importFile.name.toLowerCase();
    let items = [];

    if (filename.endsWith(".json")) {
      const data = JSON.parse(text);
      if (!Array.isArray(data.items)) throw new Error("Invalid backup file — expected { items: [...] }");
      items = data.items;
    } else if (filename.endsWith(".csv")) {
      items = _parseCSV(text);
    } else {
      throw new Error("Unsupported file type — use .json or .csv");
    }

    const now = fmtDateTime(new Date());

    // Parse snoozed state from JSON backup (not present in CSV)
    const backupSnoozed = (filename.endsWith(".json") && data.snoozed && typeof data.snoozed === "object")
      ? data.snoozed : {};

    if (mode === "replace") {
      _idCounter = null;
      _saveAllItems(items.map(r => ({ ...r, id: r.id ?? _nextId(), created_at: r.created_at || now })));
      // Restore snoozed state directly (IDs preserved in replace mode)
      snoozedItems = { ...backupSnoozed };
      saveSnoozedItems();
    } else {
      const existing = getAllItems();
      const base     = existing.length > 0 ? Math.max(...existing.map(r => Number(r.id) || 0)) + 1 : 1;
      // Build old-id → new-id map so snoozed entries follow their rows
      const idMap  = {};
      const newItems = items.map((r, i) => {
        const newId = base + i;
        if (r.id != null) idMap[r.id] = newId;
        return { ...r, id: newId, created_at: r.created_at || now };
      });
      _saveAllItems([...existing, ...newItems]);
      // Merge snoozed: translate old IDs to new IDs, don't overwrite existing snoozes
      const now2 = fmtSnoozeNow();
      Object.entries(backupSnoozed).forEach(([oldId, until]) => {
        const newId = idMap[oldId];
        if (newId != null && until >= now2) snoozedItems[newId] = until;
      });
      saveSnoozedItems();
    }

    _idCounter = null;
    updateSnoozeBadge();
    hideModal("modal-import");
    toast(`Imported ${items.length} row(s) (${mode})`, "success");
    await loadRows();
  } catch (err) {
    toast("Import failed: " + err.message, "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Import";
  }
}

function _parseCSVLine(line) {
  const vals = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      vals.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  vals.push(cur);
  return vals;
}

function _parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (!lines.length) return [];
  const headers = _parseCSVLine(lines[0]);
  const COL_MAP = {
    "item": "item", "category": "category", "date": "date", "time": "time",
    "sort": "sort", "description": "description",
    "completed?": "completed", "completed": "completed",
    "date completed": "date_completed", "date_completed": "date_completed",
  };
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = _parseCSVLine(line);
    const row  = {};
    headers.forEach((h, i) => {
      const mapped = COL_MAP[h.toLowerCase().trim()];
      if (!mapped) return;
      const v = (vals[i] || "").trim();
      if (mapped === "completed") row[mapped] = ["1","true","yes","x","y","✓"].includes(v.toLowerCase());
      else if (mapped === "sort") row[mapped] = parseFloat(v) || 0;
      else row[mapped] = v;
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function recordLastExport() {
  localStorage.setItem("wt-last-export", fmtDateTime(new Date()));
  updateLastExportDisplay();
}

function updateLastExportDisplay() {
  const el = document.getElementById("last-export-label");
  if (!el) return;
  const val = localStorage.getItem("wt-last-export");
  if (!val) { el.style.display = "none"; return; }
  // Format "YYYY-MM-DD HH:MM:SS" → "Apr 27, 5:24 PM"
  const d = new Date(val.replace(" ", "T"));
  const label = isNaN(d) ? val : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  el.textContent = `Exported ${label}`;
  el.style.display = "";
}

function exportData(format) {
  const ts = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const payload = {
      version:    "1.0",
      exportedAt: fmtDateTime(new Date()),
      items:      getAllItems(),
      snoozed:    { ...snoozedItems },
    };
    _triggerDownload(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `work-tracker-${ts}.json`
    );
    toast("Exported as JSON backup", "info");
    recordLastExport();

  } else if (format === "csv") {
    const headers = ["ID","Item","Category","Date","Time","Sort","Description","Completed?","Date Completed","Last Modified"];
    const csvRows = getAllItems().filter(r => !r.deleted).map(r => [
      r.id, r.item, r.category, r.date, r.time, r.sort,
      r.description, r.completed ? "Yes" : "No", r.date_completed, r.last_modified,
    ]);
    const csv = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    _triggerDownload(new Blob([csv], { type: "text/csv" }), `work-tracker-${ts}.csv`);
    toast("Exported as CSV", "info");
    recordLastExport();
  }
}

function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToDefault() {
  const settings = getExportSettings();

  // No File System Access API support → fall back to regular download
  if (!window.showDirectoryPicker) {
    const format = settings.format || "json";
    exportData(format);
    return;
  }

  let dirHandle;
  try {
    dirHandle = await getExportDirHandle();
  } catch (err) {
    console.error("Could not read export dir handle:", err);
  }

  if (!dirHandle) {
    toast("No default export folder set — use Export Settings to configure one.", "warn");
    return;
  }

  // Verify / request permission (requires user gesture — satisfied since we're in a click handler)
  let perm;
  try {
    perm = await dirHandle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") perm = await dirHandle.requestPermission({ mode: "readwrite" });
  } catch (err) {
    perm = "denied";
  }
  if (perm !== "granted") {
    toast("Export permission denied for that folder.", "warn");
    return;
  }

  const format   = settings.format || "json";
  const baseName = (settings.filename || "work-tracker-export").replace(/\.(json|csv)$/i, "");
  const filename = baseName + (format === "json" ? ".json" : ".csv");

  let content;
  if (format === "json") {
    const payload = {
      version:    "1.0",
      exportedAt: fmtDateTime(new Date()),
      items:      getAllItems(),
      snoozed:    { ...snoozedItems },
    };
    content = JSON.stringify(payload, null, 2);
  } else {
    const headers = ["ID","Item","Category","Date","Time","Sort","Description","Completed?","Date Completed","Last Modified"];
    const csvRows = getAllItems().filter(r => !r.deleted).map(r => [
      r.id, r.item, r.category, r.date, r.time, r.sort,
      r.description, r.completed ? "Yes" : "No", r.date_completed, r.last_modified,
    ]);
    content = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  try {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable   = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    const folder = settings.folderName || "selected folder";
    toast(`Exported to ${folder}/${filename}`, "success");
    recordLastExport();
  } catch (err) {
    console.error("Default export failed:", err);
    toast("Export failed: " + err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// Recurring task — spawn next occurrence on completion
// ---------------------------------------------------------------------------

async function spawnRecurringOccurrence(sourceRow) {
  const nextDate = nextRecurDate(sourceRow.date, sourceRow.recur_rule);
  if (!nextDate) return;
  const now    = fmtDateTime(new Date());
  const newRow = {
    item: sourceRow.item, category: sourceRow.category,
    date: nextDate, time: sourceRow.time, sort: sourceRow.sort,
    description: sourceRow.description, link: sourceRow.link || "",
    recur_rule: sourceRow.recur_rule, follow_ups: "[]",
    completed: false, date_completed: "", last_modified: now, deleted: false,
  };
  const saved = await saveRow(newRow);
  if (saved) {
    if (newRow.id) setNotifOff(newRow.id, true);
    rowData.push(newRow);
    gridApi?.applyTransaction({ add: [newRow] });
    gridApi?.onFilterChanged();
    updateRowCount();
    toast(`Recurring task created for ${nextDate}.`, "success");
  }
}

// ---------------------------------------------------------------------------
// Duplicate row
// ---------------------------------------------------------------------------

async function duplicateRow(sourceRow) {
  if (!sourceRow?.id) return;
  const now    = fmtDateTime(new Date());
  const newRow = {
    item:           (sourceRow.item || "") + " (copy)",
    category:       sourceRow.category,
    date:           sourceRow.date,
    time:           sourceRow.time,
    sort:           sourceRow.sort,
    description:    sourceRow.description,
    link:           sourceRow.link || "",
    recur_rule:     sourceRow.recur_rule || "",
    follow_ups:     "[]",
    completed:      false,
    date_completed: "",
    last_modified:  now,
    deleted:        false,
  };
  const saved = await saveRow(newRow);
  if (saved) {
    if (newRow.id) setNotifOff(newRow.id, true);
    rowData.push(newRow);
    gridApi?.applyTransaction({ add: [newRow] });
    gridApi?.onFilterChanged();
    updateCategoryDropdown();
    updateRowCount();
    toast("Task duplicated.", "success");
    openDetailPanel(newRow);
  }
}

// ---------------------------------------------------------------------------
// Create entry on a specific date (from calendar/week double-click)
// ---------------------------------------------------------------------------

async function createEntryOnDate(dateStr) {
  const now    = fmtDateTime(new Date());
  const newRow = {
    item: "", category: "", date: dateStr || "", time: "", sort: 0,
    description: "", completed: false, date_completed: "",
    last_modified: now, deleted: false,
  };
  if (activeCategoryFilters.length === 1) newRow.category = activeCategoryFilters[0];

  const saved = await saveRow(newRow);
  if (!saved) return;
  rowData.push(newRow);
  if (gridApi) gridApi.applyTransaction({ add: [newRow] });
  openDetailPanel(newRow);

  const calActive  = document.getElementById("view-calendar")?.classList.contains("active");
  const weekActive = document.getElementById("view-week")?.classList.contains("active");
  if (calActive)  renderCalendar();
  if (weekActive) renderWeekView();
}
