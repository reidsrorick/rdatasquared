import { getState } from '../store.js';
import { round2 } from '../format.js';
import { countsForTotals, isSupersededManual } from './transactions.js';
import { excludedTagIds } from './tags.js';
import { catColor } from './categories.js';
import { lastDay } from './budget.js';

function bounds(year, month) {
  return [
    `${year}-${String(month).padStart(2, '0')}-01`,
    `${year}-${String(month).padStart(2, '0')}-${String(lastDay(year, month)).padStart(2, '0')}`,
  ];
}

// This-month KPIs (mirrors reports.py dashboard_data).
export function monthKpis(year, month, { includeWork = false } = {}, s = getState()) {
  const [start, end] = bounds(year, month);
  const excluded = excludedTagIds(s);
  let spending = 0, income = 0, transfers = 0;
  for (const t of s.transactions) {
    if (t.date < start || t.date > end) continue;
    if (t.isTransfer) { transfers += 1; continue; }
    if (!countsForTotals(t, { includeExcludedTags: includeWork, excluded })) continue;
    if (t.amount < 0) spending += Math.abs(t.amount);
    else income += t.amount;
  }
  spending = round2(spending);
  income = round2(income);
  return { spending, income, net: round2(income - spending), transfers };
}

// Recent transactions for a month, newest first (drives the dashboard list).
export function monthTransactions(year, month, { includeWork = false, limit = 50 } = {}, s = getState()) {
  const [start, end] = bounds(year, month);
  const excluded = excludedTagIds(s);
  return s.transactions
    .filter((t) => t.date >= start && t.date <= end && !t.isTransfer
      && countsForTotals(t, { includeExcludedTags: includeWork, excluded }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .slice(0, limit);
}

// Spending grouped by category for a month (mirrors /api/reports/spending-by-category).
export function spendingByCategory(year, month, { includeWork = false } = {}, s = getState()) {
  const [start, end] = bounds(year, month);
  const excluded = excludedTagIds(s);
  const catById = new Map(s.categories.map((c) => [c.id, c]));
  const totals = new Map();
  let uncategorized = 0;
  for (const t of s.transactions) {
    if (!(t.amount < 0)) continue;
    if (t.date < start || t.date > end) continue;
    if (t.isTransfer || isSupersededManual(t)) continue;
    if ((t.tagIds || []).some((id) => excluded.has(id)) && !includeWork) continue;
    if (t.categoryId == null) { uncategorized += Math.abs(t.amount); continue; }
    const cat = catById.get(t.categoryId);
    if (!cat || cat.excludeFromBudget) continue;
    totals.set(cat.id, (totals.get(cat.id) || 0) + Math.abs(t.amount));
  }
  const rows = [...totals.entries()]
    .map(([id, amt]) => ({ name: catById.get(id).name, color: catColor(catById.get(id), s), amount: round2(amt) }))
    .sort((a, b) => b.amount - a.amount);
  if (uncategorized > 0) rows.push({ name: 'Uncategorized', color: '#94a3b8', amount: round2(uncategorized) });
  return rows;
}

// Monthly spending series between two "YYYY-MM" (mirrors /api/reports/monthly-spending).
export function monthlySpending(startYM, endYM, { includeWork = false } = {}, s = getState()) {
  let [sy, sm] = startYM.split('-').map(Number);
  let [ey, em] = endYM.split('-').map(Number);
  if (sy * 12 + sm > ey * 12 + em) { [sy, sm, ey, em] = [ey, em, sy, sm]; }

  const excluded = excludedTagIds(s);
  const out = [];
  let y = sy, m = sm;
  for (let guard = 0; guard < 120; guard++) {
    const [start, end] = bounds(y, m);
    let total = 0;
    for (const t of s.transactions) {
      if (!(t.amount < 0)) continue;
      if (t.date < start || t.date > end) continue;
      if (t.isTransfer || isSupersededManual(t)) continue;
      if ((t.tagIds || []).some((id) => excluded.has(id)) && !includeWork) continue;
      total += Math.abs(t.amount);
    }
    out.push({
      month: `${y}-${String(m).padStart(2, '0')}`,
      label: new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      amount: round2(total),
    });
    if (y === ey && m === em) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
