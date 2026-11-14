/* app.js — state + actions + bootstrap. Exposed on window.BB.app */
(function () {
  "use strict";
  const BB = window.BB;

  const LS_AUTOSAVE = "bb.autosave";
  const LS_TAB = "bb.activeTab";
  const LS_MASK = "bb.masked";
  let autosavePref = true;
  try {
    const v = localStorage.getItem(LS_AUTOSAVE);
    if (v != null) autosavePref = v === "1";
  } catch {}

  // restore the tab the user left off on (falls back to dashboard)
  let startTab = "dashboard";
  try {
    const t = localStorage.getItem(LS_TAB);
    if (t && BB.ui.validTab(t)) startTab = t;
  } catch {}

  // restore privacy (amounts masked) preference
  let maskedPref = false;
  try {
    maskedPref = localStorage.getItem(LS_MASK) === "1";
  } catch {}
  BB.model.setMasked(maskedPref);

  BB.state = {
    loaded: false,
    activeTab: startTab,
    masked: maskedPref,
    folderName: "",
    rows: { apartment: [], requests: [], subscriptions: [], thirdparty: [] },
    dirty: { data: false }, // unsaved changes vs budget.json
    links: [],
    migrations: {}, // one-time data fixes already applied (stored in budget.json)
    autosave: autosavePref,
    saving: false,
    lastSavedAt: null,
    pendingHandle: null, // remembered folder awaiting a one-click re-grant
    pendingName: "",
    fileMode: "none", // 'fs' = in-place writes, 'download' = fallback, 'none'
    conflict: { data: false }, // budget.json changed on disk vs our copy
  };

  const S = BB.state;
  const $ = (id) => document.getElementById(id);

  // ---- autosave engine ----
  const AUTOSAVE_DELAY = 1200;
  const timers = {};
  const pending = new Set();

  // Autosave only works when we can write a real file handle in place.
  function autosaveOn() {
    return S.autosave && BB.store.supportsFS;
  }
  // (a connected folder is enough — the first save creates budget.json if it isn't there yet)
  function canAutosave() {
    const st = BB.store.state;
    return autosaveOn() && !!(st.files.data.handle || st.dir);
  }

  function scheduleAutosave(fileKey, delay) {
    if (!canAutosave(fileKey)) return;
    if (S.conflict[fileKey]) return; // paused until the user resolves the conflict
    pending.add(fileKey);
    S.saving = true;
    clearTimeout(timers[fileKey]);
    timers[fileKey] = setTimeout(() => doAutosave(fileKey), delay == null ? AUTOSAVE_DELAY : delay);
    BB.ui.renderBars();
  }

  async function doAutosave(fileKey) {
    try {
      const res = await BB.store.saveFile(fileKey, S);
      S.dirty[fileKey] = false;
      S.lastSavedAt = new Date();
      if (res.backup) BB.ui.toast(`Backup saved before autosave.`, "");
    } catch (e) {
      if (e && e.code === "CONFLICT") {
        S.conflict[fileKey] = true; // pause autosave for this file, surface a banner
      } else {
        console.error(e);
        BB.ui.toast("Autosave failed — click Save to retry. " + (e.message || e), "warn");
        S.autosave = false; // stop retry loops; let the user re-enable
        persistAutosave();
      }
    } finally {
      pending.delete(fileKey);
      S.saving = pending.size > 0;
      BB.ui.render();
    }
  }

  // ---- expense tracker: receipts attach to a specific expense row ----
  function slug(s) {
    return String(s)
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }
  const pad2 = (x) => String(x).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  // Saved as YYYY-MM-DD_<what>_<original name>, dated by when the expense was purchased
  // so the Receipts folder sorts the way your expenses do.
  function receiptName(file, row) {
    const d = BB.model.toDate(row["Date of Original Purchase"]) || new Date();
    const dot = file.name.lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    const base = dot >= 0 ? file.name.slice(0, dot) : file.name;
    const parts = [ymd(d)];
    if (row.Activity) parts.push(slug(row.Activity));
    parts.push(slug(base) || "receipt");
    return parts.join("_") + ext;
  }
  function uniqueName(name, taken) {
    if (!taken.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf(".");
    const base = dot >= 0 ? name.slice(0, dot) : name;
    const ext = dot >= 0 ? name.slice(dot) : "";
    let n = 2;
    while (taken.has(`${base}-${n}${ext}`.toLowerCase())) n++;
    return `${base}-${n}${ext}`;
  }

  // Save one or more files to Receipts/ and link them to expense row `index`.
  async function attachReceipts(index, fileList) {
    const row = S.rows.thirdparty[index];
    if (!row) return;
    if (!BB.store.canReceipts()) {
      BB.ui.toast("Connect your budget folder first — receipts save into it.", "warn");
      return;
    }
    try {
      const taken = new Set((await BB.store.listReceipts()).map((r) => r.name.toLowerCase()));
      const names = BB.model.splitReceipts(row.Receipt);
      let n = 0;
      for (const file of fileList) {
        const name = uniqueName(receiptName(file, row), taken);
        taken.add(name.toLowerCase());
        await BB.store.saveReceipt(file, name);
        names.push(name);
        n++;
      }
      row.Receipt = BB.model.joinReceipts(names);
      markDirty("thirdparty");
      BB.ui.render();
      BB.ui.refreshReceiptModal(index);
      BB.ui.toast(`Attached ${n} receipt${n > 1 ? "s" : ""} to “${row.Activity || "expense"}”.`, "ok");
    } catch (e) {
      console.error(e);
      BB.ui.toast("Attach failed: " + (e.message || e), "warn");
    }
  }

  // Remove the link from the row. The file stays in Receipts/ — nothing is deleted.
  function unlinkReceipt(index, name) {
    const row = S.rows.thirdparty[index];
    if (!row) return;
    const names = BB.model.splitReceipts(row.Receipt).filter((n) => n !== name);
    row.Receipt = names.length ? BB.model.joinReceipts(names) : null;
    markDirty("thirdparty");
    BB.ui.render();
    BB.ui.refreshReceiptModal(index);
    BB.ui.toast("Receipt unlinked (the file is still in Receipts/).", "");
  }

  async function openReceiptByName(name) {
    try {
      const h = await BB.store.receiptHandle(name);
      if (!h) {
        BB.ui.toast(`“${name}” isn't in the Receipts folder anymore.`, "warn");
        return;
      }
      const url = await BB.store.receiptURL(h);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      BB.ui.toast("Could not open receipt: " + (e.message || e), "warn");
    }
  }

  // ---- apartment months in the Expense Tracker (Luke's share, driven by Requests) ----
  const owedLine = (key) =>
    BB.model.apartmentOwedLines(S.rows.apartment, S.rows.requests).find((l) => l.key === key);

  // "This month is already settled" — records a Complete request for the month.
  function settleMonth(key) {
    const line = owedLine(key);
    if (!line) return;
    if (line.requestIndex != null) return markMonthPaid(key); // there's already a request: just mark it paid
    S.rows.requests.push(BB.model.settledRequest(line));
    markDirty("requests");
    BB.ui.render();
    BB.ui.toast(`${line.label} marked settled.`, "ok");
  }

  // Luke paid the request for this month.
  function markMonthPaid(key) {
    const line = owedLine(key);
    if (!line || line.requestIndex == null) return;
    const r = S.rows.requests[line.requestIndex];
    if (!r["Payment Received?"]) {
      const d = new Date();
      r["Payment Received?"] = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    if (!/^complete$/i.test(r.Status || "")) r.Status = "Paid";
    markDirty("requests");
    BB.ui.render();
    BB.ui.toast(`${line.label} marked paid.`, "ok");
  }

  // Change an expense's status (Pending → Submitted → Paid), stamping the matching date.
  function setExpenseStatus(index, status) {
    const row = S.rows.thirdparty[index];
    if (!row || !BB.model.EXPENSE_STATUSES.includes(status)) return;
    row.Status = status;
    BB.model.applyStatusDates(row);
    markDirty("thirdparty");
    BB.ui.render();
  }

  function persistAutosave() {
    try {
      localStorage.setItem(LS_AUTOSAVE, S.autosave ? "1" : "0");
    } catch {}
  }

  function setAutosave(v) {
    S.autosave = v;
    persistAutosave();
    if (v) {
      // flush anything currently dirty
      Object.keys(S.dirty).forEach((k) => {
        if (S.dirty[k]) scheduleAutosave(k, 0);
      });
    }
    BB.ui.render();
  }

  function setTab(id) {
    S.activeTab = id;
    try {
      localStorage.setItem(LS_TAB, id);
    } catch {}
    BB.ui.render();
  }

  function setMasked(v) {
    S.masked = !!v;
    BB.model.setMasked(S.masked);
    try {
      localStorage.setItem(LS_MASK, S.masked ? "1" : "0");
    } catch {}
    BB.ui.render();
  }

  async function connect() {
    if (!BB.store.supportsFS) {
      $("fallbackInput").click();
      return;
    }
    try {
      let found;
      if (S.pendingHandle) {
        // one-click re-grant on the remembered folder (no re-picking)
        found = await BB.store.adoptStored(S.pendingHandle, true);
        S.pendingHandle = null;
        S.pendingName = "";
      } else {
        found = await BB.store.openFolder();
      }
      await finishLoad(found, "connect");
    } catch (e) {
      if (e && (e.name === "AbortError" || e.message === "no-fs")) return;
      console.error(e);
      BB.ui.toast("Could not open folder: " + (e.message || e), "warn");
    }
  }

  async function finishLoad(found, how) {
    const dir = BB.store.state.dir;
    const nothingThere = !found || (!found.json && !found.apartment && !found.expenses);
    if (nothingThere) {
      if (how === "restore") return false; // never prompt on page load
      if (
        !window.confirm(
          `No ${BB.store.DATA_FILE} or spreadsheets found in “${dir.name}”.\n\nStart a new, empty budget in this folder?`
        )
      )
        return false;
    }

    const res = await BB.store.loadAll(); // throws (and changes nothing) if budget.json is unreadable
    ingest(res);
    S.folderName = dir.name;
    S.fileMode = "fs";
    S.loaded = true;

    // First run in this folder: create budget.json from what we just read. The old .xlsx
    // files are only ever read, never changed.
    if (res.source !== "json") {
      try {
        await BB.store.saveFile("data", S);
        S.lastSavedAt = new Date();
        // this save already covers anything the load-time migration queued up
        S.dirty.data = false;
        clearTimeout(timers.data);
        pending.delete("data");
        S.saving = false;
      } catch (e) {
        if (e && e.code === "CONFLICT") S.conflict.data = true; // a budget.json appeared meanwhile
        else {
          console.error(e);
          BB.ui.toast("Could not create budget.json: " + (e.message || e), "warn");
        }
      }
    }
    BB.ui.render();

    if (res.source === "xlsx")
      BB.ui.toast(
        `Imported ${res.imported.join(" + ")} into ${BB.store.DATA_FILE}. Your spreadsheets were not changed.`,
        "ok"
      );
    else if (res.source === "new") BB.ui.toast(`Started a new ${BB.store.DATA_FILE}.`, "ok");
    else if (how === "restore") BB.ui.toast(`Reconnected to ${S.folderName}.`, "");
    else BB.ui.toast("Folder connected.", "");
    return true;
  }

  // On load, try to silently re-open the folder we used last time.
  async function attemptRestore() {
    if (!BB.store.supportsFS) return;
    try {
      const dir = await BB.store.getStoredFolder();
      if (!dir) return;
      const found = await BB.store.adoptStored(dir, false); // no prompt without a gesture
      if (found) {
        await finishLoad(found, "restore");
      } else {
        // permission needs a click — show a Reconnect button instead of the full picker
        S.pendingHandle = dir;
        S.pendingName = dir.name;
        BB.ui.render();
      }
    } catch (e) {
      console.warn("restore failed", e);
      // a corrupt budget.json shouldn't fail silently at startup
      if (e && e.message && e.message.includes(BB.store.DATA_FILE)) BB.ui.toast(e.message, "warn");
    }
  }

  async function loadFallback(fileList) {
    try {
      const res = await BB.store.loadFromFiles(fileList);
      ingest(res);
      S.folderName = "";
      S.fileMode = "download";
      S.loaded = true;
      BB.ui.render();
      BB.ui.toast(
        res.source === "xlsx"
          ? `Imported ${res.imported.join(" + ")}. Saving downloads a ${BB.store.DATA_FILE}.`
          : `${BB.store.DATA_FILE} loaded. Saving downloads an updated copy.`,
        ""
      );
    } catch (e) {
      console.error(e);
      BB.ui.toast("Could not read files: " + (e.message || e), "warn");
    }
  }

  // replace the in-memory data with what was just read: { rowsBySchema, links, migrations }
  function ingest({ rowsBySchema, links, migrations }) {
    S.rows.apartment = rowsBySchema.apartment || [];
    S.rows.requests = (rowsBySchema.requests || []).map(BB.model.normalizeRequest);
    S.rows.subscriptions = rowsBySchema.subscriptions || [];
    S.rows.thirdparty = (rowsBySchema.thirdparty || []).map(BB.model.normalizeExpense);
    S.links = links || [];
    S.migrations = { ...(migrations || {}) };
    S.dirty = { data: false };
    S.conflict = { data: false };
    applyMigrations();
  }

  // One-time data fixes, remembered in budget.json so each only ever runs once.
  //  • settledBeforeFirstRequest: apartment months before your first tracked Venmo request
  //    were settled before you started tracking — mark them settled so Luke isn't "owing"
  //    them in the Expense Tracker. They show up as ordinary Complete requests (delete any
  //    you disagree with).
  function applyMigrations() {
    if (S.migrations.settledBeforeFirstRequest) return;
    const added = BB.model.catchUpRequests(S.rows.apartment, S.rows.requests);
    S.migrations.settledBeforeFirstRequest = true;
    if (added.length) S.rows.requests.push(...added);
    markDirty("requests"); // persist the data (and the "already done" marker)
    if (added.length) {
      const months = added.map((r) => r.Title.replace(/ Bills$/, "")).join(" and ");
      // shown a moment later so it isn't hidden behind the "connected" toast
      setTimeout(
        () =>
          BB.ui.toast(
            `Marked ${months} as settled (before your first tracked request). Review them in the Expense Tracker — ✕ undoes one.`,
            "ok"
          ),
        3500
      );
    }
  }

  function markDirty(schemaName) {
    const fileKey = BB.store.fileForSchema(schemaName);
    S.dirty[fileKey] = true;
    scheduleAutosave(fileKey);
  }

  // expense rows get their defaults + status dates filled in before they're stored
  function prepRow(schemaName, row) {
    if (schemaName === "thirdparty") BB.model.applyStatusDates(BB.model.normalizeExpense(row));
    if (schemaName === "requests") BB.model.normalizeRequest(row);
    return row;
  }

  function commitRow(schemaName, index, out) {
    prepRow(schemaName, out);
    if (index == null) S.rows[schemaName].push(out);
    else S.rows[schemaName][index] = out;
    markDirty(schemaName);
    BB.ui.render();
  }

  function commitRows(schemaName, rows) {
    if (!rows || !rows.length) return;
    rows.forEach((r) => prepRow(schemaName, r));
    S.rows[schemaName].push(...rows);
    markDirty(schemaName);
    BB.ui.render();
  }

  function deleteRow(schemaName, index) {
    const r = S.rows[schemaName][index];
    const label = r.Item || r.Title || r.Activity || "this row";
    if (!window.confirm(`Delete “${label}”?`)) return;
    S.rows[schemaName].splice(index, 1);
    markDirty(schemaName);
    BB.ui.render();
  }

  async function save(fileKey, opts) {
    try {
      const res = await BB.store.saveFile(fileKey, S, opts);
      S.dirty[fileKey] = false;
      S.conflict[fileKey] = false;
      S.lastSavedAt = new Date();
      BB.ui.render();
      if (res.mode === "saved")
        BB.ui.toast(`Saved ${res.file}${res.backup ? " (backup made)" : ""}.`, "ok");
      else BB.ui.toast(`Downloaded ${res.file} — replace the one in your folder with it.`, "");
    } catch (e) {
      if (e && e.code === "CONFLICT") {
        S.conflict[fileKey] = true;
        BB.ui.render();
        return;
      }
      console.error(e);
      BB.ui.toast("Save failed: " + (e.message || e), "warn");
    }
  }

  // Pull the latest budget.json from disk, discarding our in-memory copy.
  async function reloadFile() {
    const res = await BB.store.loadFile();
    if (!res) return;
    ingest(res);
    BB.ui.render();
  }

  // Build an .xlsx from what's on screen and download it.
  function exportExcel() {
    try {
      const name = BB.excel.downloadExport(S);
      BB.ui.toast(`Exported ${name} — check your Downloads folder.`, "ok");
    } catch (e) {
      console.error(e);
      BB.ui.toast("Export failed: " + (e.message || e), "warn");
    }
  }

  // User resolved a conflict banner: 'pull' = take disk version, 'overwrite' = keep ours.
  async function resolveConflict(fileKey, choice) {
    try {
      if (choice === "overwrite") {
        await save(fileKey, { force: true });
      } else {
        await reloadFile(fileKey);
        BB.ui.toast(`Pulled the latest ${BB.store.FILES[fileKey].name}.`, "ok");
        // if the user still has pending edits elsewhere, autosave resumes normally
      }
    } catch (e) {
      console.error(e);
      BB.ui.toast("Could not resolve: " + (e.message || e), "warn");
    }
  }

  // When returning to the tab (e.g. after editing on another device), see if the
  // files changed underneath us. Clean files pull silently; dirty files raise a conflict.
  let checking = false;
  let unreadableWarned = false;
  async function checkExternalChanges() {
    if (checking || !S.loaded || S.fileMode !== "fs") return;
    checking = true;
    try {
      for (const fileKey of ["data"]) {
        if (S.conflict[fileKey]) continue;
        let changed = false;
        try {
          changed = await BB.store.diskChanged();
        } catch {}
        if (!changed) continue;
        if (S.dirty[fileKey] || pending.has(fileKey)) {
          S.conflict[fileKey] = true; // can't auto-pull — would lose local edits
        } else {
          try {
            await reloadFile(fileKey);
            unreadableWarned = false;
            BB.ui.toast(`Pulled newer ${BB.store.FILES[fileKey].name} from your folder.`, "");
          } catch (e) {
            // e.g. OneDrive is mid-sync and the file is half-written. Keep what we have;
            // the baseline isn't advanced, so this retries on the next check.
            if (!unreadableWarned) {
              unreadableWarned = true;
              BB.ui.toast(`${BB.store.FILES[fileKey].name} changed but can't be read yet — will retry.`, "warn");
            }
          }
        }
      }
      BB.ui.render();
    } finally {
      checking = false;
    }
  }

  async function reload() {
    if (!BB.store.state.dir) {
      BB.ui.toast("Reload only works with a connected folder.", "warn");
      return;
    }
    const dirty = Object.values(S.dirty).some(Boolean);
    if (dirty && !window.confirm("Discard unsaved changes and reload from disk?")) return;
    try {
      ingest(await BB.store.loadAll());
    } catch (e) {
      BB.ui.toast("Could not reload: " + (e.message || e), "warn");
      return;
    }
    BB.ui.render();
    BB.ui.toast("Reloaded from disk.", "");
  }

  function boot() {
    $("connectBtn").addEventListener("click", connect);
    $("reloadBtn").addEventListener("click", reload);
    $("fallbackInput").addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length) loadFallback(e.target.files);
    });
    $("autoChk").addEventListener("change", (e) => setAutosave(e.target.checked));
    $("maskBtn").addEventListener("click", () => setMasked(!S.masked));
    $("exportBtn").addEventListener("click", exportExcel);

    // sidebar collapse (desktop) — persisted
    const app = $("app");
    try {
      if (localStorage.getItem("bb.navCollapsed") === "1") app.classList.add("nav-collapsed");
    } catch {}
    $("collapseBtn").addEventListener("click", () => {
      const collapsed = app.classList.toggle("nav-collapsed");
      try {
        localStorage.setItem("bb.navCollapsed", collapsed ? "1" : "0");
      } catch {}
    });
    // mobile drawer toggle
    $("navToggle").addEventListener("click", () => app.classList.toggle("nav-open"));
    if (!BB.store.supportsFS) {
      $("connectBtn").textContent = "Open budget file";
      document.body.classList.add("no-fs");
    }

    // detect files changed by another device / Excel when we come back to the tab
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkExternalChanges();
    });
    window.addEventListener("focus", checkExternalChanges);
    setInterval(checkExternalChanges, 20000); // also poll while the tab stays open

    BB.ui.render();
    attemptRestore();
  }

  BB.app = {
    setTab, connect, loadFallback, commitRow, commitRows, deleteRow, save, reload,
    setAutosave, setMasked, autosaveOn, canAutosave,
    attachReceipts, unlinkReceipt, openReceiptByName, setExpenseStatus, settleMonth, markMonthPaid,
    resolveConflict, reloadFile, exportExcel, checkExternalChanges, fileMode: () => S.fileMode,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
