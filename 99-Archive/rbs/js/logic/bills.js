import * as store from '../store.js';
import { getState } from '../store.js';
import { addDays, daysBetween, round2 } from '../format.js';
import { isSupersededManual } from './transactions.js';

// Windows (mirrors reports.py / bills.py).
export const DUE_LOOKBACK_DAYS = 40;
export const DUE_LOOKAHEAD_DAYS = 45;
export const MATCH_BEFORE_DAYS = 10;
export const MATCH_AFTER_DAYS = 20;
const DUE_SOON_DAYS = 7;
const UPCOMING_DAYS = 45;

export const STATUS_ORDER = ['overdue', 'paid', 'due_soon', 'upcoming', 'later'];
export const STATUS_LABELS = {
  overdue: 'Overdue',
  paid: 'Paid · pending confirmation',
  due_soon: 'Due soon',
  upcoming: 'Upcoming',
  later: 'Later',
};

function clampDay(year, month, day) {
  const last = new Date(year, month, 0).getDate();
  const dd = Math.min(day, last);
  return `${year}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// All occurrence dates for a recurring category within [start, end] inclusive.
export function occurrences(cat, startISO, endISO) {
  if (!cat.dueDate || (cat.recurrence !== 'monthly' && cat.recurrence !== 'yearly')) return [];
  const dueMonth = Number(cat.dueDate.slice(5, 7));
  const dueDay = Number(cat.dueDate.slice(8, 10));
  const end = new Date(endISO + 'T00:00:00');
  const out = [];

  if (cat.recurrence === 'monthly') {
    const start = new Date(startISO + 'T00:00:00');
    let y = start.getFullYear();
    let m = start.getMonth() + 1;
    while (new Date(y, m - 1, 1) <= end) {
      const d = clampDay(y, m, dueDay);
      if (d >= startISO && d <= endISO) out.push(d);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  } else {
    const sy = Number(startISO.slice(0, 4));
    const ey = Number(endISO.slice(0, 4));
    for (let y = sy; y <= ey; y++) {
      const d = clampDay(y, dueMonth, dueDay);
      if (d >= startISO && d <= endISO) out.push(d);
    }
  }
  return out;
}

// A category transaction close enough to an occurrence to count as "seen on a statement".
export function isConfirmed(txnDates, occISO) {
  const lo = addDays(occISO, -MATCH_BEFORE_DAYS);
  const hi = addDays(occISO, MATCH_AFTER_DAYS);
  return txnDates.some((d) => d >= lo && d <= hi);
}

function statusFromDays(days) {
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due_soon';
  if (days <= UPCOMING_DAYS) return 'upcoming';
  return 'later';
}

function monthlyCost(recurrence, amount) {
  amount = Math.abs(amount || 0);
  return recurrence === 'yearly' ? amount / 12 : amount;
}

// One row per bill (category with a due date), resolved to its current active
// occurrence + status. Mirrors bills.py build_bills().
export function buildBills(todayISO, s = getState()) {
  const groupById = new Map(s.categoryGroups.map((g) => [g.id, g]));
  const dueCats = s.categories.filter(
    (c) => c.dueDate && (c.recurrence === 'monthly' || c.recurrence === 'yearly'),
  );
  const catIds = new Set(dueCats.map((c) => c.id));

  const paidSet = new Set();
  for (const bp of s.billPayments) {
    if (catIds.has(bp.categoryId)) paidSet.add(bp.categoryId + '|' + bp.dueDate);
  }

  const txnDates = new Map();
  for (const id of catIds) txnDates.set(id, []);
  const lookStart = addDays(todayISO, -(DUE_LOOKBACK_DAYS + MATCH_BEFORE_DAYS));
  for (const t of s.transactions) {
    if (!catIds.has(t.categoryId)) continue;
    if (!(t.amount < 0) || t.isTransfer || isSupersededManual(t)) continue;
    if (t.date < lookStart || t.date > todayISO) continue;
    txnDates.get(t.categoryId).push(t.date);
  }

  const windowStart = addDays(todayISO, -DUE_LOOKBACK_DAYS);
  const windowEnd = addDays(todayISO, 400);

  const bills = [];
  for (const c of dueCats) {
    let active = null;
    let isPaid = false;
    let lastConfirmed = null;
    for (const occ of occurrences(c, windowStart, windowEnd)) {
      if (isConfirmed(txnDates.get(c.id), occ)) { lastConfirmed = occ; continue; }
      active = occ;
      isPaid = paidSet.has(c.id + '|' + occ);
      break;
    }
    if (!active) continue;
    const days = daysBetween(todayISO, active);
    const group = c.groupId != null ? groupById.get(c.groupId) : null;
    bills.push({
      id: c.id,
      name: c.name,
      color: group ? group.color : (c.color || '#94a3b8'),
      group: group ? group.name : null,
      dueDate: active,
      days,
      recurrence: c.recurrence,
      amount: c.defaultBudget || 0,
      link: c.link || '',
      status: isPaid ? 'paid' : statusFromDays(days),
      lastConfirmed,
    });
  }
  bills.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.days - b.days);
  return bills;
}

export function billSummary(bills) {
  return {
    overdue: bills.filter((b) => b.status === 'overdue').length,
    dueSoon: bills.filter((b) => b.status === 'due_soon').length,
    pending: bills.filter((b) => b.status === 'paid').length,
    monthly: round2(bills.reduce((sum, b) => sum + monthlyCost(b.recurrence, b.amount), 0)),
  };
}

export function billHistory(s = getState()) {
  return [...s.billPayments]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
    .slice(0, 20);
}

// Soft check-off toggle. Returns the new status: 'paid' | 'due'.
export async function toggleBillPaid(categoryId, dueDate) {
  const existing = getState().billPayments.find(
    (b) => b.categoryId === categoryId && b.dueDate === dueDate,
  );
  if (existing) {
    await store.remove('billPayments', existing.id);
    return 'due';
  }
  await store.insert('billPayments', {
    categoryId, dueDate, status: 'paid', note: '', createdAt: new Date().toISOString(),
  });
  return 'paid';
}

// Dashboard's "Next Due" list — mirrors reports.py dashboard(). One row per bill:
// its earliest occurrence not yet confirmed by a statement.
export function upcomingDue(todayISO, s = getState()) {
  const groupById = new Map(s.categoryGroups.map((g) => [g.id, g]));
  const dueCats = s.categories.filter(
    (c) => c.dueDate && (c.recurrence === 'monthly' || c.recurrence === 'yearly'),
  );
  const catIds = new Set(dueCats.map((c) => c.id));

  const paidSet = new Set();
  for (const bp of s.billPayments) {
    if (catIds.has(bp.categoryId)) paidSet.add(bp.categoryId + '|' + bp.dueDate);
  }

  const plans = new Map(
    s.spendingPlans
      .filter((p) => p.year === Number(todayISO.slice(0, 4)) && p.month === Number(todayISO.slice(5, 7)))
      .map((p) => [p.categoryId, p.amount]),
  );

  const windowStart = addDays(todayISO, -DUE_LOOKBACK_DAYS);
  const windowEnd = addDays(todayISO, DUE_LOOKAHEAD_DAYS);

  const txnDates = new Map();
  for (const id of catIds) txnDates.set(id, []);
  const lookStart = addDays(windowStart, -MATCH_BEFORE_DAYS);
  for (const t of s.transactions) {
    if (!catIds.has(t.categoryId)) continue;
    if (!(t.amount < 0) || t.isTransfer || isSupersededManual(t)) continue;
    if (t.date < lookStart || t.date > todayISO) continue;
    txnDates.get(t.categoryId).push(t.date);
  }

  const rows = [];
  for (const c of dueCats) {
    for (const occ of occurrences(c, windowStart, windowEnd)) {
      if (isConfirmed(txnDates.get(c.id), occ)) continue;
      const group = c.groupId != null ? groupById.get(c.groupId) : null;
      rows.push({
        name: c.name,
        categoryId: c.id,
        dueDate: occ,
        color: group ? group.color : (c.color || '#94a3b8'),
        days: daysBetween(todayISO, occ),
        recurrence: c.recurrence,
        amount: plans.get(c.id) ?? null,
        link: c.link || '',
        status: paidSet.has(c.id + '|' + occ) ? 'paid' : 'due',
      });
      break;
    }
  }
  rows.sort((a, b) => a.days - b.days);
  const due = rows.filter((r) => r.status !== 'paid').slice(0, 8);
  const paid = rows.filter((r) => r.status === 'paid');
  return [...due, ...paid].sort((a, b) => a.days - b.days);
}
