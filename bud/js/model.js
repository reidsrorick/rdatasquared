/* model.js — parsing, formatting, split logic, schemas, summaries.
   No DOM here; pure data. Exposed on window.BB.model */
(function () {
  "use strict";

  // ---------- formatting ----------
  // Privacy mode: when on, every dollar figure renders masked so the screen
  // can be shown to others. All currency in the app flows through money().
  let masked = false;
  const setMasked = (v) => {
    masked = !!v;
  };
  const isMasked = () => masked;
  const money = (n) =>
    n == null || n === "" || isNaN(n)
      ? ""
      : masked
      ? "$•••••"
      : (n < 0 ? "-$" : "$") +
        Math.abs(Number(n)).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  function toDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v;
    if (typeof v === "number") {
      // Excel serial fallback (should not happen with cellDates:true)
      const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(v)));
      return d;
    }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  // Snap any date to local midnight of the day it means. Spreadsheet libraries hand back
  // dates a few seconds off midnight (or in UTC), which can land on the wrong calendar day.
  const toDay = (v) => {
    const d = toDate(v);
    if (!d) return null;
    const r = new Date(d.getTime() + 12 * 3600 * 1000);
    return new Date(r.getFullYear(), r.getMonth(), r.getDate());
  };

  const fmtDate = (v) => {
    const d = toDate(v);
    return d
      ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : "";
  };

  // yyyy-mm-dd for <input type=date>
  const dateInputValue = (v) => {
    const d = toDate(v);
    if (!d) return "";
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const monthKey = (v) => {
    const d = toDate(v);
    if (!d) return "—";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = (v) => {
    const d = toDate(v);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // ---------- apartment split logic (mirrors the SWITCH formulas) ----------
  // Items: Rent, uelec, uwater, ugarb, Internet, Renter's Insurance
  const APARTMENT_ITEMS = ["Rent", "uelec", "uwater", "ugarb", "Internet", "Renter's Insurance"];

  function split(item, total) {
    total = Number(total) || 0;
    const half = total / 2;
    // Raw precision (matching the spreadsheet's SWITCH formulas); display rounds to 2dp.
    switch (item) {
      case "Rent":
        return { half, reid: half + 75, luke: half - 75 };
      case "Internet": {
        const each = total - Math.floor(half); // = C - INT(C/2)
        return { half, reid: each, luke: each };
      }
      case "Renter's Insurance":
        return { half, reid: total, luke: 0 };
      default:
        return { half, reid: half, luke: half };
    }
  }

  // ---------- monthly summary from apartment rows ----------
  function summarize(rows) {
    const map = new Map();
    for (const r of rows) {
      const s = split(r.Item, r["Total Amount"]);
      const key = monthKey(r.Date);
      if (!map.has(key))
        map.set(key, { key, label: monthLabel(r.Date), date: toDate(r.Date), reid: 0, luke: 0, total: 0 });
      const m = map.get(key);
      m.reid += s.reid; // accumulate raw; round only for display
      m.luke += s.luke;
      // Total is the sum of the actual bill amounts (like the workbook's Summary sheet) — NOT
      // reid + luke, which runs a few cents over because of the Internet split rule.
      m.total += Number(r["Total Amount"]) || 0;
    }
    const months = [...map.values()].sort((a, b) => (a.date || 0) - (b.date || 0));
    const year = {
      reid: months.reduce((a, m) => a + m.reid, 0),
      luke: months.reduce((a, m) => a + m.luke, 0),
      total: months.reduce((a, m) => a + m.total, 0),
    };
    return { months, year };
  }

  // ---------- recurring cost normalization ----------
  function monthlyEquivalent(amount, occurrence) {
    amount = Number(amount) || 0;
    switch ((occurrence || "").toLowerCase()) {
      case "yearly":
      case "annual":
      case "annually":
        return amount / 12;
      case "weekly":
        return (amount * 52) / 12;
      case "quarterly":
        return amount / 3;
      case "monthly":
      default:
        return amount;
    }
  }

  // ---------- table schemas ----------
  // Each table knows its sheet, its columns, and (optionally) computed columns.
  const APARTMENT_ITEM_OPTIONS = APARTMENT_ITEMS.slice();
  const EXPENSE_CATEGORIES = ["Friends/Family", "Work (internal)", "Client"];
  const EXPENSE_STATUSES = ["Pending", "Submitted", "Paid"];

  const schemas = {
    apartment: {
      file: "apartment",
      sheet: "Data Entry",
      title: "Apartment — Data Entry",
      // stored columns (written back to the sheet, in this order)
      columns: [
        { key: "Date", label: "Date", type: "date", required: true },
        { key: "Item", label: "Item", type: "select", options: APARTMENT_ITEM_OPTIONS, required: true },
        { key: "Total Amount", label: "Total Amount", type: "money", required: true },
      ],
      // derived columns shown in the grid + written back to the 50/50, Reid, Luke columns
      computed: [
        { key: "50/50", label: "50/50", calc: (r) => split(r.Item, r["Total Amount"]).half, persist: true },
        { key: "Reid", label: "Reid", calc: (r) => split(r.Item, r["Total Amount"]).reid, strong: true, persist: true },
        { key: "Luke", label: "Luke", calc: (r) => split(r.Item, r["Total Amount"]).luke, persist: true },
      ],
      sortBy: (a, b) => (toDate(b.Date) || 0) - (toDate(a.Date) || 0),
    },

    requests: {
      file: "apartment",
      sheet: "Requests",
      title: "Venmo request",
      columns: [
        { key: "Title", label: "Title", type: "text", required: true },
        // which month's apartment bills this request collects (ties it to the Expense Tracker)
        { key: "Month", label: "Covers month", type: "date", month: true },
        { key: "Description", label: "Description", type: "text", wide: true },
        { key: "Amount", label: "Amount", type: "money" },
        {
          key: "Status",
          label: "Status",
          type: "select",
          options: ["Draft", "Awaiting Transfer", "Paid", "Complete"],
        },
        { key: "Request Sent?", label: "Request Sent", type: "date" },
        { key: "Payment Received?", label: "Payment Received", type: "date" },
        { key: "Account Transferred?", label: "Transferred", type: "date" },
      ],
    },

    subscriptions: {
      file: "expenses",
      sheet: "Subscriptions-Bills",
      title: "Subscriptions & Bills",
      columns: [
        // `sub` fields are still stored and editable, but the table shows them as small lines
        // under the item name instead of giving each its own column (fewer, roomier columns)
        { key: "Item", label: "Item", type: "text", required: true },
        { key: "Description", label: "Description", type: "text", wide: true, sub: true },
        { key: "Amount", label: "Amount", type: "money", required: true },
        { key: "Start Date", label: "Start", type: "date", sub: "Since" },
        { key: "End Date", label: "End", type: "date", sub: "Ends" },
        { key: "Occurance", label: "Occurrence", type: "select", options: ["Monthly", "Yearly", "Weekly", "Quarterly"] },
        { key: "Category", label: "Category", type: "select", options: ["Bill", "Subscription"] },
        { key: "Active", label: "Active", type: "bool" },
        { key: "Comments", label: "Comments", type: "text", wide: true, sub: true },
      ],
      computed: [
        {
          key: "PerMonth",
          label: "/mo",
          calc: (r) => (r.Active === false ? 0 : monthlyEquivalent(r.Amount, r.Occurance)),
        },
      ],
    },

    // Expense tracker: things you paid for that someone else owes you back.
    // The first six columns are the original sheet layout (kept in order so Excel
    // still reads it); the rest were added for tracking who owes what and whether it's paid.
    thirdparty: {
      file: "expenses",
      sheet: "Third Party",
      title: "Expense Tracker",
      columns: [
        { key: "Date of Original Purchase", label: "Purchased", type: "date" },
        { key: "Date of Activity", label: "Activity Date", type: "date" },
        { key: "Activity", label: "What", type: "text", required: true },
        { key: "Description", label: "Details", type: "text", wide: true },
        { key: "Amount", label: "Amount", type: "money", required: true },
        { key: "Purpose", label: "Project / Purpose", type: "text" },
        { key: "Category", label: "Who pays me back", type: "select", options: EXPENSE_CATEGORIES, required: true },
        { key: "Owed By", label: "Owed by (person / client)", type: "text" },
        // status + its dates are set automatically (new expenses start Pending), so the bulk
        // entry grid leaves them out — they're still in the single add/edit form
        { key: "Status", label: "Status", type: "select", options: EXPENSE_STATUSES, bulk: false },
        { key: "Date Submitted", label: "Submitted on", type: "date", bulk: false },
        { key: "Date Paid", label: "Paid on", type: "date", bulk: false },
        // receipt filenames (in the Receipts/ folder), separated by "; " — managed by the
        // attach button, not the add/edit form
        { key: "Receipt", label: "Receipts", type: "text", noForm: true },
      ],
    },
  };

  // ---------- expense tracker helpers ----------
  const todayDate = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  // Fill in the fields older rows don't have (the sheet predates these columns).
  function normalizeExpense(r) {
    if (!r.Category) r.Category = "Work (internal)";
    if (!r["Owed By"] && r.Purpose) r["Owed By"] = r.Purpose;
    if (!EXPENSE_STATUSES.includes(r.Status)) r.Status = "Pending";
    return r;
  }

  // Stamp the dates that go with a status when they haven't been filled in.
  function applyStatusDates(r) {
    if (r.Status === "Submitted" && !r["Date Submitted"]) r["Date Submitted"] = todayDate();
    if (r.Status === "Paid") {
      if (!r["Date Paid"]) r["Date Paid"] = todayDate();
      if (!r["Date Submitted"]) r["Date Submitted"] = r["Date Paid"];
    }
    if (r.Status === "Pending") {
      r["Date Submitted"] = null;
      r["Date Paid"] = null;
    }
    return r;
  }

  // ---------- apartment → "Luke owes me" ----------
  // You front the whole apartment bill and Luke pays his share by Venmo request, so each
  // month of apartment bills is one reimbursable line: Luke's share, with a status taken
  // from that month's Venmo request. Nothing is copied — it's all derived.
  const MONTH_RE =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/i;
  const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  const firstOfMonth = (v) => {
    const d = toDay(v);
    return d ? new Date(d.getFullYear(), d.getMonth(), 1) : null;
  };

  // Older requests don't say which month they cover. Work it out from the title
  // ("November Bills") or, failing that, the date it was sent.
  function inferRequestMonth(r) {
    const sent = toDay(r["Request Sent?"]);
    const text = `${r.Title || ""} ${r.Description || ""}`;
    const m = MONTH_RE.exec(text);
    if (m) {
      const mi = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()];
      const yearInText = /\b(20\d{2})\b/.exec(text);
      let y = yearInText ? +yearInText[1] : sent ? sent.getFullYear() : new Date().getFullYear();
      if (!yearInText && sent && mi > sent.getMonth() + 6) y -= 1; // "December bills" sent in January
      return new Date(y, mi, 1);
    }
    return sent ? new Date(sent.getFullYear(), sent.getMonth(), 1) : null;
  }

  function normalizeRequest(r) {
    r.Month = r.Month ? firstOfMonth(r.Month) : inferRequestMonth(r);
    if (!r.Month) delete r.Month;
    return r;
  }

  // Has Luke paid? A payment-received date or a Paid/Complete status says yes; a sent
  // request (or "Awaiting Transfer") means we're waiting on him.
  function requestState(r) {
    const st = String(r.Status || "");
    if (r["Payment Received?"] || /^(paid|complete)$/i.test(st)) return "Paid";
    if (r["Request Sent?"] || /awaiting/i.test(st)) return "Submitted";
    return "Pending";
  }

  const longMonth = (d) => d.toLocaleDateString("en-US", { month: "long" });

  // One line per month of apartment bills: what Luke owes you and where it stands.
  function apartmentOwedLines(aptRows, reqRows) {
    const rank = { Pending: 0, Submitted: 1, Paid: 2 };
    const reqsByMonth = new Map();
    (reqRows || []).forEach((r, idx) => {
      if (!r.Month) return;
      const k = monthKey(r.Month);
      if (!reqsByMonth.has(k)) reqsByMonth.set(k, []);
      reqsByMonth.get(k).push({ r, idx });
    });
    const billCount = new Map();
    for (const r of aptRows) billCount.set(monthKey(r.Date), (billCount.get(monthKey(r.Date)) || 0) + 1);

    return summarize(aptRows)
      .months.filter((m) => m.key !== "—" && m.luke > 0.005)
      .map((m) => {
        let best = null;
        for (const q of reqsByMonth.get(m.key) || []) {
          if (!best || rank[requestState(q.r)] > rank[requestState(best.r)]) best = q;
        }
        const req = best && best.r;
        return {
          key: m.key,
          label: m.label,
          date: new Date(m.date.getFullYear(), m.date.getMonth(), 1),
          amount: m.luke,
          count: billCount.get(m.key) || 0,
          status: req ? requestState(req) : "Pending",
          requestIndex: best ? best.idx : null,
          sentOn: req ? req["Request Sent?"] : null,
          paidOn: req ? req["Payment Received?"] : null,
          transferredOn: req ? req["Account Transferred?"] : null,
          requestAmount: req && req.Amount != null ? Number(req.Amount) : null,
          settledNote: !!(req && /marked settled/i.test(req.Description || "")),
        };
      });
  }

  // A request record that says "this month is already settled".
  function settledRequest(line) {
    return {
      Title: `${longMonth(line.date)} ${line.date.getFullYear()} Bills`,
      Month: line.date,
      Description: "Marked settled (before tracking started)",
      Amount: round2(line.amount),
      Status: "Complete",
    };
  }

  // One-time catch-up: every month of bills before your first tracked request, with no
  // request of its own, was settled before you started tracking — mark those settled so
  // they don't show up as owed.
  function catchUpRequests(aptRows, reqRows) {
    const keys = (reqRows || []).filter((r) => r.Month).map((r) => monthKey(r.Month)).sort();
    if (!keys.length) return [];
    const earliest = keys[0];
    const covered = new Set(keys);
    return apartmentOwedLines(aptRows, reqRows)
      .filter((l) => l.key < earliest && !covered.has(l.key))
      .map(settledRequest);
  }

  // ---------- overall summary (Summary tab) ----------
  const yearOf = (v) => {
    const d = toDate(v);
    return d ? d.getFullYear() : null;
  };
  // an expense belongs to the year it was bought (falling back to its activity date)
  const expenseYear = (r) => {
    const y = yearOf(r["Date of Original Purchase"]);
    return y != null ? y : yearOf(r["Date of Activity"]);
  };

  // every calendar year that has apartment entries or expenses, newest first
  function summaryYears(rows) {
    const ys = new Set();
    (rows.apartment || []).forEach((r) => {
      const y = yearOf(r.Date);
      if (y != null) ys.add(y);
    });
    (rows.thirdparty || []).forEach((r) => {
      const y = expenseYear(r);
      if (y != null) ys.add(y);
    });
    return [...ys].sort((a, b) => b - a);
  }

  // Apartment money by bill type (rent, electric, …) for a year (or all time if year is null).
  function apartmentByItem(aptRows, year) {
    const map = new Map();
    const total = { count: 0, total: 0, reid: 0, luke: 0 };
    for (const r of aptRows) {
      if (year != null && yearOf(r.Date) !== year) continue;
      const s = split(r.Item, r["Total Amount"]);
      const amt = Number(r["Total Amount"]) || 0;
      const key = r.Item || "(no item)";
      const o = map.get(key) || { item: key, count: 0, total: 0, reid: 0, luke: 0 };
      o.count++;
      o.total += amt;
      o.reid += s.reid;
      o.luke += s.luke;
      map.set(key, o);
      total.count++;
      total.total += amt;
      total.reid += s.reid;
      total.luke += s.luke;
    }
    return { items: [...map.values()].sort((a, b) => b.total - a.total), total };
  }

  // Active recurring items, each as a monthly and yearly cost.
  function recurringBreakdown(subs) {
    const items = (subs || [])
      .filter((r) => r.Active !== false)
      .map((r) => {
        const monthly = monthlyEquivalent(r.Amount, r.Occurance);
        return {
          item: r.Item,
          category: r.Category || "",
          cycle: r.Occurance || "Monthly",
          amount: Number(r.Amount) || 0,
          monthly,
          yearly: monthly * 12,
        };
      })
      .sort((a, b) => b.yearly - a.yearly);
    const monthly = items.reduce((a, i) => a + i.monthly, 0);
    const bills = items.filter((i) => /bill/i.test(i.category)).reduce((a, i) => a + i.monthly, 0);
    return { items, monthly, yearly: monthly * 12, bills, subs: monthly - bills };
  }

  // What you fronted for others in a year (or all time), how much came back, how much is
  // still owed — expenses plus Luke's apartment months. Each bucket gets `fronted` and
  // `recovered` (share paid back, or null if nothing was fronted).
  function frontedSummary(expenseRows, aptLines, year) {
    const exps = year == null ? expenseRows : expenseRows.filter((r) => expenseYear(r) === year);
    const lines = year == null ? aptLines : aptLines.filter((l) => l.date.getFullYear() === year);
    const sum = expenseSummary(exps, lines);
    const finish = (o) => {
      o.fronted = o.Pending + o.Submitted + o.Paid;
      o.recovered = o.fronted > 0.005 ? o.Paid / o.fronted : null;
      return o;
    };
    EXPENSE_CATEGORIES.forEach((c) => finish(sum.byCat[c]));
    finish(sum.total);
    return sum;
  }

  // Totals per category and status — what's still owed to you. `aptLines` (optional) adds
  // Luke's apartment share under Friends/Family.
  function expenseSummary(rows, aptLines) {
    const empty = () => ({ Pending: 0, Submitted: 0, Paid: 0, count: 0 });
    const byCat = {};
    EXPENSE_CATEGORIES.forEach((c) => (byCat[c] = empty()));
    const total = empty();
    for (const r of rows) {
      const cat = byCat[r.Category] ? r.Category : "Work (internal)";
      const st = EXPENSE_STATUSES.includes(r.Status) ? r.Status : "Pending";
      const amt = Number(r.Amount) || 0;
      byCat[cat][st] += amt;
      byCat[cat].count++;
      total[st] += amt;
      total.count++;
    }
    for (const l of aptLines || []) {
      byCat["Friends/Family"][l.status] += l.amount;
      byCat["Friends/Family"].count++;
      total[l.status] += l.amount;
      total.count++;
    }
    const outstanding = (o) => o.Pending + o.Submitted;
    EXPENSE_CATEGORIES.forEach((c) => (byCat[c].outstanding = outstanding(byCat[c])));
    total.outstanding = outstanding(total);
    return { byCat, total };
  }

  const splitReceipts = (s) =>
    String(s || "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
  const joinReceipts = (arr) => arr.join("; ");

  window.BB = window.BB || {};
  window.BB.model = {
    money,
    setMasked,
    isMasked,
    round2,
    toDate,
    toDay,
    fmtDate,
    dateInputValue,
    monthKey,
    monthLabel,
    split,
    summarize,
    monthlyEquivalent,
    schemas,
    APARTMENT_ITEMS,
    EXPENSE_CATEGORIES,
    EXPENSE_STATUSES,
    normalizeExpense,
    normalizeRequest,
    applyStatusDates,
    apartmentOwedLines,
    settledRequest,
    catchUpRequests,
    requestState,
    summaryYears,
    apartmentByItem,
    recurringBreakdown,
    frontedSummary,
    expenseSummary,
    splitReceipts,
    joinReceipts,
  };
})();
