import { parseCSV, serializeCSV } from './csv.js';

const DB_NAME = 'rdx1';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'csvHandle';
const LS_KEY = 'rdx1_data';

let fileHandle = null;
let saveTimer = null;
let lastSaved = null;
let saveStatus = null; // DOM element ref, set by app.js

export function setSaveStatusEl(el) { saveStatus = el; }

// ── IndexedDB ─────────────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function saveHandle(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function loadHandle() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(HANDLE_KEY);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror = e => reject(e.target.error);
  });
}

async function clearHandle() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

// ── File System Access API support ───────────────────────────────────────────

export const hasFSA = 'showOpenFilePicker' in window;

// ── Init / load ───────────────────────────────────────────────────────────────

export async function initStorage() {
  if (!hasFSA) {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? parseCSV(raw) : null;
  }

  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  const handle = await withTimeout(loadHandle(), 3000).catch(() => null);
  if (handle) {
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        return parseCSV(text);
      }
    } catch {
      // handle is stale or denied
    }
  }
  return null; // caller should prompt user to pick/create file
}

export async function pickOrCreateFile() {
  if (!hasFSA) return null;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
      multiple: false,
    });
    fileHandle = handle;
    await saveHandle(handle);
    const file = await handle.getFile();
    const text = await file.text();
    return parseCSV(text);
  } catch {
    return null;
  }
}

export async function createNewFile() {
  if (!hasFSA) return null;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'rdx1-contacts.csv',
      types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
    });
    fileHandle = handle;
    await saveHandle(handle);
    // Write empty CSV header
    const writable = await handle.createWritable();
    await writable.write('id,name,tier,tags,cadence_days,last_contact,next_due,phone,email,interests,important_dates,log\n');
    await writable.close();
    return [];
  } catch {
    return null;
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

export function scheduleSave(people) {
  clearTimeout(saveTimer);
  setSaveStatusText('Saving…', true);
  saveTimer = setTimeout(() => flushSave(people), 500);
}

async function flushSave(people) {
  const csv = serializeCSV(people);
  localStorage.setItem(LS_KEY, csv);
  if (!hasFSA || !fileHandle) return;
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(csv);
    await writable.close();
    lastSaved = new Date();
    setSaveStatusText('Saved', false);
    startSavedAgo();
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'NotFoundError') {
      fileHandle = null;
      await clearHandle();
      setSaveStatusText('File disconnected', false);
      document.dispatchEvent(new CustomEvent('rdx1:file-disconnected'));
    }
  }
}

let savedAgoTimer = null;
function startSavedAgo() {
  clearInterval(savedAgoTimer);
  savedAgoTimer = setInterval(() => {
    if (!lastSaved) return;
    const sec = Math.round((Date.now() - lastSaved) / 1000);
    setSaveStatusText(`Saved · ${sec}s ago`, false);
  }, 1000);
}

function setSaveStatusText(text, pulsing) {
  if (!saveStatus) return;
  saveStatus.textContent = text;
  saveStatus.classList.toggle('save-status--saving', pulsing);
}

// ── Fallback import/export ────────────────────────────────────────────────────

export function importCSVFile(onLoad) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const people = parseCSV(text);
    localStorage.setItem(LS_KEY, text);
    onLoad(people);
  };
  input.click();
}

export function exportCSVFile(people) {
  const csv = serializeCSV(people);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rdx1-contacts.csv';
  a.click();
  URL.revokeObjectURL(url);
}
