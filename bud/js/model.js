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

  // ---------- settings: who's who, how shared bills split, who pays you back ----------
  // Nothing is built in. A new budget starts blank and the setup screen fills these in; they
  // are saved in the workbook's Settings / Split Rules / Categories sheets.
  const RULE_METHODS = [
    { id: "equal", label: "Split equally", unit: "", hint: "Each person pays half." },
    { id: "mine", label: "I pay all", unit: "", hint: "The whole bill is yours." },
    { id: "theirs", label: "They pay all", unit: "", hint: "The whole bill is theirs." },
    { id: "percent", label: "I pay a percentage", unit: "%", hint: "Your share of the bill, as a percent." },
    { id: "offset", label: "Equal, but I pay more or less", unit: "$", hint: "Half each, then you pay this much more (use a minus for less) and they pay less." },
    { id: "fixed", label: "I pay a fixed amount", unit: "$", hint: "You pay this amount each time; they pay the rest." },
  ];

  const blankSettings = () => ({
    setupDone: false,
    me: "",
    partner: "",
    sharedEnabled: false,
    sharedLabel: "",
    sharedCategory: "",
    categories: [],
    rules: [],
  });

  function normalizeSettings(raw) {
    const o = blankSettings();
    if (!raw || typeof raw !== "object") return o;
    const str = (v) => String(v == null ? "" : v).trim();
    o.setupDone = !!raw.setupDone;
    o.me = str(raw.me);
    o.partner = str(raw.partner);
    o.sharedEnabled = !!raw.sharedEnabled;
    o.sharedLabel = str(raw.sharedLabel);
    o.sharedCategory = str(raw.sharedCategory);
    const seen = [];
    (Array.isArray(raw.categories) ? raw.categories : []).forEach((c) => {
      c = str(c);
      if (c && !seen.some((x) => x.toLowerCase() === c.toLowerCase())) seen.push(c);
    });
    o.categories = seen;
    const ids = RULE_METHODS.map((m) => m.id);
    o.rules = (Array.isArray(raw.rules) ? raw.rules : [])
      .map((r) => {
        const method = ids.includes(r && r.method) ? r.method : "equal";
        const v = r && r.value != null && r.value !== "" ? Number(r.value) : null;
        return {
          item: str(r && r.item),
          method,
          value: v != null && !isNaN(v) ? v : null,
          label: str(r && r.label),
          up: !!(r && r.up),
        };
      })
      .filter((r) => r.item);
    return o;
  }

  let cfg = blankSettings();
  const setSettings = (s) => {
    cfg = normalizeSettings(s);
  };
  const getSettings = () => cfg;
  const meName = () => cfg.me || "You";
  const partnerName = () => cfg.partner || "Roommate";
  const sharedLabel = () => cfg.sharedLabel || "Shared bills";
  const sharedCategory = () => cfg.sharedCategory || cfg.categories[0] || partnerName();

  // The settings an older budget.json (made before there was a setup screen) was built on, so
  // that existing data keeps adding up exactly as it did.
  function legacySettings() {
    return normalizeSettings({
      setupDone: true,
      me: "Reid",
      partner: "Luke",
      sharedEnabled: true,
      sharedLabel: "Apartment",
      sharedCategory: "Friends/Family",
      categories: ["Friends/Family", "Work (internal)", "Client"],
      rules: [
        { item: "Rent", method: "offset", value: 75 },
        { item: "uelec", method: "equal", label: "Electric" },
        { item: "uwater", method: "equal", label: "Water" },
        { item: "ugarb", method: "equal", label: "Garbage" },
        { item: "Internet", method: "equal", up: true },
        { item: "Renter's Insurance", method: "mine", label: "Renter's insurance" },
      ],
    });
  }

  const ruleFor = (item) => {
    const k = String(item || "").trim().toLowerCase();
    return cfg.rules.find((r) => r.item.toLowerCase() === k) || null;
  };
  const itemLabel = (item) => {
    const r = ruleFor(item);
    return (r && r.label) || item || "";
  };

  // One line saying what a rule does, for the rules list
  function ruleSummary(r) {
    const v = Number(r.value) || 0;
    const them = partnerName();
    switch (r.method) {
      case "mine":
        return "you pay all";
      case "theirs":
        return `${them} pays all`;
      case "percent":
        return `you pay ${v}%, ${them} ${Math.round((100 - v) * 100) / 100}%`;
      case "offset":
        return v >= 0
          ? `you pay ${money(v)} more than half`
          : `you pay ${money(-v)} less than half`;
      case "fixed":
        return `you pay ${money(v)}, ${them} the rest`;
      default:
        return r.up ? "split equally (each rounded up)" : "split equally";
    }
  }

  // How one shared bill splits. Anything without a rule is simply split in half.
  // Raw precision here; display rounds to 2dp.
  function split(item, total) {
    total = Number(total) || 0;
    const half = total / 2;
    const rule = ruleFor(item);
    const v = rule && rule.value != null ? Number(rule.value) : 0;
    switch (rule && rule.method) {
      case "mine":
        return { half, me: total, other: 0 };
      case "theirs":
        return { half, me: 0, other: total };
      case "percent": {
        const me = (total * Math.min(100, Math.max(0, v))) / 100;
        return { half, me, other: total - me };
      }
      case "offset":
        return { half, me: half + v, other: half - v };
      case "fixed": {
        const me = Math.min(total, Math.max(0, v));
        return { half, me, other: total - me };
      }
      default:
        if (rule && rule.up) {
          const each = total - Math.floor(half); // both pay the rounded-up half
          return { half, me: each, other: each };
        }
        return { half, me: half, other: half };
    }
  }

  // every "who pays me back" category in use: the ones you set up plus any named on an expense
  function categories(rows) {
    const out = [];
    const add = (n) => {
      n = String(n || "").trim();
      if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
    };
    cfg.categories.forEach(add);
    (rows || []).forEach((r) => add(r.Category));
    if (cfg.sharedEnabled) add(sharedCategory());
    return out;
  }

  // ---------- monthly summary from apartment rows ----------
  function summarize(rows) {
    const map = new Map();
    for (const r of rows) {
      const s = split(r.Item, r["Total Amount"]);
      const key = monthKey(r.Date);
      if (!map.has(key))
        map.set(key, { key, label: monthLabel(r.Date), date: toDate(r.Date), me: 0, other: 0, total: 0 });
      const m = map.get(key);
      m.me += s.me; // accumulate raw; round only for display
      m.other += s.other;
      // Total is the sum of the actual bill amounts (like the workbook's Summary sheet) — NOT
      // me + other, which can run a few cents over when a rule rounds each share up.
      m.total += Number(r["Total Amount"]) || 0;
    }
    const months = [...map.values()].sort((a, b) => (a.date || 0) - (b.date || 0));
    const year = {
      me: months.reduce((a, m) => a + m.me, 0),
      other: months.reduce((a, m) => a + m.other, 0),
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
  const EXPENSE_STATUSES = ["Pending", "Submitted", "Paid"];

  const schemas = {
    apartment: {
      file: "apartment",
      sheet: "Shared Bills",
      altSheets: ["Data Entry"], // what the older workbooks called it
      get title() {
        return sharedLabel();
      },
      // stored columns (written back to the sheet, in this order)
      columns: [
        { key: "Date", label: "Date", type: "date", required: true },
        { key: "Item", label: "Item", type: "text", suggest: "items", required: true },
        { key: "Total Amount", label: "Total Amount", type: "money", required: true },
      ],
      // derived columns shown in the grid and in the Excel export (labels follow the names you set)
      computed: [
        { key: "half", get label() { return "50/50"; }, calc: (r) => split(r.Item, r["Total Amount"]).half, persist: true },
        { key: "me", get label() { return meName(); }, calc: (r) => split(r.Item, r["Total Amount"]).me, strong: true, persist: true },
        { key: "other", get label() { return partnerName(); }, calc: (r) => split(r.Item, r["Total Amount"]).other, persist: true },
      ],
      sortBy: (a, b) => (toDate(b.Date) || 0) - (toDate(a.Date) || 0),
    },

    requests: {
      file: "apartment",
      sheet: "Requests",
      title: "Payment request",
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
      sheet: "Expense Tracker",
      altSheets: ["Third Party"],
      title: "Expense Tracker",
      columns: [
        { key: "Date of Original Purchase", label: "Purchased", type: "date" },
        { key: "Date of Activity", label: "Activity Date", type: "date" },
        { key: "Activity", label: "What", type: "text", required: true },
        { key: "Description", label: "Details", type: "text", wide: true },
        { key: "Amount", label: "Amount", type: "money", required: true },
        { key: "Purpose", label: "Project / Purpose", type: "text" },
        { key: "Category", label: "Who pays me back", type: "text", suggest: "categories", required: true },
        { key: "Owed By", label: "Owed by (person / client)", type: "text" },
        // which trip / batch this expense belongs to (suggests the groups you already have)
        { key: "Group", label: "Trip / group", type: "text", suggest: "groups" },
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
    if (r.Group != null) {
      r.Group = String(r.Group).trim();
      if (!r.Group) delete r.Group;
    }
    if (!r.Category) r.Category = cfg.categories[0] || "Other";
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

  // ---------- shared bills → "they owe me" ----------
  // You front the whole bill and the other person pays their share by payment request, so
  // each month of shared bills is one reimbursable line: their share, with a status taken
  // from that month's request. Nothing is copied — it's all derived.
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

  // Have they paid? A payment-received date or a Paid/Complete status says yes; a sent
  // request (or "Awaiting Transfer") means we're waiting on him.
  function requestState(r) {
    const st = String(r.Status || "");
    if (r["Payment Received?"] || /^(paid|complete)$/i.test(st)) return "Paid";
    if (r["Request Sent?"] || /awaiting/i.test(st)) return "Submitted";
    return "Pending";
  }

  const longMonth = (d) => d.toLocaleDateString("en-US", { month: "long" });

  // One line per month of shared bills: what they owe you and where it stands.
  function apartmentOwedLines(aptRows, reqRows) {
    if (!cfg.sharedEnabled) return [];
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
      .months.filter((m) => m.key !== "—" && m.other > 0.005)
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
          amount: m.other,
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

  // ---------- trips / groups ----------
  // An expense can belong to one group (a trip, a client engagement, a batch you'll submit
  // together). Names are matched ignoring case and spacing, so "amarillo trip" and
  // "Amarillo trip " are the same group.
  const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const inGroup = (r, name) => !!String(r.Group || "").trim() && sameName(r.Group, name);

  // every group in use: the saved list (so an empty group survives) plus any named on an expense
  function groupNames(rows, saved) {
    const out = [];
    const add = (n) => {
      n = String(n || "").trim();
      if (n && !out.some((x) => sameName(x, n))) out.push(n);
    };
    (saved || []).forEach(add);
    (rows || []).forEach((r) => add(r.Group));
    return out;
  }

  // Display order: brand-new empty groups first (you're about to fill them), then the group
  // with the most recently bought expense.
  function orderGroups(rows, names) {
    const latest = (g) =>
      Math.max(0, ...rows.filter((r) => inGroup(r, g)).map((r) => (toDate(r["Date of Original Purchase"]) || 0) * 1));
    const empty = (g) => !rows.some((r) => inGroup(r, g));
    return names
      .map((g, i) => ({ g, i, e: empty(g), t: latest(g) }))
      .sort((a, b) => (b.e - a.e) || (a.e ? b.i - a.i : b.t - a.t))
      .map((x) => x.g);
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
    const total = { count: 0, total: 0, me: 0, other: 0 };
    for (const r of aptRows) {
      if (year != null && yearOf(r.Date) !== year) continue;
      const s = split(r.Item, r["Total Amount"]);
      const amt = Number(r["Total Amount"]) || 0;
      const key = r.Item || "(no item)";
      const o = map.get(key) || { item: key, count: 0, total: 0, me: 0, other: 0 };
      o.count++;
      o.total += amt;
      o.me += s.me;
      o.other += s.other;
      map.set(key, o);
      total.count++;
      total.total += amt;
      total.me += s.me;
      total.other += s.other;
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
  // still owed — expenses plus the other person's shared-bill months. Each bucket gets `fronted` and
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
    sum.cats.forEach((c) => finish(sum.byCat[c]));
    finish(sum.total);
    return sum;
  }

  // Totals per category and status — what's still owed to you. `aptLines` (optional) adds the
  // other person's shared-bill months under the shared category.
  function expenseSummary(rows, aptLines) {
    const empty = () => ({ Pending: 0, Submitted: 0, Paid: 0, count: 0 });
    const cats = categories(rows);
    const byCat = {};
    cats.forEach((c) => (byCat[c] = empty()));
    const canon = (name) => cats.find((c) => c.toLowerCase() === String(name || "").trim().toLowerCase());
    const bucket = (name) => {
      const c = canon(name) || "Other";
      if (!byCat[c]) {
        byCat[c] = empty();
        cats.push(c);
      }
      return byCat[c];
    };
    const total = empty();
    for (const r of rows) {
      const st = EXPENSE_STATUSES.includes(r.Status) ? r.Status : "Pending";
      const amt = Number(r.Amount) || 0;
      const b = bucket(r.Category);
      b[st] += amt;
      b.count++;
      total[st] += amt;
      total.count++;
    }
    for (const l of aptLines || []) {
      const b = bucket(sharedCategory());
      b[l.status] += l.amount;
      b.count++;
      total[l.status] += l.amount;
      total.count++;
    }
    const outstanding = (o) => o.Pending + o.Submitted;
    cats.forEach((c) => (byCat[c].outstanding = outstanding(byCat[c])));
    total.outstanding = outstanding(total);
    return { byCat, total, cats };
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
    EXPENSE_STATUSES,
    RULE_METHODS,
    blankSettings,
    normalizeSettings,
    setSettings,
    getSettings,
    legacySettings,
    meName,
    partnerName,
    sharedLabel,
    sharedCategory,
    ruleFor,
    itemLabel,
    ruleSummary,
    categories,
    normalizeExpense,
    normalizeRequest,
    applyStatusDates,
    apartmentOwedLines,
    settledRequest,
    catchUpRequests,
    requestState,
    sameName,
    inGroup,
    groupNames,
    orderGroups,
    summaryYears,
    apartmentByItem,
    recurringBreakdown,
    frontedSummary,
    expenseSummary,
    splitReceipts,
    joinReceipts,
  };
})();
