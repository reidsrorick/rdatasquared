// ===== JSON import / export =====
import { getData, replaceAll, mergeContacts, markExported, migrate, SCHEMA_VERSION } from './store.js';
import { exportFilename, toast } from './util.js';
import { findDuplicates } from './model.js';

export function exportJSON() {
  const data = structuredClone(getData());
  data.exportedAt = new Date().toISOString();
  data.schemaVersion = SCHEMA_VERSION;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markExported();
  toast('Exported ' + a.download);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(fr.result);
        resolve(parsed);
      } catch (e) {
        reject(new Error('That file is not valid JSON.'));
      }
    };
    fr.onerror = () => reject(new Error('Could not read the file.'));
    fr.readAsText(file);
  });
}

export function validateImport(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Unexpected file format.');
  if (!Array.isArray(parsed.contacts)) throw new Error('No "contacts" list found in this file.');
  const norm = migrate(parsed);
  return {
    normalized: norm,
    count: norm.contacts.length,
    fromApp: parsed.app || 'unknown',
    exportedAt: parsed.exportedAt || null,
    schemaVersion: parsed.schemaVersion ?? null,
  };
}

export function applyReplace(normalized) {
  replaceAll(normalized);
  toast(`Replaced — ${normalized.contacts.length} contacts loaded.`);
}

export function applyMerge(normalized) {
  const { added, updated } = mergeContacts(normalized);
  toast(`Merged — ${added} added, ${updated} updated.`);
  return { added, updated };
}

export { findDuplicates };
