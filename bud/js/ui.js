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
    chevron: svg('<path d="m6 9 6 6 6-6"/>'),
    wallet: svg('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    settings: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    download: svg('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M5 3v5h5M19 21v-5h-5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    table: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>'),
    split: svg('<path d="M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.2-2.8L3 3M15 9l6-6"/>'),
    users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
    paperclip: svg('<path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>'),
  };

  const TABS = [
    { id: "dashboard", label: "Dashboard", ico: ICON.dashboard, tone: "#5b6cff", eyebrow: "Overview",
      lede: "Where things stand across the apartment, your recurring costs, and what people owe you back." },
    { id: "apartment", label: "Apartment", schema: "apartment", ico: ICON.apartment, tone: "#10b981", eyebrow: "Shared with Luke",
      lede: "Log each bill and the split between you and Luke is worked out for you." },
    { id: "summary", label: "Summary", ico: ICON.summary, tone: "#ec4899", eyebrow: "Roll-up",
      lede: "The whole picture for a year, or all time: apartment, recurring costs, and what you've fronted for others." },
    { id: "subscriptions", label: "Subscriptions & Bills", schema: "subscriptions", ico: ICON.subscriptions, tone: "#f59e0b", eyebrow: "Recurring",
      lede: "Subscriptions and bills that repeat, with what each costs per month." },
    { id: "thirdparty", label: "Expense Tracker", schema: "thirdparty", ico: ICON.expenses, tone: "#8b5cf6", eyebrow: "Reimbursements",
      lede: "Things you paid for that someone owes you back. Move each from Pending to Submitted to Paid, and group related ones into trips." },
  ];

  // title block at the top of every page: small label, big title, and a line saying what it's for
  function pageHead(tabId, actions) {
    const t = TABS.find((x) => x.id === tabId);
    return `<div class="pagehead"><div><div class="eyebrow">${esc(t.eyebrow)}</div><h1>${esc(t.label)}</h1></div>${
      actions || ""
    }</div><p class="lede">${esc(t.lede)}</p>`;
  }

  const validTab = (id) => TABS.some((t) => t.id === id);

  // how many expenses are still waiting for you to send the request (shown on the nav)
  function pendingCount() {
    const S = BB.state.rows;
    const lines = M.apartmentOwedLines(S.apartment || [], S.requests || []);
    return (S.thirdparty || []).filter((r) => r.Status === "Pending").length + lines.filter((l) => l.status === "Pending").length;
  }

  function renderNav() {
    const nav = el("tabs");
    const n = BB.state.loaded ? pendingCount() : 0;
    nav.innerHTML =
      TABS.map(
        (t) =>
          `<button class="tab${t.id === BB.state.activeTab ? " active" : ""}" data-tab="${t.id}" style="--tone:${t.tone}" title="${esc(
            t.label
          )}"><span class="ico">${t.ico}</span><span class="tab-label">${esc(t.label)}</span>${
            t.id === "thirdparty" && n ? `<span class="count" title="${n} not requested yet">${n}</span>` : ""
          }</button>`
      ).join("") +
      `<hr><button class="tab" data-act="settings" style="--tone:#697090"><span class="ico">${ICON.settings}</span><span class="tab-label">Settings</span></button>`;
    nav.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => BB.app.setTab(b.dataset.tab)));
    bindActs(nav);
  }

  // buttons that carry data-act="..." (top bar, welcome screen, settings, nav)
  function bindActs(root) {
    root.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => doAct(b.dataset.act)));
  }
  function doAct(a) {
    const S = BB.state;
    if (a === "connect") BB.app.connect();
    else if (a === "demo") BB.app.startDemo();
    else if (a === "reload") BB.app.reload();
    else if (a === "export") BB.app.exportExcel();
    else if (a === "mask") BB.app.setMasked(!S.masked);
    else if (a === "settings") openSettings();
    else if (a === "save") Object.keys(S.dirty).forEach((k) => S.dirty[k] && BB.app.save(k));
  }

  function render() {
    el("app").classList.toggle("welcome-mode", !BB.state.loaded);
    renderNav();
    renderBars();
    const view = el("view");
    if (!BB.state.loaded) {
      view.innerHTML = welcomeHtml();
      bindActs(view);
      return;
    }
    const tab = BB.state.activeTab;
    if (tab !== "thirdparty") selected.clear(); // ticked expenses only matter on the tracker
    if (tab === "dashboard") renderDashboard(view);
    else if (tab === "apartment") renderApartment(view);
    else if (tab === "summary") renderSummaryView(view);
    else if (tab === "thirdparty") renderExpenses(view);
    else renderTableTab(view, tab);
    labelTables(view);
  }

  // first screen: connect a folder, or look around with made-up data
  function welcomeHtml() {
    const S = BB.state;
    const fs = BB.store.supportsFS;
    const connect = S.pendingName
      ? `<button class="btn primary" data-act="connect">${ICON.folder}Reconnect ${esc(S.pendingName)}</button>`
      : `<button class="btn primary" data-act="connect">${ICON.folder}${fs ? "Open budget folder" : "Open budget file"}</button>`;
    const feat = (c, ico, t, d) =>
      `<div class="feature"><span class="tile" style="--c:${c}">${ico}</span><b>${t}</b><span>${d}</span></div>`;
    return `<div class="welcome"><div class="hero">
      <div class="hero-top">
        <div class="brand"><span class="logo">${ICON.wallet}</span>Budget</div>
        <h1>Your budget, kept in one file you own.</h1>
        <p>Split the apartment, track subscriptions and bills, and keep tabs on everything people owe you back. It all lives in a single <b>budget.json</b> in your OneDrive folder, and exports to Excel any time.</p>
      </div>
      <div class="hero-body">
        ${
          S.pendingName
            ? `<div class="callout info">Your browser needs your OK to open <b>${esc(S.pendingName)}</b> again. One click, no re-picking.</div>`
            : ""
        }
        <div class="hero-actions">${connect}<button class="btn" data-act="demo">Start with sample data</button></div>
        <div class="features">
          ${feat("#10b981", ICON.table, "One file you own", "Every change autosaves into budget.json, with backups, and edits from another device are noticed.")}
          ${feat("#f59e0b", ICON.split, "Split the apartment", "Rent, utilities and Internet divided your way, with a running tally of what Luke owes.")}
          ${feat("#ec4899", ICON.expenses, "Get paid back", "Pending, Submitted, Paid for every expense, with receipts and trips grouped together.")}
        </div>
        ${
          fs
            ? ""
            : `<div class="callout">This browser can't write to files directly. You can still open your budget.json, edit, and use <b>Save</b> to download the updated file. For automatic saving into your folder, use Chrome or Edge.</div>`
        }
      </div>
    </div></div>`;
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

    const card = (label, value, sub, cls, ico) =>
      `<div class="card ${cls || ""}"><div class="card-ico">${ico || ICON.wallet}</div><div class="card-label">${esc(label)}</div><div class="card-value">${value}</div><div class="card-sub">${sub || ""}</div></div>`;

    view.innerHTML = `
      ${pageHead("dashboard")}
      <div class="cards">
        ${card(
          latest ? `Apartment — ${esc(latest.label)}` : "Apartment",
          latest ? M.money(latest.total) : "—",
          latest ? `You ${M.money(latest.reid)} · Luke ${M.money(latest.luke)}` : "No entries",
          "accent",
          ICON.apartment
        )}
        ${card(
          "Luke owes you",
          M.money(lukeOwes),
          lukeOpen.length === 0
            ? "all settled"
            : lukeOpen.length === 1
            ? `${esc(lukeOpen[0].label)} — ${esc(aptNote(lukeOpen[0]))}`
            : `${lukeOpen.length} months open`,
          lukeOpen.length ? "warn" : "ok",
          ICON.users
        )}
        ${card(
          "Recurring / month",
          M.money(monthlyRecurring),
          `Bills ${M.money(billsMo)} · Subs ${M.money(subsMo)}`,
          "violet",
          ICON.subscriptions
        )}
        ${card(
          "Owed back to me",
          M.money(exp.total.outstanding),
          `Work ${M.money(exp.byCat["Work (internal)"].outstanding)} · Client ${M.money(
            exp.byCat["Client"].outstanding
          )} · Friends ${M.money(exp.byCat["Friends/Family"].outstanding)}`,
          exp.total.outstanding ? "warn" : "ok",
          exp.total.outstanding ? ICON.clock : ICON.check
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

    const card = (label, value, sub, cls, ico) =>
      `<div class="card ${cls || ""}"><div class="card-ico">${ico || ICON.wallet}</div><div class="card-label">${esc(label)}</div><div class="card-value">${M.money(
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
      ${pageHead("summary", `<div class="sum-toolbar"><div class="chips" aria-label="Period">${chips}</div></div>`)}

      <div class="cards">
        ${card(
          `Apartment — your share`,
          byItem.total.reid,
          months
            ? `${M.money(byItem.total.reid / months)}/mo avg · Luke ${M.money(byItem.total.luke)} · ${months} month${months > 1 ? "s" : ""}`
            : year == null ? "no bills yet" : `no bills in ${year}`,
          "accent",
          ICON.apartment
        )}
        ${card("Recurring / month", rec.monthly, `${M.money(rec.yearly)}/yr · bills ${M.money(rec.bills)} · subs ${M.money(rec.subs)}`, "violet", ICON.subscriptions)}
        ${card("Fronted for others", T.fronted, `${M.money(T.Paid)} paid back`, "pink", ICON.wallet)}
        ${card(
          "Still owed to you",
          T.outstanding,
          T.fronted > 0.005 ? `${pct(T.recovered)} recovered` : "nothing fronted",
          T.outstanding > 0.005 ? "warn" : "ok",
          T.outstanding > 0.005 ? ICON.clock : ICON.check
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

  // ---- groups / trips on the tracker ----
  // Expenses you've ticked (kept as the row objects, so a reload or an edit naturally clears them)
  const selected = new Set();
  // Which group blocks are folded shut — remembered on this device
  let grpCollapsed = new Set();
  try {
    grpCollapsed = new Set(JSON.parse(localStorage.getItem("bb.grpCollapsed")) || []);
  } catch {}
  const saveCollapsed = () => {
    try {
      localStorage.setItem("bb.grpCollapsed", JSON.stringify([...grpCollapsed]));
    } catch {}
  };
  const LOOSE_KEY = "__loose__"; // collapse key for the "not in a group" block

  // a small dialog asking for one name (new group, rename)
  function openNameDialog({ title, label, value, confirmLabel, hint, onSave }) {
    const host = el("modal");
    host.innerHTML = `
      <div class="modal-backdrop"></div>
      <form class="modal-card name-card" id="nameForm">
        <h3>${esc(title)}</h3>
        <label class="field"><span>${esc(label)}</span>
          <input type="text" name="name" value="${esc(value || "")}" maxlength="60" autocomplete="off" required />
        </label>
        ${hint ? `<p class="muted rc-sub" style="margin:10px 0 0">${esc(hint)}</p>` : ""}
        <div class="modal-actions">
          <button type="button" class="btn" id="nameCancel">Cancel</button>
          <button type="submit" class="btn primary">${esc(confirmLabel || "Save")}</button>
        </div>
      </form>`;
    host.classList.add("open");
    const close = () => {
      host.classList.remove("open");
      host.innerHTML = "";
    };
    host.querySelector(".modal-backdrop").addEventListener("click", close);
    el("nameCancel").addEventListener("click", close);
    el("nameForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = e.target.elements.name.value.trim();
      if (!v) return;
      close();
      onSave(v);
    });
    setTimeout(() => {
      const i = host.querySelector("input");
      if (i) {
        i.focus();
        i.select();
      }
    }, 30);
  }

  const fmtShort = (v) => {
    const d = M.toDate(v);
    return d ? `${d.getMonth() + 1}/${d.getDate()}` : "";
  };

  function renderExpenses(view) {
    const rows = BB.state.rows.thirdparty || [];
    for (const r of [...selected]) if (!rows.includes(r)) selected.delete(r); // drop ticks for rows that are gone
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

    const card = (label, value, sub, cls, ico) =>
      `<div class="card ${cls || ""}"><div class="card-ico">${ico || ICON.wallet}</div><div class="card-label">${esc(label)}</div><div class="card-value">${M.money(
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

    // an ordinary expense row, with a tick box for adding it to a group
    const expenseRow = (it) => {
      const { r, i } = it;
      const n = M.splitReceipts(r.Receipt).length;
      const on = selected.has(r);
      return `<tr${on ? ' class="sel"' : ""}>
        <td class="nw">${esc(M.fmtDate(r["Date of Original Purchase"]))}</td>
        <td class="ex-what"><div class="ex-pickrow"><input type="checkbox" class="ex-pick" data-pick="${i}" aria-label="Select to add to a group"${
          on ? " checked" : ""
        }><div class="ex-main"><div class="ex-title">${esc(r.Activity)}</div>${
          r.Description ? `<div class="ex-desc">${esc(r.Description)}</div>` : ""
        }<div class="ex-meta"><span class="pill ${CAT_CLASS[r.Category] || ""}">${esc(r.Category || "")}</span>${
          r["Owed By"] ? `<span>${esc(r["Owed By"])}</span>` : ""
        }</div></div></div></td>
        <td class="num strong">${M.money(r.Amount)}</td>
        <td class="ex-status">${statusSelect(r, i)}<div class="ex-note">${statusNote(r)}</div></td>
        <td><button class="rc-btn${n ? " has" : ""}" data-receipts="${i}" title="${
          n ? "View / add receipts" : "Attach a receipt"
        }">${ICON.paperclip}${n ? n : "Add"}</button></td>
        <td class="act"><button class="icon" data-edit="${i}" title="Edit">✎</button><button class="icon danger" data-del="${i}" title="Delete">✕</button></td>
      </tr>`;
    };
    const rowHtml = (it) => (it.kind === "apt" ? aptRow(it.l) : expenseRow(it));
    const emptyNote = items.length ? "Nothing matches these filters." : "No expenses yet — click “Add expense”.";
    const THEAD = `<thead><tr><th>Purchased</th><th>What</th><th class="num">Amount</th><th>Status</th><th>Receipts</th><th class="act"></th></tr></thead>`;
    // one floating card's table (every card shares the same column widths so they line up)
    const tableOf = (rowsHtml, foot) =>
      `<div class="table-wrap flat"><table class="grid expenses" data-table="thirdparty">${THEAD}<tbody>${rowsHtml}</tbody>${foot || ""}</table></div>`;

    // ---- groups / trips: each one is a collapsible block with a subtotal header ----
    const names = M.orderGroups(rows, M.groupNames(rows, BB.state.groups));
    const visibleExpenses = new Set(visible.filter((it) => it.kind === "expense").map((it) => it.r));
    const count = (n) => `${n} item${n === 1 ? "" : "s"}`;

    const blockHead = (o) => `<header class="grp-top" data-grpbar>
        <button type="button" class="grp-toggle" data-grptoggle="${esc(o.key)}" aria-expanded="${!o.collapsed}" aria-label="Show or hide">${ICON.chevron}</button>
        ${o.pick || ""}
        <div class="grp-title"><span class="grp-name">${esc(o.title)}</span><span class="grp-count">${esc(o.count)}</span></div>
        <div class="grp-sum">${o.sum}</div>${o.actions ? `<div class="grp-actions">${o.actions}</div>` : ""}
      </header>${o.prog || ""}`;

    const groupBlock = (g) => {
      const all = rows.filter((r) => M.inGroup(r, g));
      const vis = visible.filter((it) => it.kind === "expense" && M.inGroup(it.r, g));
      const t = M.expenseSummary(all).total;
      const fronted = t.Pending + t.Submitted + t.Paid;
      const key = g.toLowerCase();
      const collapsed = grpCollapsed.has(key);
      const allSel = vis.length > 0 && vis.every((it) => selected.has(it.r));
      const hidden = all.length - vis.length;
      const owed = t.outstanding > 0.005;
      const pct = fronted > 0 ? Math.max(0, Math.min(100, Math.round((t.Paid / fronted) * 100))) : 0;
      const sum = all.length
        ? `<span class="grp-total">${M.money(fronted)}</span><span class="grp-owed${owed ? "" : " done"}">${
            owed ? M.money(t.outstanding) + " still owed" : "all paid"
          }</span>`
        : `<span class="muted">empty</span>`;
      const menu = `<select class="grp-menu" data-grpmenu="${esc(g)}" aria-label="More actions for ${esc(g)}">
          <option value="">More…</option><option value="Submitted">Mark all submitted</option><option value="Paid">Mark all paid</option>
          <option value="rename">Rename…</option><option value="delete">Delete group…</option></select>`;
      return (
        `<section class="grp-card${collapsed ? " collapsed" : ""}${all.length && !owed ? " settled" : ""}">` +
        blockHead({
          key,
          title: g,
          collapsed,
          count: all.length ? count(all.length) + (hidden > 0 ? ` (${vis.length} shown)` : "") : "no expenses yet",
          pick: vis.length
            ? `<input type="checkbox" class="ex-pick" data-grpsel="${esc(g)}" title="Tick every expense in this group"${allSel ? " checked" : ""}>`
            : "",
          sum,
          actions: `<button type="button" class="btn sm" data-grpadd="${esc(g)}">+ Add expense</button>${menu}`,
          prog: all.length ? `<div class="grp-prog" title="${pct}% paid back"><i style="width:${pct}%"></i></div>` : "",
        }) +
        (all.length
          ? tableOf(vis.map(rowHtml).join(""))
          : `<p class="grp-empty muted">Nothing in this group yet — click “+ Add expense” above, or tick expenses in the list and choose “Add to group”.</p>`) +
        `</section>`
      );
    };

    const looseBlock = (loose) => {
      const collapsed = grpCollapsed.has(LOOSE_KEY);
      const total = loose.reduce((a, it) => a + it.amount, 0);
      return (
        `<section class="grp-card loose${collapsed ? " collapsed" : ""}">` +
        blockHead({ key: LOOSE_KEY, title: "Not in a group", collapsed, count: count(loose.length), sum: `<span class="grp-total">${M.money(total)}</span>` }) +
        tableOf(loose.map(rowHtml).join("")) +
        `</section>`
      );
    };

    let body;
    if (!names.length) {
      // no groups yet: one plain card holding the whole list
      body = `<section class="grp-card plain">${
        visible.length
          ? tableOf(
              visible.map(rowHtml).join(""),
              `<tfoot><tr><td colspan="2">Showing ${visible.length} of ${items.length}</td><td class="num strong">${M.money(
                visibleTotal
              )}</td><td colspan="3"></td></tr></tfoot>`
            )
          : `<p class="grp-empty muted">${emptyNote}</p>`
      }</section>`;
    } else {
      const parts = [];
      for (const g of names) {
        const hasAny = rows.some((r) => M.inGroup(r, g));
        const hasVisible = visible.some((it) => it.kind === "expense" && M.inGroup(it.r, g));
        if (hasAny && !hasVisible) continue; // everything in it is filtered out
        parts.push(groupBlock(g));
      }
      const loose = visible.filter((it) => it.kind === "apt" || !String(it.r.Group || "").trim());
      if (loose.length) parts.push(looseBlock(loose));
      body = parts.length
        ? parts.join("") + `<p class="grp-foot muted">Showing ${visible.length} of ${items.length} · ${M.money(visibleTotal)}</p>`
        : `<section class="grp-card plain"><p class="grp-empty muted">${emptyNote}</p></section>`;
    }

    view.innerHTML = `
      ${pageHead(
        "thirdparty",
        `<span class="head-actions">
          <button class="btn" id="newGroupBtn" title="Start a group (a trip, a batch to submit together)">New group</button>
          <button class="btn" data-bulk="thirdparty">Bulk add</button>
          <button class="btn primary" data-add="thirdparty">${ICON.plus}Add expense</button>
        </span>`
      )}
      <div class="cards">
        ${card("Still owed to me", T.outstanding, `${countOf("Pending") + countOf("Submitted")} expenses open`, "accent", ICON.wallet)}
        ${card("Not requested yet", T.Pending, `${countOf("Pending")} pending`, T.Pending ? "warn" : "ok", ICON.clock)}
        ${card("Awaiting payment", T.Submitted, `${countOf("Submitted")} submitted`, "cyan", ICON.expenses)}
        ${card("Paid back", T.Paid, `${countOf("Paid")} reimbursed`, "ok", ICON.check)}
      </div>

      <div class="panel narrow">
        <div class="panel-head"><h3>Who owes me</h3></div>
        <div class="panel-scroll"><table class="grid"><thead><tr><th>Who pays me back</th><th class="num">Pending</th><th class="num">Submitted</th><th class="num">Paid</th><th class="num">Still owed</th></tr></thead>
          <tbody>${breakdown}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${M.money(T.Pending)}</td><td class="num">${M.money(
      T.Submitted
    )}</td><td class="num">${M.money(T.Paid)}</td><td class="num strong">${M.money(T.outstanding)}</td></tr></tfoot></table></div>
      </div>

      <div class="board">
        <div class="filters">
          <div class="chips" aria-label="Filter by who pays">${catChips}</div>
          <div class="chips" aria-label="Filter by status">${stChips}</div>
        </div>
        <div class="grp-stack">${body}</div>
        <div class="selbar" id="selbar" hidden></div>
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

    // ---- groups: ticking, the "add to group" bar, and each block's controls ----
    function refreshSelbar() {
      const bar = el("selbar");
      if (!bar) return;
      const n = selected.size;
      bar.hidden = n === 0;
      if (!n) {
        bar.innerHTML = "";
        return;
      }
      const anyGrouped = [...selected].some((r) => String(r.Group || "").trim());
      bar.innerHTML = `<span class="selbar-n"><b>${n}</b> selected</span>
        <select id="selGroup" class="grp-menu" aria-label="Add the selected expenses to a group">
          <option value="">Add to group…</option>${names.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("")}<option value="__new">＋ New group…</option>
        </select>
        ${anyGrouped ? `<button type="button" class="btn sm" id="selUngroup">Remove from group</button>` : ""}
        <button type="button" class="btn ghost sm" id="selClear">Clear</button>`;
      const take = () => {
        const rs = [...selected];
        selected.clear();
        return rs;
      };
      el("selGroup").addEventListener("change", (e) => {
        const v = e.target.value;
        e.target.value = "";
        if (v === "__new")
          openNameDialog({
            title: "New group",
            label: "Group name",
            confirmLabel: "Create and add",
            hint: `The ${n} ticked expense${n === 1 ? "" : "s"} will go into it.`,
            onSave: (name) => BB.app.assignGroup(take(), name),
          });
        else if (v) BB.app.assignGroup(take(), v);
      });
      const un = el("selUngroup");
      if (un) un.addEventListener("click", () => BB.app.assignGroup(take(), null));
      el("selClear").addEventListener("click", () => {
        selected.clear();
        renderExpenses(el("view"));
      });
    }

    view.querySelectorAll("[data-pick]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const r = rows[Number(cb.dataset.pick)];
        if (!r) return;
        if (cb.checked) selected.add(r);
        else selected.delete(r);
        cb.closest("tr").classList.toggle("sel", cb.checked);
        refreshSelbar();
      })
    );
    // the box in a group's header ticks / unticks everything shown in that group
    view.querySelectorAll("[data-grpsel]").forEach((cb) =>
      cb.addEventListener("change", () => {
        rows
          .filter((r) => M.inGroup(r, cb.dataset.grpsel) && visibleExpenses.has(r))
          .forEach((r) => (cb.checked ? selected.add(r) : selected.delete(r)));
        cb.closest(".grp-card")
          .querySelectorAll("[data-pick]")
          .forEach((p) => {
            p.checked = cb.checked;
            p.closest("tr").classList.toggle("sel", cb.checked);
          });
        refreshSelbar();
      })
    );
    // click a header (not its buttons) to fold / unfold the block; remembered per device
    view.querySelectorAll("[data-grpbar]").forEach((bar) =>
      bar.addEventListener("click", (e) => {
        if (e.target.closest("input, select, option, button.btn")) return;
        const tb = bar.closest(".grp-card");
        const btn = bar.querySelector("[data-grptoggle]");
        const shut = tb.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", String(!shut));
        if (shut) grpCollapsed.add(btn.dataset.grptoggle);
        else grpCollapsed.delete(btn.dataset.grptoggle);
        saveCollapsed();
      })
    );
    view.querySelectorAll("[data-grpadd]").forEach((b) =>
      b.addEventListener("click", () => openForm("thirdparty", null, { Status: "Pending", Group: b.dataset.grpadd }))
    );
    view.querySelectorAll("[data-grpmenu]").forEach((s) =>
      s.addEventListener("change", () => {
        const g = s.dataset.grpmenu;
        const v = s.value;
        s.value = "";
        if (v === "Submitted" || v === "Paid") BB.app.setGroupStatus(g, v);
        else if (v === "rename")
          openNameDialog({
            title: "Rename group",
            label: "Group name",
            value: g,
            confirmLabel: "Rename",
            hint: "Using the name of another group merges the two.",
            onSave: (name) => BB.app.renameGroup(g, name),
          });
        else if (v === "delete") BB.app.deleteGroup(g);
      })
    );
    const ng = el("newGroupBtn");
    if (ng)
      ng.addEventListener("click", () =>
        openNameDialog({
          title: "New group",
          label: "Group name",
          confirmLabel: "Create",
          hint: "Then use “+ Add expense” inside it, or tick existing expenses and add them.",
          onSave: (name) => BB.app.createGroup(name),
        })
      );
    refreshSelbar();

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
  // "Bulk add" + "Add" for the page header of a table tab
  const tableActions = (schemaName) =>
    `<span class="head-actions"><button class="btn" data-bulk="${schemaName}">Bulk add</button><button class="btn primary" data-add="${schemaName}">${ICON.plus}Add</button></span>`;

  function renderApartment(view) {
    view.innerHTML = `
      ${pageHead("apartment", tableActions("apartment"))}
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
    view.innerHTML = pageHead(schemaName, tableActions(schemaName)) + tableBlock(schemaName);
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
      <div class="card-table"><div class="table-wrap">
        <table class="grid" data-table="${schemaName}">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div></div>`;
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
    // a page can hold several tables of one kind (one per group card)
    root.querySelectorAll(`[data-table="${schemaName}"]`).forEach((t) => {
      t.querySelectorAll("[data-edit]").forEach((b) =>
        b.addEventListener("click", () => openForm(schemaName, Number(b.dataset.edit)))
      );
      t.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", () => BB.app.deleteRow(schemaName, Number(b.dataset.del)))
      );
    });
  }

  // the suggestion list behind a "Trip / group" box: every group you already have
  function groupDatalist(cols) {
    if (!cols.some((c) => c.suggest === "groups")) return "";
    const names = M.groupNames(BB.state.rows.thirdparty, BB.state.groups);
    return `<datalist id="dl-groups">${names.map((g) => `<option value="${esc(g)}"></option>`).join("")}</datalist>`;
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
          }${c.suggest === "groups" ? ' list="dl-groups" autocomplete="off" placeholder="e.g. Amarillo trip (optional)"' : ""}>`;
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
        ${groupDatalist(formCols)}
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
      const list = c.type === "select" ? ` list="dl-${esc(c.key)}"` : c.suggest === "groups" ? ' list="dl-groups"' : "";
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
        ${datalists}${groupDatalist(cols)}
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

  // ---------------- top bar, banners, settings ----------------
  function renderBars() {
    renderControls();
    renderBanner();
  }

  function timeStr(d) {
    return d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  }

  // the little pill in the top bar: is everything saved?
  function fileChipHtml() {
    const S = BB.state;
    const dirty = Object.values(S.dirty).some(Boolean);
    let dot = "";
    let text;
    let bad = false;
    if (S.fileMode === "demo") text = "Sample data · not saved";
    else if (S.conflict && S.conflict.data) {
      dot = "error";
      bad = true;
      text = "Changed elsewhere";
    } else if (S.fileMode === "download") {
      dot = dirty ? "dirty" : "";
      text = dirty ? "Unsaved changes" : "Opened · saving downloads a copy";
    } else if (S.saving || (BB.app.autosaveOn() && dirty)) {
      dot = "saving";
      text = "Saving…";
    } else if (dirty) {
      dot = "dirty";
      text = "Unsaved changes";
    } else {
      dot = "saved";
      text = S.lastSavedAt ? `Saved ${timeStr(S.lastSavedAt)}` : "Up to date";
    }
    const name = S.folderName ? `${esc(S.folderName)} · ` : "";
    return `<span class="filechip${bad ? " bad" : ""}" title="${esc(S.folderName || BB.store.DATA_FILE)}"><span class="dot ${dot}"></span><span class="name">${name}${esc(text)}</span></span>`;
  }

  function renderControls() {
    const S = BB.state;
    const host = el("controls");
    if (!host) return;
    if (!S.loaded) {
      host.innerHTML = "";
      return;
    }
    const dirty = Object.values(S.dirty).some(Boolean);
    const fs = S.fileMode === "fs";
    const needsSave = dirty && (S.fileMode === "download" || (fs && !BB.app.autosaveOn()));
    const btn = (act, cls, ico, label, title) =>
      `<button class="btn ${cls}" data-act="${act}" title="${esc(title || label)}" aria-label="${esc(title || label)}">${ico}${
        label ? `<span class="lbl">${esc(label)}</span>` : ""
      }</button>`;
    host.innerHTML =
      fileChipHtml() +
      (needsSave ? btn("save", "sm attn", ICON.download, S.fileMode === "download" ? "Download budget.json" : "Save now") : "") +
      `<button class="btn ghost iconly${S.masked ? " on" : ""}" data-act="mask" title="${S.masked ? "Show amounts" : "Hide amounts"}" aria-label="${
        S.masked ? "Show amounts" : "Hide amounts"
      }" aria-pressed="${S.masked ? "true" : "false"}">${S.masked ? ICON.eyeOff : ICON.eye}</button>` +
      (fs ? btn("reload", "ghost iconly hide-xs", ICON.refresh, "", "Reload from disk") : "") +
      btn("export", "sm", ICON.download, "Excel", "Export everything to an Excel file") +
      (S.fileMode === "demo"
        ? btn("connect", "sm primary hide-xs", ICON.folder, "Open my folder")
        : btn("connect", "sm hide-xs", ICON.folder, fs ? "Switch folder" : "Open file"));
    bindActs(host);
  }

  // Banners: sample data, file-changed-on-disk conflicts, and "autosave isn't saving" states.
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

    if (!parts.length) {
      if (S.fileMode === "demo") {
        // 2) looking at sample data
        parts.push(
          `<div class="banner">
            <span class="banner-msg"><b>Sample data.</b> Look around and try things out — nothing is saved. Open your budget folder to work with the real thing.</span>
            <span class="banner-actions"><button class="btn sm primary" data-act="connect">Open my folder</button></span>
          </div>`
        );
      } else if (S.fileMode === "download") {
        // 3) autosave-not-hooked-up
        parts.push(
          `<div class="banner warn">
            <span class="banner-msg"><b>Download mode</b> — this browser can't write to your file directly, so changes aren't saved automatically. Use <b>Download budget.json</b> and replace the one in your folder.</span>
          </div>`
        );
      } else if (S.fileMode === "fs" && !S.autosave) {
        parts.push(
          `<div class="banner warn">
            <span class="banner-msg"><b>Autosave is off</b> — changes stay in your browser until you save them.</span>
            <span class="banner-actions"><button class="btn sm" data-autoon>Turn on autosave</button></span>
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
    bindActs(host);
  }

  // Settings: the switches and housekeeping that used to crowd the top bar
  function openSettings() {
    const S = BB.state;
    const fs = S.fileMode === "fs";
    const demo = S.fileMode === "demo";
    const row = (color, ico, title, desc, control) =>
      `<div class="set-row"><span class="tile" style="--c:${color}">${ico}</span><div class="set-text"><b>${esc(title)}</b><span>${desc}</span></div>${control}</div>`;
    const sw = (id, on) =>
      `<label class="switch"><input type="checkbox" id="${id}"${on ? " checked" : ""}><span class="track"><span class="thumb"></span></span></label>`;
    const host = el("modal");
    host.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card" id="settingsCard">
        <h3>Settings</h3>
        <div class="set-list">
          ${row("#10b981", ICON.refresh, "Autosave", fs ? "Save every change into budget.json a moment after you make it." : "Available once a folder is connected in Chrome or Edge.", fs ? sw("setAuto", S.autosave) : "")}
          ${row("#8b5cf6", ICON.eyeOff, "Hide amounts", "Mask every dollar figure, handy when someone is looking over your shoulder.", sw("setMask", S.masked))}
          ${row("#5b6cff", ICON.folder, demo ? "Your budget folder" : "Budget folder", demo ? "You're looking at sample data. Connect your OneDrive Budgeting folder to work with the real thing." : fs ? `Connected to <b>${esc(S.folderName)}</b>. Backups of budget.json are kept in a <b>backups</b> folder next to it.` : "Not connected to a folder, so saving downloads a copy.", `<span class="set-btns"><button class="btn sm" data-act="connect" data-close>${demo ? "Open folder" : "Switch"}</button>${fs ? `<button class="btn sm" data-act="reload" data-close>Reload</button>` : ""}</span>`)}
          ${row("#f59e0b", ICON.download, "Export to Excel", "Everything in one workbook: apartment, requests, subscriptions, the tracker, owed totals and trips.", `<button class="btn sm" data-act="export">Download</button>`)}
        </div>
        <div class="modal-actions"><button type="button" class="btn primary" id="setDone">Done</button></div>
      </div>`;
    host.classList.add("open");
    const close = () => {
      host.classList.remove("open");
      host.innerHTML = "";
    };
    host.querySelector(".modal-backdrop").addEventListener("click", close);
    el("setDone").addEventListener("click", close);
    host.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () => {
        doAct(b.dataset.act);
        if (b.hasAttribute("data-close")) close();
      })
    );
    const auto = el("setAuto");
    if (auto) auto.addEventListener("change", (e) => BB.app.setAutosave(e.target.checked));
    el("setMask").addEventListener("change", (e) => BB.app.setMasked(e.target.checked));
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
