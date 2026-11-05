// CSV import logic, ported from routes/imports.py. Pure functions + one commit
// helper that writes to the store.

import * as store from './store.js';

// ── Parsing ──────────────────────────────────────────────────────────────────

// Small RFC4180-ish parser: handles "quoted, fields", "" escapes, \r\n.
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Flexible bank-date parse → "YYYY-MM-DD" or null.
export function parseDateVal(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return iso(fixYear(m[3]), m[1], m[2]);
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/))) return iso(fixYear(m[3]), m[1], m[2]);
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) return iso(fixYear(m[3]), m[1], m[2]);
  if ((m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return iso(m[3], mo, m[2]);
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return iso(m[3], mo, m[1]);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return null;
}

function fixYear(y) {
  y = String(y);
  return y.length === 2 ? '20' + y : y;
}
function iso(y, m, d) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const dt = new Date(`${y}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return `${y}-${mm}-${dd}`;
}

// amount: negative = expense, positive = income. Returns number or null.
export function parseRowAmount(row, mapping) {
  const num = (s) => {
    s = String(s == null ? '' : s).replace(/,/g, '').replace(/\$/g, '').trim();
    if (!s || s === '-') return null;
    // (123.45) => -123.45
    if (s.startsWith('(') && s.endsWith(')')) s = '-' + s.slice(1, -1);
    const v = parseFloat(s);
    return Number.isNaN(v) ? null : v;
  };
  if (mapping.amountCol != null) {
    let v = num(row[mapping.amountCol]);
    if (v == null) return null;
    if (mapping.amountSign === 'positive_is_expense') v = -v;
    return v;
  }
  const debit = num(row[mapping.debitCol]);
  const credit = num(row[mapping.creditCol]);
  if (debit == null && credit == null) return null; // blank row — treat as a parse error
  return (credit || 0) - (debit || 0);
}

// ── Column guessing (mirrors import.js buildColumnSelects) ────────────────────

export function guessMapping(headers) {
  const g = { dateCol: null, descCol: null, amountCol: null, debitCol: null, creditCol: null };
  headers.forEach((h, i) => {
    const l = h.toLowerCase().trim();
    if (g.dateCol == null && /\b(date|posted)\b/.test(l)) g.dateCol = i;
    if (g.descCol == null && /\b(desc|description|memo|narration|particular|detail|name|payee)\b/.test(l)) g.descCol = i;
    if (g.amountCol == null && /^(amount|amt)$/.test(l)) g.amountCol = i;
    if (g.debitCol == null && /\b(debit|withdrawal|dr)\b/.test(l)) g.debitCol = i;
    if (g.creditCol == null && /\b(credit|deposit|cr)\b/.test(l)) g.creditCol = i;
  });
  g.mode = g.debitCol != null && g.creditCol != null ? 'split' : 'single';
  g.amountSign = 'negative_is_expense';
  g.hasHeader = true;
  return g;
}

// ── Transfer detection ───────────────────────────────────────────────────────

const TRANSFER_KEYWORDS_CHECKING = [
  'autopay', 'auto pay', 'credit card', 'card payment',
  'amex', 'american express', 'chase', 'discover', 'capital one',
  'citibank', 'citi ', 'bank of america', 'wells fargo',
  'synchrony', 'barclays', 'us bank', 'usaa', 'navy federal',
  'online payment', 'electronic payment', 'bill payment', 'bill pay',
];

export function isLikelyTransfer(description, amount, accountType) {
  if (accountType === 'credit_card') return amount > 0;
  if (accountType === 'checking') {
    const d = description.toLowerCase();
    return TRANSFER_KEYWORDS_CHECKING.some((kw) => d.includes(kw));
  }
  return false;
}

// ── Duplicate + manual-match detection ───────────────────────────────────────

export function isDuplicate(accountId, date, amount, description, s = store.getState()) {
  return s.transactions.some(
    (t) => t.accountId === accountId && t.date === date &&
           t.amount === amount && t.description === description,
  );
}

function findManualMatches(accountId, amount, date, s) {
  const lo = shiftDays(date, -2), hi = shiftDays(date, 2);
  return s.transactions.filter(
    (t) => t.accountId === accountId && t.source === 'manual' &&
           t.linkedTransactionId == null && t.amount === amount &&
           t.date >= lo && t.date <= hi,
  );
}

function shiftDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Build the review list from raw rows + mapping ─────────────────────────────

export function buildReview(rows, mapping, accountId, accountType, s = store.getState()) {
  const dataRows = mapping.hasHeader ? rows.slice(1) : rows;
  return dataRows.map((row, i) => {
    const date = parseDateVal(row[mapping.dateCol] ?? '');
    const description = String(row[mapping.descCol] ?? '').trim();
    const amount = parseRowAmount(row, mapping);
    if (date == null || amount == null || !description) {
      return { i, raw: row, error: 'Could not parse date or amount', skip: true };
    }
    const dup = isDuplicate(accountId, date, amount, description, s);
    return {
      i, date, description, amount,
      isTransfer: isLikelyTransfer(description, amount, accountType),
      isDuplicate: dup,
      skip: dup,
      error: null,
    };
  });
}

// ── Commit ───────────────────────────────────────────────────────────────────

export async function commitImport(accountId, filename, reviewRows) {
  const toImport = reviewRows.filter((r) => !r.skip && !r.error);
  let importRecord;
  const manualMatches = [];
  let transfersFlagged = 0;

  await store.commit((st) => {
    const impId = store.nextId('imports');
    importRecord = {
      id: impId, accountId, filename: filename || '',
      importedAt: new Date().toISOString(), rowCount: toImport.length,
    };
    st.imports.push(importRecord);

    for (const r of toImport) {
      const txnId = store.nextId('transactions');
      const txn = {
        id: txnId, accountId, date: r.date, description: r.description,
        amount: r.amount, categoryId: null, isTransfer: !!r.isTransfer,
        source: 'csv_import', importId: impId, linkedTransactionId: null,
        notes: '', createdAt: new Date().toISOString(), tagIds: [],
      };
      st.transactions.push(txn);
      if (txn.isTransfer) transfersFlagged++;

      for (const m of findManualMatches(accountId, r.amount, r.date, st)) {
        manualMatches.push({
          manualId: m.id, manualDate: m.date, manualDesc: m.description, manualAmount: m.amount,
          importedId: txnId, importedDesc: txn.description,
        });
      }
    }
  });

  return { imported: toImport.length, transfersFlagged, manualMatches, importId: importRecord.id };
}

export async function linkManual(manualId, importedId) {
  await store.update('transactions', manualId, { linkedTransactionId: importedId });
}
