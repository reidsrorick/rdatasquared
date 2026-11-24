/* store.js — budget.xlsx is the saved file: an ordinary Excel workbook in your folder.
   File System Access (in-place read/write in your OneDrive folder), backups, change
   detection, and receipt files. Exposed on window.BB.store */
(function () {
  "use strict";
  const model = window.BB.model;
  const schemas = model.schemas;

  const DATA_FILE = "budget.xlsx";
  // earlier formats — read once to migrate, never written
  const LEGACY_JSON = "budget.json";
  const LEGACY = { apartment: "Apartment Breakdown.xlsx", expenses: "Expenses.xlsx" };
  const FILES = { data: { name: DATA_FILE } };
  // schema name → key inside the old budget.json
  const JSON_KEYS = { apartment: "apartment", requests: "requests", subscriptions: "subscriptions", thirdparty: "expenses" };

  const supportsFS = typeof window.showDirectoryPicker === "function";

  const state = {
    dir: null, // directory handle
    files: { data: { handle: null, mtime: null, size: null, bytes: null } },
    legacyJson: null, // handle to an old budget.json, if present
    legacy: { apartment: null, expenses: null }, // handles to the two original .xlsx files, if present
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
  // Look inside a folder we now trust: is there a budget.xlsx? an older budget.json or the two
  // original spreadsheets to migrate?
  async function adoptFolder(dir) {
    state.dir = dir;
    const f = state.files.data;
    f.mtime = f.size = f.bytes = null;
    const found = { data: false, json: false, apartment: false, expenses: false };
    try {
      f.handle = await dir.getFileHandle(DATA_FILE, { create: false });
      found.data = true;
    } catch {
      f.handle = null;
    }
    try {
      state.legacyJson = await dir.getFileHandle(LEGACY_JSON, { create: false });
      found.json = true;
    } catch {
      state.legacyJson = null;
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

  // ---------------- the older budget.json (read only, to migrate) ----------------
  const pad = (n) => String(n).padStart(2, "0");
  const parseDay = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]); // local midnight, no timezone drift
    const d = new Date(s);
    return isNaN(d) ? null : model.toDay(d);
  };

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
    return { apartment: [], requests: [], subscriptions: [], thirdparty: [], people: [] };
  }

  function parseJson(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new Error(`${LEGACY_JSON} isn't valid JSON — nothing was changed.`);
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error(`${LEGACY_JSON} isn't a budget file — nothing was changed.`);
    }
    const rowsBySchema = emptyRows();
    for (const [name, key] of Object.entries(JSON_KEYS)) {
      rowsBySchema[name] = deserializeRows(name, Array.isArray(obj[key]) ? obj[key] : []);
    }
    const links = Array.isArray(obj.links) ? obj.links.filter((l) => l && typeof l === "object").map((l) => ({ ...l })) : [];
    const migrations = obj.migrations && typeof obj.migrations === "object" && !Array.isArray(obj.migrations) ? { ...obj.migrations } : {};
    const groups = Array.isArray(obj.groups) ? obj.groups.map((g) => String(g).trim()).filter(Boolean) : [];
    return { rowsBySchema, links, migrations, groups, settings: null };
  }

  // ---------------- load ----------------
  async function readData() {
    const f = state.files.data;
    const file = await f.handle.getFile();
    const buf = await file.arrayBuffer();
    const parsed = BB.excel.readWorkbook(buf); // throws before we touch any baseline
    f.mtime = file.lastModified;
    f.size = file.size;
    f.bytes = new Uint8Array(buf);
    return parsed;
  }

  // source: 'xlsx' (normal), 'json' (first run — migrated from budget.json), 'legacy' (first run —
  // migrated from the two original spreadsheets), 'new' (nothing there: show the setup screen)
  async function loadAll() {
    const f = state.files.data;
    if (f.handle) return { ...(await readData()), source: "xlsx" };

    if (state.legacyJson) {
      const text = await (await state.legacyJson.getFile()).text();
      return { ...parseJson(text), source: "json", imported: [LEGACY_JSON] };
    }
    const files = {};
    for (const key of Object.keys(LEGACY)) {
      if (state.legacy[key]) files[key] = await state.legacy[key].getFile();
    }
    if (Object.keys(files).length) {
      const imp = await BB.excel.importFiles(files);
      return { ...imp, groups: [], migrations: {}, settings: null, source: "legacy", imported: Object.keys(files).map((k) => LEGACY[k]) };
    }
    return { rowsBySchema: emptyRows(), links: [], groups: [], migrations: {}, settings: null, source: "new" };
  }

  // pull the latest budget.xlsx again (used when it changed elsewhere)
  async function loadFile() {
    if (!state.files.data.handle) return null;
    return await readData();
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

  // Fallback path (browsers without in-place file access): pick budget.xlsx, an older
  // budget.json, or the two original spreadsheets
  async function loadFromFiles(fileList) {
    const list = Array.from(fileList);
    const byName = (n) => list.find((f) => f.name.toLowerCase() === n.toLowerCase());
    state.files.data.handle = null;
    const xl = byName(DATA_FILE);
    if (xl) return { ...BB.excel.readWorkbook(await xl.arrayBuffer()), source: "xlsx" };
    const json = byName(LEGACY_JSON);
    if (json) return { ...parseJson(await json.text()), source: "json", imported: [LEGACY_JSON] };
    const files = {};
    for (const key of Object.keys(LEGACY)) {
      const f = byName(LEGACY[key]);
      if (f) files[key] = f;
    }
    if (!Object.keys(files).length) throw new Error(`Choose ${DATA_FILE} (or your older budget.json / two .xlsx files to import).`);
    const imp = await BB.excel.importFiles(files);
    return { ...imp, groups: [], migrations: {}, settings: null, source: "legacy", imported: Object.keys(files).map((k) => LEGACY[k]) };
  }

  // ---------------- backup + save ----------------
  // Throttled: one backup when editing begins, then at most once per interval,
  // so frequent autosaves don't flood the backups folder.
  const BACKUP_MIN_INTERVAL_MS = 10 * 60 * 1000;
  let lastBackupAt = 0;
  async function backup() {
    const f = state.files.data;
    if (!state.dir || !f.bytes) return null;
    if (lastBackupAt && Date.now() - lastBackupAt < BACKUP_MIN_INTERVAL_MS) return null;
    try {
      const dir = await state.dir.getDirectoryHandle("backups", { create: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = `budget ${stamp}.xlsx`;
      const h = await dir.getFileHandle(name, { create: true });
      const w = await h.createWritable();
      await w.write(f.bytes);
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
      if (h.kind === "file" && /^budget .*\.xlsx$/.test(n)) names.push(n);
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

  // S = { rows, links, groups, settings, migrations }. opts.force bypasses the "changed on disk"
  // guard (user chose to overwrite).
  async function saveFile(_fileKey, S, opts) {
    const f = state.files.data;
    const force = !!(opts && opts.force);

    // Guard: refuse to overwrite a file that changed on disk since we loaded it.
    if (f.handle && !force && (await diskChanged())) throw conflictError();

    // First save into a folder with no budget.xlsx yet — but if one appeared meanwhile
    // (another device), don't clobber it.
    if (!f.handle && state.dir) {
      let existing = null;
      try {
        existing = await state.dir.getFileHandle(DATA_FILE, { create: false });
      } catch {}
      if (existing && !force) throw conflictError();
      f.handle = await state.dir.getFileHandle(DATA_FILE, { create: true });
    }

    const bytes = new Uint8Array(BB.excel.writeWorkbook(S));

    if (f.handle) {
      const backupName = await backup();
      try {
        const w = await f.handle.createWritable();
        await w.write(bytes);
        await w.close();
      } catch (e) {
        // Excel (or OneDrive mid-sync) holds the file open
        const err = new Error(`Couldn't write ${DATA_FILE} — if it's open in Excel, close it and try again.`);
        err.code = "LOCKED";
        err.cause = e;
        throw err;
      }
      f.bytes = bytes;
      // refresh baseline so our own write isn't seen as an external change
      try {
        const nf = await f.handle.getFile();
        f.mtime = nf.lastModified;
        f.size = nf.size;
      } catch {}
      return { mode: "saved", file: DATA_FILE, backup: backupName };
    }

    // fallback: download
    BB.excel.saveBlob(bytes, DATA_FILE);
    f.bytes = bytes;
    return { mode: "download", file: DATA_FILE };
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
    _parseJson: parseJson,
  };
})();
