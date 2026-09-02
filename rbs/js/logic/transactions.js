import { getState } from '../store.js';
import { excludedTagIds } from './tags.js';

// A manual entry that a later imported row superseded — hidden from lists/totals by default.
export function isSupersededManual(t) {
  return t.source === 'manual' && t.linkedTransactionId != null;
}

// The shared "counts toward budget / dashboard / report totals" predicate.
// Mirrors the filter repeated ~15 times across the old routes/.
export function countsForTotals(t, { includeExcludedTags = false, excluded = null } = {}) {
  if (t.isTransfer) return false;
  if (isSupersededManual(t)) return false;
  if (!includeExcludedTags) {
    const ex = excluded || excludedTagIds();
    if ((t.tagIds || []).some((id) => ex.has(id))) return false;
  }
  return true;
}

export function accountName(id, s = getState()) {
  const a = s.accounts.find((x) => x.id === id);
  return a ? a.name : '';
}

// ── Transactions list: filter + sort (mirrors routes/transactions.py index) ──

const PAGE_SIZE = 50;
export { PAGE_SIZE };

export function filterTransactions(filters, s = getState()) {
  const {
    accountIds = [], categoryVals = [], tagVals = [],
    view = 'all', amountType = '', showTransfers = false, showSuperseded = false,
    search = '', dateFrom = '', dateTo = '',
  } = filters;

  const catIds = categoryVals.filter((v) => v !== 'uncategorized').map(Number);
  const wantUncategorized = categoryVals.includes('uncategorized');
  const tagIds = tagVals.filter((v) => v !== 'none').map(Number);
  const wantUntagged = tagVals.includes('none');
  const needle = search.trim().toLowerCase();

  return s.transactions.filter((t) => {
    if (accountIds.length && !accountIds.includes(t.accountId)) return false;

    if (view === 'review') {
      if (t.categoryId != null || t.isTransfer || isSupersededManual(t)) return false;
    } else {
      if (categoryVals.length) {
        const hit = (catIds.length && catIds.includes(t.categoryId)) ||
                    (wantUncategorized && t.categoryId == null);
        if (!hit) return false;
      }
      if (tagVals.length) {
        const tset = t.tagIds || [];
        const hit = (tagIds.length && tagIds.some((id) => tset.includes(id))) ||
                    (wantUntagged && tset.length === 0);
        if (!hit) return false;
      }
      if (!showTransfers && t.isTransfer) return false;
      if (!showSuperseded && isSupersededManual(t)) return false;
    }

    if (amountType === 'spending' && !(t.amount < 0)) return false;
    if (amountType === 'earning' && !(t.amount > 0)) return false;
    if (needle && !t.description.toLowerCase().includes(needle)) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });
}

export function sortTransactions(list, sort = 'date', dir = 'desc', s = getState()) {
  const acctName = new Map(s.accounts.map((a) => [a.id, a.name.toLowerCase()]));
  const catName = new Map(s.categories.map((c) => [c.id, c.name.toLowerCase()]));
  const key = (t) => {
    switch (sort) {
      case 'description': return t.description.toLowerCase();
      case 'amount': return t.amount;
      case 'source': return t.source;
      case 'account': return acctName.get(t.accountId) || '';
      case 'category': return catName.get(t.categoryId) || '';
      default: return t.date;
    }
  };
  const mul = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka < kb) return -1 * mul;
    if (ka > kb) return 1 * mul;
    // stable tiebreaker: date desc, id desc
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.id - a.id;
  });
}

export function reviewCount(s = getState()) {
  return s.transactions.filter(
    (t) => t.categoryId == null && !t.isTransfer && !isSupersededManual(t),
  ).length;
}

// ── Description → category suggestion (mirrors transactions.py suggestions) ──

const STOP = new Set([
  'THE', 'AND', 'FOR', 'WITH', 'FROM', 'PURCHASE', 'PAYMENT', 'ONLINE', 'DEBIT',
  'CREDIT', 'ACH', 'POS', 'REF', 'AUTH', 'APL', 'LLC', 'INC', 'CORP', 'CO',
  'RECURRING', 'AUTOPAY', 'PYMT', 'PMT', 'ORIG',
]);

function words(desc) {
  const cleaned = desc.toUpperCase().replace(/[^A-Z ]/g, ' ');
  return new Set(cleaned.split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));
}

export function suggestCategories(ids, s = getState()) {
  const training = [];
  for (const t of s.transactions) {
    if (t.categoryId == null || t.isTransfer) continue;
    const w = words(t.description);
    if (w.size) training.push([w, t.categoryId]);
  }
  if (!training.length) return {};

  const catName = new Map(s.categories.map((c) => [c.id, c.name]));
  const idSet = new Set(ids);
  const out = {};
  for (const t of s.transactions) {
    if (!idSet.has(t.id)) continue;
    const target = words(t.description);
    if (!target.size) continue;
    const scores = new Map();
    for (const [w, catId] of training) {
      let overlap = 0;
      for (const x of target) if (w.has(x)) overlap++;
      if (overlap) scores.set(catId, (scores.get(catId) || 0) + overlap);
    }
    if (!scores.size) continue;
    let bestId = null, best = 0, total = 0;
    for (const [id, sc] of scores) { total += sc; if (sc > best) { best = sc; bestId = id; } }
    const confidence = Math.round((best / total) * 100);
    if (confidence >= 35 && catName.has(bestId)) {
      out[t.id] = { categoryId: bestId, categoryName: catName.get(bestId), confidence };
    }
  }
  return out;
}
