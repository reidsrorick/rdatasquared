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

  // ---------- people, settings and splits ----------
  // Nothing is built in. You add the people you share bills with or who pay you back, and each
  // bill chooses who it is split with and how. Anything not split is just yours.
  const SPLIT_METHODS = [
    { id: "equal", label: "Split equally", hint: "You and everyone you pick pay the same." },
    { id: "theirs", label: "They pay it all", hint: "Split equally among the people you pick; your share is $0." },
    { id: "percent", label: "By percent", unit: "%", per: true, hint: "Each person's percentage; you pay whatever is left." },
    { id: "fixed", label: "Fixed amounts", unit: "$", per: true, hint: "Each person pays a set amount; you pay whatever is left." },
    { id: "offset", label: "Equal, but I pay more or less", unit: "$", mine: true, hint: "Split equally, then you pay this much more (a minus means less) and the others pay less." },
    { id: "myfixed", label: "I pay a fixed amount", unit: "$", mine: true, hint: "You pay this amount each time; the others split the rest." },
  ];
  // kept so older data adds up exactly as it did; not offered for new splits
  const ALL_METHODS = [...SPLIT_METHODS, { id: "equalup", label: "Equal, each rounded up", hidden: true, hint: "" }];
  const methodId = (txt) => {
    const t = String(txt == null ? "" : txt).trim().toLowerCase();
    if (!t) return "equal";
    const m = ALL_METHODS.find((x) => x.id === t || x.label.toLowerCase() === t);
    return m ? m.id : "equal";
  };
  const methodInfo = (id) => ALL_METHODS.find((m) => m.id === id) || ALL_METHODS[0];

  const blankSettings = () => ({ setupDone: false, me: "" });
  function normalizeSettings(raw) {
    const o = blankSettings();
    if (!raw || typeof raw !== "object") return o;
    o.setupDone = !!raw.setupDone;
    o.me = String(raw.me == null ? "" : raw.me).trim();
    return o;
  }

  // what the splits need to know right now (set from the app's data before anything renders)
  const ctx = { me: "", setupDone: false, people: [], bills: [] };
  function useData(S) {
    ctx.me = (S.settings && S.settings.me) || "";
    ctx.setupDone = !!(S.settings && S.settings.setupDone);
    ctx.people = (S.rows && S.rows.people) || [];
    ctx.bills = (S.rows && S.rows.subscriptions) || [];
  }
  const meName = () => ctx.me || "You";
  const peopleNames = () => ctx.people.map((p) => String(p.Name || "").trim()).filter(Boolean);
  const personKind = (name) => {
    const k = String(name || "").trim().toLowerCase();
    const p = ctx.people.find((x) => String(x.Name || "").trim().toLowerCase() === k);
    return (p && p.Kind) || "";
  };

  const splitList = (v) =>
    String(v == null ? "" : v)
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean);

  // a bill's split, read from its Split With / Split Method / Split Values columns (null = not split)
  function splitDef(bill) {
    if (!bill) return null;
    const people = splitList(bill["Split With"]);
    if (!people.length) return null;
    const vals = splitList(bill["Split Values"]).map((x) => Number(x));
    return { method: methodId(bill["Split Method"]), people, values: people.map((_, i) => (isFinite(vals[i]) ? vals[i] : 0)) };
  }

  // how `total` divides between you and each person in the split
  function computeSplit(def, total) {
    total = Number(total) || 0;
    if (!def) return { me: total, other: 0, parts: [] };
    const P = def.people;
    const n = P.length;
    const v = def.values;
    let me;
    let amts;
    switch (def.method) {
      case "theirs":
        me = 0;
        amts = P.map(() => total / n);
        break;
      case "percent":
        amts = P.map((_, i) => (total * Math.min(100, Math.max(0, v[i] || 0))) / 100);
        me = Math.max(0, total - amts.reduce((a, b) => a + b, 0));
        break;
      case "fixed":
        amts = P.map((_, i) => Math.max(0, v[i] || 0));
        me = Math.max(0, total - amts.reduce((a, b) => a + b, 0));
        break;
      case "offset": {
        const base = total / (n + 1);
        me = base + (v[0] || 0);
        amts = P.map(() => base - (v[0] || 0) / n);
        break;
      }
      case "myfixed": {
        me = Math.min(total, Math.max(0, v[0] || 0));
        amts = P.map(() => (total - me) / n);
        break;
      }
      default: {
        // "equalup" (older data): with one other person, each pays the rounded-up half
        const each = def.method === "equalup" && n === 1 ? total - Math.floor(total / 2) : total / (n + 1);
        me = each;
        amts = P.map(() => each);
      }
    }
    const parts = P.map((person, i) => ({ person, amount: amts[i] }));
    return { me, other: parts.reduce((a, x) => a + x.amount, 0), parts };
  }

  const billFor = (item) => {
    const k = String(item || "").trim().toLowerCase();
    return k ? ctx.bills.find((b) => String(b.Item || "").trim().toLowerCase() === k) || null : null;
  };
  // how a logged payment of `item` divides (the item's bill decides; no bill or no split = all yours)
  const split = (item, total) => computeSplit(splitDef(billFor(item)), total);

  // one line saying how a bill is split, for lists
  function splitSummary(bill) {
    const d = splitDef(bill);
    if (!d) return "";
    const who = d.people.join(", ");
    const x = d.values[0] || 0;
    switch (d.method) {
      case "theirs":
        return `${who} pay${d.people.length === 1 ? "s" : ""} it all`;
      case "percent":
        return d.people.map((q, i) => `${q} ${d.values[i] || 0}%`).join(" · ");
      case "fixed":
        return d.people.map((q, i) => `${q} ${money(d.values[i] || 0)}`).join(" · ");
      case "offset":
        return `with ${who} · you pay ${money(Math.abs(x))} ${x >= 0 ? "more" : "less"}`;
      case "myfixed":
        return `with ${who} · you pay ${money(x)}`;
      default:
        return `with ${who} · equal`;
    }
  }

  // ---- older files: one partner, per-item rules, categories → people + per-bill splits ----
  // (the settings every file made before the People list was built on)
  function oldDefaults() {
    return {
      setupDone: true,
      me: "Reid",
      partner: "Luke",
      sharedEnabled: true,
      sharedLabel: "Apartment",
      categories: ["Friends/Family", "Work (internal)", "Client"],
      rules: [
        { item: "Rent", method: "offset", value: 75 },
        { item: "uelec", method: "equal", label: "Electric" },
        { item: "uwater", method: "equal", label: "Water" },
        { item: "ugarb", method: "equal", label: "Garbage" },
        { item: "Internet", method: "equal", up: true },
        { item: "Renter's Insurance", method: "mine", label: "Renter's insurance" },
      ],
    };
  }

  // Turn the old shape into the new one, in place, keeping every number the same:
  //  • the partner becomes a person; each rule becomes a split on a bill of that name
  //  • logged items with no rule were split 50/50, so they get an equal split too
  //  • each person who owed you on an expense becomes a person (their old category is their Kind)
  function migrateToPeople(rows, old) {
    old = old || {};
    const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    const people = rows.people;
    const addPerson = (name, kind) => {
      name = String(name || "").trim();
      if (!name) return;
      const hit = people.find((x) => eq(x.Name, name));
      if (!hit) people.push(kind ? { Name: name, Kind: String(kind) } : { Name: name });
      else if (kind && !hit.Kind) hit.Kind = String(kind);
    };
    const partner = String(old.partner || "").trim();
    const sharing = !!(old.sharedEnabled && partner);
    if (sharing) addPerson(partner, "Roommate");

    if (sharing) {
      const bills = rows.subscriptions;
      const unsplit = new Set(); // items that were "I pay all"
      const methodLabel = (id) => methodInfo(id).label;
      const apply = (name, item, def) => {
        let bill = bills.find((b) => eq(b.Item, name)) || bills.find((b) => eq(b.Item, item));
        if (!bill) {
          bill = {
            Item: name,
            Occurance: "Monthly",
            Category: "Bill",
            Active: false,
            Comments: "Made from your old split rules. Add an amount and turn it on if it repeats.",
          };
          bills.push(bill);
        }
        bill["Split With"] = partner;
        bill["Split Method"] = methodLabel(def.method);
        bill["Split Values"] = def.values == null ? "" : String(def.values);
        // a bill's amount is now the full amount (the recurring total counts only your share of it).
        // Older amounts were often just your portion, so use what was actually paid in full.
        const paid = rows.apartment
          .filter((r) => eq(r.Item, name))
          .sort((a, b) => (toDate(b.Date) || 0) - (toDate(a.Date) || 0))[0];
        if (paid && paid["Total Amount"] != null) bill.Amount = Number(paid["Total Amount"]);
      };
      for (const rule of old.rules || []) {
        const item = String(rule.item || "").trim();
        const name = String(rule.label || rule.item || "").trim();
        if (!item) continue;
        rows.apartment.forEach((r) => {
          if (eq(r.Item, item) && !eq(r.Item, name)) r.Item = name; // logged under the display name
        });
        const v = rule.value != null ? Number(rule.value) : 0;
        if (rule.method === "mine") unsplit.add(name.toLowerCase());
        else if (rule.method === "offset") apply(name, item, { method: "offset", values: v });
        else if (rule.method === "percent") apply(name, item, { method: "percent", values: 100 - v });
        else if (rule.method === "theirs") apply(name, item, { method: "theirs", values: null });
        else if (rule.method === "fixed") apply(name, item, { method: "myfixed", values: v });
        else apply(name, item, { method: rule.up ? "equalup" : "equal", values: null });
      }
      // logged items nobody wrote a rule for were split in half
      for (const r of rows.apartment) {
        const name = String(r.Item || "").trim();
        if (!name || unsplit.has(name.toLowerCase())) continue;
        const bill = bills.find((b) => eq(b.Item, name));
        if (!bill || !splitList(bill["Split With"]).length) apply(name, name, { method: "equal", values: null });
      }
      rows.requests.forEach((q) => {
        if (!q.Person) q.Person = partner;
      });
    }

    for (const r of rows.thirdparty) {
      const who = String(r["Owed By"] || r.Purpose || r.Category || "").trim();
      if (who && !String(r["Owed By"] || "").trim()) r["Owed By"] = who;
      addPerson(who, r.Category);
    }
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
      // me + others, which can run a few cents over when a split rounds each share up.
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
  // what a bill costs YOU per month: your share of its amount (all of it if the bill isn't split)
  const myMonthly = (bill) =>
    monthlyEquivalent(computeSplit(splitDef(bill), bill && bill.Amount).me, bill && bill.Occurance);

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
    // the log of what you actually paid: each entry is split by its bill's rule
    apartment: {
      file: "apartment",
      sheet: "Bill Log",
      altSheets: ["Shared Bills", "Data Entry"], // what earlier versions called it
      title: "Bill Log",
      // stored columns (written back to the sheet, in this order)
      columns: [
        { key: "Date", label: "Date", type: "date", required: true },
        { key: "Item", label: "Bill", type: "text", suggest: "bills", required: true },
        { key: "Total Amount", label: "Total Amount", type: "money", required: true },
      ],
      // derived columns shown in the grid and written to the workbook
      computed: [
        { key: "me", get label() { return "My share"; }, calc: (r) => split(r.Item, r["Total Amount"]).me, strong: true, persist: true },
        { key: "others", get label() { return "Others owe"; }, calc: (r) => split(r.Item, r["Total Amount"]).other, persist: true },
        { key: "who", label: "Who", text: true, calc: (r) => whoText(r) },
      ],
      sortBy: (a, b) => (toDate(b.Date) || 0) - (toDate(a.Date) || 0),
    },

    requests: {
      file: "apartment",
      sheet: "Requests",
      title: "Payment request",
      columns: [
        { key: "Title", label: "Title", type: "text", required: true },
        // which month's bills this request collects, and from whom (ties it to the Expense Tracker)
        { key: "Month", label: "Covers month", type: "date", month: true },
        { key: "Person", label: "From", type: "text", suggest: "people" },
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
      title: "Bills & Subscriptions",
      columns: [
        // `sub` fields are still stored and editable, but the table shows them as small lines
        // under the item name instead of giving each its own column (fewer, roomier columns)
        { key: "Item", label: "Item", type: "text", required: true },
        { key: "Description", label: "Description", type: "text", wide: true, sub: true },
        { key: "Amount", label: "Amount", type: "money", required: true },
        { key: "Start Date", label: "Start", type: "date", sub: "Since" },
        { key: "End Date", label: "End", type: "date", sub: "Ends" },
        { key: "Occurance", label: "Repeats", type: "select", options: ["Monthly", "Yearly", "Weekly", "Quarterly"] },
        { key: "Category", label: "Type", type: "select", options: ["Bill", "Subscription"] },
        { key: "Active", label: "Active", type: "bool" },
        { key: "Comments", label: "Comments", type: "text", wide: true, sub: true },
        // who this bill is split with and how (edited with the split editor in the form)
        { key: "Split With", label: "Split with", type: "text", split: true, hide: true, bulk: false },
        { key: "Split Method", label: "Split method", type: "text", split: true, hide: true, bulk: false },
        { key: "Split Values", label: "Split values", type: "text", split: true, hide: true, bulk: false },
      ],
      computed: [
        { key: "Split", label: "Split", text: true, calc: (r) => splitSummary(r) },
        {
          key: "PerMonth",
          label: "/mo",
          calc: (r) => (r.Active === false ? 0 : myMonthly(r)),
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
        // older versions grouped payers into categories; kept so those files still read, not shown
        { key: "Category", label: "Category", type: "text", noForm: true, hide: true, bulk: false },
        { key: "Owed By", label: "Who pays me back", type: "text", suggest: "people", required: true },
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

    // the people you share bills with or who pay you back (a roommate, a friend, an employer, a client…)
    people: {
      file: "people",
      sheet: "People",
      title: "People",
      columns: [
        { key: "Name", label: "Name", type: "text", required: true },
        { key: "Kind", label: "Kind", type: "text", suggest: "kinds" },
      ],
    },
  };

  // "Sam $425.00 · Casey $20.00" for one logged payment
  function whoText(r) {
    const s = split(r.Item, r["Total Amount"]);
    return s.parts
      .filter((x) => x.amount > 0.005)
      .map((x) => `${x.person} ${money(x.amount)}`)
      .join(" · ");
  }

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

  // One line per month and person: what they owe you from the bills you logged, and where it stands.
  function apartmentOwedLines(logRows, reqRows) {
    const rank = { Pending: 0, Submitted: 1, Paid: 2 };
    const reqs = (reqRows || []).map((r, idx) => ({ r, idx })).filter((q) => q.r.Month);
    const per = new Map();
    for (const row of logRows || []) {
      const mk = monthKey(row.Date);
      if (mk === "—") continue;
      const s = split(row.Item, row["Total Amount"]);
      for (const part of s.parts) {
        if (part.amount <= 0.005) continue;
        const key = `${mk}|${part.person.toLowerCase()}`;
        let l = per.get(key);
        if (!l) {
          const d = toDate(row.Date);
          l = { key, monthKey: mk, person: part.person, label: monthLabel(row.Date), date: new Date(d.getFullYear(), d.getMonth(), 1), amount: 0, count: 0 };
          per.set(key, l);
        }
        l.amount += part.amount;
        l.count++;
      }
    }
    return [...per.values()]
      .sort((a, b) => a.date - b.date || a.person.localeCompare(b.person))
      .map((l) => {
        let best = null;
        for (const q of reqs) {
          if (monthKey(q.r.Month) !== l.monthKey) continue;
          if (q.r.Person && !sameName(q.r.Person, l.person)) continue; // a request for someone else
          if (!best || rank[requestState(q.r)] > rank[requestState(best.r)]) best = q;
        }
        const req = best && best.r;
        return {
          ...l,
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
      Person: line.person,
      Description: "Marked settled (before tracking started)",
      Amount: round2(line.amount),
      Status: "Complete",
    };
  }

  // One-time catch-up: every month of bills before your first tracked request, with no
  // request of its own, was settled before you started tracking — mark those settled so
  // they don't show up as owed.
  function catchUpRequests(logRows, reqRows) {
    const keys = (reqRows || []).filter((r) => r.Month).map((r) => monthKey(r.Month)).sort();
    if (!keys.length) return [];
    const earliest = keys[0];
    return apartmentOwedLines(logRows, reqRows)
      .filter((l) => l.requestIndex == null && l.monthKey < earliest)
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
        const monthly = myMonthly(r);
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

  // who owes this expense (falls back to the old category, then "Other")
  const payerOf = (r) => String((r && r["Owed By"]) || "").trim() || String((r && r.Category) || "").trim() || "Other";

  // everyone who can owe you: the people you added, then anyone named on an expense or in `extra`
  function payers(rows, extra) {
    const out = [];
    const add = (n) => {
      n = String(n || "").trim();
      if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
    };
    peopleNames().forEach(add);
    (rows || []).forEach((r) => add(payerOf(r)));
    (extra || []).forEach(add);
    return out;
  }

  // Totals per person (`cats`, in the order above) and status — what's still owed to you.
  // `aptLines` (optional) adds each person's share of the bills you logged.
  function expenseSummary(rows, aptLines) {
    const empty = () => ({ Pending: 0, Submitted: 0, Paid: 0, count: 0 });
    const cats = payers(rows, (aptLines || []).map((l) => l.person));
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
      const b = bucket(payerOf(r));
      b[st] += amt;
      b.count++;
      total[st] += amt;
      total.count++;
    }
    for (const l of aptLines || []) {
      const b = bucket(l.person);
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
    myMonthly,
    schemas,
    EXPENSE_STATUSES,
    SPLIT_METHODS,
    methodId,
    methodInfo,
    blankSettings,
    normalizeSettings,
    useData,
    oldDefaults,
    migrateToPeople,
    meName,
    peopleNames,
    personKind,
    splitList,
    splitDef,
    computeSplit,
    billFor,
    splitSummary,
    payerOf,
    payers,
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
