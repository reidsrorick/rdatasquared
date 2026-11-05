import { getState } from '../store.js';

const byOrder = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);

// Groups (ordered) with their categories nested and ordered, plus the ungrouped list.
export function groupedCategories(s = getState()) {
  const groups = [...s.categoryGroups].sort(byOrder).map((g) => ({
    ...g,
    categories: s.categories.filter((c) => c.groupId === g.id).sort(byOrder),
  }));
  const ungrouped = s.categories.filter((c) => c.groupId == null).sort(byOrder);
  return { groups, ungrouped };
}

export function flatCategories(s = getState()) {
  return [...s.categories].sort((a, b) => a.name.localeCompare(b.name));
}

export function categoryMap(s = getState()) {
  return new Map(s.categories.map((c) => [c.id, c]));
}

export function groupMap(s = getState()) {
  return new Map(s.categoryGroups.map((g) => [g.id, g]));
}

export function txnCountsByCategory(s = getState()) {
  const m = new Map();
  for (const t of s.transactions) {
    if (t.categoryId != null) m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
  }
  return m;
}

// Display color: the group's color when grouped, else the category's own.
export function catColor(cat, s = getState()) {
  if (!cat) return '#94a3b8';
  if (cat.groupId != null) {
    const g = s.categoryGroups.find((x) => x.id === cat.groupId);
    if (g && g.color) return g.color;
  }
  return cat.color || '#94a3b8';
}

// Next sort_order for a new category in a group (mirrors categories.py new()).
export function nextCatSortOrder(groupId, s = getState()) {
  const max = s.categories
    .filter((c) => (c.groupId ?? null) === (groupId ?? null))
    .reduce((m, c) => Math.max(m, c.sortOrder || 0), 0);
  return max + 1;
}
