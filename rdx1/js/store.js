// ===== Persistent store (localStorage) =====
import { uid, todayISO } from './util.js';

const KEY = 'rdx1.data.v1';
export const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | light | dark
  backupReminderDays: 30,   // 0 = off
  lastExportAt: null,       // ISO datetime
  backupDismissedAt: null,  // ISO datetime
};

function blankData() {
  return {
    app: 'RDX1',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: null,
    settings: { ...DEFAULT_SETTINGS },
    contacts: [],
  };
}

let data = load();
const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(data); }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankData();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.error('Failed to load data, starting fresh', e);
    return blankData();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Save failed', e);
    alert('Could not save — browser storage may be full or blocked.');
  }
}

// ---- migration / normalization ----
export function migrate(input) {
  const base = blankData();
  if (!input || typeof input !== 'object') return base;
  const out = {
    ...base,
    settings: { ...base.settings, ...(input.settings || {}) },
    contacts: Array.isArray(input.contacts) ? input.contacts.map(normalizeContact) : [],
  };
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

export function normalizeContact(c = {}) {
  const now = new Date().toISOString();
  const arr = v => (Array.isArray(v) ? v : []);
  return {
    id: c.id || uid(),
    firstName: (c.firstName || '').trim(),
    lastName: (c.lastName || '').trim(),
    company: (c.company || '').trim(),
    title: (c.title || '').trim(),
    phones: arr(c.phones).map(p => ({ label: (p.label || 'mobile').trim(), value: (p.value || '').trim() })).filter(p => p.value),
    emails: arr(c.emails).map(p => ({ label: (p.label || 'personal').trim(), value: (p.value || '').trim() })).filter(p => p.value),
    address: (c.address || '').trim(),
    birthday: normalizeBirthday(c.birthday),
    tags: [...new Set(arr(c.tags).map(t => String(t).trim()).filter(Boolean))],
    notes: (c.notes || '').trim(),
    customFields: arr(c.customFields).map(f => ({ label: (f.label || '').trim(), value: (f.value || '').trim() })).filter(f => f.label || f.value),
    favorite: !!c.favorite,
    keepInTouch: {
      enabled: !!(c.keepInTouch && c.keepInTouch.enabled),
      intervalDays: Number(c.keepInTouch && c.keepInTouch.intervalDays) || 90,
    },
    interactions: arr(c.interactions).map(i => ({
      id: i.id || uid(),
      date: i.date || todayISO(),
      type: i.type || 'note',
      note: (i.note || '').trim(),
    })).sort((a, b) => (a.date < b.date ? 1 : -1)),
    followUps: arr(c.followUps).map(f => ({
      id: f.id || uid(),
      date: f.date || todayISO(),
      note: (f.note || '').trim(),
      done: !!f.done,
    })).sort((a, b) => (a.date < b.date ? 1 : -1)),
    createdAt: c.createdAt || now,
    updatedAt: c.updatedAt || now,
  };
}

function normalizeBirthday(b) {
  if (!b) return null;
  const month = Number(b.month), day = Number(b.day);
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(b.year);
  return { month, day, year: year && year > 1900 && year < 2100 ? year : null };
}

// ---- reads ----
export function getData() { return data; }
export function getContacts() { return data.contacts; }
export function getContact(id) { return data.contacts.find(c => c.id === id) || null; }
export function getSettings() { return data.settings; }
export function allTags() {
  const set = new Set();
  for (const c of data.contacts) for (const t of c.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ---- writes ----
export function upsertContact(contact) {
  const c = normalizeContact(contact);
  c.updatedAt = new Date().toISOString();
  const idx = data.contacts.findIndex(x => x.id === c.id);
  if (idx >= 0) data.contacts[idx] = c;
  else { c.createdAt = new Date().toISOString(); data.contacts.push(c); }
  persist(); emit();
  return c;
}

export function deleteContact(id) {
  data.contacts = data.contacts.filter(c => c.id !== id);
  persist(); emit();
}

export function mutateContact(id, fn) {
  const c = getContact(id);
  if (!c) return null;
  fn(c);
  c.updatedAt = new Date().toISOString();
  data.contacts = [...data.contacts];
  persist(); emit();
  return c;
}

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  persist(); emit();
}

export function replaceAll(newData) {
  data = migrate(newData);
  persist(); emit();
}

export function mergeContacts(incoming) {
  const list = Array.isArray(incoming.contacts) ? incoming.contacts.map(normalizeContact) : [];
  let added = 0, updated = 0;
  for (const inc of list) {
    const idx = data.contacts.findIndex(c => c.id === inc.id);
    if (idx >= 0) { data.contacts[idx] = inc; updated++; }
    else { data.contacts.push(inc); added++; }
  }
  if (incoming.settings) data.settings = { ...data.settings, ...incoming.settings };
  persist(); emit();
  return { added, updated };
}

export function wipeAll() {
  data = blankData();
  persist(); emit();
}

export function markExported() {
  data.settings.lastExportAt = new Date().toISOString();
  data.settings.backupDismissedAt = null;
  persist(); emit();
}
