import * as store from '../store.js';
import { getState } from '../store.js';
import { round2 } from '../format.js';
import { groupedCategories } from './categories.js';
import { countsForTotals } from './transactions.js';
import { excludedTagIds } from './tags.js';

export function lastDay(year, month) {
  return new Date(year, month, 0).getDate();
}
function monthStart(y, m) { return `${y}-${String(m).padStart(2, '0')}-01`; }
function monthEnd(y, m) { return `${y}-${String(m).padStart(2, '0')}-${String(lastDay(y, m)).padStart(2, '0')}`; }

// Yearly categories only show in their due month; everything else every month.
export function visibleInMonth(cat, month) {
  if (cat.recurrence === 'yearly' && cat.dueDate) {
    return Number(cat.dueDate.slice(5, 7)) === month;
  }
  return true;
}

// categoryId -> abs(sum of expense) for the month. null key = uncategorized.
export function monthActual(year, month, { includeWork = false } = {}, s = getState()) {
  const start = monthStart(year, month), end = monthEnd(year, month);
  const excluded = excludedTagIds(s);
  const m = new Map();
  for (const t of s.transactions) {
    if (!(t.amount < 0)) continue;
    if (t.date < start || t.date > end) continue;
    if (!countsForTotals(t, { includeExcludedTags: includeWork, excluded })) continue;
    const k = t.categoryId ?? null;
    m.set(k, round2((m.get(k) || 0) + Math.abs(t.amount)));
  }
  return m;
}

export function plansFor(year, month, s = getState()) {
  return s.spendingPlans.filter((p) => p.year === year && p.month === month);
}

// The full budget page model for a month.
export function budgetView(year, month, { includeWork = false } = {}, s = getState()) {
  const { groups, ungrouped } = groupedCategories(s);
  const budgetable = (c) => !c.isIncome && !c.excludeFromBudget && visibleInMonth(c, month);

  const expenseGroups = groups
    .map((g) => ({ group: g, categories: g.categories.filter(budgetable) }))
    .filter((row) => row.categories.length);
  const ungroupedExpense = ungrouped.filter(budgetable);

  const actual = monthActual(year, month, { includeWork }, s);
  const planned = new Map(plansFor(year, month, s).map((p) => [p.categoryId, p.amount]));

  const visibleIds = new Set();
  for (const row of expenseGroups) for (const c of row.categories) visibleIds.add(c.id);
  for (const c of ungroupedExpense) visibleIds.add(c.id);

  const uncategorizedActual = actual.get(null) || 0;
  let totalPlanned = 0, totalSpent = uncategorizedActual;
  for (const id of visibleIds) {
    totalPlanned += planned.get(id) || 0;
    totalSpent += actual.get(id) || 0;
  }

  return {
    expenseGroups, ungroupedExpense, planned, actual,
    uncategorizedActual,
    totalPlanned: round2(totalPlanned),
    totalSpent: round2(totalSpent),
  };
}

// Dashboard "This Month's Budget" widget: groups with nested categories,
// only rows that have a plan or spending (mirrors /api/budget/by-group).
export function budgetByGroup(year, month, { includeWork = false } = {}, s = getState()) {
  const { groups, ungrouped } = groupedCategories(s);
  const actual = monthActual(year, month, { includeWork }, s);
  const planned = new Map(plansFor(year, month, s).map((p) => [p.categoryId, p.amount]));
  const budgetable = (c) => !c.isIncome && !c.excludeFromBudget && visibleInMonth(c, month);

  const entry = (c) => ({
    name: c.name,
    color: c.groupId != null
      ? (s.categoryGroups.find((g) => g.id === c.groupId)?.color || c.color || '#94a3b8')
      : (c.color || '#94a3b8'),
    planned: planned.get(c.id) || 0,
    spent: actual.get(c.id) || 0,
  });
  const build = (cats) => cats.filter(budgetable).map(entry).filter((e) => e.planned || e.spent);

  const result = [];
  for (const g of groups) {
    const kids = build(g.categories);
    if (!kids.length) continue;
    result.push({
      name: g.name, color: g.color,
      planned: round2(kids.reduce((x, e) => x + e.planned, 0)),
      spent: round2(kids.reduce((x, e) => x + e.spent, 0)),
      categories: kids.sort((a, b) => b.spent - a.spent),
    });
  }
  const ung = build(ungrouped);
  if (ung.length) {
    result.push({
      name: 'Ungrouped', color: '#94a3b8',
      planned: round2(ung.reduce((x, e) => x + e.planned, 0)),
      spent: round2(ung.reduce((x, e) => x + e.spent, 0)),
      categories: ung.sort((a, b) => b.spent - a.spent),
    });
  }
  return {
    groups: result,
    totalPlanned: round2(result.reduce((x, g) => x + g.planned, 0)),
    totalSpent: round2(result.reduce((x, g) => x + g.spent, 0)),
  };
}

// Auto-fill a fresh current/future month from each category's defaultBudget
// (mirrors budget.py index()). No-op if plans already exist or month is in the past.
export async function ensureAutoPopulated(year, month, { includeWork = false } = {}) {
  const s = getState();
  if (plansFor(year, month, s).length) return false;
  const now = new Date();
  if (year * 12 + month < now.getFullYear() * 12 + (now.getMonth() + 1)) return false;

  const { expenseGroups, ungroupedExpense } = budgetView(year, month, { includeWork }, s);
  const cats = [...expenseGroups.flatMap((r) => r.categories), ...ungroupedExpense]
    .filter((c) => c.defaultBudget && c.defaultBudget > 0);
  if (!cats.length) return false;

  await store.commit((st) => {
    for (const c of cats) {
      st.spendingPlans.push({
        id: store.nextId('spendingPlans'),
        categoryId: c.id, year, month, amount: c.defaultBudget,
      });
    }
  });
  return true;
}

// entries: [{categoryId, amount}]. amount 0 deletes the plan.
export async function savePlan(year, month, entries) {
  await store.commit((st) => {
    for (const { categoryId, amount } of entries) {
      const i = st.spendingPlans.findIndex(
        (p) => p.categoryId === categoryId && p.year === year && p.month === month,
      );
      if (!amount) {
        if (i !== -1) st.spendingPlans.splice(i, 1);
      } else if (i !== -1) {
        st.spendingPlans[i].amount = round2(amount);
      } else {
        st.spendingPlans.push({
          id: store.nextId('spendingPlans'), categoryId, year, month, amount: round2(amount),
        });
      }
    }
  });
}

export async function copyLastMonth(year, month) {
  const [py, pm] = month === 1 ? [year - 1, 12] : [year, month - 1];
  const s = getState();
  const prev = plansFor(py, pm, s);
  if (!prev.length) return { ok: false, message: 'No budget found for the previous month.' };

  const catById = new Map(s.categories.map((c) => [c.id, c]));
  let copied = 0, skipped = 0;
  await store.commit((st) => {
    for (const p of prev) {
      const cat = catById.get(p.categoryId);
      if (cat && !visibleInMonth(cat, month)) { skipped++; continue; }
      const i = st.spendingPlans.findIndex(
        (x) => x.categoryId === p.categoryId && x.year === year && x.month === month,
      );
      if (i !== -1) st.spendingPlans[i].amount = p.amount;
      else st.spendingPlans.push({
        id: store.nextId('spendingPlans'), categoryId: p.categoryId, year, month, amount: p.amount,
      });
      copied++;
    }
  });
  return { ok: true, copied, skipped };
}

// Move budgeted dollars between two categories within a month. Total unchanged.
export async function reallocate(year, month, fromId, toId, amount) {
  amount = round2(amount);
  if (!(amount > 0)) return { ok: false, message: 'Amount must be greater than zero.' };
  if (fromId === toId) return { ok: false, message: 'Choose two different categories.' };

  const s = getState();
  const dest = s.categories.find((c) => c.id === toId);
  if (!dest || dest.isIncome || dest.excludeFromBudget) {
    return { ok: false, message: 'Destination category is not budgetable.' };
  }
  const src = plansFor(year, month, s).find((p) => p.categoryId === fromId);
  if (!src) {
    const name = s.categories.find((c) => c.id === fromId)?.name || 'Source category';
    return { ok: false, message: `${name} has no budget this month to move from.` };
  }
  if (src.amount + 1e-9 < amount) {
    return { ok: false, message: `Cannot move $${amount.toFixed(2)}; only $${src.amount.toFixed(2)} is budgeted there.` };
  }

  await store.commit((st) => {
    const s2 = st.spendingPlans.find((p) => p.categoryId === fromId && p.year === year && p.month === month);
    const newSrc = round2(s2.amount - amount);
    if (newSrc <= 0) st.spendingPlans = st.spendingPlans.filter((p) => p !== s2);
    else s2.amount = newSrc;

    const d = st.spendingPlans.find((p) => p.categoryId === toId && p.year === year && p.month === month);
    if (d) d.amount = round2(d.amount + amount);
    else st.spendingPlans.push({
      id: store.nextId('spendingPlans'), categoryId: toId, year, month, amount,
    });
  });
  return { ok: true };
}
