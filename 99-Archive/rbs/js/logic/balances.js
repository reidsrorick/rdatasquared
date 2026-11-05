import { getState } from '../store.js';
import { isSupersededManual } from './transactions.js';
import { round2 } from '../format.js';

// opening balance + every non-superseded transaction up to `asOf` (inclusive).
// Transfers ARE included; superseded manual duplicates are not. (accounts.py)
export function computedBalance(accountId, { asOf = null, s = getState() } = {}) {
  const acct = s.accounts.find((a) => a.id === accountId);
  if (!acct) return 0;
  let sum = 0;
  for (const t of s.transactions) {
    if (t.accountId !== accountId) continue;
    if (isSupersededManual(t)) continue;
    if (asOf && t.date > asOf) continue;
    sum += t.amount || 0;
  }
  return round2((acct.openingBalance || 0) + sum);
}

export function netWorth(s = getState()) {
  return round2(s.accounts.reduce((tot, a) => tot + computedBalance(a.id, { s }), 0));
}

export function txnCountByAccount(s = getState()) {
  const m = new Map();
  for (const t of s.transactions) m.set(t.accountId, (m.get(t.accountId) || 0) + 1);
  return m;
}

// Most recent reconciliation for an account (latest asOfDate, then newest id).
export function latestSnapshot(accountId, s = getState()) {
  return s.balanceSnapshots
    .filter((x) => x.accountId === accountId)
    .sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : a.asOfDate > b.asOfDate ? -1 : b.id - a.id))[0] || null;
}

export function accountSnapshots(accountId, s = getState()) {
  return s.balanceSnapshots
    .filter((x) => x.accountId === accountId)
    .sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : a.asOfDate > b.asOfDate ? -1 : b.id - a.id));
}

export function snapshotDiff(snap) {
  return round2((snap.enteredBalance || 0) - (snap.computedBalance || 0));
}
