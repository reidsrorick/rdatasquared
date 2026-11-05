import { getState } from '../store.js';

export function sortedTags(s = getState()) {
  return [...s.tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function excludedTagIds(s = getState()) {
  return new Set(s.tags.filter((t) => t.excludeFromBudget).map((t) => t.id));
}

export function tagMap(s = getState()) {
  return new Map(s.tags.map((t) => [t.id, t]));
}

export function txnCountsByTag(s = getState()) {
  const m = new Map();
  for (const t of s.transactions) {
    for (const id of t.tagIds || []) m.set(id, (m.get(id) || 0) + 1);
  }
  return m;
}
