// Manual backup: the whole dataset out to a JSON file, and back in with a
// full replace. This is the only cross-device path — there is no merge.

import * as store from './store.js';
import { looksLikeBackup } from './seed.js';
import { todayISO } from './format.js';

const NUDGE_AFTER_DAYS = 7;

export function exportBackup() {
  const state = store.getState();
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${todayISO()} RBS_Export.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  store.commit((s) => { s.meta.lastExport = todayISO(); });
}

export async function importBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }
  if (!looksLikeBackup(data)) {
    throw new Error('That does not look like an RBS Budget backup.');
  }
  await store.replaceAll(data);
}

export function backupIsStale() {
  const last = store.getState()?.meta?.lastExport;
  if (!last) return true;
  const days = (Date.now() - new Date(last + 'T00:00:00').getTime()) / 86400000;
  return days >= NUDGE_AFTER_DAYS;
}
