(function () {
  "use strict";

  // ---------- Constants ----------
  var TYPES = ["Risk", "Action", "Issue", "Decision"];
  var ALL_TYPES = ["Risk", "Action", "Issue", "Decision", "Task"];
  var STATUSES = ["Open", "In Progress", "Blocked", "Resolved", "Closed"];
  var PRIORITIES = ["Low", "Medium", "High", "Critical"];
  var LMH = ["Low", "Medium", "High"];
  var SEVERITIES = ["Low", "Medium", "High", "Critical"];
  var RECUR = ["None", "Daily", "Weekdays", "Weekly", "Bi-weekly", "Monthly"];
  var UNASSIGNED = "• Unassigned";
  var NO_WORKSTREAM = "• No workstream";
  var DEFAULT_WORKSTREAMS = ["Payments", "Data migration", "Customer portal", "Platform", "Compliance"];
  var DEFAULT_GROUPS = ["Steering Committee", "Weekly Sync"];
  var DUE_OPTS = ["Past due", "Due today", "Due tomorrow", "Due this week", "Due in next 7 days", "No due date"];
  var FILTER_NONE = "__NONE__";   // a filter array of exactly [FILTER_NONE] means "nothing selected" → 0 results
  function isNoneFilter(arr) { return arr && arr.length === 1 && arr[0] === FILTER_NONE; }
  var CURRENT_USER = "Reid";
  var STORAGE_KEY = "raidlog.v1";
  var PREFS_KEY = "raidlog.prefs";
  var SETTINGS_KEY = "raidlog.settings";
  var TYPE_ICON = { Risk: "⚠", Action: "✔", Issue: "●", Decision: "◆", Task: "☑" };

  // ---------- Utilities ----------
  function todayISO(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function nowISO() { return new Date().toISOString(); }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function fmtNoteDate(iso) {
    // "dddd MM-dd-yyyy" e.g. "Monday 09-08-2026"
    if (!iso) return "";
    var d = new Date(iso);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return WEEKDAYS[d.getDay()] + " " + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "-" + d.getFullYear();
  }
  function addInterval(iso, recurrence) {
    var d = iso ? new Date(iso + "T00:00:00") : new Date();
    if (recurrence === "Daily") d.setDate(d.getDate() + 1);
    else if (recurrence === "Weekdays") { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
    else if (recurrence === "Weekly") d.setDate(d.getDate() + 7);
    else if (recurrence === "Bi-weekly") d.setDate(d.getDate() + 14);
    else if (recurrence === "Monthly") d.setMonth(d.getMonth() + 1);
    else return iso || "";
    return d.toISOString().slice(0, 10);
  }
  function isOverdue(item) {
    if (!item.dueDate) return false;
    if (item.status === "Resolved" || item.status === "Closed") return false;
    return item.dueDate < todayISO();
  }
  function initials(name) {
    if (!name) return "?";
    var p = name.trim().split(/\s+/);
    return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
  }
  function avatarColor(name) {
    var colors = ["#0052cc", "#00875a", "#de350b", "#6554c0", "#ff8b00", "#0065ff", "#5243aa", "#ff5630"];
    var h = 0;
    for (var i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return colors[Math.abs(h) % colors.length];
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function avatarEl(name, lg) {
    return '<span class="avatar' + (lg ? " lg" : "") + '" style="background:' + avatarColor(name) + '" title="' + esc(name) + '">' + esc(initials(name)) + "</span>";
  }
  function ownerAvatars(it) {
    var os = it.owners || [];
    if (!os.length) return '<span class="avatar unassigned" title="Unassigned">?</span>';
    var shown = os.slice(0, 3).map(function (o) { return avatarEl(o); }).join("");
    var extra = os.length > 3 ? '<span class="avatar unassigned" title="' + esc(os.slice(3).join(", ")) + '">+' + (os.length - 3) + "</span>" : "";
    return '<span class="avatar-stack" title="' + esc(os.join(", ")) + '">' + shown + extra + "</span>";
  }
  function bestMatch(typed, opts) {
    var t = (typed || "").trim().toLowerCase();
    if (!t) return null;
    var pref = opts.filter(function (o) { return o.toLowerCase().indexOf(t) === 0; });
    if (pref.length) return pref[0];
    var inc = opts.filter(function (o) { return o.toLowerCase().indexOf(t) !== -1; });
    return inc.length ? inc[0] : null;
  }
  var LMH_VAL = { Low: 1, Medium: 2, High: 3 };
  function riskScore(item) {
    if (item.type !== "Risk") return null;
    return (LMH_VAL[item.likelihood] || 0) * (LMH_VAL[item.impact] || 0);
  }
  function riskSeverity(score) {
    if (score >= 6) return { label: "Critical", cls: "sev-Critical", color: "#de350b" };
    if (score >= 4) return { label: "High", cls: "sev-High", color: "#ff7452" };
    if (score >= 2) return { label: "Medium", cls: "sev-Medium", color: "#ff991f" };
    return { label: "Low", cls: "sev-Low", color: "#00875a" };
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  // ---------- State / persistence ----------
  function emptyFilters() {
    return { search: "", type: [], status: [], priority: [], owner: [], workstream: [], tag: [], due: [], dueOn: "", visibility: "active" };
  }
  var store = {
    items: [],
    counter: 1,
    settings: { workstreams: DEFAULT_WORKSTREAMS.slice(), groups: DEFAULT_GROUPS.slice() },
    ui: {
      scope: "raid",          // raid | tasks | group
      activeGroup: null,
      view: "board",
      typeView: null,
      showDash: true,
      editMode: false,
      selectedRows: [],
      filters: emptyFilters(),
      sort: { key: "id", dir: "asc" },
      selectedId: null
    }
  };

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: store.items, counter: store.counter })); }
    catch (e) {}
    scheduleFileSave();
  }
  function migrateItem(it) {
    it.owners = Array.isArray(it.owners) ? it.owners : (it.owner ? [it.owner] : []);
    if ("owner" in it) delete it.owner;
    it.workstreams = Array.isArray(it.workstreams) ? it.workstreams : (it.workstream ? [it.workstream] : []);
    if ("workstream" in it) delete it.workstream;
    it.groups = Array.isArray(it.groups) ? it.groups : [];
    if (it.recurrence === "Every 2 weeks") it.recurrence = "Bi-weekly";
    it.activity = Array.isArray(it.activity) ? it.activity : [];
    it.tags = Array.isArray(it.tags) ? it.tags : [];
    it.links = Array.isArray(it.links) ? it.links : [];
    it.hidden = !!it.hidden;
    it.hiddenOn = it.hiddenOn || null;
  }
  function setHidden(it, val) {
    it.hidden = !!val;
    it.hiddenOn = val ? todayISO() : null;
  }
  // Hidden items are a same-day convenience — they come back on the next calendar day.
  function unhideStale() {
    var changed = false;
    store.items.forEach(function (it) {
      if (it.hidden && it.hiddenOn !== todayISO()) { it.hidden = false; it.hiddenOn = null; changed = true; }
    });
    return changed;
  }
  function tryLoad() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!data || !Array.isArray(data.items) || !data.items.length) return false;
      store.items = data.items;
      store.items.forEach(migrateItem);
      store.counter = data.counter || (data.items.length + 1);
      return true;
    } catch (e) { return false; }
  }

  function persistPrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        showDash: store.ui.showDash, editMode: store.ui.editMode,
        scope: store.ui.scope, activeGroup: store.ui.activeGroup, view: store.ui.view, typeView: store.ui.typeView,
        filters: store.ui.filters, sort: store.ui.sort
      }));
    } catch (e) {}
  }
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      if (typeof p.showDash === "boolean") store.ui.showDash = p.showDash;
      if (typeof p.editMode === "boolean") store.ui.editMode = p.editMode;
      if (["raid", "tasks", "group"].indexOf(p.scope) !== -1) store.ui.scope = p.scope;
      if (typeof p.activeGroup === "string") store.ui.activeGroup = p.activeGroup;
      if (["board", "list", "matrix"].indexOf(p.view) !== -1) store.ui.view = p.view;
      if (typeof p.typeView === "string" || p.typeView === null) store.ui.typeView = p.typeView;
      if (p.sort && p.sort.key) store.ui.sort = p.sort;
      var f = emptyFilters(), pf = p.filters || {};
      ["type", "status", "priority", "owner", "workstream", "tag", "due"].forEach(function (k) {
        f[k] = Array.isArray(pf[k]) ? pf[k] : (pf[k] ? [pf[k]] : []);
      });
      f.search = pf.search || ""; f.dueOn = pf.dueOn || "";
      if (["active", "all", "hidden"].indexOf(pf.visibility) !== -1) f.visibility = pf.visibility;
      store.ui.filters = f;
      // matrix only exists in raid scope
      if (store.ui.scope !== "raid" && store.ui.view === "matrix") store.ui.view = "board";
      // a group nav can be deleted out from under a saved session
      if (store.ui.scope === "group" && (!store.ui.activeGroup || groupList().indexOf(store.ui.activeGroup) === -1)) {
        store.ui.scope = "raid"; store.ui.activeGroup = null; store.ui.view = "board";
      }
    } catch (e) {}
  }
  function persistSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(store.settings)); } catch (e) {}
  }
  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && Array.isArray(s.workstreams)) store.settings.workstreams = s.workstreams;
      if (s && Array.isArray(s.groups)) store.settings.groups = s.groups;
    } catch (e) {}
  }

  function nextId() { return "RAID-" + (store.counter++); }

  var ACTIVITY_MAX = 200;
  function trimActivity(item) {
    if (!item.activity || item.activity.length <= ACTIVITY_MAX) return;
    var over = item.activity.length - ACTIVITY_MAX;
    for (var i = 0; i < item.activity.length && over > 0;) {
      if (item.activity[i].kind === "change") { item.activity.splice(i, 1); over--; }
      else i++;
    }
  }
  function log(item, kind, text) {
    item.activity.push({ id: Math.random().toString(36).slice(2), kind: kind, text: text, who: CURRENT_USER, ts: nowISO() });
    trimActivity(item);
  }

  // ---------- Seed data ----------
  function seed() {
    store.items = [];
    store.counter = 1;
    store.settings.workstreams = DEFAULT_WORKSTREAMS.slice();
    store.settings.groups = DEFAULT_GROUPS.slice();
    function mk(o) {
      var base = {
        id: nextId(), type: o.type, title: o.title, description: o.description || "",
        status: o.status || "Open", priority: o.priority || "Medium",
        workstreams: o.workstreams || (o.workstream ? [o.workstream] : []),
        groups: o.groups || [],
        owners: o.owners || (o.owner ? [o.owner] : []),
        reporter: o.reporter || CURRENT_USER,
        createdDate: o.createdDate || todayISO(-14), dueDate: o.dueDate || "",
        resolvedDate: o.resolvedDate || null, links: o.links || [], tags: o.tags || [],
        activity: []
      };
      if (o.type === "Risk") { base.likelihood = o.likelihood || "Medium"; base.impact = o.impact || "Medium"; base.mitigationPlan = o.mitigationPlan || ""; }
      if (o.type === "Action") { base.nextStep = o.nextStep || ""; }
      if (o.type === "Issue") { base.severity = o.severity || "Medium"; }
      if (o.type === "Decision") { base.decisionMade = o.decisionMade || ""; base.rationale = o.rationale || ""; }
      if (o.type === "Task") { base.recurrence = o.recurrence || "None"; }
      base.activity.push({ id: "c0", kind: "create", text: "created this " + o.type.toLowerCase(), who: base.reporter, ts: base.createdDate + "T09:00:00.000Z" });
      (o.comments || []).forEach(function (c) {
        base.activity.push({ id: Math.random().toString(36).slice(2), kind: "comment", text: c.text, who: c.who, ts: c.ts });
      });
      return base;
    }

    store.items = [
      mk({
        type: "Risk", title: "Key integration vendor may miss the API delivery deadline",
        description: "Vendor Acme has flagged resourcing constraints for the payments API. If the delivery slips past 30 Sep, the UAT window compresses to under a week.",
        status: "In Progress", priority: "High", workstream: "Payments", owner: "Priya Patel", reporter: "Reid",
        createdDate: todayISO(-20), dueDate: todayISO(12), likelihood: "High", impact: "High",
        mitigationPlan: "Weekly check-ins with the vendor's account manager. In parallel, spike a lightweight in-house adapter against the v1 API so launch is not fully dependent on Acme. Pre-book two extra UAT days for the week of 6 Oct.",
        tags: ["vendor", "payments", "schedule"], groups: ["Steering Committee"],
        comments: [
          { text: "Escalated to vendor account manager. Awaiting a revised plan by Friday.", who: "Priya Patel", ts: todayISO(-6) + "T14:12:00.000Z" },
          { text: "Contingency: fall back to the v1 API surface for launch and defer webhooks.", who: "Reid", ts: todayISO(-2) + "T10:03:00.000Z" }
        ]
      }),
      mk({
        type: "Action", title: "Finalize and dry-run the data migration runbook",
        description: "Consolidate the migration steps into a single runbook and complete one full dry run against a production-sized dataset.",
        nextStep: "Book the staging dry-run slot with the DBA team for next Tuesday.",
        status: "In Progress", priority: "High", workstream: "Data migration", owner: "Sam Rivera", reporter: "Reid",
        createdDate: todayISO(-16), dueDate: todayISO(5), links: ["RAID-1"], tags: ["migration", "release"], groups: ["Weekly Sync"],
        comments: [{ text: "Runbook draft is at 80%. Rollback section still needs review.", who: "Sam Rivera", ts: todayISO(-3) + "T16:40:00.000Z" }]
      }),
      mk({
        type: "Issue", title: "Staging environment intermittently returns HTTP 500 on checkout",
        description: "Roughly 1 in 20 checkout calls on staging fail with a 500. Logs point at a connection-pool exhaustion under concurrent load.",
        status: "Blocked", priority: "Critical", severity: "High", workstream: "Platform", owner: "Alex Chen", reporter: "Dana Okafor",
        createdDate: todayISO(-9), dueDate: todayISO(-1), tags: ["staging", "checkout", "bug"], groups: ["Steering Committee"],
        comments: [
          { text: "Blocked on infra raising the RDS max_connections limit — ticket INFRA-2231.", who: "Alex Chen", ts: todayISO(-4) + "T11:20:00.000Z" }
        ]
      }),
      mk({
        type: "Decision", title: "Adopt React (with TypeScript) for the new customer portal frontend",
        description: "Framework selection for the greenfield portal. Options weighed: React, Vue, and server-rendered templates.",
        decisionMade: "The portal will be built as a React + TypeScript single-page app, bundled with Vite.",
        rationale: "Team already has deep React experience, the component ecosystem covers our needs, and hiring is easier. Vue was close but the existing skill set tipped it.",
        status: "Resolved", priority: "Medium", workstream: "Customer portal", owner: "Reid", reporter: "Reid",
        createdDate: todayISO(-25), resolvedDate: todayISO(-18), tags: ["architecture", "frontend"]
      }),
      mk({
        type: "Risk", title: "Insufficient QA capacity for the compressed release window",
        description: "With one QA engineer on leave in the release week, regression coverage for the payments flow may be incomplete.",
        status: "Open", priority: "Medium", workstreams: ["Payments", "Compliance"], owner: "Jordan Lee", reporter: "Priya Patel",
        createdDate: todayISO(-11), dueDate: todayISO(9), likelihood: "Medium", impact: "High",
        mitigationPlan: "Cross-train two engineers on the payments regression suite this sprint. Automate the top 10 checkout paths so manual effort in the release week drops. Line up a contract QA resource on standby.",
        links: ["RAID-1"], tags: ["qa", "capacity"]
      }),
      mk({
        type: "Action", title: "Schedule the pre-launch security review with InfoSec",
        description: "InfoSec needs two weeks' notice for a full review. Get on their calendar and share the threat model doc.",
        nextStep: "Send the review request form to InfoSec today with the architecture diagram attached.",
        status: "Open", priority: "Medium", workstream: "Compliance", owner: "Morgan Blake", reporter: "Reid",
        createdDate: todayISO(-5), dueDate: todayISO(3), tags: ["security", "compliance"], groups: ["Weekly Sync"]
      }),
      mk({
        type: "Issue", title: "Customer CSV import fails for files that are not UTF-8 encoded",
        description: "Imports of Latin-1 / Windows-1252 CSV exports throw a decode error instead of falling back or reporting a friendly message.",
        status: "Open", priority: "Low", severity: "Medium", workstream: "Customer portal", owner: "Taylor Kim", reporter: "Dana Okafor",
        createdDate: todayISO(-7), dueDate: todayISO(20), tags: ["import", "bug", "encoding"]
      }),
      mk({
        type: "Decision", title: "Defer SSO / SAML integration to Phase 2",
        description: "Whether to include enterprise SSO in the initial launch scope.",
        decisionMade: "SSO is out of scope for launch and moves to Phase 2 (Q1 next year).",
        rationale: "Only two prospects require it at launch and both accepted a Phase 2 commitment. Including it now would push the date by ~3 weeks.",
        status: "Closed", priority: "Low", workstream: "Customer portal", owner: "Reid", reporter: "Morgan Blake",
        createdDate: todayISO(-30), resolvedDate: todayISO(-22), tags: ["scope", "auth"]
      }),
      mk({
        type: "Task", title: "Send my updated availability to the PMO for capacity planning",
        description: "They need it before the weekly Thursday capacity call.",
        status: "Open", priority: "Medium", recurrence: "Weekly", owners: ["Reid"],
        createdDate: todayISO(-2), dueDate: todayISO(1), tags: ["admin"]
      }),
      mk({
        type: "Task", title: "Review the vendor contract redlines before the 1:1 with Legal",
        description: "Focus on the SLA section and the termination clause — flag anything that shifts risk onto us.",
        status: "In Progress", priority: "High", workstream: "Compliance", owners: ["Reid", "Morgan Blake"],
        createdDate: todayISO(-4), dueDate: todayISO(-1), tags: ["contract", "prep"],
        comments: [{ text: "First pass done. SLA credits look thin — need to raise this.", who: "Reid", ts: todayISO(-1) + "T08:15:00.000Z" }]
      })
    ];
    store.items.forEach(function (it) {
      (it.links || []).forEach(function (lid) {
        var other = store.items.find(function (x) { return x.id === lid; });
        if (other) { other.links = other.links || []; if (other.links.indexOf(it.id) === -1) other.links.push(it.id); }
      });
    });
    persist();
    persistSettings();
  }

  // ---------- Scope / filtering / sorting ----------
  function isTasksScope() { return store.ui.scope === "tasks"; }
  function isGroupScope() { return store.ui.scope === "group"; }
  function baseItems() {
    if (isGroupScope()) {
      var g = store.ui.activeGroup;
      return store.items.filter(function (it) { return (it.groups || []).indexOf(g) !== -1; });
    }
    return store.items.filter(function (it) {
      return isTasksScope() ? it.type === "Task" : it.type !== "Task";
    });
  }
  // The main RAID Board and List views also show tasks (still off the dashboard, by-type views, and export).
  function mainViewWithTasks() {
    return store.ui.scope === "raid" && !store.ui.typeView &&
      (store.ui.view === "board" || store.ui.view === "list");
  }
  function poolItems() {
    if (isGroupScope()) return baseItems();
    return mainViewWithTasks() ? store.items.slice() : baseItems();
  }
  function activeFilters() {
    var f = Object.assign({}, store.ui.filters);
    if (store.ui.typeView && !isTasksScope()) f.type = [store.ui.typeView];
    return f;
  }
  function weekBounds() {
    var n = new Date(todayISO() + "T00:00:00");
    return { start: todayISO(-n.getDay()), end: todayISO(6 - n.getDay()) };  // Sun … Sat of this week
  }
  function dueMatchesOne(it, opt) {
    var d = it.dueDate, t = todayISO();
    switch (opt) {
      case "No due date": return !d;
      case "Past due": return !!d && d < t && it.status !== "Resolved" && it.status !== "Closed";
      case "Due today": return d === t;
      case "Due tomorrow": return d === todayISO(1);
      case "Due in next 7 days": return !!d && d >= t && d <= todayISO(7);
      case "Due this week": { if (!d) return false; var w = weekBounds(); return d >= w.start && d <= w.end; }
    }
    return true;
  }
  function dueMatches(it, dueArr, dueOn) {
    if (dueOn && it.dueDate !== dueOn) return false;
    if (!dueArr || !dueArr.length) return true;
    if (isNoneFilter(dueArr)) return false;
    return dueArr.some(function (c) { return dueMatchesOne(it, c); });
  }
  function filteredItems() {
    var f = activeFilters();
    var q = f.search.trim().toLowerCase();
    var vis = f.visibility || "active";
    return poolItems().filter(function (it) {
      if (vis === "active" && it.hidden) return false;
      if (vis === "hidden" && !it.hidden) return false;
      if (f.type.length && f.type.indexOf(it.type) === -1) return false;
      if (f.status.length && f.status.indexOf(it.status) === -1) return false;
      if (f.priority.length && f.priority.indexOf(it.priority) === -1) return false;
      if (f.owner.length) {
        var os = it.owners || [];
        if (!f.owner.some(function (o) { return o === UNASSIGNED ? !os.length : os.indexOf(o) !== -1; })) return false;
      }
      if (f.workstream.length) {
        var ws = it.workstreams || [];
        if (!f.workstream.some(function (w) { return w === NO_WORKSTREAM ? !ws.length : ws.indexOf(w) !== -1; })) return false;
      }
      if (f.tag.length && !f.tag.some(function (t) { return (it.tags || []).indexOf(t) !== -1; })) return false;
      if (!dueMatches(it, f.due, f.dueOn)) return false;
      if (q) {
        var hay = (it.id + " " + it.title + " " + it.description + " " + (it.workstreams || []).join(" ") + " " + (it.groups || []).join(" ") + " " +
          (it.owners || []).join(" ") + " " + (it.nextStep || "") + " " + (it.mitigationPlan || "") + " " +
          (it.decisionMade || "") + " " + (it.rationale || "") + " " + (it.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }
  function sortItems(list) {
    var s = store.ui.sort;
    var dir = s.dir === "asc" ? 1 : -1;
    var pOrder = { Low: 0, Medium: 1, High: 2, Critical: 3 };
    var stOrder = {}; STATUSES.forEach(function (x, i) { stOrder[x] = i; });
    return list.slice().sort(function (a, b) {
      var av, bv;
      switch (s.key) {
        case "id": av = parseInt(a.id.split("-")[1], 10); bv = parseInt(b.id.split("-")[1], 10); break;
        case "priority": av = pOrder[a.priority]; bv = pOrder[b.priority]; break;
        case "status": av = stOrder[a.status]; bv = stOrder[b.status]; break;
        case "dueDate": av = a.dueDate || "9999"; bv = b.dueDate || "9999"; break;
        case "owner": av = (a.owners || []).join(", ").toLowerCase(); bv = (b.owners || []).join(", ").toLowerCase(); break;
        case "workstream": av = (a.workstreams || []).join(", ").toLowerCase(); bv = (b.workstreams || []).join(", ").toLowerCase(); break;
        default: av = (a[s.key] || "").toString().toLowerCase(); bv = (b[s.key] || "").toString().toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function isOpenStatus(it) { return it.status !== "Resolved" && it.status !== "Closed"; }
  function uniqueOwners() {
    // only owners of still-open items — a name drops out once its items are all done/deleted
    var s = {};
    store.items.forEach(function (i) { if (isOpenStatus(i)) (i.owners || []).forEach(function (o) { if (o) s[o] = 1; }); });
    return Object.keys(s).sort();
  }
  function uniqueTags() {
    var s = {};
    store.items.forEach(function (i) { (i.tags || []).forEach(function (t) { if (t) s[t] = 1; }); });
    return Object.keys(s).sort();
  }
  function workstreamList() {
    var out = (store.settings.workstreams || []).slice();
    var seen = {}; out.forEach(function (w) { seen[w] = 1; });
    store.items.forEach(function (i) { (i.workstreams || []).forEach(function (w) { if (w && !seen[w]) { seen[w] = 1; out.push(w); } }); });
    return out;
  }
  function groupList() {
    var out = (store.settings.groups || []).slice();
    var seen = {}; out.forEach(function (g) { seen[g] = 1; });
    store.items.forEach(function (i) { (i.groups || []).forEach(function (g) { if (g && !seen[g]) { seen[g] = 1; out.push(g); } }); });
    return out;
  }
  function groupCount(g) {
    return store.items.filter(function (i) { return (i.groups || []).indexOf(g) !== -1 && !i.hidden; }).length;
  }
  // Quick-create a group from anywhere an item is being assigned to one. Returns the name, or "" if cancelled.
  function promptNewGroup() {
    var name = prompt("New group name (e.g. a meeting or theme):");
    if (!name) return "";
    name = name.trim();
    if (!name) return "";
    if (store.settings.groups.indexOf(name) === -1) { store.settings.groups.push(name); persistSettings(); }
    return name;
  }
  function linkTargets() {
    // open RAID items that can be linked to (not tasks, not done)
    return store.items.filter(function (o) { return o.type !== "Task" && isOpenStatus(o); });
  }
  function resolveLink(v) {
    v = (v || "").trim();
    if (!v) return null;
    var m = v.match(/^(RAID-\d+)/i);
    if (m) { var it = getItem(m[1].toUpperCase()); return it && it.type !== "Task" ? it.id : null; }
    var exact = store.items.find(function (o) { return o.type !== "Task" && (o.id + " — " + o.title) === v; });
    if (exact) return exact.id;
    var byTitle = store.items.find(function (o) { return o.type !== "Task" && o.title.toLowerCase() === v.toLowerCase(); });
    return byTitle ? byTitle.id : null;
  }
  function optsFor(key) {
    var pool = poolItems();
    if (key === "type") return (mainViewWithTasks() || isGroupScope()) ? ALL_TYPES : TYPES;
    if (key === "status") return STATUSES;
    if (key === "priority") return PRIORITIES;
    if (key === "owner") return (pool.some(function (i) { return !(i.owners || []).length; }) ? [UNASSIGNED] : []).concat(uniqueOwners());
    if (key === "workstream") return (pool.some(function (i) { return !(i.workstreams || []).length; }) ? [NO_WORKSTREAM] : []).concat(workstreamList());
    if (key === "tag") return uniqueTags();
    if (key === "due") return DUE_OPTS;
    return [];
  }
  function sanitizeFilters() {
    var f = store.ui.filters;
    ["type", "owner", "workstream", "tag", "due"].forEach(function (k) {
      if (isNoneFilter(f[k])) return;
      var valid = optsFor(k);
      f[k] = f[k].filter(function (v) { return valid.indexOf(v) !== -1; });
    });
  }

  // ---------- Renderers ----------
  var viewEl = document.getElementById("view");

  function render() {
    if (unhideStale()) persist();
    sanitizeFilters();
    renderNav();
    renderDash();
    renderFilters();
    renderKpi();
    var ui = store.ui;
    document.getElementById("toggleDash").textContent = ui.showDash ? "Hide summary" : "Show summary";
    document.getElementById("dash").classList.toggle("hidden", !ui.showDash);

    var title;
    if (isGroupScope()) title = "Group: " + ui.activeGroup;
    else if (isTasksScope()) title = ui.view === "list" ? "Task list" : "Tasks";
    else if (ui.typeView) title = ui.typeView + "s";
    else if (ui.view === "matrix") title = "Risk Matrix";
    else if (ui.view === "list") title = "List";
    else title = "Board";
    document.getElementById("viewTitle").textContent = title;

    if (ui.scope === "raid" && ui.view === "matrix") renderMatrix();
    else if (ui.view === "list" || ui.typeView) renderList();
    else renderBoard();

    if (ui.selectedId) renderDetailModal(ui.selectedId);
    persistPrefs();
  }

  function renderNav() {
    var ui = store.ui;
    document.querySelectorAll(".nav-item[data-nav]").forEach(function (b) {
      var nav = b.getAttribute("data-nav");
      var active = false;
      if (nav === "board") active = ui.scope === "raid" && ui.view === "board" && !ui.typeView;
      else if (nav === "list") active = ui.scope === "raid" && ui.view === "list" && !ui.typeView;
      else if (nav === "matrix") active = ui.scope === "raid" && ui.view === "matrix";
      else if (nav === "taskboard") active = ui.scope === "tasks" && ui.view !== "list";
      else if (nav === "tasklist") active = ui.scope === "tasks" && ui.view === "list";
      else if (nav.indexOf("type:") === 0) active = ui.scope === "raid" && ui.typeView === nav.split(":")[1];
      b.classList.toggle("active", active);
    });
    ALL_TYPES.forEach(function (t) {
      var c = document.querySelector('[data-count="' + t + '"]');
      if (c) c.textContent = store.items.filter(function (i) { return i.type === t && !i.hidden; }).length;
    });
    renderGroupNav();
  }
  function renderGroupNav() {
    var el = document.getElementById("groupNavList");
    if (!el) return;
    var groups = groupList();
    if (!groups.length) {
      el.innerHTML = '<div class="hint" style="padding:2px 20px 8px">No groups yet — add one in Settings &amp; data.</div>';
      return;
    }
    el.innerHTML = groups.map(function (g) {
      var active = isGroupScope() && store.ui.activeGroup === g;
      return '<button class="nav-item' + (active ? " active" : "") + '" data-nav="group:' + esc(g) + '">' +
        '<span class="dot" style="background:var(--group)"></span> ' + esc(g) +
        ' <span class="count">' + groupCount(g) + "</span></button>";
    }).join("");
  }

  function dcard(label, value, sub) {
    return '<div class="dash-card"><div class="label">' + label + '</div><div class="value">' + value +
      '</div><div class="sub">' + (sub || "") + "</div></div>";
  }
  function visibleItems() { return baseItems().filter(function (i) { return !i.hidden; }); }
  function renderDash() {
    if (isGroupScope()) { renderGroupDash(); return; }
    if (isTasksScope()) { renderTaskDash(); return; }
    var d = document.getElementById("dash");
    var items = visibleItems();
    var byType = {}; TYPES.forEach(function (t) { byType[t] = items.filter(function (i) { return i.type === t; }).length; });
    var overdue = items.filter(isOverdue).length;
    var open = items.filter(function (i) { return i.status !== "Resolved" && i.status !== "Closed"; }).length;
    var byPrio = {}; PRIORITIES.forEach(function (p) { byPrio[p] = items.filter(function (i) { return i.priority === p; }).length; });
    var maxP = Math.max(1, Math.max.apply(null, PRIORITIES.map(function (p) { return byPrio[p]; })));
    var prioColors = { Low: "#5e6c84", Medium: "#ff991f", High: "#ff7452", Critical: "#de350b" };
    d.innerHTML =
      dcard("Total items", items.length, open + " open · " + (items.length - open) + " done") +
      '<div class="dash-card"><div class="label">By type</div>' +
        '<div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">' +
        TYPES.map(function (t) {
          return '<span style="font-weight:700"><span class="type-dot ' + t + '" style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>' +
            byType[t] + "</span>";
        }).join("") + "</div><div class='sub'>R / A / I / D</div></div>" +
      '<div class="dash-card ' + (overdue ? "warn" : "") + '"><div class="label">Overdue</div><div class="value">' + overdue +
        '</div><div class="sub">past due date, not resolved</div></div>' +
      '<div class="dash-card"><div class="label">By priority</div>' +
        '<div class="mini-bars">' + PRIORITIES.map(function (p) {
          return '<div class="bar" title="' + p + ": " + byPrio[p] + '" style="height:' + (100 * byPrio[p] / maxP) + '%;background:' + prioColors[p] + '"></div>';
        }).join("") + "</div>" +
        '<div class="sub">' + byPrio.Critical + " critical · " + byPrio.High + " high</div></div>";
  }
  function renderTaskDash() {
    var d = document.getElementById("dash");
    var items = visibleItems();
    var open = items.filter(function (i) { return i.status !== "Resolved" && i.status !== "Closed"; }).length;
    var overdue = items.filter(isOverdue).length;
    var byPrio = {}; PRIORITIES.forEach(function (p) { byPrio[p] = items.filter(function (i) { return i.priority === p; }).length; });
    var dueSoon = items.filter(function (i) {
      return i.dueDate && i.dueDate <= todayISO() && i.status !== "Resolved" && i.status !== "Closed";
    }).length;
    d.innerHTML =
      dcard("Tasks", items.length, open + " open · " + (items.length - open) + " done") +
      '<div class="dash-card ' + (overdue ? "warn" : "") + '"><div class="label">Overdue</div><div class="value">' + overdue +
        '</div><div class="sub">past due, not done</div></div>' +
      dcard("Due today or sooner", dueSoon, "open tasks") +
      dcard("High / Critical", byPrio.High + byPrio.Critical, "need attention");
  }
  function renderGroupDash() {
    var d = document.getElementById("dash");
    var items = visibleItems();
    var byType = {}; ALL_TYPES.forEach(function (t) { byType[t] = items.filter(function (i) { return i.type === t; }).length; });
    var overdue = items.filter(isOverdue).length;
    var open = items.filter(isOpenStatus).length;
    d.innerHTML =
      dcard("In this group", items.length, open + " open · " + (items.length - open) + " done") +
      '<div class="dash-card"><div class="label">By type</div>' +
        '<div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">' +
        ALL_TYPES.map(function (t) {
          return '<span style="font-weight:700"><span class="type-dot ' + t + '" style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>' +
            byType[t] + "</span>";
        }).join("") + "</div><div class='sub'>R / A / I / D / Task</div></div>" +
      '<div class="dash-card ' + (overdue ? "warn" : "") + '"><div class="label">Overdue</div><div class="value">' + overdue +
        "</div><div class=\"sub\">past due date, not resolved</div></div>";
  }

  // ----- Filter bar (multi-select) -----
  // Model per dimension:
  //   []              → no filter (every box checked, "Select all" checked)
  //   [FILTER_NONE]   → nothing selected (no boxes checked, "Select all" unchecked) → 0 results
  //   [a, b, …]       → active filter, match ANY selected value
  var FILTER_KEYS = ["type", "status", "priority", "owner", "workstream", "tag", "due"];
  var FILTER_LABELS = { type: "Type", status: "Status", priority: "Priority", owner: "Owner", workstream: "Workstream", tag: "Label", due: "Due" };
  function fmulti(key) {
    var label = FILTER_LABELS[key];
    var opts = optsFor(key);
    var sel = store.ui.filters[key];
    var none = isNoneFilter(sel);
    var allChecked = sel.length === 0;
    var active = !allChecked;
    var selCount = none ? 0 : sel.length;
    var openMenu = store.ui._openMenu === key;
    var mq = (openMenu ? (store.ui._menuSearch || "") : "");
    var mqLower = mq.trim().toLowerCase();
    var showSearch = opts.length > 3;   // every real filter has 4+ options — so effectively all of them
    return '<div class="fmulti" data-fmulti-key="' + key + '">' +
      '<button type="button" class="fmulti-btn' + (active ? " on" : "") + '" data-fmulti-toggle="' + key + '">' + esc(label) +
        (active ? " (" + selCount + "/" + opts.length + ")" : "") + " ▾</button>" +
      '<div class="fmulti-menu' + (openMenu ? "" : " hidden") + '">' +
        (opts.length ? (
          (showSearch ? '<input type="text" class="fmulti-search" placeholder="Search ' + esc(label.toLowerCase()) + '…" value="' + esc(mq) + '" autocomplete="off">' : "") +
          '<label class="fmulti-all"><input type="checkbox" data-fall="' + key + '"' + (allChecked ? " checked" : "") + "> <b>Select all</b></label>" +
          opts.map(function (o) {
            var checked = allChecked || (!none && sel.indexOf(o) !== -1);
            var hide = mqLower && o.toLowerCase().indexOf(mqLower) === -1;
            return '<label data-fopt="' + esc(o.toLowerCase()) + '"' + (hide ? " hidden" : "") + '><input type="checkbox" data-fkey="' + key + '" data-fval="' + esc(o) + '"' + (checked ? " checked" : "") + "> " + esc(o) + "</label>";
          }).join("")
        ) : '<div class="hint" style="padding:6px 8px">Nothing to filter</div>') +
      "</div></div>";
  }
  function toggleFilterValue(key, val) {
    var all = optsFor(key);
    var cur = store.ui.filters[key];
    var eff = isNoneFilter(cur) ? [] : (cur.length ? cur.slice() : all.slice());
    var i = eff.indexOf(val);
    if (i === -1) eff.push(val); else eff.splice(i, 1);
    store.ui.filters[key] = eff.length === all.length ? [] : (eff.length === 0 ? [FILTER_NONE] : eff);
  }
  function toggleSelectAll(key) {
    // "Select all" is checked only when the dimension is unfiltered ([]). Clicking toggles all ⟷ none.
    store.ui.filters[key] = store.ui.filters[key].length === 0 ? [FILTER_NONE] : [];
  }
  function renderFilters() {
    var f = store.ui.filters;
    var tasks = isTasksScope();
    var wrap = document.getElementById("filters");
    var vis = f.visibility || "active";
    wrap.innerHTML =
      '<div class="search">🔍<input type="text" id="fSearch" placeholder="Search…" value="' + esc(f.search) + '"></div>' +
      (store.ui.typeView || tasks ? "" : fmulti("type")) +
      fmulti("status") + fmulti("priority") + fmulti("owner") + fmulti("workstream") + fmulti("tag") + fmulti("due") +
      '<input type="date" id="fDueOn" title="Due on this exact date" value="' + esc(f.dueOn) + '">' +
      '<select id="fVisibility" title="Show hidden items"' + (vis !== "active" ? ' class="on"' : "") + ">" +
        '<option value="active"' + (vis === "active" ? " selected" : "") + ">Active items</option>" +
        '<option value="all"' + (vis === "all" ? " selected" : "") + ">Include hidden</option>" +
        '<option value="hidden"' + (vis === "hidden" ? " selected" : "") + ">Hidden only</option>" +
      "</select>" +
      '<span id="filterChips"></span>';
    renderChips();
    if (store.ui._openMenu && store.ui._menuSearch) {
      var si = wrap.querySelector('.fmulti[data-fmulti-key="' + store.ui._openMenu + '"] .fmulti-search');
      if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    }
  }
  function renderChips() {
    var c = document.getElementById("filterChips");
    if (!c) return;
    var f = store.ui.filters;
    var chips = [];
    FILTER_KEYS.forEach(function (k) {
      if (isTasksScope() && k === "type") return;
      var vals = f[k] || [];
      if (!vals.length) return;
      if (isNoneFilter(vals)) {
        chips.push('<span class="chip">' + FILTER_LABELS[k] + ": none" + '<button data-chip-remove data-ck="' + k + '">×</button></span>');
      } else if (vals.length === 1) {
        chips.push('<span class="chip">' + FILTER_LABELS[k] + ": " + esc(vals[0]) + '<button data-chip-remove data-ck="' + k + '" data-cv="' + esc(vals[0]) + '">×</button></span>');
      } else {
        chips.push('<span class="chip">' + FILTER_LABELS[k] + ": " + vals.length + " of " + optsFor(k).length + '<button data-chip-remove data-ck="' + k + '">×</button></span>');
      }
    });
    if (f.search) chips.push('<span class="chip">"' + esc(f.search) + '"<button data-chip-remove data-ck="search">×</button></span>');
    if (f.dueOn) chips.push('<span class="chip">Due ' + fmtDate(f.dueOn) + '<button data-chip-remove data-ck="dueOn">×</button></span>');
    if ((f.visibility || "active") !== "active") chips.push('<span class="chip">' + (f.visibility === "hidden" ? "Hidden only" : "Incl. hidden") + '<button data-chip-remove data-ck="visibility">×</button></span>');
    if (chips.length) chips.push('<button class="btn subtle" id="clearAll">Clear all</button>');
    c.innerHTML = chips.join("");
  }

  // ----- Filter-aware KPI strip -----
  function anyFilterActive() {
    var f = store.ui.filters;
    return !!f.search || !!f.dueOn || (f.visibility || "active") !== "active" ||
      FILTER_KEYS.some(function (k) { return (f[k] || []).length; });
  }
  function renderKpi() {
    var el = document.getElementById("viewkpi");
    if (!el) return;
    if (store.ui.view === "matrix" && !isTasksScope()) { el.innerHTML = ""; return; }
    var shown = filteredItems();
    var vis = store.ui.filters.visibility || "active";
    var total = poolItems().filter(function (i) {
      return vis === "hidden" ? i.hidden : (vis === "all" ? true : !i.hidden);
    }).length;
    var pastDue = shown.filter(function (i) { return dueMatchesOne(i, "Past due"); }).length;
    var thisWeek = shown.filter(function (i) { return dueMatchesOne(i, "Due this week"); }).length;
    var unresolved = shown.filter(isOpenStatus).length;
    var filtered = anyFilterActive();
    el.innerHTML =
      '<span class="kpi"><b>' + shown.length + "</b> " + (filtered ? "match" + (shown.length === 1 ? "" : "es") : "item" + (shown.length === 1 ? "" : "s")) +
        (filtered && shown.length !== total ? ' <span class="kpi-sub">of ' + total + "</span>" : "") + "</span>" +
      '<span class="kpi' + (pastDue ? " warn" : "") + '"><b>' + pastDue + "</b> past due</span>" +
      '<span class="kpi"><b>' + thisWeek + "</b> due this week</span>" +
      '<span class="kpi"><b>' + unresolved + "</b> unresolved</span>";
  }

  function cardHtml(it) {
    var over = isOverdue(it);
    var score = riskScore(it);
    var wss = it.workstreams || [];
    var hasChips = wss.length || (it.tags && it.tags.length);
    return '<div class="card" draggable="true" data-id="' + it.id + '" data-type="' + it.type + '">' +
      '<div class="labels">' +
        '<span class="badge ' + it.type + '">' + it.type + "</span>" +
        (it.type === "Risk" && score ? '<span class="sev-tag ' + riskSeverity(score).cls + '">Sev ' + score + "</span>" : "") +
        (it.type === "Issue" ? '<span class="sev-tag sev-' + it.severity + '">' + it.severity + " sev</span>" : "") +
        (it.type === "Task" && it.recurrence && it.recurrence !== "None"
          ? '<span class="sev-tag" style="background:var(--task-bg);color:#0c4a4a">↻ ' + esc(it.recurrence) + "</span>" : "") +
      "</div>" +
      '<div class="title">' + esc(it.title) + "</div>" +
      (hasChips ? '<div class="labels">' +
        wss.map(function (w) { return '<span class="ws-tag">' + esc(w) + "</span>"; }).join("") +
        (it.tags || []).slice(0, 4).map(function (t) { return '<span class="label-tag">' + esc(t) + "</span>"; }).join("") +
        "</div>" : "") +
      '<div class="meta">' +
        '<span class="id">' + it.id + "</span>" +
        '<span class="flag" data-p="' + it.priority + '" title="' + it.priority + ' priority"></span>' +
        '<span class="spacer"></span>' +
        (it.dueDate ? '<span class="due ' + (over ? "overdue" : "") + '" title="Due ' + fmtDate(it.dueDate) + '">' + fmtDate(it.dueDate) + "</span>" : "") +
        ownerAvatars(it) +
      "</div></div>";
  }

  function renderBoard() {
    var items = filteredItems();
    var taskCount = mainViewWithTasks() ? items.filter(function (it) { return it.type === "Task"; }).length : 0;
    var board = el('<div class="board"></div>');
    STATUSES.forEach(function (st) {
      var inCol = items.filter(function (i) { return i.status === st; });
      var col = el(
        '<div class="col" data-status="' + esc(st) + '">' +
          '<div class="col-head"><span class="pill" data-st="' + esc(st) + '">' + st + '</span><span class="n">' + inCol.length + "</span></div>" +
          '<div class="col-body"></div>' +
        "</div>"
      );
      var body = col.querySelector(".col-body");
      inCol.forEach(function (it) { body.appendChild(el(cardHtml(it))); });
      if (!inCol.length) body.appendChild(el('<div class="col-empty" style="color:var(--text-faint);font-size:12px;text-align:center;padding:12px">Drop here</div>'));
      board.appendChild(col);
    });
    viewEl.innerHTML = taskCount
      ? '<div class="hint" style="margin-bottom:10px">Showing ' + taskCount + " task" + (taskCount === 1 ? "" : "s") + " alongside RAID items — tasks are not included in the Excel export.</div>"
      : "";
    viewEl.appendChild(board);
    wireBoardDnD();
  }

  function optSel(opts, cur) {
    return opts.map(function (o) { return "<option " + (o === cur ? "selected" : "") + ">" + esc(o) + "</option>"; }).join("");
  }
  function tdFor(it, key, edit) {
    var over = isOverdue(it);
    switch (key) {
      case "id": return '<td><span class="id-cell" data-open-row>' + it.id + "</span></td>";
      case "type": return '<td><span class="badge ' + it.type + '">' + it.type + "</span></td>";
      case "title": return edit
        ? '<td class="title-cell"><input type="text" class="ie" data-edit-field="title" value="' + esc(it.title) + '"></td>'
        : '<td class="title-cell">' + esc(it.title) +
          (it.tags && it.tags.length ? " " + it.tags.map(function (t) { return '<span class="label-tag">' + esc(t) + "</span>"; }).join(" ") : "") + "</td>";
      case "workstream": return "<td>" + ((it.workstreams || []).length ? esc((it.workstreams || []).join(", ")) : '<span style="color:var(--text-faint)">—</span>') + "</td>";
      case "status": return edit
        ? '<td><select class="ie" data-edit-field="status">' + optSel(STATUSES, it.status) + "</select></td>"
        : '<td><span class="pill" data-st="' + esc(it.status) + '">' + it.status + "</span></td>";
      case "priority": return edit
        ? '<td><select class="ie" data-edit-field="priority">' + optSel(PRIORITIES, it.priority) + "</select></td>"
        : '<td><span class="flag" data-p="' + it.priority + '">' + it.priority + "</span></td>";
      case "owner": return (it.owners || []).length
        ? '<td><span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + ownerAvatars(it) + "<span>" + esc((it.owners || []).join(", ")) + "</span></span></td>"
        : '<td><span style="color:var(--text-faint)">Unassigned</span></td>';
      case "dueDate": return edit
        ? '<td><input type="date" class="ie" data-edit-field="dueDate" value="' + esc(it.dueDate || "") + '"></td>'
        : '<td style="' + (over ? "color:var(--issue);font-weight:600" : "") + '">' + fmtDate(it.dueDate) + (over ? " ⚠" : "") + "</td>";
      case "_actions": return '<td class="ie-actions"><button type="button" class="btn subtle" data-hide-toggle>' + (it.hidden ? "Unhide" : "Hide") + "</button></td>";
      case "_select": return '<td class="ie-select"><input type="checkbox" class="row-check" data-row-check="' + it.id + '"' +
        (store.ui.selectedRows.indexOf(it.id) !== -1 ? " checked" : "") + "></td>";
    }
    return "<td></td>";
  }
  function bulkGroupOptionsHtml() {
    return '<option value="">Add selected to group…</option>' +
      groupList().map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") +
      '<option value="__new__">+ New group…</option>';
  }
  function renderList() {
    var edit = store.ui.editMode;
    var items = sortItems(filteredItems());
    var s = store.ui.sort;
    function arrow(k) { return s.key === k ? '<span class="arrow">' + (s.dir === "asc" ? "▲" : "▼") + "</span>" : ""; }
    var cols = isTasksScope()
      ? [["id", "ID"], ["title", "Title"], ["workstream", "Workstream"], ["status", "Status"], ["priority", "Priority"], ["owner", "Owner"], ["dueDate", "Due date"]]
      : [["id", "ID"], ["type", "Type"], ["title", "Title"], ["workstream", "Workstream"], ["status", "Status"], ["priority", "Priority"], ["owner", "Owner"], ["dueDate", "Due date"]];
    if (edit) cols = [["_select", ""]].concat(cols, [["_actions", ""]]);
    var visibleIds = items.map(function (it) { return it.id; });
    store.ui.selectedRows = store.ui.selectedRows.filter(function (id) { return visibleIds.indexOf(id) !== -1; });
    var selN = store.ui.selectedRows.length;
    var toolbar = '<div class="list-toolbar">' +
      '<button type="button" class="btn subtle' + (edit ? " on" : "") + '" id="editToggle">' + (edit ? "✓ Done editing" : "✎ Edit rows") + "</button>" +
      (edit && !selN ? '<span class="hint">Title, Status, Priority and Due date are editable inline. Check rows to bulk-add to a group. Click an ID to open the full item.</span>' : "") +
      (edit && selN ? '<span class="bulk-bar"><b>' + selN + " selected</b>" +
        '<select id="bulkGroupAdd">' + bulkGroupOptionsHtml() + "</select>" +
        '<button type="button" class="btn subtle" id="bulkClear">Clear selection</button></span>' : "") +
      "</div>";
    var taskCount = mainViewWithTasks() ? items.filter(function (it) { return it.type === "Task"; }).length : 0;
    if (!items.length) {
      viewEl.innerHTML = toolbar + '<div class="table-wrap"><div class="empty"><div class="big">Nothing here yet</div><div>Try clearing a filter, or use + Create.</div></div></div>';
      return;
    }
    viewEl.innerHTML =
      toolbar +
      (taskCount ? '<div class="hint" style="margin-bottom:8px">Showing ' + taskCount + " task" + (taskCount === 1 ? "" : "s") + " alongside RAID items — tasks are not included in the Excel export.</div>" : "") +
      '<div class="table-wrap"><table><thead><tr>' +
        cols.map(function (c) {
          if (c[0] === "_select") return '<th><input type="checkbox" id="selectAllRows"' + (selN && selN === visibleIds.length ? " checked" : "") + "></th>";
          return c[1] === "" ? "<th></th>" : '<th data-sort="' + c[0] + '">' + c[1] + " " + arrow(c[0]) + "</th>";
        }).join("") +
      "</tr></thead><tbody>" +
      items.map(function (it) {
        return '<tr data-id="' + it.id + '"' + (it.hidden ? ' class="row-hidden"' : "") + ">" +
          cols.map(function (c) { return tdFor(it, c[0], edit); }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  function renderMatrix() {
    var risks = store.items.filter(function (i) { return i.type === "Risk" && !i.hidden; });
    var band = [["m-med", "m-high", "m-crit"], ["m-low", "m-med", "m-high"], ["m-low", "m-low", "m-med"]];
    var impacts = ["High", "Medium", "Low"];
    var likelihoods = ["Low", "Medium", "High"];
    var cells = "";
    for (var r = 0; r < 3; r++) {
      cells += '<div class="axis-y">' + (r === 1 ? "Impact" : "&nbsp;") + "</div>";
      for (var c = 0; c < 3; c++) {
        var here = risks.filter(function (it) { return it.impact === impacts[r] && it.likelihood === likelihoods[c]; });
        cells += '<div class="cell ' + band[r][c] + '">' +
          here.map(function (it) { return '<span class="marker" data-id="' + it.id + '">' + it.id + "</span>"; }).join("") +
          '<span class="cell-label">' + impacts[r] + " / " + likelihoods[c] + "</span></div>";
      }
    }
    cells += '<div class="corner"></div>' + likelihoods.map(function (l) { return '<div class="axis-x">' + l + "</div>"; }).join("");
    var counts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    risks.forEach(function (it) { counts[riskSeverity(riskScore(it)).label]++; });
    viewEl.innerHTML =
      '<div class="matrix-wrap">' +
        "<h2 style='font-size:16px'>Risk matrix — likelihood × impact</h2>" +
        "<p style='color:var(--text-sub);margin-top:4px'>" + risks.length + " risks plotted. Severity = likelihood × impact (Low 1 · Med 2 · High 3).</p>" +
        '<div class="matrix">' + cells + "</div>" +
        '<div class="axis-caption">Likelihood →</div>' +
        "<div style='display:flex;gap:14px;margin-top:16px;flex-wrap:wrap'>" +
          Object.keys(counts).map(function (k) { return '<span class="sev-tag sev-' + k + '">' + k + ": " + counts[k] + "</span>"; }).join("") +
        "</div>" +
      "</div>";
  }

  // ---------- Detail modal ----------
  var modalRoot = document.getElementById("modalRoot");
  function closeModal() { modalRoot.innerHTML = ""; store.ui.selectedId = null; }
  function openItem(id) { store.ui.selectedId = id; renderDetailModal(id); }
  function multiSingular(k) { return { owners: "owner", tags: "label" }[k] || k; }
  function getItem(id) { return store.items.find(function (i) { return i.id === id; }); }

  function updateField(id, field, value, label) {
    var it = getItem(id);
    if (!it) return;
    var old = it[field];
    if (old === value) return;
    it[field] = value;
    if (field === "status") {
      var doneNow = value === "Resolved" || value === "Closed";
      var wasDone = old === "Resolved" || old === "Closed";
      if (doneNow && !it.resolvedDate) it.resolvedDate = todayISO();
      if (!doneNow) it.resolvedDate = null;
      if (doneNow && !wasDone && it.type === "Task" && it.recurrence && it.recurrence !== "None") spawnRecurrence(it);
    }
    var from = old == null || old === "" ? "empty" : old;
    var to = value == null || value === "" ? "empty" : value;
    log(it, "change", "changed <b>" + (label || field) + "</b> from " + esc(String(from)) + " to " + esc(String(to)));
    persist();
    render();
  }

  function spawnRecurrence(done) {
    var nextDue = addInterval(done.dueDate || todayISO(), done.recurrence);
    while (nextDue && nextDue <= todayISO()) {
      var advanced = addInterval(nextDue, done.recurrence);
      if (advanced === nextDue) break;
      nextDue = advanced;
    }
    var copy = {
      id: nextId(), type: "Task", title: done.title,
      description: done.description || "", status: "Open",
      priority: done.priority, workstreams: (done.workstreams || []).slice(),
      owners: (done.owners || []).slice(), reporter: done.reporter,
      createdDate: todayISO(), dueDate: nextDue, resolvedDate: null,
      links: [], tags: (done.tags || []).slice(), recurrence: done.recurrence,
      activity: [{ id: "c0", kind: "create", text: "created automatically from recurring task " + done.id, who: CURRENT_USER, ts: nowISO() }]
    };
    store.items.push(copy);
    log(done, "change", "recurrence — next occurrence created as <b>" + copy.id + "</b>");
    toast("Next occurrence created: " + copy.id + (nextDue ? " (due " + fmtDate(nextDue) + ")" : ""));
  }

  function duplicateItem(id) {
    var it = getItem(id);
    if (!it) return;
    var copy = JSON.parse(JSON.stringify(it));
    copy.id = nextId();
    copy.title = it.title + " (copy)";
    copy.status = "Open";
    copy.resolvedDate = null;
    copy.createdDate = todayISO();
    copy.reporter = CURRENT_USER;
    copy.hidden = false; copy.hiddenOn = null;
    copy.links = [];
    copy.activity = [{ id: "c0", kind: "create", text: "duplicated from " + it.id, who: CURRENT_USER, ts: nowISO() }];
    store.items.push(copy);
    store.ui.scope = copy.type === "Task" ? "tasks" : "raid";
    store.ui.typeView = null;
    if (store.ui.view === "matrix") store.ui.view = "board";
    persist();
    render();
    toast("Created " + copy.id + " as a copy of " + it.id);
    openItem(copy.id);
  }

  function addComment(id, text) {
    var it = getItem(id);
    if (!it || !text.trim()) return;
    it.activity.push({ id: Math.random().toString(36).slice(2), kind: "comment", text: text.trim(), who: CURRENT_USER, ts: nowISO() });
    persist();
    renderDetailModal(id);
    renderBoardOrList();
  }
  function renderBoardOrList() {
    if (store.ui.scope === "raid" && store.ui.view === "matrix") renderMatrix();
    else if (store.ui.view === "list" || store.ui.typeView) renderList();
    else renderBoard();
    renderDash(); renderNav(); renderKpi();
  }
  function applyFilterChange() {
    sanitizeFilters();
    renderFilters();   // rebuilds; reopens the tracked menu
    renderKpi();
    renderBoardOrList();
    persistPrefs();
  }

  function selectField(id, field, label, opts, val, hint) {
    return '<div class="field"><label>' + label + "</label>" +
      '<select data-field="' + field + '" data-id="' + id + '">' +
      opts.map(function (o) { return "<option " + (o === val ? "selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      "</select>" + (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
  }
  function multiFieldHtml(labelText, key, values, listId, placeholder) {
    return '<div class="field"><label>' + labelText + "</label>" +
      '<div class="tag-input-row">' +
      (values || []).map(function (v) {
        return '<span class="tag-pill">' + esc(v) + '<button data-multi-remove="' + key + '" data-val="' + esc(v) + '">×</button></span>';
      }).join("") +
      '<input type="text" data-multi-add="' + key + '"' + (listId ? ' list="' + listId + '"' : "") +
      ' placeholder="' + esc(placeholder) + '" autocomplete="off"></div></div>';
  }
  function wsFieldHtml(current) {
    var avail = workstreamList().filter(function (w) { return current.indexOf(w) === -1; });
    return '<div class="field"><label>Workstreams</label><div class="tag-input-row">' +
      current.map(function (w) { return '<span class="tag-pill">' + esc(w) + '<button data-ws-remove data-val="' + esc(w) + '">×</button></span>'; }).join("") +
      (avail.length
        ? '<select data-ws-add><option value="">+ add…</option>' + avail.map(function (w) { return "<option>" + esc(w) + "</option>"; }).join("") + "</select>"
        : (current.length ? "" : '<span class="hint">Define workstreams in Settings &amp; data.</span>')) +
      "</div></div>";
  }
  function groupFieldHtml(current) {
    var avail = groupList().filter(function (g) { return current.indexOf(g) === -1; });
    return '<div class="field"><label>Groups</label><div class="tag-input-row">' +
      current.map(function (g) { return '<span class="tag-pill group-pill">' + esc(g) + '<button data-group-remove data-val="' + esc(g) + '">×</button></span>'; }).join("") +
      '<select data-group-add><option value="">+ add…</option>' +
        avail.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") +
        '<option value="__new__">+ New group…</option>' +
      "</select>" +
      '<div class="hint" style="width:100%;margin-top:2px">A collection you can pull up as its own board/list — e.g. items to discuss in a meeting.</div>' +
      "</div></div>";
  }

  function renderDetailModal(id) {
    var it = getItem(id);
    if (!it) { closeModal(); return; }
    var isTask = it.type === "Task";
    var score = riskScore(it);
    var sev = score != null ? riskSeverity(score) : null;

    var typeSpecific = "";
    if (it.type === "Risk") {
      typeSpecific =
        '<div class="row2">' + selectField(id, "likelihood", "Likelihood", LMH, it.likelihood) + selectField(id, "impact", "Impact", LMH, it.impact) + "</div>" +
        '<div class="field"><label>Mitigation plan</label><textarea data-field="mitigationPlan" data-id="' + id + '" placeholder="How the risk will be reduced, avoided, or handled if it occurs…">' + esc(it.mitigationPlan || "") + "</textarea></div>";
    } else if (it.type === "Action") {
      typeSpecific = '<div class="field"><label>Next step</label><textarea data-field="nextStep" data-id="' + id + '" placeholder="The immediate next action…">' + esc(it.nextStep || "") + "</textarea></div>";
    } else if (it.type === "Issue") {
      typeSpecific = selectField(id, "severity", "Severity (how bad)", SEVERITIES, it.severity, "Separate from priority, which is how urgent it is.");
    } else if (it.type === "Decision") {
      typeSpecific =
        '<div class="field"><label>Decision made</label><textarea data-field="decisionMade" data-id="' + id + '" placeholder="The decision / outcome…">' + esc(it.decisionMade || "") + "</textarea></div>" +
        '<div class="field"><label>Rationale</label><textarea data-field="rationale" data-id="' + id + '" placeholder="Why this decision…">' + esc(it.rationale || "") + "</textarea></div>";
    }

    var linksBlock = "";
    if (!isTask) {
      var linkedHtml = (it.links || []).map(function (lid) {
        var li = getItem(lid);
        return '<div class="linked-item" data-open="' + lid + '">' +
          (li ? '<span class="type-dot ' + li.type + '" style="width:8px;height:8px;border-radius:50%"></span><b>' + lid + "</b> " + esc(li.title.slice(0, 40)) : "<b>" + esc(lid) + "</b> (missing)") +
          '<button class="rm" data-unlink="' + lid + '" title="Remove link">×</button></div>';
      }).join("");
      linksBlock =
        '<div class="field"><label>Linked items</label><div class="linked-list">' + (linkedHtml || '<span class="hint">No links yet.</span>') + "</div>" +
        '<div class="inline-add"><input type="text" id="linkInput" list="linkOptions" placeholder="Type an ID or title + Enter (Tab to accept)" autocomplete="off"></div>' +
        "</div>";
    }

    var activity = it.activity.slice().sort(function (a, b) { return a.ts > b.ts ? -1 : 1; });
    var actHtml = activity.map(function (a) {
      return '<div class="act ' + a.kind + '">' + avatarEl(a.who) +
        '<div class="body"><div><span class="who">' + esc(a.who) + '</span><span class="when" title="' + fmtDateTime(a.ts) + '">' + fmtNoteDate(a.ts) + "</span></div>" +
        '<div class="text">' + (a.kind === "change" ? a.text : esc(a.text)) + "</div></div></div>";
    }).join("");

    var descLabel = isTask ? "Notes" : "Description";
    var lists =
      '<datalist id="ownerOptions">' + uniqueOwners().map(function (o) { return '<option value="' + esc(o) + '"></option>'; }).join("") + "</datalist>" +
      '<datalist id="tagOptions">' + uniqueTags().map(function (t) { return '<option value="' + esc(t) + '"></option>'; }).join("") + "</datalist>" +
      '<datalist id="linkOptions">' + linkTargets().filter(function (o) { return o.id !== id && (it.links || []).indexOf(o.id) === -1; })
        .map(function (o) { return '<option value="' + esc(o.id + " — " + o.title) + '"></option>'; }).join("") + "</datalist>";

    var overlay = el(
      '<div class="overlay" id="overlay">' +
      '<div class="modal wide">' +
        '<div class="modal-head">' +
          '<span class="badge ' + it.type + '">' + it.type + "</span>" +
          '<span class="id">' + it.id + "</span>" +
          '<span class="spacer"></span>' +
          '<select data-field="status" data-id="' + id + '" style="padding:6px 10px;border:1px solid var(--border-strong);border-radius:4px;font-weight:600">' +
            STATUSES.map(function (s) { return "<option " + (s === it.status ? "selected" : "") + ">" + s + "</option>"; }).join("") +
          "</select>" +
          '<button class="close" id="closeModal">×</button>' +
        "</div>" +
        '<div class="modal-body">' + lists + '<div class="modal-cols">' +
          "<div>" +
            '<div class="field"><label>Title</label><input type="text" data-field="title" data-id="' + id + '" value="' + esc(it.title) + '"></div>' +
            '<div class="field"><label>' + descLabel + '</label><textarea data-field="description" data-id="' + id + '" style="min-height:90px">' + esc(it.description || "") + "</textarea></div>" +
            typeSpecific +
            multiFieldHtml("Labels", "tags", it.tags, "tagOptions", "Add label + Enter (Tab to accept suggestion)") +
            linksBlock +
            '<div class="activity"><h3>Activity &amp; ' + (isTask ? "notes" : "comments") + '</h3>' +
              '<div class="comment-box">' + avatarEl(CURRENT_USER) +
                '<textarea id="commentInput" placeholder="Add a note…"></textarea>' +
              "</div>" +
              '<div style="text-align:right;margin-bottom:14px"><button class="btn primary" id="addComment">Add note</button></div>' +
              '<div class="act-list">' + actHtml + "</div>" +
            "</div>" +
          "</div>" +
          "<div>" +
            (sev ? '<div class="side-box"><h4>Risk severity</h4><div class="score-box" style="background:' + sev.color + '22">' +
              '<div class="n" style="color:' + sev.color + '">' + score + '</div><div class="lbl" style="color:' + sev.color + '">' + sev.label + "</div></div>" +
              '<div class="hint" style="margin-top:8px">' + it.likelihood + " likelihood × " + it.impact + " impact</div></div>" : "") +
            '<div class="side-box"><h4>Details</h4>' +
              selectField(id, "priority", "Priority", PRIORITIES, it.priority) +
              multiFieldHtml("Owners", "owners", it.owners, "ownerOptions", "Add owner + Enter (Tab to accept suggestion)") +
              wsFieldHtml(it.workstreams || []) +
              groupFieldHtml(it.groups || []) +
              '<div class="field"><label>Due date</label><input type="date" data-field="dueDate" data-id="' + id + '" value="' + esc(it.dueDate || "") + '"></div>' +
              (isTask ? '<div class="field" style="margin-bottom:0"><label>Repeat</label><select data-field="recurrence" data-id="' + id + '">' +
                RECUR.map(function (o) { return "<option " + (o === (it.recurrence || "None") ? "selected" : "") + ">" + o + "</option>"; }).join("") +
                '</select><div class="hint">A new occurrence is created when you mark this done.</div></div>' : "") +
            "</div>" +
            '<div class="side-box"><h4>' + (isTask ? "Dates" : "People &amp; dates") + '</h4>' +
              (isTask ? "" : '<div class="side-row"><span class="k">Reporter</span><span class="v">' + esc(it.reporter) + "</span></div>") +
              '<div class="side-row"><span class="k">Created</span><span class="v">' + fmtDate(it.createdDate) + "</span></div>" +
              '<div class="side-row"><span class="k">' + (isTask ? "Done" : "Resolved") + '</span><span class="v">' + (it.resolvedDate ? fmtDate(it.resolvedDate) : "—") + "</span></div>" +
              (isOverdue(it) ? '<div class="side-row"><span class="k">Status</span><span class="v" style="color:var(--issue)">Overdue</span></div>' : "") +
            "</div>" +
            (isTask ? '<div class="hint" style="margin-bottom:12px">Personal task — not shown on the RAID board or included in the Excel export.</div>' : "") +
            (it.hidden ? '<div class="hint" style="margin-bottom:8px;color:var(--text-sub)">Hidden until tomorrow — excluded from views and the export unless you show hidden items. Comes back automatically on ' + fmtDate(todayISO(1)) + ".</div>" : "") +
            '<button class="btn" id="dupItem" style="width:100%;margin-bottom:8px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Duplicate</button>' +
            '<button class="btn" id="hideItem" style="width:100%;margin-bottom:8px">' + (it.hidden ? "Unhide item" : "Hide item") + "</button>" +
            '<button class="btn" id="deleteItem" style="width:100%;color:var(--issue);border-color:var(--issue)">Delete item</button>' +
          "</div>" +
        "</div></div>" +
      "</div></div>"
    );
    modalRoot.innerHTML = "";
    modalRoot.appendChild(overlay);
    wireDetailModal(id);
  }

  function wireDetailModal(id) {
    var overlay = document.getElementById("overlay");
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closeModal(); });
    document.getElementById("closeModal").addEventListener("click", closeModal);

    overlay.querySelectorAll("[data-field]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var field = inp.getAttribute("data-field");
        var label = field.replace(/([A-Z])/g, " $1").toLowerCase();
        var val = typeof inp.value === "string" ? inp.value.trim() : inp.value;
        if (inp.tagName === "INPUT" && inp.type === "text") inp.value = val;
        updateField(id, field, val, label);
      });
    });

    function multiSource(key) { return key === "owners" ? uniqueOwners() : key === "tags" ? uniqueTags() : []; }
    function addMulti(key, v) {
      var it = getItem(id); it[key] = it[key] || [];
      if (it[key].indexOf(v) === -1) {
        it[key].push(v);
        log(it, "change", "added " + multiSingular(key) + " <b>" + esc(v) + "</b>");
        persist(); renderDetailModal(id); renderBoardOrList();
      }
    }
    overlay.querySelectorAll("[data-multi-add]").forEach(function (inp) {
      inp.addEventListener("keydown", function (e) {
        var key = inp.getAttribute("data-multi-add");
        if (e.key === "Tab") {
          var m = bestMatch(inp.value, multiSource(key));
          if (m && m.toLowerCase() !== inp.value.trim().toLowerCase()) { e.preventDefault(); addMulti(key, m); }
          return;
        }
        if (e.key !== "Enter" || !inp.value.trim()) return;
        e.preventDefault();
        addMulti(key, inp.value.trim());
      });
    });
    overlay.querySelectorAll("[data-multi-remove]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-multi-remove"), v = b.getAttribute("data-val");
        var it = getItem(id);
        it[key] = (it[key] || []).filter(function (x) { return x !== v; });
        log(it, "change", "removed " + multiSingular(key) + " <b>" + esc(v) + "</b>");
        persist(); renderDetailModal(id); renderBoardOrList();
      });
    });

    var wsAdd = overlay.querySelector("[data-ws-add]");
    if (wsAdd) wsAdd.addEventListener("change", function () {
      if (!wsAdd.value) return;
      var it = getItem(id); it.workstreams = it.workstreams || [];
      if (it.workstreams.indexOf(wsAdd.value) === -1) {
        it.workstreams.push(wsAdd.value);
        log(it, "change", "added workstream <b>" + esc(wsAdd.value) + "</b>");
        persist(); renderDetailModal(id); renderBoardOrList();
      }
    });
    overlay.querySelectorAll("[data-ws-remove]").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = getItem(id), v = b.getAttribute("data-val");
        it.workstreams = (it.workstreams || []).filter(function (x) { return x !== v; });
        log(it, "change", "removed workstream <b>" + esc(v) + "</b>");
        persist(); renderDetailModal(id); renderBoardOrList();
      });
    });

    var gAdd = overlay.querySelector("[data-group-add]");
    if (gAdd) gAdd.addEventListener("change", function () {
      var v = gAdd.value;
      if (!v) return;
      if (v === "__new__") v = promptNewGroup();
      if (!v) { renderDetailModal(id); return; }
      var it = getItem(id); it.groups = it.groups || [];
      if (it.groups.indexOf(v) === -1) {
        it.groups.push(v);
        log(it, "change", "added to group <b>" + esc(v) + "</b>");
        persist(); renderDetailModal(id); renderBoardOrList(); renderNav();
      }
    });
    overlay.querySelectorAll("[data-group-remove]").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = getItem(id), v = b.getAttribute("data-val");
        it.groups = (it.groups || []).filter(function (x) { return x !== v; });
        log(it, "change", "removed from group <b>" + esc(v) + "</b>");
        persist(); renderDetailModal(id); renderBoardOrList(); renderNav();
      });
    });

    var ci = document.getElementById("commentInput");
    document.getElementById("addComment").addEventListener("click", function () { addComment(id, ci.value); ci.value = ""; });
    ci.addEventListener("keydown", function (e) {
      // Enter saves the note; Shift+Enter for a newline
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); addComment(id, ci.value); ci.value = ""; }
    });

    function addLinkTo(rawVal) {
      var lid = resolveLink(rawVal);
      var it = getItem(id);
      if (!lid) { toast("No matching open item"); return; }
      if (lid === id) { toast("Can't link an item to itself"); return; }
      it.links = it.links || [];
      if (it.links.indexOf(lid) !== -1) { toast(lid + " is already linked"); return; }
      it.links.push(lid);
      log(it, "change", "linked <b>" + lid + "</b>");
      var other = getItem(lid);
      if (other) { other.links = other.links || []; if (other.links.indexOf(id) === -1) other.links.push(id); }
      persist(); renderDetailModal(id); renderBoardOrList();
    }
    var linkInput = document.getElementById("linkInput");
    if (linkInput) linkInput.addEventListener("keydown", function (e) {
      if (e.key === "Tab") {
        var opts = linkTargets().map(function (o) { return o.id + " — " + o.title; });
        var m = bestMatch(linkInput.value, opts);
        if (m && m.toLowerCase() !== linkInput.value.trim().toLowerCase()) { e.preventDefault(); addLinkTo(m); }
        return;
      }
      if (e.key !== "Enter" || !linkInput.value.trim()) return;
      e.preventDefault();
      addLinkTo(linkInput.value);
    });
    overlay.querySelectorAll("[data-unlink]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var it = getItem(id);
        var lid = b.getAttribute("data-unlink");
        it.links = it.links.filter(function (x) { return x !== lid; });
        var other = getItem(lid);
        if (other && other.links) other.links = other.links.filter(function (x) { return x !== id; });
        log(it, "change", "removed link to <b>" + lid + "</b>");
        persist(); renderDetailModal(id); renderBoardOrList();
      });
    });
    overlay.querySelectorAll("[data-open]").forEach(function (b) {
      b.addEventListener("click", function () { openItem(b.getAttribute("data-open")); });
    });

    document.getElementById("dupItem").addEventListener("click", function () { duplicateItem(id); });
    document.getElementById("hideItem").addEventListener("click", function () {
      var it = getItem(id);
      setHidden(it, !it.hidden);
      log(it, "change", it.hidden ? "hidden from views (until tomorrow)" : "unhidden");
      persist(); render();
      toast(id + (it.hidden ? " hidden until tomorrow" : " unhidden"));
    });
    document.getElementById("deleteItem").addEventListener("click", function () {
      var it = getItem(id);
      if (!confirm("Delete " + id + " — “" + it.title + "”? This cannot be undone.")) return;
      store.items = store.items.filter(function (x) { return x.id !== id; });
      store.items.forEach(function (x) { if (x.links) x.links = x.links.filter(function (l) { return l !== id; }); });
      persist(); closeModal(); render();
      toast(id + " deleted");
    });
  }

  // ---------- Create modal ----------
  function openCreate() {
    var chosen = store.ui.typeView || (isTasksScope() ? "Task" : "Risk");
    var createState = { owners: [], tags: [], workstreams: [], groups: isGroupScope() ? [store.ui.activeGroup] : [], links: [] };
    var overlay = el('<div class="overlay" id="overlay"><div class="modal"><div class="modal-head"><b>Create item</b><span class="spacer"></span><button class="close" id="closeModal">×</button></div><div class="modal-body" id="createBody"></div><div class="modal-foot"><button class="btn" id="cCancel">Cancel</button><button class="btn primary" id="cSave">Create</button></div></div></div>');
    modalRoot.innerHTML = ""; modalRoot.appendChild(overlay);

    var COMMON_FIELDS = ["nTitle", "nDesc", "nPriority", "nStatus", "nDue"];
    var chipCfg = {
      nOwnerRow: { key: "owners", list: "ownerOptions", ph: "Add owner + Enter (Tab to accept suggestion)", src: uniqueOwners },
      nTagRow: { key: "tags", list: "tagOptions", ph: "Add label + Enter (Tab to accept suggestion)", src: uniqueTags }
    };
    function fieldSelect(fid, label, opts, val) {
      return '<div class="field"><label>' + label + '</label><select id="' + fid + '">' +
        opts.map(function (o) { return "<option " + (o === val ? "selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select></div>";
    }
    function snapshotCommon() { var f = {}; COMMON_FIELDS.forEach(function (k) { var e = document.getElementById(k); if (e) f[k] = e.value; }); return f; }
    function restoreCommon(f) { Object.keys(f || {}).forEach(function (k) { var e = document.getElementById(k); if (e) e.value = f[k]; }); }
    function chipRowInner(rowId) {
      var cfg = chipCfg[rowId];
      return createState[cfg.key].map(function (v) {
        return '<span class="tag-pill">' + esc(v) + '<button type="button" data-cs-remove="' + rowId + '" data-val="' + esc(v) + '">×</button></span>';
      }).join("") +
        '<input type="text" id="' + rowId + 'Input" list="' + cfg.list + '" placeholder="' + cfg.ph + '" autocomplete="off">';
    }
    function refreshChipRow(rowId) {
      document.getElementById(rowId).innerHTML = chipRowInner(rowId);
      wireChipRow(rowId);
      var i = document.getElementById(rowId + "Input"); if (i) i.focus();
    }
    function wireChipRow(rowId) {
      var cfg = chipCfg[rowId];
      var row = document.getElementById(rowId);
      var inp = document.getElementById(rowId + "Input");
      if (inp) inp.addEventListener("keydown", function (e) {
        if (e.key === "Tab") {
          var m = bestMatch(inp.value, cfg.src());
          if (m && m.toLowerCase() !== inp.value.trim().toLowerCase()) {
            e.preventDefault();
            if (createState[cfg.key].indexOf(m) === -1) createState[cfg.key].push(m);
            refreshChipRow(rowId);
          }
          return;
        }
        if (e.key !== "Enter" || !inp.value.trim()) return;
        e.preventDefault();
        var v = inp.value.trim();
        if (createState[cfg.key].indexOf(v) === -1) createState[cfg.key].push(v);
        refreshChipRow(rowId);
      });
      row.querySelectorAll("[data-cs-remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          createState[cfg.key] = createState[cfg.key].filter(function (x) { return x !== btn.getAttribute("data-val"); });
          refreshChipRow(rowId);
        });
      });
    }
    function wsRowInner() {
      var avail = workstreamList().filter(function (w) { return createState.workstreams.indexOf(w) === -1; });
      return createState.workstreams.map(function (w) { return '<span class="tag-pill">' + esc(w) + '<button type="button" data-ws-remove data-val="' + esc(w) + '">×</button></span>'; }).join("") +
        (avail.length
          ? '<select id="nWsAdd"><option value="">+ add…</option>' + avail.map(function (w) { return "<option>" + esc(w) + "</option>"; }).join("") + "</select>"
          : (createState.workstreams.length ? "" : '<span class="hint">Define workstreams in Settings &amp; data.</span>'));
    }
    function refreshWs() { document.getElementById("nWsRow").innerHTML = wsRowInner(); wireWs(); }
    function wireWs() {
      var add = document.getElementById("nWsAdd");
      if (add) add.addEventListener("change", function () {
        if (add.value && createState.workstreams.indexOf(add.value) === -1) createState.workstreams.push(add.value);
        refreshWs();
      });
      document.getElementById("nWsRow").querySelectorAll("[data-ws-remove]").forEach(function (b) {
        b.addEventListener("click", function () {
          createState.workstreams = createState.workstreams.filter(function (x) { return x !== b.getAttribute("data-val"); });
          refreshWs();
        });
      });
    }
    function groupRowInner() {
      var avail = groupList().filter(function (g) { return createState.groups.indexOf(g) === -1; });
      return createState.groups.map(function (g) { return '<span class="tag-pill group-pill">' + esc(g) + '<button type="button" data-group-remove data-val="' + esc(g) + '">×</button></span>'; }).join("") +
        '<select id="nGroupAdd"><option value="">+ add…</option>' +
          avail.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") +
          '<option value="__new__">+ New group…</option>' +
        "</select>";
    }
    function refreshGroups() { document.getElementById("nGroupRow").innerHTML = groupRowInner(); wireGroups(); }
    function wireGroups() {
      var add = document.getElementById("nGroupAdd");
      if (add) add.addEventListener("change", function () {
        var v = add.value;
        if (!v) return;
        if (v === "__new__") v = promptNewGroup();
        if (v && createState.groups.indexOf(v) === -1) createState.groups.push(v);
        refreshGroups();
      });
      document.getElementById("nGroupRow").querySelectorAll("[data-group-remove]").forEach(function (b) {
        b.addEventListener("click", function () {
          createState.groups = createState.groups.filter(function (x) { return x !== b.getAttribute("data-val"); });
          refreshGroups();
        });
      });
    }
    function linkRowInner() {
      return createState.links.map(function (lid) {
        var li = getItem(lid);
        return '<span class="tag-pill">' + esc(lid) + (li ? " " + esc(li.title.slice(0, 22)) : "") + '<button type="button" data-link-remove data-val="' + esc(lid) + '">×</button></span>';
      }).join("") +
        '<input type="text" id="nLinkInput" list="linkOptions" placeholder="Type an ID or title + Enter (Tab to accept)" autocomplete="off">';
    }
    function refreshLinks() { document.getElementById("nLinkRow").innerHTML = linkRowInner(); wireLinks(); }
    function wireLinks() {
      var inp = document.getElementById("nLinkInput");
      function addLink(raw) {
        var lid = resolveLink(raw);
        if (!lid) { toast("No matching open item"); return; }
        if (createState.links.indexOf(lid) === -1) createState.links.push(lid);
        refreshLinks();
      }
      if (inp) inp.addEventListener("keydown", function (e) {
        if (e.key === "Tab") {
          var opts = linkTargets().map(function (o) { return o.id + " — " + o.title; });
          var m = bestMatch(inp.value, opts);
          if (m && m.toLowerCase() !== inp.value.trim().toLowerCase()) { e.preventDefault(); addLink(m); }
          return;
        }
        if (e.key !== "Enter" || !inp.value.trim()) return;
        e.preventDefault();
        addLink(inp.value);
      });
      document.getElementById("nLinkRow").querySelectorAll("[data-link-remove]").forEach(function (b) {
        b.addEventListener("click", function () {
          createState.links = createState.links.filter(function (x) { return x !== b.getAttribute("data-val"); });
          refreshLinks();
        });
      });
    }

    function body() {
      var isTask = chosen === "Task";
      var b = document.getElementById("createBody");
      b.innerHTML =
        '<datalist id="ownerOptions">' + uniqueOwners().map(function (o) { return '<option value="' + esc(o) + '"></option>'; }).join("") + "</datalist>" +
        '<datalist id="tagOptions">' + uniqueTags().map(function (t) { return '<option value="' + esc(t) + '"></option>'; }).join("") + "</datalist>" +
        '<datalist id="linkOptions">' + linkTargets().filter(function (o) { return createState.links.indexOf(o.id) === -1; })
          .map(function (o) { return '<option value="' + esc(o.id + " — " + o.title) + '"></option>'; }).join("") + "</datalist>" +
        '<div class="field"><label>Type</label><div class="type-picker">' +
          ALL_TYPES.map(function (t) {
            return '<button type="button" class="type-opt ' + (t === chosen ? "sel" : "") + '" data-type="' + t + '"><span class="ic">' + TYPE_ICON[t] + "</span>" + t + "</button>";
          }).join("") +
        "</div></div>" +
        '<div class="field"><label>Title *</label><input type="text" id="nTitle" placeholder="Short summary"></div>' +
        '<div class="field"><label>' + (isTask ? "Notes" : "Description") + '</label><textarea id="nDesc" placeholder="Longer detail…"></textarea></div>' +
        typeFields(isTask) +
        '<div class="row2">' + fieldSelect("nPriority", "Priority", PRIORITIES, "Medium") + fieldSelect("nStatus", "Status", STATUSES, "Open") + "</div>" +
        '<div class="field"><label>Due date</label><input type="date" id="nDue"></div>' +
        '<div class="field"><label>Workstreams</label><div class="tag-input-row" id="nWsRow">' + wsRowInner() + "</div></div>" +
        '<div class="field"><label>Groups</label><div class="tag-input-row" id="nGroupRow">' + groupRowInner() + "</div></div>" +
        '<div class="field"><label>Owners</label><div class="tag-input-row" id="nOwnerRow">' + chipRowInner("nOwnerRow") + "</div></div>" +
        '<div class="field"><label>Labels</label><div class="tag-input-row" id="nTagRow">' + chipRowInner("nTagRow") + "</div></div>" +
        (isTask ? "" : '<div class="field"><label>Linked items</label><div class="tag-input-row" id="nLinkRow">' + linkRowInner() + "</div></div>") +
        (isTask ? '<div class="hint">Tasks stay off the RAID board and out of the Excel export.</div>' : "");

      b.querySelectorAll(".type-opt").forEach(function (opt) {
        opt.addEventListener("click", function () {
          var keep = snapshotCommon();
          chosen = opt.getAttribute("data-type");
          body();
          restoreCommon(keep);
        });
      });
      wireChipRow("nOwnerRow");
      wireChipRow("nTagRow");
      wireWs();
      wireGroups();
      if (!isTask) wireLinks();

      function typeFields(isTask) {
        if (isTask) return fieldSelect("nRecur", "Repeat", RECUR, "None");
        if (chosen === "Risk") return '<div class="row2">' + fieldSelect("nLikelihood", "Likelihood", LMH, "Medium") + fieldSelect("nImpact", "Impact", LMH, "Medium") + "</div>" +
          '<div class="field"><label>Mitigation plan</label><textarea id="nMitigation" placeholder="How the risk will be reduced, avoided, or handled if it occurs…"></textarea></div>';
        if (chosen === "Action") return '<div class="field"><label>Next step</label><input type="text" id="nNext" placeholder="Immediate next action"></div>';
        if (chosen === "Issue") return fieldSelect("nSeverity", "Severity", SEVERITIES, "Medium");
        if (chosen === "Decision") return '<div class="field"><label>Decision made</label><textarea id="nDecision" placeholder="The outcome…"></textarea></div><div class="field"><label>Rationale</label><textarea id="nRationale" placeholder="Why…"></textarea></div>';
        return "";
      }
    }
    body();

    function close() { modalRoot.innerHTML = ""; }
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    document.getElementById("closeModal").addEventListener("click", close);
    document.getElementById("cCancel").addEventListener("click", close);
    document.getElementById("cSave").addEventListener("click", function () {
      var isTask = chosen === "Task";
      var title = document.getElementById("nTitle").value.trim();
      if (!title) { document.getElementById("nTitle").focus(); toast("Title is required"); return; }
      [["nOwnerRowInput", "owners"], ["nTagRowInput", "tags"]].forEach(function (p) {
        var inp = document.getElementById(p[0]);
        if (inp && inp.value.trim() && createState[p[1]].indexOf(inp.value.trim()) === -1) createState[p[1]].push(inp.value.trim());
      });
      var it = {
        id: nextId(), type: chosen, title: title,
        description: document.getElementById("nDesc").value.trim(),
        status: document.getElementById("nStatus").value,
        priority: document.getElementById("nPriority").value,
        workstreams: createState.workstreams.slice(),
        groups: createState.groups.slice(),
        owners: createState.owners.slice(),
        reporter: CURRENT_USER,
        createdDate: todayISO(),
        dueDate: document.getElementById("nDue").value || "",
        resolvedDate: null, links: isTask ? [] : createState.links.slice(),
        tags: createState.tags.slice(),
        activity: []
      };
      if (chosen === "Risk") { it.likelihood = document.getElementById("nLikelihood").value; it.impact = document.getElementById("nImpact").value; it.mitigationPlan = document.getElementById("nMitigation").value.trim(); }
      if (chosen === "Action") { it.nextStep = document.getElementById("nNext").value.trim(); }
      if (chosen === "Issue") { it.severity = document.getElementById("nSeverity").value; }
      if (chosen === "Decision") { it.decisionMade = document.getElementById("nDecision").value.trim(); it.rationale = document.getElementById("nRationale").value.trim(); }
      if (isTask) { var rc = document.getElementById("nRecur"); it.recurrence = rc ? rc.value : "None"; }
      if (it.status === "Resolved" || it.status === "Closed") it.resolvedDate = todayISO();
      it.activity.push({ id: "c0", kind: "create", text: "created this " + chosen.toLowerCase(), who: CURRENT_USER, ts: nowISO() });
      store.items.push(it);
      (it.links || []).forEach(function (lid) {
        var o = getItem(lid);
        if (o) { o.links = o.links || []; if (o.links.indexOf(it.id) === -1) o.links.push(it.id); }
      });

      var stayInGroup = isGroupScope() && (it.groups || []).indexOf(store.ui.activeGroup) !== -1;
      if (stayInGroup) {
        // already the right scope/group — just make sure we land on a real view
        if (store.ui.view === "matrix") store.ui.view = "board";
      } else if (isTask) { store.ui.scope = "tasks"; store.ui.view = "board"; store.ui.typeView = null; }
      else {
        store.ui.scope = "raid";
        if (store.ui.view === "matrix") store.ui.view = "board";
        if (store.ui.typeView && store.ui.typeView !== chosen) store.ui.typeView = null;
      }
      persist(); close(); render();
      toast(it.id + " created");
      openItem(it.id);
    });
    document.getElementById("nTitle").focus();
  }

  // ---------- Excel (.xlsx) export ----------
  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;
    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = f.data;
      var crc = crc32(data);
      var size = data.length;
      var local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0));
      chunks.push(new Uint8Array(local), name, data);
      var cd = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(cd), name);
      offset += local.length + name.length + size;
    });
    var cdStart = offset;
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    central.forEach(function (c) { chunks.push(c); });
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0))));
    var total = chunks.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }
  function colRef(n) {
    var s = ""; n++;
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function makeXlsx(sheetName, rows) {
    var enc = new TextEncoder();
    function x(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
    var body = rows.map(function (row, ri) {
      var cells = row.map(function (val, ci) {
        var ref = colRef(ci) + (ri + 1);
        if (typeof val === "number" && isFinite(val)) return '<c r="' + ref + '"><v>' + val + "</v></c>";
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + x(val == null ? "" : val) + "</t></is></c>";
      }).join("");
      return '<row r="' + (ri + 1) + '">' + cells + "</row>";
    }).join("");
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + body + "</sheetData></worksheet>";
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + x(sheetName).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    return zipStore([
      { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
      { name: "_rels/.rels", data: enc.encode(rels) },
      { name: "xl/workbook.xml", data: enc.encode(workbook) },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
      { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet) }
    ]);
  }
  function exportXLSX() {
    var headers = ["ID", "Type", "Title", "Description", "Workstreams", "Groups", "Status", "Priority", "Owners", "Reporter",
      "Created", "Due date", "Resolved", "Likelihood", "Impact", "Risk score", "Mitigation plan",
      "Next step", "Severity", "Decision made", "Rationale", "Linked items", "Labels", "Comments"];
    var rows = [headers];
    var exported = store.items.filter(function (it) { return it.type !== "Task" && !it.hidden; });
    exported.forEach(function (it) {
      var comments = it.activity.filter(function (a) { return a.kind === "comment"; })
        .map(function (a) { return a.who + " (" + a.ts.slice(0, 10) + "): " + a.text; }).join(" | ");
      var rs = riskScore(it);
      rows.push([
        it.id, it.type, it.title, it.description || "", (it.workstreams || []).join(", "), (it.groups || []).join(", "), it.status, it.priority,
        (it.owners || []).join(", "), it.reporter,
        it.createdDate || "", it.dueDate || "", it.resolvedDate || "", it.likelihood || "", it.impact || "",
        rs == null ? "" : rs, it.mitigationPlan || "", it.nextStep || "", it.severity || "",
        it.decisionMade || "", it.rationale || "", (it.links || []).join(" "), (it.tags || []).join(" "), comments
      ]);
    });
    var data = makeXlsx("RAID Log", rows);
    downloadFile("RAID Tracker.xlsx", data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    toast("Exported " + exported.length + " items to Excel");
  }

  // ---------- JSON backup / restore ----------
  function downloadFile(name, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function backupPayload() {
    return { app: "raid-log", version: 3, exportedAt: nowISO(), counter: store.counter, settings: store.settings, items: store.items };
  }
  function exportJSON() {
    downloadFile("RAID Tracker.json", JSON.stringify(backupPayload(), null, 2), "application/json");
    toast("Backup downloaded (" + store.items.length + " items)");
  }
  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { toast("Not a valid JSON file"); return; }
      var items = Array.isArray(data) ? data : (data && data.items);
      if (!Array.isArray(items) || !items.length) { toast("No items found in that file"); return; }
      var bad = items.filter(function (it) { return !it || !it.id || !it.type || !it.title; });
      if (bad.length) { toast("File has " + bad.length + " malformed item(s) — not loaded"); return; }
      if (!store.items.length) { applyReplace(items, data); return; }
      promptImportMode(items, data);
    };
    reader.readAsText(file);
  }
  function applyReplace(items, data) {
    items.forEach(migrateItem);
    store.items = items;
    if (data && data.settings && Array.isArray(data.settings.workstreams)) { store.settings = data.settings; persistSettings(); }
    var maxNum = items.reduce(function (m, it) { var n = parseInt(String(it.id).split("-")[1], 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
    store.counter = (data && data.counter && data.counter > maxNum) ? data.counter : maxNum + 1;
    store.ui.selectedId = null;
    modalRoot.innerHTML = "";
    persist(); render();
    toast("Loaded " + items.length + " items from backup");
  }
  function stableStringify(v) {
    if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stableStringify(v[k]); }).join(",") + "}";
    }
    return JSON.stringify(v);
  }
  // Fields that don't define "the same item" — differences here shouldn't stop a duplicate from being recognized.
  var DEDUPE_IGNORE_FIELDS = { id: 1, activity: 1, hidden: 1, hiddenOn: 1 };
  function normalizeForDedupe(it) {
    var out = {};
    Object.keys(it).forEach(function (k) {
      if (DEDUPE_IGNORE_FIELDS[k]) return;
      var v = it[k];
      // Order shouldn't matter for simple list fields (owners, workstreams, tags, links, ...).
      if (Array.isArray(v) && v.every(function (x) { return x === null || typeof x !== "object"; })) v = v.slice().sort();
      out[k] = v;
    });
    return out;
  }
  // Same ID and the same defining content counts as a true duplicate, not a conflict — minor differences in
  // activity/comments, hidden state, or list ordering are ignored so real re-imports of the same item match.
  function itemsEqual(a, b) {
    return stableStringify(normalizeForDedupe(a)) === stableStringify(normalizeForDedupe(b));
  }
  function applyMerge(items, data) {
    var existingById = {};
    store.items.forEach(function (it) { existingById[it.id] = it; });
    var renumbered = 0, skipped = 0;
    items.forEach(function (it) {
      migrateItem(it);
      var n = parseInt(String(it.id).split("-")[1], 10);
      if (!isNaN(n) && n >= store.counter) store.counter = n + 1;
      var existing = existingById[it.id];
      if (existing) {
        if (itemsEqual(existing, it)) { skipped++; return; }
        it.id = "RAID-" + (store.counter++);
        renumbered++;
      }
      existingById[it.id] = it;
      store.items.push(it);
    });
    if (data && data.settings && Array.isArray(data.settings.workstreams)) {
      data.settings.workstreams.forEach(function (w) {
        if (store.settings.workstreams.indexOf(w) === -1) store.settings.workstreams.push(w);
      });
      persistSettings();
    }
    store.ui.selectedId = null;
    modalRoot.innerHTML = "";
    persist(); render();
    var added = items.length - skipped;
    var extras = [];
    if (renumbered) extras.push(renumbered + " renumbered to avoid ID clashes");
    if (skipped) extras.push(skipped + " duplicate" + (skipped === 1 ? "" : "s") + " skipped");
    toast("Merged " + added + " item" + (added === 1 ? "" : "s") + " into the log" +
      (extras.length ? " (" + extras.join(", ") + ")" : ""));
  }
  function promptImportMode(items, data) {
    var n = items.length, cur = store.items.length;
    var overlay = el(
      '<div class="overlay" id="importOverlay"><div class="modal" style="max-width:440px">' +
        '<div class="modal-head"><b>Load backup</b><span class="spacer"></span><button class="close" id="importClose">×</button></div>' +
        '<div class="modal-body">' +
          '<p style="margin:0 0 14px">This file has ' + n + " item" + (n === 1 ? "" : "s") + ". Your log currently has " + cur + " item" + (cur === 1 ? "" : "s") + ". How should it be loaded?</p>" +
          '<div style="display:flex;flex-direction:column;gap:10px">' +
            '<button class="btn primary" id="importMerge" style="text-align:left;padding:10px 14px">Merge with current data' +
              '<div class="hint" style="margin-top:3px">Adds these items alongside what you have. Any ID clashes are renumbered so nothing is overwritten.</div></button>' +
            '<button class="btn danger" id="importReplace" style="text-align:left;padding:10px 14px">Replace all data' +
              '<div class="hint" style="margin-top:3px">Discards everything currently in the log and loads only this file.</div></button>' +
          "</div>" +
        "</div>" +
      "</div></div>"
    );
    modalRoot.innerHTML = ""; modalRoot.appendChild(overlay);
    function close() { modalRoot.innerHTML = ""; }
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    document.getElementById("importClose").addEventListener("click", close);
    document.getElementById("importMerge").addEventListener("click", function () { applyMerge(items, data); });
    document.getElementById("importReplace").addEventListener("click", function () {
      if (!confirm("Replace all " + cur + " current item" + (cur === 1 ? "" : "s") + " with the " + n + " item" + (n === 1 ? "" : "s") + " from this file?")) return;
      applyReplace(items, data);
    });
  }
  function storageWorks() {
    try { localStorage.setItem("raidlog.probe", "1"); localStorage.removeItem("raidlog.probe"); return true; }
    catch (e) { return false; }
  }

  // ---------- Auto-save to a real file (File System Access API — Chromium browsers only) ----------
  var FS_DB = "raidlog-fs", FS_STORE = "handles", FS_KEY = "autosave";
  var fsHandle = null;
  var fsStatus = fsSupported() ? "checking" : "unsupported";  // checking | none | connected | needs-permission | error | unsupported
  var fsSaveTimer = null;
  function fsSupported() { return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function"; }
  function fsDiagnostic() {
    var hasProp = typeof window !== "undefined" && ("showSaveFilePicker" in window);
    var secure = typeof window !== "undefined" && !!window.isSecureContext;
    var proto = typeof location !== "undefined" ? location.protocol : "?";
    var bits = [];
    bits.push("API present: " + (hasProp ? "yes" : "no"));
    bits.push("secure context: " + (secure ? "yes" : "no"));
    bits.push("page loaded via: " + proto);
    return bits.join(" · ");
  }
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(FS_DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(FS_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FS_STORE, "readwrite");
        tx.objectStore(FS_STORE).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FS_STORE, "readonly");
        var req = tx.objectStore(FS_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbDel(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FS_STORE, "readwrite");
        tx.objectStore(FS_STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function scheduleFileSave() {
    if (fsStatus !== "connected") return;
    clearTimeout(fsSaveTimer);
    fsSaveTimer = setTimeout(writeToFile, 800);
  }
  function writeToFile() {
    if (!fsHandle || fsStatus !== "connected") return Promise.resolve();
    return fsHandle.createWritable()
      .then(function (writable) {
        return writable.write(JSON.stringify(backupPayload(), null, 2)).then(function () { return writable.close(); });
      })
      .catch(function () {
        fsStatus = "error";
        refreshAutosaveBlock();
      });
  }
  function connectAutosaveFile() {
    if (!fsSupported()) { toast("This browser doesn't support auto-save to a file — try Chrome or Edge."); return; }
    window.showSaveFilePicker({
      suggestedName: "RAID Tracker.json",
      types: [{ description: "RAID Tracker backup", accept: { "application/json": [".json"] } }]
    }).then(function (handle) {
      fsHandle = handle;
      fsStatus = "connected";
      idbSet(FS_KEY, handle).catch(function () {
        // Couldn't remember the file for next time (e.g. private browsing) — this session still auto-saves fine.
        toast("Connected, but this browser can't remember it for next time");
      });
      refreshAutosaveBlock();
      return writeToFile();
    }).then(function () {
      if (fsStatus === "connected") toast("Now auto-saving to " + fsHandle.name);
    }).catch(function (e) {
      if (e && e.name !== "AbortError") toast("Couldn't connect that file");
    });
  }
  function requestAutosavePermission() {
    if (!fsHandle) return;
    fsHandle.requestPermission({ mode: "readwrite" }).then(function (perm) {
      if (perm === "granted") { fsStatus = "connected"; toast("Auto-save reconnected"); return writeToFile(); }
      toast("Permission was not granted");
    }).catch(function () { toast("Couldn't reconnect"); })
      .then(refreshAutosaveBlock);
  }
  function disconnectAutosaveFile() {
    fsHandle = null;
    fsStatus = "none";
    idbDel(FS_KEY).catch(function () {});
    refreshAutosaveBlock();
    toast("Auto-save file disconnected");
  }
  function tryReconnectOnBoot() {
    if (!fsSupported()) { fsStatus = "unsupported"; return; }
    idbGet(FS_KEY).then(function (handle) {
      if (!handle) { fsStatus = "none"; refreshAutosaveBlock(); return; }
      fsHandle = handle;
      return handle.queryPermission({ mode: "readwrite" }).then(function (perm) {
        fsStatus = perm === "granted" ? "connected" : "needs-permission";
        refreshAutosaveBlock();
      });
    }).catch(function () { fsStatus = "none"; refreshAutosaveBlock(); });
  }
  function autosaveBlockHtml() {
    if (fsStatus === "unsupported") return '<div class="hint">Not available on this page. This needs Chrome, Edge, or Brave, and — in some of those browsers — the page loaded over <code>http(s)://</code> rather than opened directly as a file.' +
      '<span style="display:block;margin-top:6px;font-size:11px;color:var(--text-faint,#888)">Diagnostic: ' + esc(fsDiagnostic()) + '</span></div>';
    if (fsStatus === "checking") return '<div class="hint">Checking for a previously connected file…</div>';
    if (fsStatus === "connected") return '<div class="hint">Auto-saving to <b>' + esc(fsHandle ? fsHandle.name : "your file") + "</b> — every change is written there automatically, in addition to this browser.</div>" +
      '<div class="settings-actions" style="margin-top:8px"><button class="btn" id="fsSaveNow">Save now</button><button class="btn" id="fsDisconnect">Disconnect</button></div>';
    if (fsStatus === "needs-permission") return '<div class="hint">Previously connected to <b>' + esc(fsHandle ? fsHandle.name : "a file") + "</b> — this browser needs you to confirm access again after reloading.</div>" +
      '<div class="settings-actions" style="margin-top:8px"><button class="btn" id="fsReconnect">Reconnect</button><button class="btn" id="fsDisconnect">Disconnect</button></div>';
    if (fsStatus === "error") return '<div class="hint" style="color:var(--issue)">The last save to your file failed — it may have been moved, renamed, or deleted.</div>' +
      '<div class="settings-actions" style="margin-top:8px"><button class="btn" id="fsSaveNow">Try again</button><button class="btn" id="fsDisconnect">Disconnect</button></div>';
    return '<div class="hint">Keep a real file on disk in sync automatically, so you never have to remember to download a backup.</div>' +
      '<div class="settings-actions" style="margin-top:8px"><button class="btn" id="fsConnect">Choose a file…</button></div>';
  }
  function wireAutosaveBlock() {
    var c = document.getElementById("fsConnect"); if (c) c.addEventListener("click", connectAutosaveFile);
    var r = document.getElementById("fsReconnect"); if (r) r.addEventListener("click", requestAutosavePermission);
    var s = document.getElementById("fsSaveNow"); if (s) s.addEventListener("click", function () { writeToFile().then(function () { if (fsStatus === "connected") toast("Saved to " + fsHandle.name); }); });
    var d = document.getElementById("fsDisconnect"); if (d) d.addEventListener("click", function () {
      if (!confirm("Stop auto-saving to this file? Your data stays in the app either way.")) return;
      disconnectAutosaveFile();
    });
  }
  function refreshAutosaveBlock() {
    var el2 = document.getElementById("autosaveBlock");
    if (!el2) return;
    el2.innerHTML = autosaveBlockHtml();
    wireAutosaveBlock();
  }

  // ---------- Settings & data modal ----------
  function openSettings() {
    var canStore = storageWorks();
    var n = store.items.length;
    var overlay = el(
      '<div class="overlay" id="overlay"><div class="modal">' +
        '<div class="modal-head"><b>Settings &amp; data</b><span class="spacer"></span><button class="close" id="closeModal">×</button></div>' +
        '<div class="modal-body">' +
          '<div class="settings-group"><h4>Workstreams</h4>' +
            '<div class="hint" style="margin-bottom:8px">The options offered in every item’s Workstreams field. Removing one here does not change items already using it.</div>' +
            '<div class="tag-input-row" id="wsRow">' +
              store.settings.workstreams.map(function (w) { return '<span class="tag-pill">' + esc(w) + '<button data-ws-remove="' + esc(w) + '">×</button></span>'; }).join("") +
              '<input type="text" id="wsInput" placeholder="Add workstream + Enter" autocomplete="off"></div>' +
          "</div>" +
          '<div class="settings-group"><h4>Groups</h4>' +
            '<div class="hint" style="margin-bottom:8px">Ad hoc collections of items — e.g. everything to discuss at a meeting — that show up under Groups in the sidebar. Removing one here does not change items already using it.</div>' +
            '<div class="tag-input-row" id="groupsRow">' +
              store.settings.groups.map(function (g) { return '<span class="tag-pill group-pill">' + esc(g) + '<button data-group-remove-setting="' + esc(g) + '">×</button></span>'; }).join("") +
              '<input type="text" id="groupsInput" placeholder="Add group + Enter" autocomplete="off"></div>' +
          "</div>" +
          '<div class="settings-group"><h4>Auto-save to a file</h4><div id="autosaveBlock">' + autosaveBlockHtml() + "</div></div>" +
          '<div class="settings-group"><h4>Export &amp; backup</h4><div class="settings-actions">' +
            '<button class="btn" id="sExport">⭳ Export to Excel (.xlsx)</button>' +
            '<button class="btn" id="sBackup">💾 Download backup (.json)</button>' +
            '<button class="btn" id="sRestore">📂 Load backup (.json)</button>' +
            '<div class="hint">' + (canStore
              ? "Your work auto-saves to this browser. Download a backup for a portable copy or to move between machines."
              : "This browser blocks storage — changes last only until you close the tab. Download a backup often.") + "</div>" +
          "</div></div>" +
          '<div class="settings-group danger-zone"><h4>Danger zone</h4><div class="settings-actions">' +
            '<div><button class="btn danger" id="sReset">↺ Reset to sample data</button>' +
              '<div class="hint">Replaces everything with the original demo items.</div></div>' +
            '<div style="width:100%"><div class="hint" style="margin-bottom:5px">Type <b>DELETE</b> to enable — permanently removes all ' + n + " item" + (n === 1 ? "" : "s") + ".</div>" +
              '<input type="text" id="sClearConfirm" placeholder="DELETE" autocomplete="off" spellcheck="false" style="max-width:150px;display:inline-block">' +
              '<button class="btn danger" id="sClear" disabled style="margin-left:8px;opacity:.45">🗑 Clear all items</button></div>' +
          "</div></div>" +
        "</div>" +
      "</div></div>"
    );
    modalRoot.innerHTML = ""; modalRoot.appendChild(overlay);
    function close() { modalRoot.innerHTML = ""; }
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    document.getElementById("closeModal").addEventListener("click", close);
    wireAutosaveBlock();

    var wsInput = document.getElementById("wsInput");
    wsInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || !wsInput.value.trim()) return;
      e.preventDefault();
      var v = wsInput.value.trim();
      if (store.settings.workstreams.indexOf(v) === -1) { store.settings.workstreams.push(v); persistSettings(); openSettings(); render(); }
      else wsInput.value = "";
    });
    overlay.querySelectorAll("[data-ws-remove]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-ws-remove");
        store.settings.workstreams = store.settings.workstreams.filter(function (w) { return w !== v; });
        persistSettings(); openSettings(); render();
      });
    });

    var groupsInput = document.getElementById("groupsInput");
    groupsInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || !groupsInput.value.trim()) return;
      e.preventDefault();
      var v = groupsInput.value.trim();
      if (store.settings.groups.indexOf(v) === -1) { store.settings.groups.push(v); persistSettings(); openSettings(); render(); }
      else groupsInput.value = "";
    });
    overlay.querySelectorAll("[data-group-remove-setting]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-group-remove-setting");
        store.settings.groups = store.settings.groups.filter(function (g) { return g !== v; });
        persistSettings(); openSettings(); render();
      });
    });

    document.getElementById("sExport").addEventListener("click", exportXLSX);
    document.getElementById("sBackup").addEventListener("click", exportJSON);
    document.getElementById("sRestore").addEventListener("click", function () { document.getElementById("restoreInput").click(); });
    document.getElementById("sReset").addEventListener("click", function () {
      if (!confirm("Reset to the original sample data? Everything currently in the log will be lost.")) return;
      seed(); store.ui.selectedId = null; close(); render(); toast("Sample data restored");
    });
    var cc = document.getElementById("sClearConfirm");
    var cb = document.getElementById("sClear");
    cc.addEventListener("input", function () {
      var ok = cc.value.trim().toUpperCase() === "DELETE";
      cb.disabled = !ok;
      cb.style.opacity = ok ? "1" : ".45";
    });
    cb.addEventListener("click", function () {
      if (cb.disabled) return;
      var count = store.items.length;
      store.items = [];
      store.counter = 1;
      store.ui.selectedId = null;
      store.ui.typeView = null;
      store.ui.filters = emptyFilters();
      persist(); close(); render();
      toast("Cleared " + count + " items — the log is now empty");
    });
  }

  // ---------- Drag & drop (move + reorder) ----------
  function wireBoardDnD() {
    var dragId = null;
    viewEl.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("dragstart", function (e) {
        dragId = card.getAttribute("data-id");
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {}
      });
      card.addEventListener("dragend", function () { card.classList.remove("dragging"); dragId = null; });
      card.addEventListener("click", function () { openItem(card.getAttribute("data-id")); });
    });
    viewEl.querySelectorAll(".col").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drag-over"); e.dataTransfer.dropEffect = "move"; });
      col.addEventListener("dragleave", function (e) { if (e.target === col) col.classList.remove("drag-over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("drag-over");
        var id = dragId || e.dataTransfer.getData("text/plain");
        dropOnBoard(id, col, e.clientY);
      });
    });
  }
  function dropOnBoard(id, colEl, clientY) {
    var it = getItem(id);
    if (!it) return;
    var newStatus = colEl.getAttribute("data-status");
    var cards = [].slice.call(colEl.querySelectorAll(".card"));
    var refId = null;
    for (var i = 0; i < cards.length; i++) {
      var cid = cards[i].getAttribute("data-id");
      if (cid === id) continue;
      var box = cards[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) { refId = cid; break; }
    }
    var arr = store.items;
    arr.splice(arr.indexOf(it), 1);
    var insertAt;
    if (refId) {
      insertAt = arr.indexOf(getItem(refId));
    } else {
      var lastId = null;
      for (var j = cards.length - 1; j >= 0; j--) { if (cards[j].getAttribute("data-id") !== id) { lastId = cards[j].getAttribute("data-id"); break; } }
      insertAt = lastId ? arr.indexOf(getItem(lastId)) + 1 : arr.length;
    }
    arr.splice(insertAt, 0, it);
    var statusChanged = it.status !== newStatus;
    if (statusChanged) {
      updateField(id, "status", newStatus, "status");   // logs + persists + renders
      toast(id + " → " + newStatus);
    } else {
      persist();
      render();
    }
  }

  // ---------- Global events ----------
  // Delegated (not per-element) because Groups nav buttons are generated dynamically.
  document.querySelector(".sidebar").addEventListener("click", function (e) {
    var b = e.target.closest("[data-nav]");
    if (!b) return;
    var nav = b.getAttribute("data-nav");
    var ui = store.ui;
    ui._openMenu = null;
    ui._menuSearch = "";
    ui.selectedRows = [];
    if (nav === "board") { ui.scope = "raid"; ui.view = "board"; ui.typeView = null; ui.activeGroup = null; }
    else if (nav === "list") { ui.scope = "raid"; ui.view = "list"; ui.typeView = null; ui.activeGroup = null; }
    else if (nav === "matrix") { ui.scope = "raid"; ui.view = "matrix"; ui.typeView = null; ui.activeGroup = null; }
    else if (nav === "taskboard") { ui.scope = "tasks"; ui.view = "board"; ui.typeView = null; ui.activeGroup = null; }
    else if (nav === "tasklist") { ui.scope = "tasks"; ui.view = "list"; ui.typeView = null; ui.activeGroup = null; }
    else if (nav.indexOf("type:") === 0) { ui.scope = "raid"; ui.typeView = nav.split(":")[1]; ui.view = "list"; ui.activeGroup = null; }
    else if (nav.indexOf("group:") === 0) { ui.scope = "group"; ui.activeGroup = nav.slice(6); ui.view = "board"; ui.typeView = null; }
    render();
  });

  document.getElementById("createBtn").addEventListener("click", openCreate);
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("hdrBackup").addEventListener("click", exportJSON);
  document.getElementById("hdrRestore").addEventListener("click", function () { document.getElementById("restoreInput").click(); });
  document.getElementById("restoreInput").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("toggleDash").addEventListener("click", function () {
    store.ui.showDash = !store.ui.showDash;
    render();
  });

  var filtersEl = document.getElementById("filters");
  filtersEl.addEventListener("input", function (e) {
    if (e.target.id === "fSearch") { store.ui.filters.search = e.target.value; renderChips(); renderKpi(); renderBoardOrList(); persistPrefs(); return; }
    if (e.target.classList && e.target.classList.contains("fmulti-search")) {
      store.ui._menuSearch = e.target.value;
      var q = e.target.value.trim().toLowerCase();
      var menu = e.target.closest(".fmulti-menu");
      menu.querySelectorAll("label[data-fopt]").forEach(function (lab) {
        lab.hidden = !!q && lab.getAttribute("data-fopt").indexOf(q) === -1;
      });
    }
  });
  filtersEl.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "fDueOn") { store.ui.filters.dueOn = t.value; applyFilterChange(); return; }
    if (t.id === "fVisibility") { store.ui.filters.visibility = t.value; applyFilterChange(); return; }
    var fall = t.getAttribute && t.getAttribute("data-fall");
    if (fall) { toggleSelectAll(fall); applyFilterChange(); return; }
    var fkey = t.getAttribute && t.getAttribute("data-fkey");
    if (fkey) { toggleFilterValue(fkey, t.getAttribute("data-fval")); applyFilterChange(); }
  });
  filtersEl.addEventListener("click", function (e) {
    var tog = e.target.closest && e.target.closest("[data-fmulti-toggle]");
    if (tog) {
      var key = tog.getAttribute("data-fmulti-toggle");
      store.ui._openMenu = (store.ui._openMenu === key) ? null : key;
      store.ui._menuSearch = "";
      renderFilters();
      if (store.ui._openMenu) {
        var si = document.querySelector('.fmulti[data-fmulti-key="' + store.ui._openMenu + '"] .fmulti-search');
        if (si) si.focus();
      }
      return;
    }
    var rm = e.target.closest && e.target.closest("[data-chip-remove]");
    if (rm) {
      var ck = rm.getAttribute("data-ck"), cv = rm.getAttribute("data-cv");
      if (ck === "visibility") store.ui.filters.visibility = "active";
      else if (cv != null && Array.isArray(store.ui.filters[ck])) {
        store.ui.filters[ck] = store.ui.filters[ck].filter(function (x) { return x !== cv; });
      } else {
        store.ui.filters[ck] = Array.isArray(store.ui.filters[ck]) ? [] : "";
      }
      applyFilterChange();
      return;
    }
    if (e.target.id === "clearAll") { store.ui.filters = emptyFilters(); store.ui._openMenu = null; store.ui._menuSearch = ""; applyFilterChange(); }
  });
  document.addEventListener("click", function (e) {
    if (store.ui._openMenu && (!e.target.closest || !e.target.closest(".fmulti"))) {
      store.ui._openMenu = null;
      store.ui._menuSearch = "";
      document.querySelectorAll(".fmulti-menu").forEach(function (m) { m.classList.add("hidden"); });
    }
  });

  viewEl.addEventListener("click", function (e) {
    if (e.target.id === "editToggle") {
      store.ui.editMode = !store.ui.editMode;
      store.ui.selectedRows = [];
      persistPrefs();
      renderList();
      return;
    }
    if (e.target.id === "bulkClear") { store.ui.selectedRows = []; renderList(); return; }
    var hb = e.target.closest && e.target.closest("[data-hide-toggle]");
    if (hb) {
      var trh = e.target.closest("tr[data-id]");
      var ith = getItem(trh.getAttribute("data-id"));
      setHidden(ith, !ith.hidden);
      log(ith, "change", ith.hidden ? "hidden from views (until tomorrow)" : "unhidden");
      persist();
      render();
      return;
    }
    var tr = e.target.closest && e.target.closest("tr[data-id]");
    if (tr) {
      if (store.ui.editMode) {
        if (e.target.closest("[data-open-row]")) openItem(tr.getAttribute("data-id"));
        return;   // otherwise let inline inputs handle it
      }
      if (e.target.closest("input,select,textarea,button")) return;
      openItem(tr.getAttribute("data-id"));
      return;
    }
    var th = e.target.closest && e.target.closest("th[data-sort]");
    if (th) {
      var k = th.getAttribute("data-sort");
      var s = store.ui.sort;
      if (s.key === k) s.dir = s.dir === "asc" ? "desc" : "asc";
      else { s.key = k; s.dir = "asc"; }
      renderList();
      persistPrefs();
      return;
    }
    var marker = e.target.closest && e.target.closest(".marker[data-id]");
    if (marker) openItem(marker.getAttribute("data-id"));
  });
  viewEl.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "selectAllRows") {
      var ids = [].slice.call(document.querySelectorAll("tbody tr[data-id]")).map(function (r) { return r.getAttribute("data-id"); });
      store.ui.selectedRows = t.checked ? ids : [];
      renderList();
      return;
    }
    if (t.classList && t.classList.contains("row-check")) {
      var id = t.getAttribute("data-row-check");
      var i = store.ui.selectedRows.indexOf(id);
      if (t.checked && i === -1) store.ui.selectedRows.push(id);
      else if (!t.checked && i !== -1) store.ui.selectedRows.splice(i, 1);
      renderList();
      return;
    }
    if (t.id === "bulkGroupAdd") {
      var v = t.value;
      if (!v) return;
      if (v === "__new__") v = promptNewGroup();
      if (v) {
        var n = 0;
        store.ui.selectedRows.forEach(function (rid) {
          var it = getItem(rid);
          if (!it) return;
          it.groups = it.groups || [];
          if (it.groups.indexOf(v) === -1) { it.groups.push(v); log(it, "change", "added to group <b>" + esc(v) + "</b>"); n++; }
        });
        persist();
        toast("Added " + n + " item" + (n === 1 ? "" : "s") + " to " + v);
      }
      store.ui.selectedRows = [];
      render();
      return;
    }
    var inp = t.closest && t.closest("[data-edit-field]");
    if (!inp) return;
    var tr = t.closest("tr[data-id]");
    if (!tr) return;
    var field = inp.getAttribute("data-edit-field");
    var val = typeof inp.value === "string" ? inp.value.trim() : inp.value;
    updateField(tr.getAttribute("data-id"), field, val, field);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modalRoot.innerHTML) { modalRoot.innerHTML = ""; store.ui.selectedId = null; return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (e.target && e.target.id === "commentInput") return;
      var save = document.getElementById("cSave");
      e.preventDefault();
      if (save) save.click();
      else openCreate();
      return;
    }
    if (e.key === "c" && !/input|textarea|select/i.test(e.target.tagName || "") && !modalRoot.innerHTML) openCreate();
  });

  // ---------- Boot ----------
  loadSettings();
  if (!tryLoad()) seed();
  loadPrefs();
  render();
  tryReconnectOnBoot();
})();
