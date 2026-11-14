/* ui.js — all DOM rendering. Exposed on window.BB.ui */
(function () {
  "use strict";
  const M = window.BB.model;
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (id) => document.getElementById(id);

  // Minimal line icons — they inherit the surrounding text color.
  const svg = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    dashboard: svg('<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>'),
    apartment: svg('<path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21"/><path d="M15 10h3.5a1.5 1.5 0 0 1 1.5 1.5V21"/><path d="M3 21h18"/><path d="M8 8h3M8 12h3M8 16h3"/>'),
    summary: svg('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
    subscriptions: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    expenses: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.1-5.1M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2M3 3l18 18"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    paperclip: svg('<path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>'),
  };

  const TABS = [
    { id: "dashboard", label: "Dashboard", ico: ICON.dashboard },
    { id: "apartment", label: "Apartment", schema: "apartment", ico: ICON.apartment },
    { id: "summary", label: "Summary", ico: ICON.summary },
    { id: "subscriptions", label: "Subscriptions & Bills", schema: "subscriptions", ico: ICON.subscriptions },
    { id: "thirdparty", label: "Expense Tracker", schema: "thirdparty", ico: ICON.expenses },
  ];

  const validTab = (id) => TABS.some((t) => t.id === id);

  function renderNav() {
    const nav = el("tabs");
    nav.innerHTML = TABS.map(
      (t) =>
        `<button class="tab${t.id === BB.state.activeTab ? " active" : ""}" data-tab="${t.id}" title="${esc(
          t.label
        )}"><span class="ico">${t.ico}</span><span class="tab-label">${esc(t.label)}</span></button>`
    ).join("");
    const active = TABS.find((t) => t.id === BB.state.activeTab);
    const title = el("pageTitle");
    if (title && active) title.textContent = active.label;
    nav.querySelectorAll(".tab").forEach((b) =>
      b.addEventListener("click", () => {
        BB.app.setTab(b.dataset.tab);
        document.getElementById("app").classList.remove("nav-open"); // close mobile drawer
      })
    );
  }

  function render() {
    renderNav();
    renderBars();
    const view = el("view");
    if (!BB.state.loaded) {
      view.innerHTML = `<div class="empty"><h2>Not connected</h2><p>Open your OneDrive <strong>Budgeting</strong> folder. Your data lives in <em>budget.json</em> there — if it isn't there yet, your existing <em>Apartment Breakdown.xlsx</em> and <em>Expenses.xlsx</em> are imported into it the first time.</p></div>`;
      return;
    }
    const tab = BB.state.activeTab;
    if (tab === "dashboard") renderDashboard(view);
    else if (tab === "apartment") renderApartment(view);
    else if (tab === "summary") renderSummaryView(view);
    else if (tab === "thirdparty") renderExpenses(view);
    else renderTableTab(view, tab);
    labelTables(view);
  }

  // Tag each table cell with its column's header text. Wide screens ignore it; on phones the
  // CSS turns every row into a small card and shows these as the labels ("Amount  $134.00").
  function labelTables(root) {
    root.querySelectorAll("table.grid, table.bulk-grid").forEach((t) => {
      // a header's title attribute, when it has one, is the longer name to show on a card ("#" → "Entries")
      const heads = [...t.querySelectorAll("thead th")].map(
        (th) => th.title || th.textContent.replace(/\s*\*\s*$/, "").trim()
      );
      t.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
        let col = 0;
        [...tr.children].forEach((td) => {
          td.setAttribute("data-label", heads[col] || "");
          col += td.colSpan || 1;
        });
      });
    });
  }

  // One-line status for a month of Luke's apartment share, taken from that month's request.
  function aptNote(l) {
    const inBank = l.transferredOn ? ` · in bank ${fmtShort(l.transferredOn)}` : "";
    if (l.status === "Paid")
      return (l.settledNote ? "settled (before tracking)" : l.paidOn ? `paid ${fmtShort(l.paidOn)}` : "paid") + inBank;
    if (l.status === "Submitted") return l.sentOn ? `request sent ${fmtShort(l.sentOn)}` : "request sent";
    return l.requestIndex != null ? "request drafted" : "no request yet";
  }

  // ---------------- dashboard ----------------
  function renderDashboard(view) {
    const S = BB.state.rows;
    const sum = M.summarize(S.apartment);
    const latest = sum.months[sum.months.length - 1];

    // what Luke still owes you (months of apartment bills not yet paid)
    const lines = M.apartmentOwedLines(S.apartment, S.requests);
    const lukeOpen = lines.filter((l) => l.status !== "Paid");
    const lukeOwes = lukeOpen.reduce((a, l) => a + l.amount, 0);

    const activeSubs = S.subscriptions.filter((r) => r.Active !== false);
    const monthlyRecurring = activeSubs.reduce(
      (a, r) => a + M.monthlyEquivalent(r.Amount, r.Occurance),
      0
    );
    const billsMo = activeSubs
      .filter((r) => /bill/i.test(r.Category || ""))
      .reduce((a, r) => a + M.monthlyEquivalent(r.Amount, r.Occurance), 0);
    const subsMo = monthlyRecurring - billsMo;

    const exp = M.expenseSummary(S.thirdparty, lines);

    const card = (label, value, sub, cls) =>
      `<div class="card ${cls || ""}"><div class="card-label">${esc(label)}</div><div class="card-value">${value}</div><div class="card-sub">${sub || ""}</div></div>`;

    view.innerHTML = `
      <div class="cards">
        ${card(
          latest ? `Apartment — ${esc(latest.label)}` : "Apartment",
          latest ? M.money(latest.total) : "—",
          latest ? `You ${M.money(latest.reid)} · Luke ${M.money(latest.luke)}` : "No entries",
          "accent"
        )}
        ${card(
          "Luke owes you",
          M.money(lukeOwes),
          lukeOpen.length === 0
            ? "all settled"
            : lukeOpen.length === 1
            ? `${esc(lukeOpen[0].label)} — ${esc(aptNote(lukeOpen[0]))}`
            : `${lukeOpen.length} months open`,
          lukeOpen.length ? "warn" : ""
        )}
        ${card(
          "Recurring / month",
          M.money(monthlyRecurring),
          `Bills ${M.money(billsMo)} · Subs ${M.money(subsMo)}`
        )}
        ${card(
          "Owed back to me",
          M.money(exp.total.outstanding),
          `Work ${M.money(exp.byCat["Work (internal)"].outstanding)} · Client ${M.money(
            exp.byCat["Client"].outstanding
          )} · Friends ${M.money(exp.byCat["Friends/Family"].outstanding)}`,
          exp.total.outstanding ? "warn" : ""
        )}
      </div>

      <div class="dash-grid">
        <div class="panel">
          <div class="panel-head"><h3>Monthly apartment split</h3></div>
          ${renderSummaryTable(sum)}
        </div>

        <div class="panel">
          <div class="panel-head"><h3>Active recurring</h3></div>
          ${renderMiniRecurring(activeSubs)}
        </div>
      </div>`;
  }

  function renderSummaryTable(sum) {
    if (!sum.months.length) return `<p class="muted">No apartment entries yet.</p>`;
    const rows = sum.months
      .map(
        (m) =>
          `<tr><td>${esc(m.label)}</td><td class="num strong">${M.money(m.reid)}</td><td class="num">${M.money(
            m.luke
          )}</td><td class="num">${M.money(m.total)}</td></tr>`
      )
      .join("");
    return `<div class="panel-scroll"><table class="grid summary"><thead><tr><th>Month</th><th class="num">Reid</th><th class="num">Luke</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Year total</td><td class="num strong">${M.money(sum.year.reid)}</td><td class="num">${M.money(
      sum.year.luke
    )}</td><td class="num">${M.money(sum.year.total)}</td></tr></tfoot></table></div>`;
  }

  // ---------------- Summary tab ----------------
  // The overall picture across everything you track. Dated data (apartment bills, expenses) is
  // scoped to a calendar year; "All time" shows everything. The month-by-month apartment table
  // lives on the Dashboard and Apartment tabs — this page is about the rest of the picture.
  const ITEM_LABEL = {
    Rent: "Rent",
    uelec: "Electric",
    uwater: "Water",
    ugarb: "Garbage",
    Internet: "Internet",
    "Renter's Insurance": "Renter's insurance",
  };
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

  let sumPeriod = "latest";
  try {
    const s = localStorage.getItem("bb.sumPeriod");
    if (s) sumPeriod = s;
  } catch {}
  function setSumPeriod(v) {
    sumPeriod = v;
    try {
      localStorage.setItem("bb.sumPeriod", v);
    } catch {}
    renderSummaryView(el("view"));
  }

  function renderSummaryView(view) {
    const S = BB.state.rows;
    const years = M.summaryYears(S);
    if (!years.length && !(S.subscriptions || []).length) {
      view.innerHTML = `<div class="empty"><h2>Nothing to summarize yet</h2><p>Add apartment bills, subscriptions or expenses and they'll roll up here.</p></div>`;
      return;
    }

    // the selected period; falls back to the newest year if the remembered one has no data
    let period = sumPeriod;
    if (period !== "all" && !years.includes(Number(period))) period = years.length ? String(years[0]) : "all";
    const year = period === "all" ? null : Number(period);
    const periodLabel = year == null ? "all time" : String(year);

    const aptIn = year == null ? S.apartment : S.apartment.filter((r) => M.toDate(r.Date) && M.toDate(r.Date).getFullYear() === year);
    const months = M.summarize(aptIn).months.length;
    const byItem = M.apartmentByItem(S.apartment, year);
    const rec = M.recurringBreakdown(S.subscriptions);
    const lines = M.apartmentOwedLines(S.apartment, S.requests);
    const fr = M.frontedSummary(S.thirdparty, lines, year);
    const T = fr.total;

    const card = (label, value, sub, cls) =>
      `<div class="card ${cls || ""}"><div class="card-label">${esc(label)}</div><div class="card-value">${M.money(
        value
      )}</div><div class="card-sub">${sub || ""}</div></div>`;

    const chips =
      years
        .map(
          (y) =>
            `<button class="chip${String(y) === period ? " on" : ""}" data-sumperiod="${y}">${y}</button>`
        )
        .join("") + `<button class="chip${period === "all" ? " on" : ""}" data-sumperiod="all">All time</button>`;

    // ---- where the apartment money goes ----
    const aptBody = byItem.items.length
      ? `<div class="panel-scroll"><table class="grid"><thead><tr><th>Bill</th><th class="num" title="Entries">#</th><th class="num">Total</th><th class="num">You</th><th class="num">Luke</th><th class="num" title="% of bills">%</th></tr></thead>
          <tbody>${byItem.items
            .map(
              (it) =>
                `<tr><td>${esc(ITEM_LABEL[it.item] || it.item)}</td><td class="num">${it.count}</td><td class="num">${M.money(
                  it.total
                )}</td><td class="num strong">${M.money(it.reid)}</td><td class="num">${M.money(it.luke)}</td><td class="num">${pct(
                  byItem.total.total ? it.total / byItem.total.total : null
                )}</td></tr>`
            )
            .join("")}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${byItem.total.count}</td><td class="num">${M.money(
            byItem.total.total
          )}</td><td class="num strong">${M.money(byItem.total.reid)}</td><td class="num">${M.money(byItem.total.luke)}</td><td class="num">100%</td></tr></tfoot></table></div>`
      : `<p class="muted rc-empty">${year == null ? "No apartment bills yet." : `No apartment bills in ${year}.`}</p>`;

    // ---- recurring costs (active now) ----
    const recBody = rec.items.length
      ? `<div class="panel-scroll"><table class="grid"><thead><tr><th>Item</th><th>Type</th><th>Cycle</th><th class="num">/ month</th><th class="num">/ year</th></tr></thead>
          <tbody>${rec.items
            .map(
              (i) =>
                `<tr><td>${esc(i.item)}</td><td><span class="pill ${/bill/i.test(i.category) ? "pill-bill" : "pill-sub"}">${esc(
                  i.category
                )}</span></td><td>${esc(i.cycle)}</td><td class="num">${M.money(i.monthly)}</td><td class="num strong">${M.money(
                  i.yearly
                )}</td></tr>`
            )
            .join("")}</tbody>
          <tfoot><tr><td colspan="3">Total</td><td class="num">${M.money(rec.monthly)}</td><td class="num strong">${M.money(
            rec.yearly
          )}</td></tr></tfoot></table></div>
          <p class="muted rc-note-line">Your rent, internet and renter's insurance also appear in the apartment numbers — don't add the two together.</p>`
      : `<p class="muted rc-empty">No active subscriptions or bills.</p>`;

    // ---- fronted for others, and how much has come back ----
    const frRows = M.EXPENSE_CATEGORIES.map((c) => {
      const b = fr.byCat[c];
      return `<tr><td><span class="pill ${CAT_CLASS[c]}">${esc(c)}</span></td><td class="num">${M.money(b.fronted)}</td><td class="num">${M.money(
        b.Paid
      )}</td><td class="num strong">${M.money(b.outstanding)}</td><td class="num">${pct(b.recovered)}</td></tr>`;
    }).join("");
    const frBody =
      T.count > 0
        ? `<div class="panel-scroll"><table class="grid"><thead><tr><th>Who pays me back</th><th class="num">Fronted</th><th class="num">Paid back</th><th class="num">Still owed</th><th class="num">Recovered</th></tr></thead>
            <tbody>${frRows}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${M.money(T.fronted)}</td><td class="num">${M.money(T.Paid)}</td><td class="num strong">${M.money(
                T.outstanding
              )}</td><td class="num">${pct(T.recovered)}</td></tr></tfoot></table></div>
            <p class="muted rc-note-line">Includes Luke's share of the apartment each month. Expenses count in the year they were bought.</p>`
        : `<p class="muted rc-empty">${year == null ? "Nothing fronted for others yet." : `Nothing fronted for others in ${year}.`}</p>`;

    view.innerHTML = `
      <div class="sum-toolbar"><span class="muted">Showing</span><div class="chips" aria-label="Period">${chips}</div></div>

      <div class="cards">
        ${card(
          `Apartment — your share`,
          byItem.total.reid,
          months
            ? `${M.money(byItem.total.reid / months)}/mo avg · Luke ${M.money(byItem.total.luke)} · ${months} month${months > 1 ? "s" : ""}`
            : year == null ? "no bills yet" : `no bills in ${year}`,
          "accent"
        )}
        ${card("Recurring / month", rec.monthly, `${M.money(rec.yearly)}/yr · bills ${M.money(rec.bills)} · subs ${M.money(rec.subs)}`, "")}
        ${card("Fronted for others", T.fronted, `${M.money(T.Paid)} paid back`, "")}
        ${card(
          "Still owed to you",
          T.outstanding,
          T.fronted > 0.005 ? `${pct(T.recovered)} recovered` : "nothing fronted",
          T.outstanding > 0.005 ? "warn" : ""
        )}
      </div>

      <div class="dash-grid">
        <div class="panel">
          <div class="panel-head"><h3>Where the apartment money goes · ${esc(periodLabel)}</h3></div>
          ${aptBody}
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Recurring costs · active now</h3></div>
          ${recBody}
        </div>
      </div>

      <div class="panel narrow">
        <div class="panel-head"><h3>Fronted for others · ${esc(periodLabel)}</h3></div>
        ${frBody}
      </div>`;

    labelTables(view);
    view.querySelectorAll("[data-sumperiod]").forEach((b) =>
      b.addEventListener("click", () => setSumPeriod(b.dataset.sumperiod))
    );
  }

  // ---------------- Expense Tracker tab ----------------
  // Things you paid for that someone else owes you back: friends/family, your employer
  // (internal expense reports), or a client. Receipts attach to the expense they belong to.
  const CAT_CLASS = { "Friends/Family": "pill-fam", "Work (internal)": "pill-work", Client: "pill-client" };
  const STATUS_CLASS = { Pending: "st-pending", Submitted: "st-submitted", Paid: "st-paid" };
  const STATUS_RANK = { Pending: 0, Submitted: 1, Paid: 2 };

  let expFilter = { cat: "all", status: "open" };
  try {
    const s = JSON.parse(localStorage.getItem("bb.expFilter"));
    const catOk = s && (s.cat === "all" || M.EXPENSE_CATEGORIES.includes(s.cat));
    const stOk = s && ["open", "all", ...M.EXPENSE_STATUSES].includes(s.status);
    if (catOk && stOk) expFilter = { cat: s.cat, status: s.status };
  } catch {}

  function setExpFilter(patch) {
    expFilter = { ...expFilter, ...patch };
    try {
      localStorage.setItem("bb.expFilter", JSON.stringify(expFilter));
    } catch {}
    renderExpenses(el("view"));
  }

  const fmtShort = (v) => {
    const d = M.toDate(v);
    return d ? `${d.getMonth() + 1}/${d.getDate()}` : "";
  };

  function renderExpenses(view) {
    const rows = BB.state.rows.thirdparty || [];
    // Luke's share of each month of apartment bills, derived from Apartment + Requests
    const lines = M.apartmentOwedLines(BB.state.rows.apartment || [], BB.state.rows.requests || []);
    const sum = M.expenseSummary(rows, lines);
    const T = sum.total;
    // one list for everything owed to you: stored expenses + the derived apartment months
    const items = [
      ...rows.map((r, i) => ({
        kind: "expense", i, r,
        cat: r.Category, status: r.Status, amount: Number(r.Amount) || 0,
        date: M.toDate(r["Date of Original Purchase"]),
      })),
      ...lines.map((l) => ({ kind: "apt", l, cat: "Friends/Family", status: l.status, amount: l.amount, date: l.date })),
    ];
    const countOf = (st) => items.filter((it) => it.status === st).length;

    const card = (label, value, sub, cls) =>
      `<div class="card ${cls || ""}"><div class="card-label">${esc(label)}</div><div class="card-value">${M.money(
        value
      )}</div><div class="card-sub">${sub}</div></div>`;

    const breakdown = M.EXPENSE_CATEGORIES.map((c) => {
      const b = sum.byCat[c];
      return `<tr><td><span class="pill ${CAT_CLASS[c]}">${esc(c)}</span></td><td class="num">${M.money(
        b.Pending
      )}</td><td class="num">${M.money(b.Submitted)}</td><td class="num">${M.money(
        b.Paid
      )}</td><td class="num strong">${M.money(b.outstanding)}</td></tr>`;
    }).join("");

    // ---- filtered ledger ----
    const catOk = (it) => expFilter.cat === "all" || it.cat === expFilter.cat;
    const stOk = (it) =>
      expFilter.status === "all" ? true : expFilter.status === "open" ? it.status !== "Paid" : it.status === expFilter.status;
    const visible = items
      .filter((it) => catOk(it) && stOk(it))
      .sort((a, b) => (STATUS_RANK[a.status] || 0) - (STATUS_RANK[b.status] || 0) || (b.date || 0) - (a.date || 0));
    const visibleTotal = visible.reduce((a, it) => a + it.amount, 0);

    const chip = (group, value, label, count) =>
      `<button class="chip${expFilter[group] === value ? " on" : ""}" data-chip="${group}" data-value="${esc(value)}">${esc(
        label
      )}${count != null ? ` <span class="chip-n">${count}</span>` : ""}</button>`;
    const catChips =
      chip("cat", "all", "All", items.length) +
      M.EXPENSE_CATEGORIES.map((c) => chip("cat", c, c, sum.byCat[c].count)).join("");
    const stChips =
      chip("status", "open", "Still owed", countOf("Pending") + countOf("Submitted")) +
      M.EXPENSE_STATUSES.map((s) => chip("status", s, s, countOf(s))).join("") +
      chip("status", "all", "Everything");

    const statusSelect = (r, i) =>
      `<select class="status-sel ${STATUS_CLASS[r.Status] || ""}" data-status="${i}" aria-label="Status">${M.EXPENSE_STATUSES.map(
        (s) => `<option${r.Status === s ? " selected" : ""}>${s}</option>`
      ).join("")}</select>`;

    const statusNote = (r) =>
      r.Status === "Paid" && r["Date Paid"]
        ? `paid ${esc(fmtShort(r["Date Paid"]))}`
        : r.Status === "Submitted" && r["Date Submitted"]
        ? `sent ${esc(fmtShort(r["Date Submitted"]))}`
        : "";

    // A month of apartment bills: Luke's share. Its status comes from that month's Venmo
    // request, so the actions below create, update, edit or remove that request.
    const aptRow = (l) => {
      const longName = l.date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const note = aptNote(l);
      const differs =
        l.requestAmount != null && Math.abs(l.requestAmount - l.amount) > 0.01
          ? ` · request was ${M.money(l.requestAmount)}`
          : "";
      const actions =
        l.status === "Paid"
          ? ""
          : (l.requestIndex != null
              ? `<button class="btn sm" data-aptpaid="${esc(l.key)}" title="Luke paid this request">Mark paid</button>`
              : `<button class="btn sm" data-aptreq="${esc(l.key)}" title="Create the Venmo request for this month">Request…</button> <button class="btn ghost sm" data-aptsettle="${esc(
                  l.key
                )}" title="Already settled — no request needed">Settled</button>`);
      const edit =
        l.requestIndex != null
          ? `<button class="icon" data-aptedit="${l.requestIndex}" title="Edit the request (dates, status, bank transfer)">✎</button><button class="icon danger" data-aptdel="${l.requestIndex}" title="Remove this request — the month goes back to unrequested">✕</button>`
          : "";
      return `<tr class="apt-line">
        <td class="nw">${esc(l.label)}</td>
        <td class="ex-what"><div class="ex-title">Apartment — ${esc(longName)}</div><div class="ex-desc">Luke's share of ${l.count} bill${
        l.count === 1 ? "" : "s"
      }${esc(differs)}</div><div class="ex-meta"><span class="pill ${CAT_CLASS["Friends/Family"]}">Friends/Family</span><span>Luke</span></div></td>
        <td class="num strong">${M.money(l.amount)}</td>
        <td class="ex-status"><span class="status-pill ${STATUS_CLASS[l.status]}">${esc(l.status)}</span><div class="ex-note">${esc(note)}</div></td>
        <td class="muted" title="Receipts for the bills themselves go on the Apartment tab">—</td>
        <td class="act apt-actions">${actions} ${edit}</td>
      </tr>`;
    };

    const body = visible.length
      ? visible
          .map((it) => {
            if (it.kind === "apt") return aptRow(it.l);
            const { r, i } = it;
            const n = M.splitReceipts(r.Receipt).length;
            return `<tr>
              <td class="nw">${esc(M.fmtDate(r["Date of Original Purchase"]))}</td>
              <td class="ex-what"><div class="ex-title">${esc(r.Activity)}</div>${
                r.Description ? `<div class="ex-desc">${esc(r.Description)}</div>` : ""
              }<div class="ex-meta"><span class="pill ${CAT_CLASS[r.Category] || ""}">${esc(r.Category || "")}</span>${
                r["Owed By"] ? `<span>${esc(r["Owed By"])}</span>` : ""
              }</div></td>
              <td class="num strong">${M.money(r.Amount)}</td>
              <td class="ex-status">${statusSelect(r, i)}<div class="ex-note">${statusNote(r)}</div></td>
              <td><button class="rc-btn${n ? " has" : ""}" data-receipts="${i}" title="${
                n ? "View / add receipts" : "Attach a receipt"
              }">${ICON.paperclip}${n ? n : "Add"}</button></td>
              <td class="act"><button class="icon" data-edit="${i}" title="Edit">✎</button><button class="icon danger" data-del="${i}" title="Delete">✕</button></td>
            </tr>`;
          })
          .join("")
      : `<tr><td class="muted" colspan="6">${
          items.length ? "Nothing matches these filters." : "No expenses yet — click “Add expense”."
        }</td></tr>`;

    view.innerHTML = `
      <div class="cards">
        ${card("Still owed to me", T.outstanding, `${countOf("Pending") + countOf("Submitted")} expenses open`, T.outstanding ? "accent" : "")}
        ${card("Not requested yet", T.Pending, `${countOf("Pending")} pending`, T.Pending ? "warn" : "")}
        ${card("Awaiting payment", T.Submitted, `${countOf("Submitted")} submitted`, "")}
        ${card("Paid back", T.Paid, `${countOf("Paid")} reimbursed`, "")}
      </div>

      <div class="panel narrow">
        <div class="panel-head"><h3>Who owes me</h3></div>
        <div class="panel-scroll"><table class="grid"><thead><tr><th>Who pays me back</th><th class="num">Pending</th><th class="num">Submitted</th><th class="num">Paid</th><th class="num">Still owed</th></tr></thead>
          <tbody>${breakdown}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${M.money(T.Pending)}</td><td class="num">${M.money(
      T.Submitted
    )}</td><td class="num">${M.money(T.Paid)}</td><td class="num strong">${M.money(T.outstanding)}</td></tr></tfoot></table></div>
      </div>

      <div class="panel">
        <div class="panel-head row">
          <h3>Expenses</h3>
          <span class="head-actions">
            <button class="btn" data-bulk="thirdparty">Bulk add</button>
            <button class="btn primary" data-add="thirdparty">+ Add expense</button>
          </span>
        </div>
        <div class="filters">
          <div class="chips" aria-label="Filter by who pays">${catChips}</div>
          <div class="chips" aria-label="Filter by status">${stChips}</div>
        </div>
        <div class="table-wrap flat">
          <table class="grid expenses" data-table="thirdparty">
            <thead><tr><th>Purchased</th><th>What</th><th class="num">Amount</th><th>Status</th><th>Receipts</th><th class="act"></th></tr></thead>
            <tbody>${body}</tbody>
            ${
              visible.length
                ? `<tfoot><tr><td colspan="2">Showing ${visible.length} of ${items.length}</td><td class="num strong">${M.money(
                    visibleTotal
                  )}</td><td colspan="3"></td></tr></tfoot>`
                : ""
            }
          </table>
        </div>
      </div>`;

    labelTables(view);
    wireTable("thirdparty");
    view.querySelectorAll("[data-chip]").forEach((b) =>
      b.addEventListener("click", () => setExpFilter({ [b.dataset.chip]: b.dataset.value }))
    );
    view.querySelectorAll("[data-status]").forEach((s) =>
      s.addEventListener("change", () => BB.app.setExpenseStatus(Number(s.dataset.status), s.value))
    );
    view.querySelectorAll("[data-receipts]").forEach((b) =>
      b.addEventListener("click", () => openReceiptModal(Number(b.dataset.receipts)))
    );

    // apartment-month actions
    const lineByKey = (k) => lines.find((l) => l.key === k);
    view.querySelectorAll("[data-aptreq]").forEach((b) =>
      b.addEventListener("click", () => {
        const l = lineByKey(b.dataset.aptreq);
        if (!l) return;
        // open the Requests form pre-filled for this month
        openForm("requests", null, {
          Title: `${l.date.toLocaleDateString("en-US", { month: "long" })} ${l.date.getFullYear()} Bills`,
          Month: l.date,
          Description: `Venmo request for ${l.label} apartment bills`,
          Amount: M.round2(l.amount),
          Status: "Draft",
        });
      })
    );
    view.querySelectorAll("[data-aptsettle]").forEach((b) =>
      b.addEventListener("click", () => BB.app.settleMonth(b.dataset.aptsettle))
    );
    view.querySelectorAll("[data-aptpaid]").forEach((b) =>
      b.addEventListener("click", () => BB.app.markMonthPaid(b.dataset.aptpaid))
    );
    view.querySelectorAll("[data-aptedit]").forEach((b) =>
      b.addEventListener("click", () => openForm("requests", Number(b.dataset.aptedit)))
    );
    view.querySelectorAll("[data-aptdel]").forEach((b) =>
      b.addEventListener("click", () => BB.app.deleteRow("requests", Number(b.dataset.aptdel)))
    );
  }

  // ---- receipts attached to one expense ----
  function openReceiptModal(index) {
    const row = BB.state.rows.thirdparty[index];
    if (!row) return;
    const can = BB.store.canReceipts();
    const host = el("modal");
    host.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card rc-card" id="rcCard" data-index="${index}">
        <h3>Receipts — ${esc(row.Activity || "expense")}</h3>
        <p class="muted rc-sub">${esc(M.fmtDate(row["Date of Original Purchase"]))}${
          row.Amount != null ? " · " + M.money(row.Amount) : ""
        }${row["Owed By"] ? " · " + esc(row["Owed By"]) : ""}</p>
        <div id="rcFiles" class="rc-files"></div>
        <div class="rc-drop" id="rcDrop">${
          can
            ? "Drop files here, or use the button below."
            : "Connect your budget folder (Chrome / Edge) to attach receipts."
        }</div>
        <input type="file" id="rcInput" multiple accept="image/*,application/pdf" hidden />
        <div class="modal-actions">
          <span class="muted rc-note">Saved to <b>Receipts/</b> as <code>date_what_filename</code></span>
          <span class="spacer"></span>
          <button type="button" class="btn primary" id="rcAdd"${can ? "" : " disabled"}>+ Add receipt(s)…</button>
          <button type="button" class="btn" id="rcClose">Done</button>
        </div>
      </div>`;
    host.classList.add("open");
    const close = () => {
      host.classList.remove("open");
      host.innerHTML = "";
    };
    host.querySelector(".modal-backdrop").addEventListener("click", close);
    el("rcClose").addEventListener("click", close);
    el("rcAdd").addEventListener("click", () => el("rcInput").click());
    el("rcInput").addEventListener("change", (e) => {
      if (e.target.files.length) BB.app.attachReceipts(index, e.target.files);
      e.target.value = "";
    });
    const card = el("rcCard");
    ["dragover", "dragenter"].forEach((ev) =>
      card.addEventListener(ev, (e) => {
        e.preventDefault();
        card.classList.add("dragging");
      })
    );
    ["dragleave", "drop"].forEach((ev) => card.addEventListener(ev, () => card.classList.remove("dragging")));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      if (can && e.dataTransfer && e.dataTransfer.files.length) BB.app.attachReceipts(index, e.dataTransfer.files);
    });
    fillReceiptFiles(index);
  }

  function fillReceiptFiles(index) {
    const row = BB.state.rows.thirdparty[index];
    const box = el("rcFiles");
    if (!row || !box) return;
    const names = M.splitReceipts(row.Receipt);
    box.innerHTML = names.length
      ? names
          .map(
            (n, k) =>
              `<div class="receipt-item"><span class="rc-ico">${
                /\.pdf$/i.test(n) ? "PDF" : "IMG"
              }</span><span class="rc-name">${esc(n)}</span><button type="button" class="btn ghost sm" data-ropen="${k}">Open</button><button type="button" class="icon danger" data-runlink="${k}" title="Unlink from this expense (keeps the file)">✕</button></div>`
          )
          .join("")
      : `<p class="muted rc-empty">No receipts attached yet.</p>`;
    box.querySelectorAll("[data-ropen]").forEach((b) =>
      b.addEventListener("click", () => BB.app.openReceiptByName(names[Number(b.dataset.ropen)]))
    );
    box.querySelectorAll("[data-runlink]").forEach((b) =>
      b.addEventListener("click", () => BB.app.unlinkReceipt(index, names[Number(b.dataset.runlink)]))
    );
  }

  // called after attach/unlink so an open dialog shows the new list
  function refreshReceiptModal(index) {
    const card = el("rcCard");
    if (card && Number(card.dataset.index) === index) fillReceiptFiles(index);
  }

  function renderMiniRecurring(subs) {
    if (!subs.length) return `<p class="muted">No active items.</p>`;
    const rows = subs
      .slice()
      .sort((a, b) => M.monthlyEquivalent(b.Amount, b.Occurance) - M.monthlyEquivalent(a.Amount, a.Occurance))
      .map(
        (r) =>
          `<tr><td>${esc(r.Item)}</td><td><span class="pill ${/bill/i.test(r.Category || "") ? "pill-bill" : "pill-sub"}">${esc(
            r.Category || ""
          )}</span></td><td>${esc(r.Occurance || "")}</td><td class="num">${M.money(r.Amount)}</td><td class="num strong">${M.money(
            M.monthlyEquivalent(r.Amount, r.Occurance)
          )}</td></tr>`
      )
      .join("");
    return `<div class="panel-scroll"><table class="grid"><thead><tr><th>Item</th><th>Type</th><th>Cycle</th><th class="num">Amount</th><th class="num">/mo</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------------- apartment tab (table + summary + links) ----------------
  function renderApartment(view) {
    view.innerHTML = `
      <div class="two-col">
        <div>${tableBlock("apartment")}</div>
        <aside class="side">
          <div class="panel">
            <div class="panel-head"><h3>Monthly summary</h3></div>
            ${renderSummaryTable(M.summarize(BB.state.rows.apartment))}
          </div>
          <div class="panel">
            <div class="panel-head"><h3>Biller portals</h3></div>
            ${renderLinks()}
          </div>
          <div class="panel note">
            <strong>Split rules</strong>
            <ul>
              <li><b>Rent:</b> you +$75, Luke −$75</li>
              <li><b>Renter's Insurance:</b> you pay 100%</li>
              <li>Everything else: 50 / 50</li>
            </ul>
          </div>
        </aside>
      </div>`;
    wireTable("apartment");
  }

  function renderLinks() {
    const links = BB.state.links || [];
    if (!links.length) return `<p class="muted">No links found.</p>`;
    return (
      `<ul class="links">` +
      links
        .map(
          (l) =>
            `<li><a href="${esc(l.Link)}" target="_blank" rel="noopener">${esc(l.Place || l.Link)}</a><span>${esc(
              l.Purpose || ""
            )}</span></li>`
        )
        .join("") +
      `</ul>`
    );
  }

  // ---------------- generic table tab ----------------
  function renderTableTab(view, schemaName) {
    view.innerHTML = tableBlock(schemaName);
    wireTable(schemaName);
  }

  function tableBlock(schemaName) {
    const schema = M.schemas[schemaName];
    const rows = BB.state.rows[schemaName] || [];
    const allCols = [...schema.columns, ...(schema.computed || [])];
    // `sub` columns don't get their own column; they show as small lines under the first one
    const cols = allCols.filter((c) => !c.sub);
    const subCols = allCols.filter((c) => c.sub);

    let ordered = rows.map((r, i) => ({ r, i }));
    if (schema.sortBy) ordered.sort((a, b) => schema.sortBy(a.r, b.r));

    // small muted lines under the first cell: description, "Since … · Ends …", comments
    const subLines = (r) => {
      const lines = [];
      let dates = [];
      const flush = () => {
        if (dates.length) lines.push(dates.join(" · "));
        dates = [];
      };
      for (const c of subCols) {
        const v = r[c.key];
        if (v == null || v === "") continue;
        if (c.type === "date") dates.push((typeof c.sub === "string" ? c.sub + " " : "") + M.fmtDate(v));
        else {
          flush();
          lines.push(String(v));
        }
      }
      flush();
      return lines.map((t) => `<div class="ex-desc">${esc(t)}</div>`).join("");
    };

    const head =
      cols.map((c) => `<th class="${cellClass(c)}">${esc(c.label)}</th>`).join("") +
      `<th class="act"></th>`;

    const body = ordered.length
      ? ordered
          .map(
            ({ r, i }) =>
              `<tr>` +
              cols
                .map((c, k) => `<td class="${cellClass(c)}">${renderCell(r, c)}${k === 0 ? subLines(r) : ""}</td>`)
                .join("") +
              `<td class="act"><button class="icon" data-edit="${i}" title="Edit">✎</button><button class="icon danger" data-del="${i}" title="Delete">✕</button></td>` +
              `</tr>`
          )
          .join("")
      : `<tr><td class="muted" colspan="${cols.length + 1}">No rows yet — click “Add”.</td></tr>`;

    return `
      <div class="panel-head row">
        <h3>${esc(schema.title)}</h3>
        <span class="head-actions">
          <button class="btn" data-bulk="${schemaName}">Bulk add</button>
          <button class="btn primary" data-add="${schemaName}">+ Add</button>
        </span>
      </div>
      <div class="table-wrap">
        <table class="grid" data-table="${schemaName}">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function cellClass(c) {
    if (c.type === "money" || c.key === "50/50" || c.key === "Reid" || c.key === "Luke" || c.key === "PerMonth")
      return "num" + (c.strong ? " strong" : "");
    if (c.wide) return "wide";
    if (c.type === "date" || c.type === "bool") return "nw"; // dates and ticks never break across lines
    return "";
  }

  function renderCell(r, c) {
    if (c.calc) {
      const v = c.calc(r);
      return c.key === "PerMonth" ? M.money(v) : M.money(v);
    }
    const v = r[c.key];
    if (c.type === "date") return c.month ? (v ? esc(M.monthLabel(v)) : "") : esc(M.fmtDate(v));
    if (c.type === "money") return M.money(v);
    if (c.type === "bool") return v === false ? "—" : v ? "✓" : "—";
    if (c.type === "select" && c.key === "Status") {
      const paid = /paid|complete/i.test(v || "");
      return `<span class="pill ${paid ? "pill-ok" : "pill-wait"}">${esc(v || "")}</span>`;
    }
    return esc(v);
  }

  function wireTable(schemaName) {
    const root = el("view");
    root.querySelectorAll("[data-add]").forEach((b) =>
      b.addEventListener("click", () => openForm(b.dataset.add, null))
    );
    root.querySelectorAll("[data-bulk]").forEach((b) =>
      b.addEventListener("click", () => openBulk(b.dataset.bulk))
    );
    const t = root.querySelector(`[data-table="${schemaName}"]`);
    if (!t) return;
    t.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => openForm(schemaName, Number(b.dataset.edit)))
    );
    t.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => BB.app.deleteRow(schemaName, Number(b.dataset.del)))
    );
  }

  // ---------------- add / edit modal ----------------
  // `prefill` (optional) seeds a NEW row, e.g. a Venmo request pre-filled for a month
  function openForm(schemaName, index, prefill) {
    const schema = M.schemas[schemaName];
    const editing = index != null;
    const row = editing
      ? BB.state.rows[schemaName][index]
      : prefill
      ? { ...prefill }
      : schemaName === "thirdparty"
      ? { Status: "Pending" }
      : {};
    // columns managed elsewhere (e.g. attached receipts) stay out of the form
    const formCols = schema.columns.filter((c) => !c.noForm);

    const fields = formCols
      .map((c) => {
        const v = row[c.key];
        let input = "";
        if (c.type === "select") {
          const opts = (c.options || [])
            .map((o) => `<option${String(v) === String(o) ? " selected" : ""}>${esc(o)}</option>`)
            .join("");
          input = `<select name="${esc(c.key)}"><option value=""></option>${opts}</select>`;
        } else if (c.type === "bool") {
          input = `<label class="chk"><input type="checkbox" name="${esc(c.key)}" ${
            v === false ? "" : v ? "checked" : "checked"
          }> active</label>`;
        } else if (c.type === "date" && c.month) {
          // a whole month (stored as the 1st) — e.g. which month's bills a request covers
          input = `<input type="month" name="${esc(c.key)}" value="${esc(M.dateInputValue(v).slice(0, 7))}">`;
        } else if (c.type === "date") {
          input = `<input type="date" name="${esc(c.key)}" value="${esc(M.dateInputValue(v))}">`;
        } else if (c.type === "money" || c.type === "number") {
          input = `<input type="number" step="0.01" name="${esc(c.key)}" value="${v == null ? "" : esc(v)}">`;
        } else {
          input = `<input type="text" name="${esc(c.key)}" value="${v == null ? "" : esc(v)}"${
            c.wide ? ' class="wide"' : ""
          }>`;
        }
        return `<label class="field ${c.wide ? "wide" : ""}"><span>${esc(c.label)}${
          c.required ? ' <i class="req">*</i>' : ""
        }</span>${input}</label>`;
      })
      .join("");

    // expenses can take receipts right in the form; they're saved with the expense
    let receiptField = "";
    if (schemaName === "thirdparty") {
      const can = BB.store.canReceipts();
      const have = editing ? M.splitReceipts(row.Receipt).length : 0;
      receiptField = `<label class="field wide"><span>Receipts${
        have ? ` <em class="muted">(${have} already attached — manage them with the paperclip on the row)</em>` : ""
      }</span>
        <input type="file" name="__receipts" multiple accept="image/*,application/pdf"${can ? "" : " disabled"} />
        <small class="field-hint">${
          can
            ? "Optional. Choose one or more images / PDFs — they're saved to your Receipts folder and linked to this expense."
            : "Connect your budget folder (Chrome / Edge) to attach receipts."
        }</small></label>`;
    }

    const host = el("modal");
    host.innerHTML = `
      <div class="modal-backdrop"></div>
      <form class="modal-card" id="rowForm">
        <h3>${editing ? "Edit" : "Add"} — ${esc(schema.title)}</h3>
        <div class="form-grid">${fields}${receiptField}</div>
        <div class="modal-actions">
          <button type="button" class="btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="btn primary">${editing ? "Save" : "Add"}</button>
        </div>
      </form>`;
    host.classList.add("open");

    const close = () => {
      host.classList.remove("open");
      host.innerHTML = "";
    };
    host.querySelector(".modal-backdrop").addEventListener("click", close);
    el("cancelBtn").addEventListener("click", close);
    el("rowForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const out = editing ? { ...row } : {};
      for (const c of formCols) {
        if (c.type === "bool") out[c.key] = fd.get(c.key) != null;
        else if (c.type === "date") {
          const val = fd.get(c.key);
          out[c.key] = !val ? null : c.month ? new Date(+val.slice(0, 4), +val.slice(5, 7) - 1, 1) : new Date(val + "T00:00:00");
        } else if (c.type === "money" || c.type === "number") {
          const val = fd.get(c.key);
          out[c.key] = val === "" ? null : Number(val);
        } else {
          const val = (fd.get(c.key) || "").trim();
          out[c.key] = val || null;
        }
      }
      const missing = schema.columns.filter((c) => c.required && (out[c.key] == null || out[c.key] === ""));
      if (missing.length) {
        toast("Missing: " + missing.map((m) => m.label).join(", "), "warn");
        return;
      }
      // grab any chosen receipt files before the form is torn down
      const picker = e.target.querySelector('[name="__receipts"]');
      const files = picker && picker.files ? Array.from(picker.files) : [];
      BB.app.commitRow(schemaName, index, out);
      const savedIndex = index != null ? index : BB.state.rows[schemaName].length - 1;
      close();
      if (files.length) BB.app.attachReceipts(savedIndex, files);
    });
  }

  // ---------------- bulk / Excel-style entry ----------------
  function parseLooseDate(s) {
    s = s.trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return new Date(y, +m[1] - 1, +m[2]);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function coerceCell(raw, col) {
    const s = raw == null ? "" : String(raw).trim();
    if (col.type === "bool") {
      if (s === "") return true; // default active
      return /^(y|yes|true|1|active|✓|x)$/i.test(s);
    }
    if (s === "") return null;
    if (col.type === "date") {
      const d = parseLooseDate(s);
      // month columns accept "11/2026", "Nov 2026", "2026-11" or any date in the month
      return d && col.month ? new Date(d.getFullYear(), d.getMonth(), 1) : d;
    }
    if (col.type === "money" || col.type === "number") {
      const n = Number(s.replace(/[$,\s]/g, ""));
      return isNaN(n) ? null : n;
    }
    if (col.type === "select" && col.options) {
      const hit = col.options.find((o) => o.toLowerCase() === s.toLowerCase());
      return hit || s;
    }
    return s;
  }

  function openBulk(schemaName) {
    const schema = M.schemas[schemaName];
    const cols = schema.columns.filter((c) => !c.noForm && c.bulk !== false);
    const START_ROWS = 6;

    const datalists = cols
      .filter((c) => c.type === "select")
      .map(
        (c) =>
          `<datalist id="dl-${esc(c.key)}">${(c.options || [])
            .map((o) => `<option value="${esc(o)}"></option>`)
            .join("")}</datalist>`
      )
      .join("");

    const cellInput = (c) => {
      const list = c.type === "select" ? ` list="dl-${esc(c.key)}"` : "";
      const ph = c.type === "date" ? (c.month ? "mm/yyyy" : "mm/dd/yyyy") : "";
      return `<td><input class="bcell" data-key="${esc(c.key)}"${list} placeholder="${ph}" /></td>`;
    };
    const blankRow = () =>
      `<tr>${cols.map(cellInput).join("")}<td class="act"><button type="button" class="icon danger" data-delrow title="Remove row">✕</button></td></tr>`;

    const header =
      cols.map((c) => `<th>${esc(c.label)}${c.required ? ' <i class="req">*</i>' : ""}</th>`).join("") +
      `<th class="act"></th>`;

    const host = el("modal");
    host.innerHTML = `
      <div class="modal-backdrop"></div>
      <form class="modal-card bulk-card" id="bulkForm">
        <h3>Bulk add — ${esc(schema.title)}</h3>
        <p class="bulk-hint">Type rows, or <strong>paste straight from Excel</strong> (copy cells, click the first box, Ctrl+V). Computed splits are added automatically.${
          schemaName === "thirdparty" ? " Attach receipts afterward with the paperclip on each row." : ""
        }</p>
        ${datalists}
        <div class="bulk-wrap">
          <table class="bulk-grid">
            <thead><tr>${header}</tr></thead>
            <tbody id="bulkBody">${Array.from({ length: START_ROWS }, blankRow).join("")}</tbody>
          </table>
        </div>
        <div class="modal-actions bulk-actions">
          <button type="button" class="btn" id="bulkAddRow">+ Row</button>
          <span class="bulk-count" id="bulkCount"></span>
          <span class="spacer"></span>
          <button type="button" class="btn" id="bulkCancel">Cancel</button>
          <button type="submit" class="btn primary">Add all</button>
        </div>
      </form>`;
    host.classList.add("open");
    labelTables(host);

    const body = el("bulkBody");
    const close = () => {
      host.classList.remove("open");
      host.innerHTML = "";
    };

    function wireRow(tr) {
      tr.querySelector("[data-delrow]").addEventListener("click", () => {
        if (body.querySelectorAll("tr").length > 1) tr.remove();
        else tr.querySelectorAll(".bcell").forEach((i) => (i.value = ""));
      });
    }
    body.querySelectorAll("tr").forEach(wireRow);

    function addRow() {
      const tmp = document.createElement("tbody");
      tmp.innerHTML = blankRow();
      const tr = tmp.firstElementChild;
      body.appendChild(tr);
      wireRow(tr);
      labelTables(host);
      return tr;
    }
    el("bulkAddRow").addEventListener("click", () => addRow().querySelector(".bcell").focus());

    // paste from Excel: TSV into the grid starting at the focused cell
    body.addEventListener("paste", (e) => {
      const text = (e.clipboardData || window.clipboardData).getData("text");
      if (!text || !/[\t\n]/.test(text)) return; // single cell — normal paste
      const target = e.target.closest(".bcell");
      if (!target) return;
      e.preventDefault();
      const startTr = target.closest("tr");
      const startCol = [...startTr.querySelectorAll(".bcell")].indexOf(target);
      const lines = text.replace(/\r/g, "").split("\n");
      if (lines.length && lines[lines.length - 1] === "") lines.pop();
      let trs = [...body.querySelectorAll("tr")];
      let startIdx = trs.indexOf(startTr);
      lines.forEach((line, i) => {
        if (startIdx + i >= trs.length) {
          addRow();
          trs = [...body.querySelectorAll("tr")];
        }
        const cells = line.split("\t");
        const inputs = [...trs[startIdx + i].querySelectorAll(".bcell")];
        cells.forEach((val, j) => {
          if (startCol + j < inputs.length) inputs[startCol + j].value = val;
        });
      });
    });

    host.querySelector(".modal-backdrop").addEventListener("click", close);
    el("bulkCancel").addEventListener("click", close);

    el("bulkForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const trs = [...body.querySelectorAll("tr")];
      let added = 0,
        skipped = 0;
      const toAdd = [];
      for (const tr of trs) {
        const inputs = [...tr.querySelectorAll(".bcell")];
        const raw = inputs.map((i) => i.value.trim());
        if (raw.every((v) => v === "")) continue; // skip empty rows
        const obj = {};
        cols.forEach((c, i) => (obj[c.key] = coerceCell(raw[i], c)));
        const missing = cols.some((c) => c.required && (obj[c.key] == null || obj[c.key] === ""));
        if (missing) {
          skipped++;
          continue;
        }
        toAdd.push(obj);
        added++;
      }
      if (!added) {
        toast(skipped ? `No valid rows (${skipped} missing required fields).` : "Nothing to add.", "warn");
        return;
      }
      BB.app.commitRows(schemaName, toAdd);
      close();
      toast(`Added ${added} row${added > 1 ? "s" : ""}${skipped ? `, skipped ${skipped}` : ""}.`, "ok");
    });
  }

  // ---------------- controls + save bar + status ----------------
  function renderBars() {
    renderControls();
    renderSaveBar();
    renderBanner();
  }

  // Warning banners: file-changed-on-disk conflicts, and "autosave isn't saving" states.
  function renderBanner() {
    const host = el("banner");
    if (!host) return;
    const S = BB.state;
    if (!S.loaded) {
      host.innerHTML = "";
      return;
    }
    const parts = [];

    // 1) conflicts (highest priority)
    for (const k of ["data"]) {
      if (!S.conflict || !S.conflict[k]) continue;
      const name = BB.store.FILES[k].name;
      const dirty = S.dirty[k];
      parts.push(
        `<div class="banner danger">
          <span class="banner-msg"><b>${esc(name)}</b> was changed somewhere else (probably another device). ${
          dirty
            ? "You also have unsaved changes here — pick which version to keep."
            : "Pull the newer version before you keep editing."
        }</span>
          <span class="banner-actions">
            <button class="btn sm" data-pull="${k}">Reload latest${dirty ? " (discard mine)" : ""}</button>
            <button class="btn sm primary" data-overwrite="${k}">Keep my version</button>
          </span>
        </div>`
      );
    }

    // 2) autosave-not-hooked-up (only when there's no conflict taking over)
    if (!parts.length) {
      if (S.fileMode === "download") {
        parts.push(
          `<div class="banner warn">
            <span class="banner-msg"><b>Download mode</b> — this browser can't write to your file directly, so changes aren't saved automatically. Use <b>Save</b> to download an updated <b>budget.json</b> and replace the one in your folder.</span>
          </div>`
        );
      } else if (S.fileMode === "fs" && !S.autosave) {
        const anyDirty = Object.values(S.dirty).some(Boolean);
        parts.push(
          `<div class="banner warn">
            <span class="banner-msg"><b>Autosave is off</b> — changes stay in your browser until you save them.</span>
            <span class="banner-actions">
              <button class="btn sm" data-autoon>Turn on autosave</button>
              ${anyDirty ? `<button class="btn sm primary" data-savenow>Save now</button>` : ""}
            </span>
          </div>`
        );
      }
    }

    host.innerHTML = parts.join("");
    host.querySelectorAll("[data-pull]").forEach((b) =>
      b.addEventListener("click", () => BB.app.resolveConflict(b.dataset.pull, "pull"))
    );
    host.querySelectorAll("[data-overwrite]").forEach((b) =>
      b.addEventListener("click", () => BB.app.resolveConflict(b.dataset.overwrite, "overwrite"))
    );
    const on = host.querySelector("[data-autoon]");
    if (on) on.addEventListener("click", () => BB.app.setAutosave(true));
    host.querySelectorAll("[data-savenow]").forEach((b) =>
      b.addEventListener("click", () => {
        Object.keys(BB.state.dirty).forEach((k) => BB.state.dirty[k] && BB.app.save(k));
      })
    );
  }

  function renderControls() {
    const S = BB.state;
    el("status").textContent = S.folderName
      ? S.folderName
      : S.loaded
      ? "Loaded (read-only)"
      : "No folder";
    const toggle = el("autoToggle");
    const canToggle = S.loaded && BB.store.supportsFS;
    toggle.hidden = !canToggle;
    const chk = el("autoChk");
    if (chk) chk.checked = !!S.autosave;

    const exportBtn = el("exportBtn");
    if (exportBtn) exportBtn.hidden = !S.loaded;

    const mask = el("maskBtn");
    if (mask) {
      mask.innerHTML = S.masked ? ICON.eyeOff : ICON.eye;
      mask.title = S.masked ? "Show amounts" : "Hide amounts";
      mask.setAttribute("aria-label", mask.title);
      mask.setAttribute("aria-pressed", S.masked ? "true" : "false");
      mask.classList.toggle("on", !!S.masked);
    }

    const btn = el("connectBtn");
    if (btn) {
      if (!S.loaded && S.pendingName) btn.textContent = `Reconnect ${S.pendingName}`;
      else if (S.loaded) btn.textContent = "Change folder";
      else btn.textContent = BB.store.supportsFS ? "Open budget folder" : "Open budget file";
    }
  }

  function timeStr(d) {
    return d
      ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
  }

  function renderSaveBar() {
    const S = BB.state;
    const bar = el("saveBar");
    if (!S.loaded) {
      bar.className = "savebar";
      bar.innerHTML = "";
      return;
    }
    const dirtyFiles = Object.keys(S.dirty).filter((k) => S.dirty[k]);
    const auto = BB.app.autosaveOn();

    if (auto) {
      // files that can't be written in place still need a manual button
      const needManual = dirtyFiles.filter((k) => !BB.store.state.files[k].handle);
      const autoDirty = dirtyFiles.filter((k) => BB.store.state.files[k].handle);
      let left;
      if (S.saving || autoDirty.length) left = `<span class="saving">Saving…</span>`;
      else left = `<span class="saved">✓ Saved${S.lastSavedAt ? " " + timeStr(S.lastSavedAt) : ""}</span>`;
      bar.className = "savebar" + (needManual.length ? " dirty" : "");
      bar.innerHTML = left + needManual.map(saveBtn).join("");
      wireSave(bar);
      return;
    }

    // manual mode
    if (!dirtyFiles.length) {
      bar.className = "savebar";
      bar.innerHTML = `<span class="saved">All changes saved${S.lastSavedAt ? " " + timeStr(S.lastSavedAt) : ""}</span>`;
      return;
    }
    bar.className = "savebar dirty";
    bar.innerHTML = `<span>Unsaved changes</span>` + dirtyFiles.map(saveBtn).join("");
    wireSave(bar);
  }

  const saveBtn = (k) =>
    `<button class="btn primary" data-save="${k}">Save ${esc(BB.store.FILES[k].name)}</button>`;
  function wireSave(bar) {
    bar.querySelectorAll("[data-save]").forEach((b) =>
      b.addEventListener("click", () => BB.app.save(b.dataset.save))
    );
  }

  // ---------------- toast ----------------
  let toastTimer;
  function toast(msg, kind) {
    const t = el("toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = "toast"), 3200);
  }

  window.BB.ui = { render, renderBars, refreshReceiptModal, toast, validTab };
})();
