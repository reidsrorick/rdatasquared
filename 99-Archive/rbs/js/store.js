// The single source of truth. Holds the whole dataset in memory, persists it to
// IndexedDB as one value, and notifies subscribers after every mutation.

import { freshState, migrate, SEQ_KEY } from './seed.js';

const DB_NAME = 'rbs-budget';
const STORE = 'kv';
const KEY = 'state';

let _state = null;
const _subs = new Set();

// ── Minimal IndexedDB wrapper: one object store, one key ──────────────────────

function _open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _idbGet(key) {
  const db = await _open();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

async function _idbSet(key, val) {
  const db = await _open();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function load() {
  let stored = null;
  try {
    stored = await _idbGet(KEY);
  } catch (e) {
    console.error('Could not read local data:', e);
  }

  if (!stored) {
    _state = freshState();
    await persist();
  } else {
    const before = stored.version;
    _state = migrate(stored);
    if (_state.version !== before) await persist();
  }

  // Ask the browser not to evict this data under storage pressure.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  return _state;
}

export function getState() {
  return _state;
}

export async function persist() {
  await _idbSet(KEY, _state);
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export function subscribe(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

function _notify() {
  for (const fn of _subs) fn(_state);
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function nextId(collection) {
  const k = SEQ_KEY[collection] || collection;
  _state.seq[k] = (_state.seq[k] || 0) + 1;
  return _state.seq[k];
}

export async function insert(collection, obj) {
  const row = { ...obj, id: nextId(collection) };
  _state[collection].push(row);
  await persist();
  _notify();
  return row;
}

export async function update(collection, id, patch) {
  const row = _state[collection].find((r) => r.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  await persist();
  _notify();
  return row;
}

export async function remove(collection, id) {
  const i = _state[collection].findIndex((r) => r.id === id);
  if (i === -1) return false;
  _state[collection].splice(i, 1);
  await persist();
  _notify();
  return true;
}

// Escape hatch for multi-step changes: mutate freely inside `fn`, then one save.
export async function commit(fn) {
  fn(_state);
  await persist();
  _notify();
}

// Full replace — used by backup import.
export async function replaceAll(newState) {
  _state = migrate(structuredClone(newState));
  await persist();
  _notify();
  return _state;
}

// Wipe back to a fresh install.
export async function reset() {
  _state = freshState();
  await persist();
  _notify();
  return _state;
}
