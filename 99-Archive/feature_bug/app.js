/* ============================================================
   App & Bug Tracker — vanilla JS, localStorage, JSON backups
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "app-tracker:v1";
  var THEME_KEY = "app-tracker:theme";
  var SCHEMA_VERSION = 1;

  /* ---------- Option vocabularies ---------- */
  var APP_STATUSES = ["idea", "planned", "building", "live", "paused", "archived"];
  var ITEM_TYPES = ["feature", "enhancement", "bug"];
  var DEFAULT_TYPE = "feature";
  var ITEM_STATUSES = ["open", "in-progress", "resolved", "closed"];
  var PRIORITIES = ["low", "medium", "high"];

  var TYPE_LABEL = { feature: "Feature", enhancement: "Enhancement", bug: "Bug" };
  var TYPE_PLURAL = { feature: "Features", enhancement: "Enhancements", bug: "Bugs" };

  /* ---------- State ---------- */
  var state = load();

  /* ids of items currently checked for bulk copy (ephemeral, not persisted) */
  var selected = new Set();

  function blankState() {
    return { version: SCHEMA_VERSION, apps: [], items: [], meta: { lastExportAt: null, lastChangeAt: null } };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      var data = JSON.parse(raw);
      return normalize(data);
    } catch (e) {
      console.error("Failed to load state:", e);
      return blankState();
    }
  }

  function normalize(data) {
    var s = blankState();
    if (data && typeof data === "object") {
      if (Array.isArray(data.apps)) s.apps = data.apps;
      if (Array.isArray(data.items)) {
        s.items = data.items.map(function (i) {
          // Coerce retired types (e.g. legacy "question") onto a current one.
          if (i && ITEM_TYPES.indexOf(i.type) === -1) i.type = "enhancement";
          return i;
        });
      }
      if (data.meta && typeof data.meta === "object") {
        s.meta.lastExportAt = data.meta.lastExportAt || null;
        s.meta.lastChangeAt = data.meta.lastChangeAt || null;
      }
    }
    return s;
  }

  function save(markChange) {
    if (markChange !== false) state.meta.lastChangeAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("Could not save — storage may be full");
      console.error(e);
    }
    renderBackupNudge();
  }

  /* ---------- Helpers ---------- */
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function now() { return new Date().toISOString(); }
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function labelize(s) { return String(s).replace(/-/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); }); }
  function appById(id) { for (var i = 0; i < state.apps.length; i++) if (state.apps[i].id === id) return state.apps[i]; return null; }
  function itemById(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var toastTimer;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ---------- Routing ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/dashboard";
    var qIdx = h.indexOf("?");
    var path = qIdx === -1 ? h : h.slice(0, qIdx);
    var query = {};
    if (qIdx !== -1) {
      h.slice(qIdx + 1).split("&").forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split("=");
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
      });
    }
    return { path: path, parts: path.split("/").filter(Boolean), query: query };
  }

  // localStorage key holding the last filter/sort query string for a view.
  function viewStoreKey(page) {
    if (page === "items") return "flt:items";
    if (page === "apps") return "flt:apps";
    if (page === "app") return "flt:appitems";
    return null;
  }
  function saveViewState(page, hash) {
    var key = viewStoreKey(page);
    if (!key) return;
    var qi = hash.indexOf("?");
    try { localStorage.setItem(key, qi === -1 ? "" : hash.slice(qi + 1)); } catch (e) {}
  }
  function clearViewState(page) {
    var key = viewStoreKey(page);
    if (key) { try { localStorage.removeItem(key); } catch (e) {} }
  }

  function router() {
    var r = parseHash();
    var page = r.parts[0] || "dashboard";
    closeModal();

    // Reopen a view where you left it: if there's no query but we saved one
    // last time, restore it into the URL before rendering.
    var storeKey = viewStoreKey(page);
    if (storeKey && !Object.keys(r.query).length) {
      var saved;
      try { saved = localStorage.getItem(storeKey); } catch (e) { saved = null; }
      if (saved) {
        history.replaceState(null, "", "#" + r.path + "?" + saved);
        r = parseHash();
      }
    }

    setActiveNav(page, r.query);

    if (page === "apps") renderApps(r.query);
    else if (page === "app" && r.parts[1]) renderAppDetail(r.parts[1], r.query);
    else if (page === "items") renderItems(r.query);
    else renderDashboard();

    syncSelection();
  }

  function setActiveNav(page, query) {
    $$(".mainnav a").forEach(function (a) {
      a.classList.remove("active");
      if (a.getAttribute("data-route") !== page) return;
      if (page === "items") {
        var m = a.getAttribute("href").match(/type=([^&]*)/);
        var want = m ? m[1] : null; // null => the bare "Items" link
        var cur = query.type == null ? null : query.type;
        if (want === cur) a.classList.add("active");
      } else {
        a.classList.add("active");
      }
    });
  }

  function go(hash) { location.hash = hash; }

  /* ---------- Views ---------- */
  var view = $("#view");

  function renderDashboard() {
    var apps = state.apps;
    var items = state.items;
    var openItems = items.filter(function (i) { return i.status === "open" || i.status === "in-progress"; });

    function count(type) { return openItems.filter(function (i) { return i.type === type; }).length; }

    var byStatus = {};
    APP_STATUSES.forEach(function (s) { byStatus[s] = 0; });
    apps.forEach(function (a) { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });

    var recent = items.slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    }).slice(0, 8);

    view.innerHTML =
      '<div class="page-head"><h1>Dashboard</h1>' +
        '<div class="row">' +
          '<button class="btn btn-primary" data-action="new-app">+ New app</button>' +
          '<button class="btn" data-action="new-item">+ New item</button>' +
          '<button class="btn" data-action="bulk-item">Bulk add</button>' +
        '</div>' +
      '</div>' +
      '<div class="stat-grid">' +
        stat(apps.length, "Apps tracked") +
        stat(byStatus.idea + byStatus.planned, "Ideas &amp; planned") +
        stat(byStatus.building, "In build") +
        stat(byStatus.live, "Live") +
        ITEM_TYPES.map(function (t) { return stat(count(t), "Open " + TYPE_PLURAL[t].toLowerCase()); }).join("") +
      '</div>' +
      '<h2>Apps</h2>' +
      (apps.length ? appTable(sortApps(apps.slice(), "status", "asc"), { sort: "", dir: "asc" }, false)
                   : emptyBox("No apps yet.", "new-app", "Add your first app")) +
      '<h2 style="margin-top:32px">Recent activity</h2>' +
      (recent.length ? '<div>' + recent.map(function (i) { return itemRow(i, true, false); }).join("") + '</div>'
                     : '<p class="muted">Nothing yet.</p>');
  }

  function stat(n, label) {
    return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + label + '</div></div>';
  }

  function emptyBox(msg, action, btnLabel) {
    return '<div class="empty"><p>' + esc(msg) + '</p>' +
      (action ? '<button class="btn btn-primary" data-action="' + action + '">' + esc(btnLabel) + '</button>' : '') +
      '</div>';
  }

  function openCountFor(appId) {
    return state.items.filter(function (i) {
      return i.appId === appId && (i.status === "open" || i.status === "in-progress");
    }).length;
  }

  function appMetrics(a) {
    var open = 0, total = 0;
    state.items.forEach(function (i) {
      if (i.appId !== a.id) return;
      total++;
      if (i.status === "open" || i.status === "in-progress") open++;
    });
    return { open: open, total: total };
  }

  function sortApps(list, key, dir) {
    var mul = dir === "desc" ? -1 : 1;
    var keyOf = function (a) {
      var m = appMetrics(a);
      if (key === "name") return a.name.toLowerCase();
      if (key === "open") return m.open;
      if (key === "total") return m.total;
      if (key === "updated") return a.updatedAt || "";
      return APP_STATUSES.indexOf(a.status);
    };
    return list.slice().sort(function (a, b) {
      var ka = keyOf(a), kb = keyOf(b);
      var c = ka < kb ? -1 : ka > kb ? 1 : 0;
      return (mul * c) || a.name.localeCompare(b.name);
    });
  }

  function appTh(key, label, f, interactive) {
    if (!interactive) return "<th>" + esc(label) + "</th>";
    var active = f.sort === key;
    var arrow = active ? (f.dir === "desc" ? " ▾" : " ▴") : "";
    return '<th class="app-th' + (active ? " sorted" : "") + '" data-sort="' + key + '">' + esc(label) + arrow + "</th>";
  }

  function appTable(list, f, interactive) {
    if (!list.length) return emptyBox("No apps match these filters.", null);
    return '<div class="table-wrap"><table class="app-table"><thead><tr>' +
      appTh("name", "App", f, interactive) +
      appTh("status", "Status", f, interactive) +
      appTh("open", "Open", f, interactive) +
      appTh("total", "Items", f, interactive) +
      appTh("updated", "Updated", f, interactive) +
      "<th></th>" +
      "</tr></thead><tbody>" +
      list.map(appTableRow).join("") +
      "</tbody></table></div>";
  }

  function appTableRow(a) {
    var m = appMetrics(a);
    return "<tr>" +
      '<td class="app-name-cell"><a href="#/app/' + a.id + '">' + esc(a.name) + "</a>" +
        (a.blurb ? '<div class="muted app-blurb">' + esc(a.blurb) + "</div>" : "") + "</td>" +
      '<td><span class="badge st-' + a.status + '">' + labelize(a.status) + "</span></td>" +
      '<td class="num">' + (m.open || "—") + "</td>" +
      '<td class="num">' + (m.total || "—") + "</td>" +
      '<td class="muted nowrap">' + fmtDate(a.updatedAt) + "</td>" +
      '<td class="app-actions-cell">' +
        '<a class="btn btn-small" href="#/app/' + a.id + '">Open</a>' +
        '<button class="btn btn-small" data-action="edit-app" data-id="' + a.id + '">Edit</button>' +
      "</td></tr>";
  }

  function appCard(a) {
    var m = appMetrics(a);
    return '<div class="card">' +
      '<h3><a href="#/app/' + a.id + '">' + esc(a.name) + '</a></h3>' +
      '<div class="row" style="gap:6px">' +
        '<span class="badge st-' + a.status + '">' + labelize(a.status) + '</span>' +
        (m.open ? '<span class="badge">' + m.open + ' open</span>' : '') +
        (m.total ? '<span class="badge">' + m.total + ' total</span>' : '') +
      '</div>' +
      (a.blurb ? '<p class="muted" style="margin:10px 0 0">' + esc(a.blurb) + '</p>' : '') +
      '<div class="card-actions">' +
        '<a class="btn btn-small" href="#/app/' + a.id + '">Open</a>' +
        (a.url ? '<a class="btn btn-small" href="' + esc(a.url) + '" target="_blank" rel="noopener">Visit</a>' : '') +
        (a.repo ? '<a class="btn btn-small" href="' + esc(a.repo) + '" target="_blank" rel="noopener">Repo</a>' : '') +
        '<button class="btn btn-small" data-action="edit-app" data-id="' + a.id + '">Edit</button>' +
      '</div>' +
    '</div>';
  }

  function appViewMode() {
    return localStorage.getItem("apps-view") === "cards" ? "cards" : "table";
  }

  function appFiltersToHash(f) {
    var parts = [];
    if (f.status != null) parts.push("status=" + encodeURIComponent(f.status.join(",")));
    if (f.q) parts.push("q=" + encodeURIComponent(f.q));
    if (f.sort && f.sort !== "status") parts.push("sort=" + f.sort);
    if (f.dir && f.dir !== "asc") parts.push("dir=" + f.dir);
    return "#/apps" + (parts.length ? "?" + parts.join("&") : "");
  }

  function readAppFilterDom() {
    var q = parseHash().query;
    return {
      status: readFacet("appstatus"),
      q: $("#app-q") ? $("#app-q").value.trim() : "",
      sort: q.sort || "status",
      dir: q.dir || "asc"
    };
  }

  function drawApps(f) {
    var q = f.q.toLowerCase();
    var list = state.apps.filter(function (a) {
      if (f.status != null && f.status.indexOf(a.status) === -1) return false;
      if (q && (a.name + " " + (a.blurb || "")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    list = sortApps(list, f.sort, f.dir);

    var target = appFiltersToHash(f);
    if (location.hash !== target) history.replaceState(null, "", target);
    saveViewState("apps", target);

    $("#appResults").innerHTML = appViewMode() === "cards"
      ? (list.length ? '<div class="grid">' + list.map(appCard).join("") + "</div>"
                     : emptyBox("No apps match these filters.", null))
      : appTable(list, f, true);
  }

  function renderApps(query) {
    query = query || {};

    if (!state.apps.length) {
      view.innerHTML =
        '<div class="page-head"><h1>Apps</h1>' +
          '<button class="btn btn-primary" data-action="new-app">+ New app</button></div>' +
        emptyBox("No apps yet. Track the apps you are building or want to build.", "new-app", "Add your first app");
      return;
    }

    var f = {
      status: facetFromQuery(query.status),
      q: query.q || "",
      sort: query.sort || "status",
      dir: query.dir || "asc"
    };
    var mode = appViewMode();

    view.innerHTML =
      '<div class="page-head"><h1>Apps</h1>' +
        '<button class="btn btn-primary" data-action="new-app">+ New app</button>' +
      '</div>' +
      '<div class="filters">' +
        msComponent("appstatus", f.status) +
        '<input type="search" id="app-q" placeholder="Search apps…" value="' + esc(f.q) + '" />' +
        '<button class="btn btn-small" id="app-clear">Clear</button>' +
        '<span class="filler"></span>' +
        '<div class="viewtoggle">' +
          '<button type="button" class="btn btn-small' + (mode === "table" ? " active" : "") + '" data-appview="table">List</button>' +
          '<button type="button" class="btn btn-small' + (mode === "cards" ? " active" : "") + '" data-appview="cards">Cards</button>' +
        '</div>' +
      '</div>' +
      '<div id="appResults"></div>';

    var redraw = function () { drawApps(readAppFilterDom()); };
    wireMultiSelects(redraw);
    $("#app-q").addEventListener("input", debounce(redraw, 200));
    $("#app-clear").addEventListener("click", function () { clearViewState("apps"); go("#/apps"); });
    $$("[data-appview]").forEach(function (b) {
      b.addEventListener("click", function () {
        localStorage.setItem("apps-view", b.getAttribute("data-appview"));
        renderApps(parseHash().query);
      });
    });
    $("#appResults").addEventListener("click", function (e) {
      var th = e.target.closest("th[data-sort]");
      if (!th) return;
      var key = th.getAttribute("data-sort");
      var cur = readAppFilterDom();
      if (cur.sort === key) {
        cur.dir = cur.dir === "asc" ? "desc" : "asc";
      } else {
        cur.sort = key;
        cur.dir = (key === "name" || key === "status") ? "asc" : "desc";
      }
      drawApps(cur);
    });

    drawApps(f);
  }

  /* ---------- Shared item filtering + sorting ---------- */
  var SORTS = [
    { value: "smart", label: "Sort: open first" },
    { value: "priority", label: "Sort: priority (high→low)" },
    { value: "updated", label: "Sort: recently updated" },
    { value: "created", label: "Sort: newest" },
    { value: "oldest", label: "Sort: oldest" },
    { value: "title", label: "Sort: title (A→Z)" },
    { value: "status", label: "Sort: status" }
  ];
  var FACET_KEYS = ["type", "status", "priority", "app"];

  // Each item filter is a multi-select dropdown.
  //   null            -> no constraint (every option checked; the default)
  //   [] or ["a", …]  -> constrain to exactly these values ([] matches nothing)
  // Unchecking "Select all" clears every box, so the list shows nothing.
  var FACETS = {
    type: {
      label: "Type",
      options: function () { return ITEM_TYPES.map(function (v) { return { value: v, label: TYPE_LABEL[v] }; }); }
    },
    status: {
      label: "Status",
      options: function () { return ITEM_STATUSES.map(function (v) { return { value: v, label: labelize(v) }; }); }
    },
    priority: {
      label: "Priority",
      options: function () { return PRIORITIES.map(function (v) { return { value: v, label: labelize(v) }; }); }
    },
    app: {
      label: "App",
      options: function () {
        return [{ value: "none", label: "— No app —" }].concat(
          state.apps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
            .map(function (a) { return { value: a.id, label: a.name }; })
        );
      }
    },
    // used by the Apps list view, not the item filters (not in FACET_KEYS)
    appstatus: {
      label: "Status",
      options: function () { return APP_STATUSES.map(function (v) { return { value: v, label: labelize(v) }; }); }
    }
  };

  function parseList(v) { return v ? String(v).split(",").filter(Boolean) : []; }

  // A query param that is absent => null (no constraint). Present (even "") => an
  // array of the chosen values, so "?type=" means "nothing checked, show none".
  function facetFromQuery(v) { return v == null ? null : parseList(v); }

  function filterState(query) {
    return {
      type: facetFromQuery(query.type),
      status: facetFromQuery(query.status),
      priority: facetFromQuery(query.priority),
      app: facetFromQuery(query.app),
      q: query.q || "",
      sort: query.sort || "smart"
    };
  }

  function msSummary(checkedCount, total) {
    if (checkedCount >= total) return "All";
    if (checkedCount === 0) return "None";
    return checkedCount + " of " + total;
  }

  // One multi-select dropdown. `sel` null = every option checked (no constraint).
  function msComponent(key, sel) {
    var facet = FACETS[key];
    var opts = facet.options();
    var on = function (v) { return sel == null || sel.indexOf(v) !== -1; };
    var checkedCount = opts.filter(function (o) { return on(o.value); }).length;
    var allOn = checkedCount === opts.length;
    var constrained = checkedCount < opts.length;
    return '<div class="ms" data-facet="' + key + '" data-label="' + esc(facet.label) + '">' +
      '<button type="button" class="btn btn-small ms-toggle' + (constrained ? ' ms-active' : '') + '">' +
        esc(facet.label) + ': ' + esc(msSummary(checkedCount, opts.length)) + ' <span class="ms-caret">▾</span>' +
      '</button>' +
      '<div class="ms-menu" hidden>' +
        '<label class="ms-row ms-all-row"><input type="checkbox" class="ms-all"' +
          (allOn ? ' checked' : '') + '> <strong>Select all</strong></label>' +
        opts.map(function (o) {
          return '<label class="ms-row"><input type="checkbox" class="ms-opt" value="' + esc(o.value) + '"' +
            (on(o.value) ? ' checked' : '') + '> ' + esc(o.label) + '</label>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function filterControls(f, opts) {
    opts = opts || {};
    var facets = opts.lockApp ? ["type", "status", "priority"] : FACET_KEYS;
    return '<div class="filters">' +
      facets.map(function (k) { return msComponent(k, f[k]); }).join("") +
      '<input type="search" id="filter-q" placeholder="Search text…" value="' + esc(f.q) + '" />' +
      '<select id="filter-sort">' +
        SORTS.map(function (s) {
          return '<option value="' + s.value + '"' + (f.sort === s.value ? " selected" : "") + '>' + esc(s.label) + '</option>';
        }).join("") +
      '</select>' +
      '<button class="btn btn-small" id="filter-clear">Clear</button>' +
    '</div>';
  }

  // Read a facet's effective value: null when every option is checked (no
  // constraint), otherwise the checked values (possibly [], meaning "show none").
  function readFacet(key) {
    var boxes = $$('.ms[data-facet="' + key + '"] .ms-opt');
    if (!boxes.length) return null;
    var checked = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
    if (checked.length >= boxes.length) return null;
    return checked;
  }

  function readFilterDom() {
    return {
      type: readFacet("type"),
      status: readFacet("status"),
      priority: readFacet("priority"),
      app: readFacet("app"),
      q: ($("#filter-q") ? $("#filter-q").value.trim() : ""),
      sort: ($("#filter-sort") ? $("#filter-sort").value : "") || "smart"
    };
  }

  function filtersToHash(base, f) {
    var parts = [];
    FACET_KEYS.forEach(function (k) {
      if (f[k] != null) parts.push(k + "=" + encodeURIComponent(f[k].join(",")));
    });
    if (f.q) parts.push("q=" + encodeURIComponent(f.q));
    if (f.sort && f.sort !== "smart") parts.push("sort=" + encodeURIComponent(f.sort));
    return base + (parts.length ? "?" + parts.join("&") : "");
  }

  function sortItems(list, key) {
    var openRank = function (i) { return (i.status === "open" || i.status === "in-progress") ? 0 : 1; };
    var byUpdated = function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); };
    var cmp;
    if (key === "priority") {
      cmp = function (a, b) { return (PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority)) || byUpdated(a, b); };
    } else if (key === "updated") {
      cmp = byUpdated;
    } else if (key === "created") {
      cmp = function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); };
    } else if (key === "oldest") {
      cmp = function (a, b) { return (a.createdAt || "").localeCompare(b.createdAt || ""); };
    } else if (key === "title") {
      cmp = function (a, b) { return a.title.localeCompare(b.title); };
    } else if (key === "status") {
      cmp = function (a, b) { return (ITEM_STATUSES.indexOf(a.status) - ITEM_STATUSES.indexOf(b.status)) || byUpdated(a, b); };
    } else { // smart
      cmp = function (a, b) {
        if (openRank(a) !== openRank(b)) return openRank(a) - openRank(b);
        return (PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority)) || byUpdated(a, b);
      };
    }
    return list.slice().sort(cmp);
  }

  function inFacet(arr, val) { return arr == null || arr.indexOf(val) !== -1; }

  function filterAndSort(items, f) {
    var q = f.q.toLowerCase();
    var list = items.filter(function (i) {
      if (!inFacet(f.type, i.type)) return false;
      if (!inFacet(f.status, i.status)) return false;
      if (!inFacet(f.priority, i.priority)) return false;
      if (!inFacet(f.app, i.appId || "none")) return false;
      if (q && (i.title + " " + (i.details || "")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    return sortItems(list, f.sort);
  }

  // Render a filtered+sorted list into `containerSel` and rewire selection.
  // `ctx` = { base, page, source(), showApp, lockApp }
  function renderFilteredList(containerSel, ctx) {
    var f = readFilterDom();
    if (ctx.lockApp) f.app = null;
    var target = filtersToHash(ctx.base, f);
    if (location.hash !== target) history.replaceState(null, "", target);
    saveViewState(ctx.page, target);
    var all = ctx.source();
    var list = filterAndSort(all, f);
    var emptyMsg = all.length ? "No items match these filters." : "No items yet — use “+ New item” or “Bulk add” above.";
    $(containerSel).innerHTML = itemListSection(list, emptyMsg, ctx.showApp);
    syncSelection();
  }

  /* ----- multi-select dropdown behaviour (shared by item + app filters) ----- */

  function closeAllMenus(except) {
    $$(".ms-menu").forEach(function (m) { if (m !== except) m.hidden = true; });
  }

  // Reflect option checkboxes onto the "Select all" tri-state box + toggle label.
  function refreshMs(ms) {
    var all = ms.querySelector(".ms-all");
    var opts = $$(".ms-opt", ms);
    var n = opts.filter(function (b) { return b.checked; }).length;
    all.checked = n === opts.length;
    all.indeterminate = n > 0 && n < opts.length;
    var toggle = ms.querySelector(".ms-toggle");
    toggle.innerHTML = esc(ms.dataset.label) + ": " + esc(msSummary(n, opts.length)) + ' <span class="ms-caret">▾</span>';
    toggle.classList.toggle("ms-active", n < opts.length);
  }

  function wireMultiSelects(onChange) {
    $$(".filters .ms").forEach(function (ms) {
      var toggle = ms.querySelector(".ms-toggle");
      var menu = ms.querySelector(".ms-menu");
      var all = ms.querySelector(".ms-all");
      var opts = $$(".ms-opt", ms);

      refreshMs(ms); // set initial indeterminate state

      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = menu.hidden;
        closeAllMenus();
        menu.hidden = !willOpen;
      });
      menu.addEventListener("click", function (e) { e.stopPropagation(); });

      all.addEventListener("change", function () {
        opts.forEach(function (b) { b.checked = all.checked; });
        refreshMs(ms);
        onChange();
      });
      opts.forEach(function (b) {
        b.addEventListener("change", function () {
          refreshMs(ms);
          onChange();
        });
      });
    });
  }

  function wireFilterControls(onChange, clearHref, page) {
    wireMultiSelects(onChange);
    if ($("#filter-sort")) $("#filter-sort").addEventListener("change", onChange);
    if ($("#filter-q")) $("#filter-q").addEventListener("input", debounce(onChange, 200));
    if ($("#filter-clear")) $("#filter-clear").addEventListener("click", function () {
      clearViewState(page);
      go(clearHref);
    });
  }

  function renderAppDetail(id, query) {
    var a = appById(id);
    if (!a) { view.innerHTML = emptyBox("App not found.", null); return; }
    var items = state.items.filter(function (i) { return i.appId === id; });
    var f = filterState(query || {});

    view.innerHTML =
      '<div class="page-head">' +
        '<div>' +
          '<a class="muted" href="#/apps">&larr; All apps</a>' +
          '<h1 style="margin-top:4px">' + esc(a.name) + ' ' +
            '<span class="badge st-' + a.status + '">' + labelize(a.status) + '</span></h1>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn" data-action="edit-app" data-id="' + a.id + '">Edit app</button>' +
          '<button class="btn btn-danger" data-action="delete-app" data-id="' + a.id + '">Delete</button>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="margin-bottom:24px">' +
        (a.blurb ? '<p>' + esc(a.blurb) + '</p>' : '<p class="muted">No description.</p>') +
        '<div class="row" style="gap:8px;margin-top:8px">' +
          (a.url ? '<a class="btn btn-small" href="' + esc(a.url) + '" target="_blank" rel="noopener">Visit site</a>' : '') +
          (a.repo ? '<a class="btn btn-small" href="' + esc(a.repo) + '" target="_blank" rel="noopener">Repository</a>' : '') +
        '</div>' +
        (a.notes ? '<p class="item-details" style="margin-top:12px">' + esc(a.notes) + '</p>' : '') +
        '<p class="muted" style="font-size:12px;margin:12px 0 0">Created ' + fmtDate(a.createdAt) + ' · Updated ' + fmtDate(a.updatedAt) + '</p>' +
      '</div>' +
      '<div class="page-head">' +
        '<h2 style="margin:0">Items (' + items.length + ')</h2>' +
        '<div class="row">' +
          '<button class="btn btn-primary" data-action="new-item" data-app="' + a.id + '">+ Add item</button>' +
          '<button class="btn" data-action="bulk-item" data-app="' + a.id + '">Bulk add</button>' +
        '</div>' +
      '</div>' +
      (items.length
        ? filterControls(f, { lockApp: true }) + '<div id="itemResults"></div>'
        : emptyBox("This app has no features, enhancements, or bugs logged yet. Use “+ Add item” or “Bulk add” above.", null));

    if (!items.length) return;

    var ctx = {
      base: "#/app/" + id,
      page: "app",
      source: function () { return state.items.filter(function (i) { return i.appId === id; }); },
      showApp: false,
      lockApp: true
    };
    wireFilterControls(function () { renderFilteredList("#itemResults", ctx); }, "#/app/" + id, "app");
    renderFilteredList("#itemResults", ctx);
  }

  /* ---------- Items view ---------- */
  function renderItems(query) {
    var f = filterState(query);
    var onlyType = (f.type && f.type.length === 1) ? f.type[0] : null;
    var heading = onlyType ? (TYPE_PLURAL[onlyType] || "Items") : "All items";
    var dataType = onlyType ? ' data-type="' + onlyType + '"' : "";

    view.innerHTML =
      '<div class="page-head"><h1>' + heading + '</h1>' +
        '<div class="row">' +
          '<button class="btn btn-primary" data-action="new-item"' + dataType + '>+ New item</button>' +
          '<button class="btn" data-action="bulk-item"' + dataType + '>Bulk add</button>' +
        '</div>' +
      '</div>' +
      filterControls(f, {}) +
      '<div id="itemResults"></div>';

    var ctx = {
      base: "#/items",
      page: "items",
      source: function () { return state.items; },
      showApp: true,
      lockApp: false
    };
    wireFilterControls(function () { renderFilteredList("#itemResults", ctx); }, "#/items", "items");
    renderFilteredList("#itemResults", ctx);
  }

  // Renders rows in the order given (callers sort via filterAndSort / sortItems).
  function itemListSection(list, emptyMsg, showApp) {
    if (!list.length) return emptyBox(emptyMsg, null);
    return '<label class="select-all-row"><input type="checkbox" id="selectAllCheck" /> Select all (' + list.length + ')</label>' +
      list.map(function (i) { return itemRow(i, !!showApp, true); }).join("");
  }

  function itemRow(i, showApp, selectable) {
    var a = i.appId ? appById(i.appId) : null;
    var done = i.status === "resolved" || i.status === "closed";
    var isSel = selected.has(i.id);
    return '<div class="item ' + (done ? "done " : "") + (selectable && isSel ? "selected" : "") + '">' +
      (selectable
        ? '<input type="checkbox" class="item-check" data-id="' + i.id + '"' + (isSel ? " checked" : "") + ' aria-label="Select item" />'
        : '') +
      '<div class="item-main">' +
        '<p class="item-title">' + esc(i.title) + '</p>' +
        (i.details ? '<div class="item-details">' + esc(i.details) + '</div>' : '') +
        '<div class="item-meta">' +
          '<span class="badge type-' + i.type + '">' + (TYPE_LABEL[i.type] || i.type) + '</span>' +
          '<span class="badge st-' + i.status + '">' + labelize(i.status) + '</span>' +
          '<span class="badge pri-' + i.priority + '">' + labelize(i.priority) + '</span>' +
          (showApp && a ? '<a class="badge" href="#/app/' + a.id + '">' + esc(a.name) + '</a>' : '') +
          '<span class="muted" style="font-size:12px">' + fmtDate(i.updatedAt) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="item-buttons">' +
        (done
          ? '<button class="btn btn-small" data-action="reopen-item" data-id="' + i.id + '">Reopen</button>'
          : '<button class="btn btn-small" data-action="resolve-item" data-id="' + i.id + '">Resolve</button>') +
        '<button class="btn btn-small" data-action="edit-item" data-id="' + i.id + '">Edit</button>' +
        '<button class="btn btn-small btn-danger" data-action="delete-item" data-id="' + i.id + '">&times;</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- Selection & clipboard ---------- */
  // Keep the selection set in sync with what's on screen, refresh checkboxes,
  // the "select all" box, and the floating action bar.
  function syncSelection() {
    var checks = $$(".item-check");
    var visible = {};
    checks.forEach(function (c) { visible[c.getAttribute("data-id")] = true; });
    selected.forEach(function (id) {
      if (!visible[id] || !itemById(id)) selected.delete(id);
    });
    checks.forEach(function (c) {
      var on = selected.has(c.getAttribute("data-id"));
      c.checked = on;
      var row = c.closest(".item");
      if (row) row.classList.toggle("selected", on);
    });
    var sa = $("#selectAllCheck");
    if (sa) sa.checked = checks.length > 0 && checks.every(function (c) { return c.checked; });

    var bar = $("#selectionBar");
    bar.hidden = selected.size === 0;
    $("#selCount").textContent = selected.size + " selected";
  }

  function clearSelection() {
    selected.clear();
    syncSelection();
  }

  // Selected items in the order they appear on screen.
  function selectedItemsInOrder() {
    return $$(".item-check")
      .filter(function (c) { return c.checked; })
      .map(function (c) { return itemById(c.getAttribute("data-id")); })
      .filter(Boolean);
  }

  function formatItemsText(items) {
    return items.map(function (i) {
      var a = i.appId ? appById(i.appId) : null;
      var lines = [];
      lines.push((TYPE_LABEL[i.type] || i.type) + ": " + i.title);
      var meta = [];
      if (a) meta.push("App: " + a.name);
      meta.push("Status: " + labelize(i.status));
      meta.push("Priority: " + labelize(i.priority));
      lines.push(meta.join("  |  "));
      if (i.details) lines.push(i.details);
      return lines.join("\n");
    }).join("\n\n");
  }

  function copyToClipboard(text, okMsg) {
    var done = function () { toast(okMsg); };
    var fail = function () { toast("Copy failed — check browser permissions"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : fail(); });
    } else {
      legacyCopy(text) ? done() : fail();
    }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copySelected(mode) {
    var items = selectedItemsInOrder();
    if (!items.length) { toast("Nothing selected"); return; }
    if (mode === "json") {
      copyToClipboard(JSON.stringify(items, null, 2), "Copied " + items.length + " item(s) as JSON");
    } else {
      copyToClipboard(formatItemsText(items), "Copied " + items.length + " item(s)");
    }
  }

  // Bulk-set a field ("status" or "priority") on every selected item.
  function bulkSetField(field, value) {
    var items = selectedItemsInOrder();
    if (!items.length || !value) return;
    var t = now();
    items.forEach(function (i) { i[field] = value; i.updatedAt = t; });
    save();
    toast("Set " + items.length + " item(s) to " + labelize(value));
    router();
  }

  /* ---------- Modal / forms ---------- */
  var modalRoot = $("#modalRoot");
  var modalForm = $("#modalForm");
  var modalTitle = $("#modalTitle");
  var submitHandler = null;

  function openModal(title, bodyHtml, onSubmit) {
    modalTitle.textContent = title;
    modalForm.innerHTML = bodyHtml;
    submitHandler = onSubmit;
    modalRoot.hidden = false;
    var first = modalForm.querySelector("input, select, textarea");
    if (first) first.focus();
  }
  function closeModal() {
    modalRoot.hidden = true;
    modalForm.innerHTML = "";
    submitHandler = null;
  }
  modalForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitHandler) submitHandler(new FormData(modalForm));
  });
  $$("[data-close]", modalRoot).forEach(function (el) {
    el.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", function (e) {
    if (modalRoot.hidden) return;
    if (e.key === "Escape") { closeModal(); return; }
    // Ctrl/Cmd + Enter saves from anywhere in the form (incl. textareas).
    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "\n")) {
      e.preventDefault();
      if (modalForm.requestSubmit) modalForm.requestSubmit();
      else modalForm.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  function field(label, name, value, opts) {
    opts = opts || {};
    var input;
    if (opts.type === "textarea") {
      input = '<textarea name="' + name + '"' + (opts.required ? " required" : "") +
        (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + '>' + esc(value || "") + '</textarea>';
    } else if (opts.type === "select") {
      input = '<select name="' + name + '"' + (opts.required ? " required" : "") + '>' +
        opts.options.map(function (o) {
          var v = typeof o === "string" ? o : o.value;
          var l = typeof o === "string" ? labelize(o) : o.label;
          return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? " selected" : "") + '>' + esc(l) + '</option>';
        }).join("") +
        '</select>';
    } else {
      input = '<input type="' + (opts.type || "text") + '" name="' + name + '" value="' + esc(value || "") + '"' +
        (opts.required ? " required" : "") +
        (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + ' />';
    }
    return '<div class="field"><label>' + esc(label) + '</label>' + input + '</div>';
  }

  /* ---------- App CRUD ---------- */
  function appForm(existing) {
    var a = existing || {};
    return field("Name", "name", a.name, { required: true, placeholder: "My cool app" }) +
      field("Status", "status", a.status || "idea", { type: "select", options: APP_STATUSES }) +
      field("Short description", "blurb", a.blurb, { type: "textarea", placeholder: "One or two lines about what it does" }) +
      '<div class="field-row">' +
        field("Live URL", "url", a.url, { type: "url", placeholder: "https://…" }) +
        field("Repository URL", "repo", a.repo, { type: "url", placeholder: "https://github.com/…" }) +
      '</div>' +
      field("Notes", "notes", a.notes, { type: "textarea", placeholder: "Anything else worth remembering" });
  }

  function newApp() {
    openModal("New app", appForm(null), function (fd) {
      var t = now();
      state.apps.push({
        id: uid(),
        name: (fd.get("name") || "").trim() || "Untitled app",
        status: fd.get("status") || "idea",
        blurb: (fd.get("blurb") || "").trim(),
        url: (fd.get("url") || "").trim(),
        repo: (fd.get("repo") || "").trim(),
        notes: (fd.get("notes") || "").trim(),
        createdAt: t, updatedAt: t
      });
      save();
      closeModal();
      toast("App added");
      router();
    });
  }

  function editApp(id) {
    var a = appById(id);
    if (!a) return;
    openModal("Edit app", appForm(a), function (fd) {
      a.name = (fd.get("name") || "").trim() || a.name;
      a.status = fd.get("status") || a.status;
      a.blurb = (fd.get("blurb") || "").trim();
      a.url = (fd.get("url") || "").trim();
      a.repo = (fd.get("repo") || "").trim();
      a.notes = (fd.get("notes") || "").trim();
      a.updatedAt = now();
      save();
      closeModal();
      toast("App updated");
      router();
    });
  }

  function deleteApp(id) {
    var a = appById(id);
    if (!a) return;
    var linked = state.items.filter(function (i) { return i.appId === id; });
    var msg = "Delete \"" + a.name + "\"?";
    if (linked.length) msg += "\n\n" + linked.length + " linked item(s) will be kept but unassigned from any app.";
    if (!confirm(msg)) return;
    linked.forEach(function (i) { i.appId = null; i.updatedAt = now(); });
    state.apps = state.apps.filter(function (x) { return x.id !== id; });
    save();
    toast("App deleted");
    go("#/apps");
  }

  /* ---------- Item CRUD ---------- */
  function itemForm(existing, presetType, presetApp) {
    var i = existing || {};
    var appOptions = [{ value: "", label: "— No app —" }].concat(
      state.apps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (a) { return { value: a.id, label: a.name }; })
    );
    return '<div class="field-row">' +
        field("Type", "type", i.type || presetType || DEFAULT_TYPE, { type: "select", options: ITEM_TYPES.map(function (t) { return { value: t, label: TYPE_LABEL[t] }; }) }) +
        field("App", "appId", i.appId || presetApp || "", { type: "select", options: appOptions }) +
      '</div>' +
      field("Title", "title", i.title, { required: true, placeholder: "Short summary" }) +
      field("Details", "details", i.details, { type: "textarea", placeholder: "Steps to reproduce, acceptance criteria, context…" }) +
      '<div class="field-row">' +
        field("Status", "status", i.status || "open", { type: "select", options: ITEM_STATUSES }) +
        field("Priority", "priority", i.priority || "medium", { type: "select", options: PRIORITIES }) +
      '</div>';
  }

  function newItem(presetType, presetApp) {
    openModal("New item", itemForm(null, presetType, presetApp), function (fd) {
      var t = now();
      state.items.push({
        id: uid(),
        type: fd.get("type") || DEFAULT_TYPE,
        appId: fd.get("appId") || null,
        title: (fd.get("title") || "").trim() || "Untitled",
        details: (fd.get("details") || "").trim(),
        status: fd.get("status") || "open",
        priority: fd.get("priority") || "medium",
        createdAt: t, updatedAt: t
      });
      save();
      closeModal();
      toast("Item added");
      router();
    });
  }

  /* ---------- Bulk add ---------- */
  var TYPE_ALIASES = {
    f: "feature", feat: "feature", feature: "feature",
    e: "enhancement", enh: "enhancement", enhancement: "enhancement",
    b: "bug", bug: "bug"
  };

  // Parse a textarea blob into item drafts: one per non-empty line.
  //   "Login button broken"                -> default type
  //   "feature: dark mode"                 -> type override via prefix
  //   "Total wrong | tax excludes shipping" -> title + details
  function parseBulkLines(text, defaultType) {
    var drafts = [];
    String(text || "").split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var type = defaultType;
      var m = line.match(/^([A-Za-z]+)\s*[:\-]\s+(.+)$/);
      if (m && TYPE_ALIASES[m[1].toLowerCase()]) {
        type = TYPE_ALIASES[m[1].toLowerCase()];
        line = m[2].trim();
      }
      var details = "";
      var sep = line.indexOf(" | ");
      if (sep !== -1) {
        details = line.slice(sep + 3).trim();
        line = line.slice(0, sep).trim();
      }
      if (line) drafts.push({ type: type, title: line, details: details });
    });
    return drafts;
  }

  function bulkForm(presetType, presetApp) {
    var appOptions = [{ value: "", label: "— No app —" }].concat(
      state.apps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (a) { return { value: a.id, label: a.name }; })
    );
    var ph = "Dark mode toggle | respect prefers-color-scheme\n" +
      "enhancement: speed up initial load\n" +
      "bug: login button does nothing on Safari";
    return field("Default type", "type", presetType || DEFAULT_TYPE,
        { type: "select", options: ITEM_TYPES.map(function (t) { return { value: t, label: TYPE_LABEL[t] }; }) }) +
      '<div class="field-row">' +
        field("App", "appId", presetApp || "", { type: "select", options: appOptions }) +
        field("Status", "status", "open", { type: "select", options: ITEM_STATUSES }) +
      '</div>' +
      field("Priority", "priority", "medium", { type: "select", options: PRIORITIES }) +
      '<div class="field">' +
        '<label>Items — one per line</label>' +
        '<textarea name="lines" rows="9" placeholder="' + esc(ph) + '"></textarea>' +
        '<p class="muted" style="font-size:12px;margin:6px 0 0">' +
          '<strong id="bulkCount">0 items</strong> · prefix a line with ' +
          '<code>feature:</code> <code>enhancement:</code> <code>bug:</code> to override the type, ' +
          'and add <code> | details</code> for a description.' +
        '</p>' +
      '</div>';
  }

  function bulkAddItems(presetType, presetApp) {
    openModal("Bulk add items", bulkForm(presetType, presetApp), function (fd) {
      var drafts = parseBulkLines(fd.get("lines"), fd.get("type") || DEFAULT_TYPE);
      if (!drafts.length) { toast("Nothing to add — enter one item per line"); return; }
      var t = now();
      var appId = fd.get("appId") || null;
      var status = fd.get("status") || "open";
      var priority = fd.get("priority") || "medium";
      drafts.forEach(function (d) {
        state.items.push({
          id: uid(),
          type: d.type,
          appId: appId,
          title: d.title,
          details: d.details,
          status: status,
          priority: priority,
          createdAt: t, updatedAt: t
        });
      });
      save();
      closeModal();
      toast("Added " + drafts.length + " item" + (drafts.length === 1 ? "" : "s"));
      router();
    });

    var ta = modalForm.querySelector('[name="lines"]');
    var typeSel = modalForm.querySelector('[name="type"]');
    var countEl = modalForm.querySelector("#bulkCount");
    var refresh = function () {
      var n = parseBulkLines(ta.value, typeSel.value).length;
      countEl.textContent = n + " item" + (n === 1 ? "" : "s");
    };
    ta.addEventListener("input", refresh);
    typeSel.addEventListener("change", refresh);
    ta.focus();
  }

  function editItem(id) {
    var i = itemById(id);
    if (!i) return;
    openModal("Edit item", itemForm(i), function (fd) {
      i.type = fd.get("type") || i.type;
      i.appId = fd.get("appId") || null;
      i.title = (fd.get("title") || "").trim() || i.title;
      i.details = (fd.get("details") || "").trim();
      i.status = fd.get("status") || i.status;
      i.priority = fd.get("priority") || i.priority;
      i.updatedAt = now();
      save();
      closeModal();
      toast("Item updated");
      router();
    });
  }

  function setItemStatus(id, status) {
    var i = itemById(id);
    if (!i) return;
    i.status = status;
    i.updatedAt = now();
    save();
    router();
  }

  function deleteItem(id) {
    var i = itemById(id);
    if (!i) return;
    if (!confirm('Delete "' + i.title + '"?')) return;
    state.items = state.items.filter(function (x) { return x.id !== id; });
    save();
    toast("Item deleted");
    router();
  }

  /* ---------- Export / Import ----------

     Browsers cannot silently overwrite a file from a normal download — the
     download manager always writes "name (1).json" when the name is taken, and
     there is no flag to change that. The File System Access API is the only way
     to write back to a specific file the user chose: `showSaveFilePicker` gives
     us a handle, we keep it (persisted in IndexedDB), and every later Export
     overwrites that same file. Chromium desktop only; elsewhere we fall back to
     the classic dated download.                                              */

  var FS_KEY = "backupFile";
  var backupHandle = null;

  function fsAccessSupported() { return typeof window.showSaveFilePicker === "function"; }

  function exportPayload() {
    return JSON.stringify({
      version: SCHEMA_VERSION,
      exportedAt: now(),
      apps: state.apps,
      items: state.items
    }, null, 2);
  }

  function markExported() {
    state.meta.lastExportAt = now();
    save(false);
  }

  // e.g. "2026-09-03 App-Bug_Tracker_Backup"
  function backupBaseName() {
    return new Date().toISOString().slice(0, 10) + " App-Bug_Tracker_Backup";
  }

  function downloadBlob(text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = backupBaseName() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function ensureWritePermission(handle) {
    var opts = { mode: "readwrite" };
    if (typeof handle.queryPermission !== "function") return Promise.resolve(true);
    return Promise.resolve(handle.queryPermission(opts)).then(function (p) {
      if (p === "granted") return true;
      if (typeof handle.requestPermission !== "function") return false;
      return Promise.resolve(handle.requestPermission(opts)).then(function (p2) { return p2 === "granted"; });
    });
  }

  function writeHandle(handle, text) {
    return handle.createWritable().then(function (w) {
      return w.write(text).then(function () { return w.close(); });
    });
  }

  function pickBackupFile() {
    return window.showSaveFilePicker({
      suggestedName: backupBaseName() + ".json",
      types: [{ description: "JSON backup", accept: { "application/json": [".json"] } }]
    }).then(function (h) {
      backupHandle = h;
      return idbSet(FS_KEY, h).catch(function () {}).then(function () { return h; });
    });
  }

  // forcePicker: true = always prompt for a (new) file ("Export as…")
  function exportBackup(forcePicker) {
    var text = exportPayload();

    if (!fsAccessSupported()) {
      downloadBlob(text);
      markExported();
      toast("Backup downloaded");
      return;
    }

    var resolveHandle;
    if (forcePicker) {
      resolveHandle = pickBackupFile();
    } else if (backupHandle) {
      resolveHandle = Promise.resolve(backupHandle);
    } else {
      resolveHandle = idbGet(FS_KEY).then(function (h) { return h || pickBackupFile(); });
    }

    resolveHandle
      .then(function (handle) {
        return ensureWritePermission(handle).then(function (ok) {
          if (!ok) {
            var e = new Error("permission");
            e.code = "permission";
            throw e;
          }
          return writeHandle(handle, text).then(function () {
            backupHandle = handle;
            $("#exportBtn").title = "Overwrite backup: " + handle.name;
            markExported();
            toast("Saved to " + handle.name);
          });
        });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return; // picker cancelled
        console.error("Export failed:", err);
        if (err && err.code === "permission") {
          backupHandle = null;
          idbDel(FS_KEY).catch(function () {});
          toast("Permission denied — pick the file again with “Export as…”");
        } else {
          // stale handle (file moved/deleted) or write error → clean copy
          backupHandle = null;
          idbDel(FS_KEY).catch(function () {});
          downloadBlob(text);
          markExported();
          toast("Could not reach the saved file — downloaded a copy");
        }
      });
  }

  /* tiny IndexedDB kv store, just for the backup file handle */
  function idbOpen() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("app-tracker", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var rq = db.transaction("kv", "readonly").objectStore("kv").get(key);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(val, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbDel(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete(key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        toast("That file is not valid JSON");
        return;
      }
      if (!data || !Array.isArray(data.apps) || !Array.isArray(data.items)) {
        toast("Unrecognized backup format");
        return;
      }
      var mode = prompt(
        "Import " + data.apps.length + " app(s) and " + data.items.length + " item(s).\n\n" +
        'Type "replace" to overwrite everything, or "merge" to add/update by id.',
        "merge"
      );
      if (mode == null) return;
      mode = mode.trim().toLowerCase();

      if (mode === "replace") {
        state.apps = data.apps;
        state.items = data.items;
      } else if (mode === "merge") {
        mergeList(state.apps, data.apps);
        mergeList(state.items, data.items);
      } else {
        toast("Import cancelled");
        return;
      }
      save();
      toast("Import complete");
      router();
    };
    reader.readAsText(file);
  }

  function mergeList(target, incoming) {
    var index = {};
    target.forEach(function (x, idx) { index[x.id] = idx; });
    incoming.forEach(function (x) {
      if (!x || !x.id) { x.id = uid(); }
      if (index[x.id] != null) {
        target[index[x.id]] = x;
      } else {
        target.push(x);
        index[x.id] = target.length - 1;
      }
    });
  }

  /* ---------- Backup nudge ---------- */
  function renderBackupNudge() {
    var el = $("#backupNudge");
    var changed = state.meta.lastChangeAt;
    var exported = state.meta.lastExportAt;
    var stale = changed && (!exported || exported < changed);
    var dismissed = sessionStorage.getItem("nudge-dismissed") === "1";
    if (stale && !dismissed && (state.apps.length || state.items.length)) {
      el.querySelector("span").textContent = exported
        ? "You have unsaved changes since your last backup (" + fmtDate(exported) + ")."
        : "You haven't exported a backup yet.";
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  /* ---------- Theme ---------- */
  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }

  /* ---------- Misc utils ---------- */
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ---------- Event wiring ---------- */
  // Close any open multi-select dropdown when clicking elsewhere.
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".ms")) closeAllMenus();
  });

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");
    switch (action) {
      case "new-app": newApp(); break;
      case "edit-app": editApp(id); break;
      case "delete-app": deleteApp(id); break;
      case "new-item": newItem(el.getAttribute("data-type"), el.getAttribute("data-app")); break;
      case "bulk-item": bulkAddItems(el.getAttribute("data-type"), el.getAttribute("data-app")); break;
      case "edit-item": editItem(id); break;
      case "delete-item": deleteItem(id); break;
      case "resolve-item": setItemStatus(id, "resolved"); break;
      case "reopen-item": setItemStatus(id, "open"); break;
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains("item-check")) {
      var id = t.getAttribute("data-id");
      if (t.checked) selected.add(id); else selected.delete(id);
      syncSelection();
    } else if (t.id === "selectAllCheck") {
      $$(".item-check").forEach(function (c) {
        var id = c.getAttribute("data-id");
        if (t.checked) selected.add(id); else selected.delete(id);
      });
      syncSelection();
    }
  });

  (function initBulkFieldSelects() {
    var st = $("#selStatus");
    ITEM_STATUSES.forEach(function (s) {
      st.insertAdjacentHTML("beforeend", '<option value="' + s + '">' + labelize(s) + "</option>");
    });
    var pr = $("#selPriority");
    PRIORITIES.forEach(function (p) {
      pr.insertAdjacentHTML("beforeend", '<option value="' + p + '">' + labelize(p) + "</option>");
    });
    st.addEventListener("change", function () { bulkSetField("status", st.value); st.value = ""; });
    pr.addEventListener("change", function () { bulkSetField("priority", pr.value); pr.value = ""; });
  })();

  $("#selCopy").addEventListener("click", function () { copySelected("text"); });
  $("#selCopyJson").addEventListener("click", function () { copySelected("json"); });
  $("#selClear").addEventListener("click", clearSelection);

  $("#exportBtn").addEventListener("click", function () { exportBackup(false); });
  $("#nudgeExport").addEventListener("click", function () { exportBackup(false); });
  $("#exportAsBtn").addEventListener("click", function () { exportBackup(true); });
  $("#nudgeDismiss").addEventListener("click", function () {
    sessionStorage.setItem("nudge-dismissed", "1");
    $("#backupNudge").hidden = true;
  });
  $("#importBtn").addEventListener("click", function () { $("#importFile").click(); });
  $("#importFile").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = "";
  });
  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#menuToggle").addEventListener("click", function () {
    $("#mainnav").classList.toggle("open");
  });
  $("#mainnav").addEventListener("click", function (e) {
    if (e.target.tagName === "A") $("#mainnav").classList.remove("open");
  });

  window.addEventListener("hashchange", router);

  /* ---------- Boot ---------- */
  initTheme();
  renderBackupNudge();

  if (fsAccessSupported()) {
    $("#exportAsBtn").hidden = false;
    // Surface where Export will save, if we already remember a file.
    idbGet(FS_KEY).then(function (h) {
      if (!h) return;
      backupHandle = h;
      $("#exportBtn").title = "Overwrite backup: " + h.name;
    }).catch(function () {});
  } else {
    $("#exportBtn").title = "Download a JSON backup (your browser can't overwrite an existing file)";
  }

  if (!location.hash) location.hash = "#/dashboard";
  router();
})();
