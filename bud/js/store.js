/* store.js — budget.json is the single source of truth.
   File System Access (in-place read/write in your OneDrive folder), backups, change
   detection, and receipt files. Exposed on window.BB.store */
(function () {
  "use strict";
  const model = window.BB.model;
  const schemas = model.schemas;

  const DATA_FILE = "budget.json";
  const FORMAT_VERSION = 1;
  // the old spreadsheets — read once to migrate, never written
  const LEGACY = { apartment: "Apartment Breakdown.xlsx", expenses: "Expenses.xlsx" };
  const FILES = { data: { name: DATA_FILE } };
  // schema name → key inside budget.json
  const JSON_KEYS = { apartment: "apartment", requests: "requests", subscriptions: "subscriptions", thirdparty: "expenses" };

  const supportsFS = typeof window.showDirectoryPicker === "function";

  const state = {
    dir: null, // directory handle
    files: { data: { handle: null, mtime: null, size: null, text: null } },
    legacy: { apartment: null, expenses: null }, // handles to the old .xlsx files, if present
  };

  async function queryPerm(handle, write) {
    try {
      return await handle.queryPermission({ mode: write ? "readwrite" : "read" });
    } catch {
      return "denied";
    }
  }
  async function requestPerm(handle, write) {
    const opts = { mode: write ? "readwrite" : "read" };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  // ---- tiny IndexedDB key/value store, to remember the folder handle ----
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("bb-store", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(key, val) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const t = db.transaction("kv", "readwrite");
        t.objectStore("kv").put(val, key);
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      });
    } catch (e) {
      console.warn("idbSet failed", e);
    }
  }
  async function idbGet(key) {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const t = db.transaction("kv", "readonly");
        const rq = t.objectStore("kv").get(key);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    } catch {
      return null;
    }
  }

  // ---- folder handling ----
  // Look inside a folder we now trust: is there a budget.json? old spreadsheets to migrate?
  async function adoptFolder(dir) {
    state.dir = dir;
    const f = state.files.data;
    f.mtime = f.size = f.text = null;
    const found = { json: false, apartment: false, expenses: false };
    try {
      f.handle = await dir.getFileHandle(DATA_FILE, { create: false });
      found.json = true;
    } catch {
      f.handle = null;
    }
    for (const key of Object.keys(LEGACY)) {
      try {
        state.legacy[key] = await dir.getFileHandle(LEGACY[key], { create: false });
        found[key] = true;
      } catch {
        state.legacy[key] = null;
      }
    }
    return found;
  }

  async function openFolder() {
    if (!supportsFS) throw new Error("no-fs");
    const dir = await window.showDirectoryPicker({ id: "budget-folder", mode: "readwrite" });
    if (!(await requestPerm(dir, true))) throw new Error("permission-denied");
    const found = await adoptFolder(dir);
    await idbSet("dir", dir);
    return found;
  }

  async function getStoredFolder() {
    if (!supportsFS) return null;
    return (await idbGet("dir")) || null;
  }

  // adopt a remembered handle; `interactive` allows a permission prompt (needs a user gesture)
  async function adoptStored(dir, interactive) {
    const perm = await queryPerm(dir, true);
    if (perm === "granted") return await adoptFolder(dir);
    if (interactive) {
      if (await requestPerm(dir, true)) return await adoptFolder(dir);
      throw new Error("permission-denied");
    }
    return null; // needs a gesture to re-grant
  }

  // ---------------- budget.json  ⇄  rows ----------------
  const pad = (n) => String(n).padStart(2, "0");
  const dayString = (v) => {
    const d = model.toDay(v);
    return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null;
  };
  const parseDay = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]); // local midnight, no timezone drift
    const d = new Date(s);
    return isNaN(d) ? null : model.toDay(d);
  };

  function serializeRows(schemaName, rows) {
    const cols = schemas[schemaName].columns;
    return rows.map((r) => {
      const o = {};
      for (const c of cols) {
        let v = r[c.key];
        if (v == null || v === "") continue;
        if (c.type === "date") v = dayString(v);
        else if (c.type === "money" || c.type === "number") {
          v = Number(v);
          if (isNaN(v)) continue;
        } else if (c.type === "bool") v = !!v;
        else v = String(v);
        if (v != null) o[c.key] = v;
      }
      return o;
    });
  }

  function deserializeRows(schemaName, arr) {
    const cols = schemas[schemaName].columns;
    return arr
      .filter((raw) => raw && typeof raw === "object")
      .map((raw) => {
        const o = {};
        for (const c of cols) {
          const v = raw[c.key];
          if (v == null || v === "") continue;
          if (c.type === "date") {
            const d = parseDay(v);
            if (d) o[c.key] = d;
          } else if (c.type === "money" || c.type === "number") {
            const n = Number(v);
            if (!isNaN(n)) o[c.key] = n;
          } else if (c.type === "bool") o[c.key] = v !== false && v !== "false";
          else o[c.key] = String(v);
        }
        return o;
      });
  }

  function emptyRows() {
    return { apartment: [], requests: [], subscriptions: [], thirdparty: [] };
  }

  function buildData(S) {
    const data = { app: "budget", version: FORMAT_VERSION, savedAt: new Date().toISOString() };
    data.migrations = { ...(S.migrations || {}) }; // one-time data fixes already applied
    for (const [name, key] of Object.entries(JSON_KEYS)) data[key] = serializeRows(name, (S.rows && S.rows[name]) || []);
    data.links = (S.links || []).map((l) => ({ ...l }));
    return data;
  }

  // readable, diff-friendly JSON: one row per line
  function stringify(data) {
    const parts = [];
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) {
        parts.push(
          v.length
            ? `  ${JSON.stringify(k)}: [\n${v.map((r) => "    " + JSON.stringify(r)).join(",\n")}\n  ]`
            : `  ${JSON.stringify(k)}: []`
        );
      } else {
        parts.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
      }
    }
    return "{\n" + parts.join(",\n") + "\n}\n";
  }

  function parseData(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new Error(`${DATA_FILE} isn't valid JSON — nothing was changed.`);
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error(`${DATA_FILE} isn't a budget file — nothing was changed.`);
    }
    if (obj.version && obj.version > FORMAT_VERSION) {
      throw new Error(`${DATA_FILE} was saved by a newer version of this app — refresh and try again.`);
    }
    const rowsBySchema = emptyRows();
    for (const [name, key] of Object.entries(JSON_KEYS)) {
      rowsBySchema[name] = deserializeRows(name, Array.isArray(obj[key]) ? obj[key] : []);
    }
    const links = Array.isArray(obj.links) ? obj.links.filter((l) => l && typeof l === "object").map((l) => ({ ...l })) : [];
    const migrations = obj.migrations && typeof obj.migrations === "object" && !Array.isArray(obj.migrations) ? { ...obj.migrations } : {};
    return { rowsBySchema, links, migrations };
  }

  // ---------------- load ----------------
  async function readJson() {
    const f = state.files.data;
    const file = await f.handle.getFile();
    const text = await file.text();
    const parsed = parseData(text); // throws before we touch any baseline
    f.mtime = file.lastModified;
    f.size = file.size;
    f.text = text;
    return parsed;
  }

  // source: 'json' (normal), 'xlsx' (first run — migrated from the old spreadsheets), 'new' (nothing there)
  async function loadAll() {
    const f = state.files.data;
    if (f.handle) return { ...(await readJson()), source: "json" };

    const files = {};
    for (const key of Object.keys(LEGACY)) {
      if (state.legacy[key]) files[key] = await state.legacy[key].getFile();
    }
    if (Object.keys(files).length) {
      const imp = await BB.excel.importFiles(files);
      return { ...imp, source: "xlsx", imported: Object.keys(files).map((k) => LEGACY[k]) };
    }
    return { rowsBySchema: emptyRows(), links: [], source: "new" };
  }

  // pull the latest budget.json again (used when it changed elsewhere)
  async function loadFile() {
    if (!state.files.data.handle) return null;
    return await readJson();
  }

  async function diskChanged() {
    const f = state.files.data;
    if (!f.handle || f.mtime == null) return false;
    try {
      const file = await f.handle.getFile();
      return Math.abs(file.lastModified - f.mtime) > 1500 || file.size !== f.size;
    } catch {
      return false;
    }
  }

  // Fallback path (browsers without in-place file access): pick budget.json, or the old .xlsx files
  async function loadFromFiles(fileList) {
    const list = Array.from(fileList);
    const json = list.find((f) => f.name.toLowerCase() === DATA_FILE);
    state.files.data.handle = null;
    if (json) {
      const text = await json.text();
      return { ...parseData(text), source: "json" };
    }
    const files = {};
    for (const file of list) {
      for (const key of Object.keys(LEGACY)) {
        if (file.name.toLowerCase() === LEGACY[key].toLowerCase()) files[key] = file;
      }
    }
    if (!Object.keys(files).length) throw new Error(`Choose ${DATA_FILE} (or your two .xlsx files to import).`);
    const imp = await BB.excel.importFiles(files);
    return { ...imp, source: "xlsx", imported: Object.keys(files).map((k) => LEGACY[k]) };
  }

  // ---------------- backup + save ----------------
  // Throttled: one backup when editing begins, then at most once per interval,
  // so frequent autosaves don't flood the backups folder.
  const BACKUP_MIN_INTERVAL_MS = 10 * 60 * 1000;
  let lastBackupAt = 0;
  async function backup() {
    const f = state.files.data;
    if (!state.dir || f.text == null) return null;
    if (lastBackupAt && Date.now() - lastBackupAt < BACKUP_MIN_INTERVAL_MS) return null;
    try {
      const dir = await state.dir.getDirectoryHandle("backups", { create: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = `budget ${stamp}.json`;
      const h = await dir.getFileHandle(name, { create: true });
      const w = await h.createWritable();
      await w.write(f.text);
      await w.close();
      lastBackupAt = Date.now();
      await pruneBackups(dir, 20);
      return name;
    } catch (e) {
      console.warn("backup failed", e);
      return null;
    }
  }

  async function pruneBackups(dir, keep) {
    const names = [];
    for await (const [n, h] of dir.entries()) {
      if (h.kind === "file" && /^budget .*\.json$/.test(n)) names.push(n);
    }
    names.sort();
    while (names.length > keep) {
      const victim = names.shift();
      try {
        await dir.removeEntry(victim);
      } catch {}
    }
  }

  function conflictError() {
    const e = new Error("File changed on disk");
    e.code = "CONFLICT";
    e.fileKey = "data";
    return e;
  }

  // S = { rows, links }. opts.force bypasses the "changed on disk" guard (user chose to overwrite).
  async function saveFile(_fileKey, S, opts) {
    const f = state.files.data;
    const force = !!(opts && opts.force);

    // Guard: refuse to overwrite a file that changed on disk since we loaded it.
    if (f.handle && !force && (await diskChanged())) throw conflictError();

    // First save into a folder with no budget.json yet — but if one appeared meanwhile
    // (another device), don't clobber it.
    if (!f.handle && state.dir) {
      let existing = null;
      try {
        existing = await state.dir.getFileHandle(DATA_FILE, { create: false });
      } catch {}
      if (existing && !force) throw conflictError();
      f.handle = await state.dir.getFileHandle(DATA_FILE, { create: true });
    }

    const text = stringify(buildData(S));

    if (f.handle) {
      const backupName = await backup();
      const w = await f.handle.createWritable();
      await w.write(text);
      await w.close();
      f.text = text;
      // refresh baseline so our own write isn't seen as an external change
      try {
        const nf = await f.handle.getFile();
        f.mtime = nf.lastModified;
        f.size = nf.size;
      } catch {}
      return { mode: "saved", file: DATA_FILE, backup: backupName };
    }

    // fallback: download
    download(DATA_FILE, text);
    f.text = text;
    return { mode: "download", file: DATA_FILE };
  }

  function download(name, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // everything lives in one file
  const fileForSchema = () => "data";

  // ---- receipts: files saved into a Receipts/ subfolder of the budget folder ----
  async function receiptsDir(create) {
    if (!state.dir) return null;
    try {
      return await state.dir.getDirectoryHandle("Receipts", { create: !!create });
    } catch {
      return null;
    }
  }
  async function listReceipts() {
    const d = await receiptsDir(false);
    if (!d) return [];
    const out = [];
    try {
      for await (const [name, h] of d.entries()) {
        if (h.kind === "file") {
          let size = 0;
          try {
            size = (await h.getFile()).size;
          } catch {}
          out.push({ name, handle: h, size });
        }
      }
    } catch {}
    out.sort((a, b) => (a.name < b.name ? 1 : -1)); // newest-named first
    return out;
  }
  async function saveReceipt(file, name) {
    const d = await receiptsDir(true);
    if (!d) throw new Error("No folder connected");
    const h = await d.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(file);
    await w.close();
    return name;
  }
  async function receiptURL(handle) {
    const f = await handle.getFile();
    return URL.createObjectURL(f);
  }
  // look a receipt up by filename; null if it isn't in Receipts/ (moved or deleted)
  async function receiptHandle(name) {
    const d = await receiptsDir(false);
    if (!d) return null;
    try {
      return await d.getFileHandle(name);
    } catch {
      return null;
    }
  }
  const canReceipts = () => !!state.dir;

  window.BB.store = {
    supportsFS,
    state,
    DATA_FILE,
    FILES,
    openFolder,
    getStoredFolder,
    adoptStored,
    loadAll,
    loadFile,
    diskChanged,
    loadFromFiles,
    saveFile,
    fileForSchema,
    listReceipts,
    saveReceipt,
    receiptURL,
    receiptHandle,
    canReceipts,
    // exposed for tests / tooling
    _serialize: (S) => stringify(buildData(S)),
    _parse: parseData,
  };
})();
