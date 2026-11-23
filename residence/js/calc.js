/*
 * calc.js — pure logic: schedules, bills per month, splits, balances.
 * No DOM access; also runs under Node for tests.
 */
(function (root) {
  'use strict';
  const RT = (root.RT = root.RT || {});

  const pad = (n) => String(n).padStart(2, '0');

  /* ----------------------------------------------------------------- dates */

  function isoOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayISO() { return isoOf(new Date()); }
  function daysInMonth(period) {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function addMonths(period, n) {
    const [y, m] = period.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
  }
  function addMonthsISO(iso, n) {
    const p = addMonths(iso.slice(0, 7), n);
    return `${p}-${pad(Math.min(+iso.slice(8, 10), daysInMonth(p)))}`;
  }
  function addDaysISO(iso, n) {
    const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n);
    return isoOf(d);
  }
  function monthsBetween(p1, p2) {
    const [y1, m1] = p1.split('-').map(Number);
    const [y2, m2] = p2.split('-').map(Number);
    return (y2 - y1) * 12 + (m2 - m1);
  }

  /* -------------------------------------------------------------- schedule */

  function isScheduled(e, period) {
    if (!e.active) return false;
    if (!e.startDate) return false;
    const sp = e.startDate.slice(0, 7);
    if (period < sp) return false;
    if (e.endDate && period > e.endDate.slice(0, 7)) return false;
    const diff = monthsBetween(sp, period);
    switch (e.frequency) {
      case 'One-time': return diff === 0;
      case 'Quarterly': return diff % 3 === 0;
      case 'Yearly': return diff % 12 === 0;
      default: return true;
    }
  }

  function dueDateFor(e, period) {
    let day = e.dueDay > 0 ? e.dueDay : (e.startDate ? +e.startDate.slice(8, 10) : 1) || 1;
    return `${period}-${pad(Math.min(day, daysInMonth(period)))}`;
  }

  /* ---------------------------------------------------------------- splits */

  /** [{personId, value}] who shares this expense. */
  function participants(db, e) {
    const known = new Set(db.people.map((p) => p.id));
    const dflt = isAmountMethod(e.splitMethod) ? 0 : 1;
    let rows = db.splits.filter((s) => s.expenseId === e.id && known.has(s.personId));
    if (!rows.length) rows = db.residents.filter((r) => r.residenceId === e.residenceId && known.has(r.personId)).map((r) => ({ personId: r.personId, value: dflt }));
    if (!rows.length) rows = db.people.filter((p) => p.active).map((p) => ({ personId: p.id, value: dflt }));
    return rows;
  }

  /** Give each raw (fractional-cent) amount whole cents so the total is exact. */
  function roundToCents(raw, total) {
    const cents = raw.map(Math.floor);
    let left = total - cents.reduce((a, b) => a + b, 0);
    raw.map((r, i) => ({ i, frac: r - cents[i] }))
      .sort((a, b) => b.frac - a.frac)
      .forEach(({ i }) => { if (left > 0) { cents[i]++; left--; } });
    return cents;
  }

  const isAmountMethod = (m) => m === 'Fixed' || m === 'Offset';

  /**
   * Split `amount` across the expense's participants -> [{personId, amount}] (cent-exact).
   *   Equal / Percent / Shares : proportional to weights.
   *   Fixed  : people with a $ value pay exactly that; everyone else splits the rest equally.
   *   Offset : equal split, then people with a +/- $ value pay that much more/less than their
   *            equal share; the difference is taken from (or given to) everyone without a value.
   */
  function splitAmounts(db, e, amount) {
    const parts = participants(db, e);
    if (!parts.length) return [];
    const total = Math.round(amount * 100);
    const n = parts.length;
    let cents;

    if (isAmountMethod(e.splitMethod)) {
      const vals = parts.map((p) => Math.round((Number(p.value) || 0) * 100));
      const free = vals.map((v) => v === 0);
      const nFree = free.filter(Boolean).length;
      const sum = vals.reduce((a, b) => a + b, 0);
      let raw;
      if (e.splitMethod === 'Fixed') {
        const rest = total - sum;
        if (nFree > 0 && rest >= 0) raw = vals.map((v, i) => (free[i] ? rest / nFree : v));
        else if (sum > 0) raw = vals.map((v) => (v * total) / sum);   // over-allocated or all fixed: scale to the bill
        else raw = vals.map(() => total / n);
      } else {
        const base = total / n;
        raw = vals.map((v, i) => base + v + (nFree > 0 ? (free[i] ? -sum / nFree : 0) : -sum / n));
      }
      cents = roundToCents(raw, total);
    } else {
      let weights = parts.map((p) => (e.splitMethod === 'Equal' ? 1 : Math.max(0, Number(p.value) || 0)));
      let wsum = weights.reduce((a, b) => a + b, 0);
      if (wsum <= 0) { weights = parts.map(() => 1); wsum = n; }
      cents = roundToCents(weights.map((w) => (total * w) / wsum), total);
    }
    return parts.map((p, i) => ({ personId: p.personId, amount: cents[i] / 100 }));
  }

  /* ----------------------------------------------------------------- bills */

  const inScope = (db, residenceId, e) => !residenceId || residenceId === 'all' || e.residenceId === residenceId;

  function makeBill(db, e, period, payment) {
    const today = todayISO();
    const amount = payment ? payment.amount : e.amount;
    const dueDate = !isScheduled(e, period) && payment && payment.paidDate ? payment.paidDate : dueDateFor(e, period);
    const paid = !!payment && payment.status === 'Paid';
    let state;
    if (paid) state = 'paid';
    else if (dueDate < today) state = 'overdue';
    else if (dueDate <= addDaysISO(today, 7)) state = 'soon';
    else state = 'upcoming';
    return {
      key: `${e.id}|${period}|${payment ? payment.id : 'expected'}`,
      expense: e, period, dueDate, payment, amount, paid, state,
      billed: !!payment && !paid,
      paidById: payment ? payment.paidById || e.paidById : e.paidById,
      split: splitAmounts(db, e, amount),
    };
  }

  /** All bills (recorded or expected) for one month. */
  function billsForPeriod(db, period, residenceId) {
    const bills = [];
    db.expenses.forEach((e) => {
      if (!inScope(db, residenceId, e)) return;
      const pays = db.payments.filter((p) => p.expenseId === e.id && p.period === period);
      if (pays.length) pays.forEach((p) => bills.push(makeBill(db, e, period, p)));
      else if (isScheduled(e, period)) bills.push(makeBill(db, e, period, null));
    });
    return bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.expense.name.localeCompare(b.expense.name));
  }

  function periodSummary(db, period, residenceId) {
    const bills = billsForPeriod(db, period, residenceId);
    const sum = (arr) => arr.reduce((a, b) => a + b.amount, 0);
    const paid = bills.filter((b) => b.paid);
    const open = bills.filter((b) => !b.paid);
    const byCategory = {};
    bills.forEach((b) => { const c = b.expense.category || 'Other'; byCategory[c] = (byCategory[c] || 0) + b.amount; });
    const byPerson = {}; // share of this month's bills, and what they've actually fronted
    db.people.forEach((p) => (byPerson[p.id] = { share: 0, paid: 0 }));
    bills.forEach((b) => {
      b.split.forEach((s) => { if (byPerson[s.personId]) byPerson[s.personId].share += s.amount; });
      if (b.paid && byPerson[b.paidById]) byPerson[b.paidById].paid += b.amount;
    });
    return {
      bills, total: sum(bills), paid: sum(paid), outstanding: sum(open),
      overdueCount: bills.filter((b) => b.state === 'overdue').length,
      byCategory, byPerson,
    };
  }

  /* -------------------------------------------------------------- balances */

  function balances(db, residenceId) {
    const C = {}; // cents
    db.people.forEach((p) => (C[p.id] = { paid: 0, owed: 0, sentOut: 0, received: 0 }));
    const slot = (id) => C[id] || (C[id] = { paid: 0, owed: 0, sentOut: 0, received: 0 });

    db.payments.forEach((p) => {
      if (p.status !== 'Paid') return;
      const e = db.expenses.find((x) => x.id === p.expenseId);
      if (!e || !inScope(db, residenceId, e)) return;
      const payer = p.paidById || e.paidById;
      if (!payer) return;
      slot(payer).paid += Math.round(p.amount * 100);
      splitAmounts(db, e, p.amount).forEach((s) => (slot(s.personId).owed += Math.round(s.amount * 100)));
    });
    db.settlements.forEach((s) => {
      if (residenceId && residenceId !== 'all' && s.residenceId !== residenceId) return;
      slot(s.fromId).sentOut += Math.round(s.amount * 100);
      slot(s.toId).received += Math.round(s.amount * 100);
    });

    const rows = Object.keys(C).map((personId) => {
      const c = C[personId];
      return {
        personId, paid: c.paid / 100, owed: c.owed / 100, sent: c.sentOut / 100, received: c.received / 100,
        net: (c.paid - c.owed + c.sentOut - c.received) / 100, // + : is owed money, − : owes money
      };
    });
    return rows;
  }

  /** Minimal "who pays whom" list from net balances. */
  function simplifyDebts(rows) {
    const cr = rows.filter((r) => r.net > 0.004).map((r) => ({ id: r.personId, c: Math.round(r.net * 100) })).sort((a, b) => b.c - a.c);
    const dr = rows.filter((r) => r.net < -0.004).map((r) => ({ id: r.personId, c: Math.round(-r.net * 100) })).sort((a, b) => b.c - a.c);
    const out = [];
    let i = 0, j = 0;
    while (i < dr.length && j < cr.length) {
      const amt = Math.min(dr[i].c, cr[j].c);
      if (amt > 0) out.push({ fromId: dr[i].id, toId: cr[j].id, amount: amt / 100 });
      dr[i].c -= amt; cr[j].c -= amt;
      if (dr[i].c === 0) i++;
      if (cr[j].c === 0) j++;
    }
    return out;
  }

  /** Monthly totals for the n months ending at `period`. */
  function trend(db, period, residenceId, n = 12) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const p = addMonths(period, -i);
      const bills = billsForPeriod(db, p, residenceId);
      out.push({ period: p, total: bills.reduce((a, b) => a + b.amount, 0), paid: bills.filter((b) => b.paid).reduce((a, b) => a + b.amount, 0) });
    }
    return out;
  }

  /** Approximate monthly cost of an expense (for residence cards). */
  function monthlyEquivalent(e) {
    if (!e.active) return 0;
    switch (e.frequency) {
      case 'Quarterly': return e.amount / 3;
      case 'Yearly': return e.amount / 12;
      case 'One-time': return 0;
      default: return e.amount;
    }
  }

  RT.calc = {
    todayISO, isoOf, daysInMonth, addMonths, addMonthsISO, addDaysISO, monthsBetween,
    isScheduled, dueDateFor, participants, splitAmounts,
    billsForPeriod, periodSummary, balances, simplifyDebts, trend, monthlyEquivalent,
  };
})(typeof window !== 'undefined' ? window : globalThis);
