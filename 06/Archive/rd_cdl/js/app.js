/* CDL 2026 Analyzer — router, views, sortable tables, detail modals. */
(function () {
  const view = document.getElementById("view");
  const $ = (s, r = document) => r.querySelector(s);

  // In-memory UI state: kept while navigating between views, reset on a full
  // page refresh (it lives only for this page's JS session — no storage APIs).
  const UIState = {
    overview: { sortKey: null, sortDir: null },
    players: { search: "", team: "", sortKey: null, sortDir: null },
    teams: { sortKey: null, sortDir: null },
    matches: { event: "", team: "", status: "" },
    maps: { mode: "", sortKey: null, sortDir: null },
    events: { sortKey: null, sortDir: null },
    h2h: { mode: "teams", teams: { a: null, b: null }, players: { a: null, b: null } },
    history: { mode: "team", team: null, player: null },
  };

  // ---------- small helpers ------------------------------------------------
  const kd = (r) => r.kd;
  const fx = (v, d = 2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);
  const signClass = (v, base) => v >= base ? "pos" : "neg";

  function playerChip(pid) {
    const tag = DB.playerTag(pid), hs = DB.playerHeadshot(pid);
    const img = hs ? `<img class="avatar" src="${hs}" loading="lazy" onerror="this.style.visibility='hidden'"/>` : "";
    return `<span class="chip">${img}<span class="tag-strong">${tag}</span></span>`;
  }
  function teamChip(tid, short) {
    if (!tid) return `<span class="muted">—</span>`;
    return `<span class="tchip"><span class="tdot" style="background:${DB.teamColor(tid)}"></span>${DB.teamName(tid, short)}</span>`;
  }
  function teamLogoChip(tid) {
    const logo = DB.teamLogo(tid);
    const img = logo ? `<img class="logo" src="${logo}" loading="lazy" onerror="this.style.display='none'"/>` : "";
    return `<span class="chip">${img}<span>${DB.teamName(tid, true)}</span></span>`;
  }

  // ---------- sortable table ----------------------------------------------
  function SortableTable(mount, columns, rows, opts = {}) {
    const colByKey = {};
    columns.forEach((c) => (colByKey[c.key] = c));
    let sortKey = opts.sort || (columns.find((c) => c.default) || columns[0]).key;
    let dir = opts.dir != null ? opts.dir : -1;
    let data = rows.slice();

    const val = (c, r) => (c.value ? c.value(r) : r[c.key]);

    function render() {
      const c = colByKey[sortKey];
      data.sort((a, b) => {
        let va = val(c, a), vb = val(c, b);
        if (typeof va === "string" || typeof vb === "string") {
          va = (va ?? "").toString().toLowerCase(); vb = (vb ?? "").toString().toLowerCase();
          return va < vb ? -dir : va > vb ? dir : 0;
        }
        va = (va == null || isNaN(va)) ? -Infinity : va;
        vb = (vb == null || isNaN(vb)) ? -Infinity : vb;
        return (va - vb) * dir;
      });
      const head = columns.map((col) => {
        const s = col.key === sortKey ? ` sorted` : "";
        const arrow = col.key === sortKey ? `<span class="arrow">${dir < 0 ? "▼" : "▲"}</span>` : "";
        return `<th class="${col.left ? "left" : ""}${s}" data-key="${col.key}" title="${col.title || col.label}">${col.label} ${arrow}</th>`;
      }).join("");
      const body = data.map((r, i) => {
        const cells = columns.map((col) => {
          const html = col.render ? col.render(r, i) : DB.num(r[col.key], col.d || 0);
          return `<td class="${col.left ? "left" : ""}">${html}</td>`;
        }).join("");
        return `<tr class="${opts.onRow ? "clickable" : ""}" data-i="${i}">${cells}</tr>`;
      }).join("");
      mount.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      mount.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
        const k = th.dataset.key;
        if (k === sortKey) dir = -dir; else { sortKey = k; dir = colByKey[k].asc ? 1 : -1; }
        if (opts.onSort) opts.onSort(sortKey, dir);
        render();
      }));
      if (opts.onRow) mount.querySelectorAll("tbody tr").forEach((tr) =>
        tr.addEventListener("click", () => opts.onRow(data[+tr.dataset.i])));
    }
    this.setData = (r) => { data = r.slice(); render(); };
    render();
  }

  // ---------- searchable select (combobox) --------------------------------
  function SearchSelect(mount, options, cfg = {}) {
    let value = cfg.value != null ? cfg.value : (options[0] && options[0].value);
    const map = new Map(options.map((o) => [String(o.value), o]));
    mount.classList.add("ss");
    const control = document.createElement("div");
    control.className = "ss-control"; control.tabIndex = 0;
    const pop = document.createElement("div"); pop.className = "ss-pop hidden";
    const search = document.createElement("input");
    search.className = "ss-search"; search.type = "text"; search.placeholder = cfg.placeholder || "Search…";
    const list = document.createElement("div"); list.className = "ss-list";
    pop.appendChild(search); pop.appendChild(list);
    mount.appendChild(control); mount.appendChild(pop);

    const optInner = (o) => {
      const img = o.img
        ? `<img class="ss-img ${o.imgRound ? "round" : ""}" src="${o.img}" onerror="this.style.visibility='hidden'">`
        : (o.dot ? `<span class="tdot" style="background:${o.dot}"></span>` : "");
      return `${img}<span class="ss-opt-label">${o.label}</span>${o.sub ? `<span class="ss-opt-sub">${o.sub}</span>` : ""}`;
    };
    const renderControl = () => {
      const o = map.get(String(value));
      control.innerHTML = `<span class="ss-current">${o ? optInner(o) : '<span class="muted">Select…</span>'}</span><span class="ss-caret">▾</span>`;
    };
    const renderList = (q) => {
      const ql = (q || "").toLowerCase();
      const items = options.filter((o) => o.label.toLowerCase().includes(ql) || (o.sub && o.sub.toLowerCase().includes(ql)));
      list.innerHTML = items.length
        ? items.map((o) => `<div class="ss-opt ${String(o.value) === String(value) ? "sel" : ""}" data-v="${o.value}">${optInner(o)}</div>`).join("")
        : `<div class="ss-empty">No matches</div>`;
      list.querySelectorAll(".ss-opt").forEach((el) =>
        el.addEventListener("mousedown", (e) => { e.preventDefault(); choose(el.dataset.v); }));
    };
    const outside = (e) => { if (!mount.contains(e.target)) close(); };
    function open() {
      pop.classList.remove("hidden"); search.value = ""; renderList("");
      setTimeout(() => search.focus(), 0);
      document.addEventListener("mousedown", outside);
    }
    function close() { pop.classList.add("hidden"); document.removeEventListener("mousedown", outside); }
    function choose(v) {
      value = isNaN(+v) ? v : +v; renderControl(); close();
      if (cfg.onChange) cfg.onChange(value);
    }
    control.addEventListener("click", () => (pop.classList.contains("hidden") ? open() : close()));
    control.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    search.addEventListener("input", () => renderList(search.value));
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(); control.focus(); }
      if (e.key === "Enter") { const f = list.querySelector(".ss-opt"); if (f) { e.preventDefault(); choose(f.dataset.v); } }
    });
    renderControl();
    this.getValue = () => value;
    this.setValue = (v) => { value = v; renderControl(); };
  }

  function teamSelectOptions() {
    return (DB.raw.teamStats || []).map((t) => t.team_id)
      .sort((a, b) => DB.teamName(a) < DB.teamName(b) ? -1 : 1)
      .map((id) => ({ value: id, label: DB.teamName(id), sub: DB.teamName(id, true), img: DB.teamLogo(id), dot: DB.teamColor(id) }));
  }
  function playerSelectOptions() {
    return (DB.raw.playerStats || []).map((p) => ({ id: p.player_id, tag: p.player_tag }))
      .sort((a, b) => a.tag.toLowerCase() < b.tag.toLowerCase() ? -1 : 1)
      .map((p) => ({ value: p.id, label: p.tag, img: DB.playerHeadshot(p.id), imgRound: true, sub: DB.teamName(DB.playerTeam[p.id], true) }));
  }

  // ---------- modal --------------------------------------------------------
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modalBody");
  function openModal(html) { modalBody.innerHTML = html; modal.classList.remove("hidden"); }
  function closeModal() { modal.classList.add("hidden"); modalBody.innerHTML = ""; }
  modal.querySelectorAll("[data-close]").forEach((e) => e.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // ---------- derived helpers ---------------------------------------------
  function teamRecord(teamId) {
    let w = 0, l = 0;
    (DB.raw.matches || []).forEach((m) => {
      if (m.status !== "complete") return;
      if (m.team_1_id !== teamId && m.team_2_id !== teamId) return;
      if (m.winner_id === teamId) w++; else if (m.winner_id) l++;
    });
    return { w, l };
  }

  function mapAggregates(modeFilter) {
    const agg = {};
    (DB.raw.games || []).forEach((g) => {
      if (modeFilter && g.mode_id !== modeFilter) return;
      const k = g.map_id;
      const a = agg[k] || (agg[k] = { map_id: k, games: 0, kills: 0, dmg: 0, secs: 0, modes: new Set() });
      a.games++;
      a.kills += (g.team_1_kills || 0) + (g.team_2_kills || 0);
      a.dmg += (g.team_1_damage || 0) + (g.team_2_damage || 0);
      a.secs += (g.gametime_min || 0) * 60 + (g.gametime_sec || 0);
      a.modes.add(g.mode_id);
    });
    return Object.values(agg);
  }

  // ================= VIEWS =================================================
  const Views = {};

  Views.overview = function () {
    const ps = DB.raw.playerStats || [];
    const nGamesPlayed = (DB.raw.games || []).length;
    const completed = (DB.raw.matches || []).filter((m) => m.status === "complete").length;
    const kpis = [
      ["Teams", (DB.raw.teams || []).length],
      ["Ranked players", ps.length],
      ["Events", (DB.raw.events || []).length],
      ["Matches", completed],
      ["Maps played", nGamesPlayed],
    ];
    const topRating = ps.slice().sort((a, b) => b.bp_rating - a.bp_rating).slice(0, 10)
      .map((p) => ({ label: p.player_tag, value: +(p.bp_rating).toFixed(3), display: fx(p.bp_rating, 2), color: DB.teamColor(DB.playerTeam[p.player_id]) }));
    const topKills = ps.slice().sort((a, b) => b.kills - a.kills).slice(0, 10)
      .map((p) => ({ label: p.player_tag, value: p.kills, display: DB.num(p.kills), color: "var(--accent-2)" }));

    const standings = (DB.raw.teams || []).map((t) => {
      const r = teamRecord(t.id); return { t, ...r, wp: r.w + r.l ? r.w / (r.w + r.l) : 0 };
    }).filter((s) => s.w + s.l > 0).sort((a, b) => b.wp - a.wp || b.w - a.w);

    view.innerHTML = `
      <div class="kpis">${kpis.map((k) => `<div class="kpi"><div class="n">${DB.num(k[1])}</div><div class="l">${k[0]}</div></div>`).join("")}</div>
      <div class="grid cols-2">
        <div class="card"><h3 class="sub">Top players · BP Rating</h3>${Charts.hbar(topRating, { labelW: 90 })}</div>
        <div class="card"><h3 class="sub">Top players · Kills</h3>${Charts.hbar(topKills, { labelW: 90 })}</div>
      </div>
      <h3 class="sub">Standings (match record)</h3>
      <div id="standings"></div>`;

    new SortableTable($("#standings"), [
      { key: "rank", label: "#", render: (r, i) => `<span class="rank">${i + 1}</span>`, value: () => 0, left: true },
      { key: "team", label: "Team", left: true, value: (r) => DB.teamName(r.t.id), render: (r) => teamLogoChip(r.t.id) },
      { key: "w", label: "W", render: (r) => `<b>${r.w}</b>`, d: 0 },
      { key: "l", label: "L", render: (r) => r.l, d: 0 },
      { key: "wp", label: "Win %", render: (r) => DB.pct(r.wp) },
    ], standings, {
      sort: UIState.overview.sortKey || "wp",
      dir: UIState.overview.sortDir != null ? UIState.overview.sortDir : -1,
      onSort: (k, d) => { UIState.overview.sortKey = k; UIState.overview.sortDir = d; },
      onRow: (r) => teamDetail(r.t.id),
    });
  };

  Views.players = function () {
    const rows = (DB.raw.playerStats || []).map((p) => ({ ...p, team_id: DB.playerTeam[p.player_id] }));
    const teams = (DB.raw.teams || []).slice().sort((a, b) => DB.teamName(a.id) < DB.teamName(b.id) ? -1 : 1);
    view.innerHTML = `
      <h2 class="section">Player stats · Season 2026</h2>
      <div class="toolbar">
        <input type="search" id="psearch" placeholder="Search player…" />
        <select id="pteam"><option value="">All teams</option>${teams.map((t) => `<option value="${t.id}">${DB.teamName(t.id)}</option>`).join("")}</select>
        <div class="spacer"></div>
        <span class="count-note" id="pcount"></span>
      </div>
      <div id="ptable"></div>
      <p class="muted" style="margin-top:.6rem">Click a player for mode splits and per-event trend. Sort by any column.</p>`;

    const cols = [
      { key: "rk", label: "#", left: true, value: () => 0, render: (r, i) => `<span class="rank">${i + 1}</span>` },
      { key: "player_tag", label: "Player", left: true, asc: true, value: (r) => r.player_tag, render: (r) => playerChip(r.player_id) },
      { key: "team_id", label: "Team", left: true, asc: true, value: (r) => DB.teamName(r.team_id), render: (r) => teamChip(r.team_id, true) },
      { key: "game_count", label: "GP", title: "Maps played" },
      { key: "bp_rating", label: "BP Rtg", title: "Breaking Point rating", render: (r) => `<b class="${signClass(r.bp_rating, 1)}">${fx(r.bp_rating, 2)}</b>` },
      { key: "slayer_rating", label: "Slayer", render: (r) => fx(r.slayer_rating, 1) },
      { key: "kd", label: "K/D", render: (r) => `<span class="${signClass(r.kd, 1)}">${fx(r.kd, 2)}</span>` },
      { key: "kills", label: "Kills" },
      { key: "deaths", label: "Deaths" },
      { key: "dmg", label: "Damage", value: (r) => r.damage, render: (r) => DB.num(r.damage) },
      { key: "dmg_per_min", label: "Dmg/min", render: (r) => fx(r.dmg_per_min, 0) },
      { key: "hp_bp_rating", label: "HP Rtg", title: "Hardpoint rating", render: (r) => fx(r.hp_bp_rating, 1) },
      { key: "snd_bp_rating", label: "SnD Rtg", title: "Search & Destroy rating", render: (r) => fx(r.snd_bp_rating, 1) },
      { key: "ovl_kd", label: "OVL K/D", title: "Overload K/D", render: (r) => fx(r.ovl_kd, 2) },
    ];
    const S = UIState.players;
    const table = new SortableTable($("#ptable"), cols, rows, {
      sort: S.sortKey || "bp_rating",
      dir: S.sortDir != null ? S.sortDir : -1,
      onSort: (k, d) => { S.sortKey = k; S.sortDir = d; },
      onRow: (r) => playerDetail(r.player_id),
    });
    $("#psearch").value = S.search || "";
    $("#pteam").value = S.team || "";
    const apply = () => {
      S.search = $("#psearch").value; S.team = $("#pteam").value;
      const q = S.search.trim().toLowerCase();
      const tf = S.team;
      const f = rows.filter((r) =>
        (!q || r.player_tag.toLowerCase().includes(q)) &&
        (!tf || String(r.team_id) === tf));
      table.setData(f);
      $("#pcount").textContent = `${f.length} players`;
    };
    $("#psearch").addEventListener("input", apply);
    $("#pteam").addEventListener("change", apply);
    apply();
  };

  Views.teams = function () {
    const rows = (DB.raw.teamStats || []).map((t) => ({ ...t, ...teamRecord(t.team_id) }));
    view.innerHTML = `
      <h2 class="section">Team stats · Season 2026</h2>
      <div id="ttable"></div>
      <p class="muted" style="margin-top:.6rem">Click a team for its roster and mode splits.</p>`;
    new SortableTable($("#ttable"), [
      { key: "team", label: "Team", left: true, asc: true, value: (r) => DB.teamName(r.team_id), render: (r) => teamLogoChip(r.team_id) },
      { key: "w", label: "W", render: (r) => `<b>${r.w}</b>` },
      { key: "l", label: "L" },
      { key: "kd", label: "K/D", render: (r) => `<b class="${signClass(r.kd, 1)}">${fx(r.kd, 2)}</b>` },
      { key: "kills", label: "Kills" },
      { key: "deaths", label: "Deaths" },
      { key: "hp_kd", label: "HP K/D", render: (r) => fx(r.hp_kd, 2) },
      { key: "snd_kd", label: "SnD K/D", render: (r) => fx(r.snd_kd, 2) },
      { key: "ovl_kd", label: "OVL K/D", render: (r) => fx(r.ovl_kd, 2) },
      { key: "hp_map_win_percentage", label: "HP Win%", render: (r) => DB.pct(r.hp_map_win_percentage) },
      { key: "snd_map_win_percentage", label: "SnD Win%", render: (r) => DB.pct(r.snd_map_win_percentage) },
      { key: "ovl_map_win_percentage", label: "OVL Win%", render: (r) => DB.pct(r.ovl_map_win_percentage) },
    ], rows, {
      sort: UIState.teams.sortKey || "kd",
      dir: UIState.teams.sortDir != null ? UIState.teams.sortDir : -1,
      onSort: (k, d) => { UIState.teams.sortKey = k; UIState.teams.sortDir = d; },
      onRow: (r) => teamDetail(r.team_id),
    });
  };

  Views.matches = function () {
    const matches = (DB.raw.matches || []).slice().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    const events = DB.eventsSorted();
    const teams = (DB.raw.teams || []).slice().sort((a, b) => DB.teamName(a.id) < DB.teamName(b.id) ? -1 : 1);
    view.innerHTML = `
      <h2 class="section">Matches</h2>
      <div class="toolbar">
        <select id="mevent"><option value="">All events</option>${events.map((e) => `<option value="${e.id}">${DB.eventName(e.id)}</option>`).join("")}</select>
        <select id="mteam"><option value="">All teams</option>${teams.map((t) => `<option value="${t.id}">${DB.teamName(t.id)}</option>`).join("")}</select>
        <select id="mstatus"><option value="">All statuses</option><option value="complete">Completed</option><option value="upcoming">Upcoming</option></select>
        <div class="spacer"></div><span class="count-note" id="mcount"></span>
      </div>
      <div class="card" style="padding:0" id="mlist"></div>`;

    function row(m) {
      const t1w = m.winner_id === m.team_1_id, t2w = m.winner_id === m.team_2_id;
      const sc = m.status === "complete" ? `${m.team_1_score ?? "-"}<span class="muted"> : </span>${m.team_2_score ?? "-"}` : `<span class="muted">vs</span>`;
      return `<div class="match-row" data-id="${m.id}">
        <div class="match-meta">${DB.dateTime(m.datetime)}<br><span class="muted">${DB.eventName(m.event_id, true)}</span></div>
        <div class="match-teams">
          <div class="match-side ${t1w ? "badge-win" : ""}">${teamLogoChip(m.team_1_id)}</div>
          <div class="match-score">${sc}</div>
          <div class="match-side right ${t2w ? "badge-win" : ""}">${teamLogoChip(m.team_2_id)}</div>
        </div>
        <div class="match-meta" style="text-align:right">Bo${m.best_of || "?"}</div>
      </div>`;
    }
    const S = UIState.matches;
    function apply() {
      S.event = $("#mevent").value; S.team = $("#mteam").value; S.status = $("#mstatus").value;
      const ev = S.event, tm = S.team, st = S.status;
      const f = matches.filter((m) =>
        (!ev || String(m.event_id) === ev) &&
        (!tm || String(m.team_1_id) === tm || String(m.team_2_id) === tm) &&
        (!st || (st === "complete" ? m.status === "complete" : m.status !== "complete")));
      $("#mlist").innerHTML = f.map(row).join("") || `<div class="match-row muted">No matches.</div>`;
      $("#mcount").textContent = `${f.length} matches`;
      $("#mlist").querySelectorAll(".match-row[data-id]").forEach((r) =>
        r.addEventListener("click", () => matchDetail(+r.dataset.id)));
    }
    $("#mevent").value = S.event || ""; $("#mteam").value = S.team || ""; $("#mstatus").value = S.status || "";
    ["#mevent", "#mteam", "#mstatus"].forEach((s) => $(s).addEventListener("change", apply));
    apply();
  };

  Views.maps = function () {
    const modes = DB.raw.modes || [];
    view.innerHTML = `
      <h2 class="section">Map & mode analysis</h2>
      <div class="toolbar">
        <select id="mapmode"><option value="">All modes</option>${modes.map((m) => `<option value="${m.id}">${m.name}</option>`).join("")}</select>
        <div class="spacer"></div><span class="count-note">from ${DB.num((DB.raw.games || []).length)} maps played</span>
      </div>
      <div class="grid cols-2">
        <div class="card"><h3 class="sub">Most played maps</h3><div id="mapbars"></div></div>
        <div class="card"><h3 class="sub">Mode distribution</h3><div id="modebars"></div></div>
      </div>
      <h3 class="sub">Map pool</h3><div id="maptable"></div>`;

    function draw() {
      UIState.maps.mode = $("#mapmode").value;
      const mf = UIState.maps.mode ? +UIState.maps.mode : null;
      const agg = mapAggregates(mf).sort((a, b) => b.games - a.games);
      $("#mapbars").innerHTML = Charts.hbar(agg.slice(0, 10).map((a) => ({
        label: DB.mapName(a.map_id), value: a.games, display: a.games, color: "var(--accent)" })), { labelW: 110 });

      const modeCounts = {};
      (DB.raw.games || []).forEach((g) => { modeCounts[g.mode_id] = (modeCounts[g.mode_id] || 0) + 1; });
      const md = Object.entries(modeCounts).map(([id, n]) => ({ label: DB.modeName(+id), value: n, display: n, color: "var(--accent-2)" }))
        .sort((a, b) => b.value - a.value);
      $("#modebars").innerHTML = Charts.vbar(md, { height: 240 });

      new SortableTable($("#maptable"), [
        { key: "map", label: "Map", left: true, asc: true, value: (r) => DB.mapName(r.map_id), render: (r) => `<b>${DB.mapName(r.map_id)}</b>` },
        { key: "modes", label: "Modes", left: true, value: (r) => r.modes.size, render: (r) => [...r.modes].map((m) => `<span class="pill-mode">${DB.modeName(m)}</span>`).join(" ") },
        { key: "games", label: "Played" },
        { key: "avgk", label: "Avg kills / map", value: (r) => r.kills / r.games, render: (r) => fx(r.kills / r.games, 0) },
        { key: "avgt", label: "Avg length", value: (r) => r.secs / r.games, render: (r) => `${Math.floor((r.secs / r.games) / 60)}m ${Math.round((r.secs / r.games) % 60)}s` },
      ], agg, {
        sort: UIState.maps.sortKey || "games",
        dir: UIState.maps.sortDir != null ? UIState.maps.sortDir : -1,
        onSort: (k, d) => { UIState.maps.sortKey = k; UIState.maps.sortDir = d; },
      });
    }
    $("#mapmode").value = UIState.maps.mode || "";
    $("#mapmode").addEventListener("change", draw);
    draw();
  };

  Views.events = function () {
    const events = DB.eventsSorted();
    view.innerHTML = `
      <h2 class="section">Events / tournaments</h2>
      <div id="etable"></div>
      <p class="muted" style="margin-top:.6rem">Click an event for its stat leaders.</p>`;
    const rows = events.map((e) => {
      const mc = (DB.raw.matches || []).filter((m) => m.event_id === e.id && m.status === "complete").length;
      return { ...e, played: mc };
    });
    new SortableTable($("#etable"), [
      { key: "start_date", label: "Start", left: true, asc: true, value: (r) => new Date(r.start_date).getTime(), render: (r) => DB.date(r.start_date) },
      { key: "name", label: "Event", left: true, asc: true, value: (r) => r.name, render: (r) => `<b>${(r.name || "").trim()}</b>` },
      { key: "tier", label: "Tier", left: true, value: (r) => r.tier || "", render: (r) => `<span class="muted">${r.tier || "—"}</span>` },
      { key: "played", label: "Matches" },
      { key: "number_of_teams", label: "Teams", render: (r) => r.number_of_teams || "—" },
      { key: "prizepool", label: "Prize", value: (r) => r.prizepool || 0, render: (r) => r.prizepool ? "$" + DB.num(r.prizepool) : "—" },
      { key: "location", label: "Location", left: true, value: (r) => r.location || "", render: (r) => `<span class="muted">${r.location || "—"}</span>` },
    ], rows, {
      sort: UIState.events.sortKey || "start_date",
      dir: UIState.events.sortDir != null ? UIState.events.sortDir : 1,
      onSort: (k, d) => { UIState.events.sortKey = k; UIState.events.sortDir = d; },
      onRow: (r) => eventDetail(r.id),
    });
  };

  // ---- shared H2H render helpers -----------------------------------------
  const recCell = (w, l) => `<b class="${w > l ? "winA" : w < l ? "winB" : ""}">${w}–${l}</b>`;
  const marginTxt = (m) => `<span class="${m >= 0 ? "winA" : "winB"}">${m >= 0 ? "+" : ""}${m.toFixed(1)}</span>`;

  Views.h2h = function () {
    view.innerHTML = `
      <h2 class="section">Head-to-Head</h2>
      <div class="toolbar">
        <div class="seg" id="h2hMode">
          <button class="seg-btn active" data-m="teams">Team vs Team</button>
          <button class="seg-btn" data-m="players">Player vs Player</button>
        </div>
      </div>
      <div class="toolbar" id="h2hCtrl"></div>
      <div id="h2hBody"></div>`;
    const S = UIState.h2h;
    let mode = S.mode;
    let selA = null, selB = null;

    function controls() {
      const list = mode === "teams" ? teamSelectOptions() : playerSelectOptions();
      const ph = mode === "teams" ? "Search teams…" : "Search players…";
      const valid = new Set(list.map((o) => o.value));
      const saved = S[mode];
      const aVal = saved.a != null && valid.has(saved.a) ? saved.a : (list[0] && list[0].value);
      const bVal = saved.b != null && valid.has(saved.b) ? saved.b : (list[1] && list[1].value);
      saved.a = aVal; saved.b = bVal;
      $("#h2hCtrl").innerHTML = `<div id="selA"></div><span class="muted">vs</span><div id="selB"></div>`;
      selA = new SearchSelect($("#selA"), list, { value: aVal, placeholder: ph, onChange: (v) => { saved.a = v; render(); } });
      selB = new SearchSelect($("#selB"), list, { value: bVal, placeholder: ph, onChange: (v) => { saved.b = v; render(); } });
      render();
    }
    function render() {
      const a = selA.getValue(), b = selB.getValue();
      if (a === b) { $("#h2hBody").innerHTML = `<div class="empty">Pick two different ${mode === "teams" ? "teams" : "players"}.</div>`; return; }
      $("#h2hBody").innerHTML = mode === "teams" ? teamCompare(a, b) : playerCompare(a, b);
      $("#h2hBody").querySelectorAll(".match-row[data-id]").forEach((r) => r.addEventListener("click", () => matchDetail(+r.dataset.id)));
      $("#h2hBody").querySelectorAll("[data-pid]").forEach((r) => r.addEventListener("click", () => playerDetail(+r.dataset.pid)));
    }
    $("#h2hMode").querySelectorAll(".seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.m === mode);
      btn.addEventListener("click", () => {
        mode = btn.dataset.m; S.mode = mode;
        $("#h2hMode").querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x === btn));
        controls();
      });
    });
    controls();
  };

  function teamCompare(a, b) {
    const R = Analysis.teamH2H(a, b);
    const aN = DB.teamName(a, true), bN = DB.teamName(b, true);
    const head = `<div class="vs-head">
      <div class="vs-side a">${DB.teamLogo(a) ? `<img src="${DB.teamLogo(a)}">` : ""}<div class="nm" style="color:${DB.teamColor(a)}">${DB.teamName(a)}</div></div>
      <div class="vs-center"><div class="rec">${R.aWins} <span class="muted">–</span> ${R.bWins}</div><div class="lbl">Series (Bo-series) record</div>
        <div class="vs-pill" style="margin-top:.4rem">Maps ${R.mapA}–${R.mapB}</div></div>
      <div class="vs-side b">${DB.teamLogo(b) ? `<img src="${DB.teamLogo(b)}">` : ""}<div class="nm" style="color:${DB.teamColor(b)}">${DB.teamName(b)}</div></div>
    </div>`;
    if (!R.matches.length) return head + `<div class="empty">${DB.teamName(a)} and ${DB.teamName(b)} haven't played this season.</div>`;

    const modeRows = Object.values(R.byMode).sort((x, y) => y.n - x.n).map((m) => {
      const avgA = m.aScore / m.n, avgB = m.bScore / m.n;
      return `<tr><td class="left">${DB.modeName(m.mode_id)}</td><td>${recCell(m.aWins, m.bWins)}</td>
        <td>${avgA.toFixed(1)}</td><td>${avgB.toFixed(1)}</td><td>${marginTxt(avgA - avgB)}</td></tr>`;
    }).join("");
    const modeTable = `<h3 class="sub">By mode — record &amp; average score (${aN} perspective)</h3>
      <div class="table-wrap"><table><thead><tr><th class="left">Mode</th><th>${aN}–${bN} maps</th><th>${aN} avg</th><th>${bN} avg</th><th>Margin</th></tr></thead><tbody>${modeRows}</tbody></table></div>`;

    const mapRows = Object.values(R.byMap).sort((x, y) => y.n - x.n).map((m) => {
      const margin = (m.aScore - m.bScore) / m.n;
      return `<tr><td class="left">${DB.mapName(m.map_id)}</td><td class="left"><span class="pill-mode">${DB.modeName(m.mode_id)}</span></td>
        <td>${recCell(m.aWins, m.bWins)}</td><td>${m.n}</td><td>${marginTxt(margin)}</td></tr>`;
    }).join("");
    const mapTable = `<h3 class="sub">By map</h3><div class="table-wrap"><table><thead><tr><th class="left">Map</th><th class="left">Mode</th><th>${aN}–${bN}</th><th>Played</th><th>Avg margin</th></tr></thead><tbody>${mapRows}</tbody></table></div>`;

    const matchList = `<h3 class="sub">Meetings (${R.matches.length})</h3><div class="card" style="padding:0">${R.matches.map((mi) => {
      const t1w = mi.winner === mi.t1, t2w = mi.winner === mi.t2;
      return `<div class="match-row" data-id="${mi.id}">
        <div class="match-meta">${DB.dateTime(mi.datetime)}<br><span class="muted">${DB.eventName(mi.event_id, true)}</span></div>
        <div class="match-teams"><div class="match-side ${t1w ? "badge-win" : ""}">${teamLogoChip(mi.t1)}</div>
        <div class="match-score">${mi.s1} : ${mi.s2}</div>
        <div class="match-side right ${t2w ? "badge-win" : ""}">${teamLogoChip(mi.t2)}</div></div></div>`;
    }).join("")}</div>`;
    return head + modeTable + mapTable + matchList;
  }

  function playerCompare(p, q) {
    const R = Analysis.playerH2H(p, q);
    const sp = (DB.raw.playerStats || []).find((x) => x.player_id === p);
    const sq = (DB.raw.playerStats || []).find((x) => x.player_id === q);
    const hs = (id) => DB.playerHeadshot(id) ? `<img class="avatar" src="${DB.playerHeadshot(id)}">` : "";
    const head = `<div class="vs-head">
      <div class="vs-side a">${hs(p)}<div class="nm">${DB.playerTag(p)}</div><div class="vs-pill">${teamChip(DB.playerTeam[p], true)}</div></div>
      <div class="vs-center"><div class="rec">${R.pWins} <span class="muted">–</span> ${R.qWins}</div><div class="lbl">Map record head-to-head</div>
        <div class="vs-pill" style="margin-top:.4rem">${R.matchesFaced} matches faced</div></div>
      <div class="vs-side b">${hs(q)}<div class="nm">${DB.playerTag(q)}</div><div class="vs-pill">${teamChip(DB.playerTeam[q], true)}</div></div>
    </div>`;

    let h2hTables = "";
    if (R.matchesFaced) {
      const modeRows = Object.values(R.byMode).sort((x, y) => y.n - x.n).map((m) =>
        `<tr><td class="left">${DB.modeName(m.mode_id)}</td><td>${recCell(m.pWins, m.qWins)}</td><td>${m.n}</td></tr>`).join("");
      const mapRows = Object.values(R.byMap).sort((x, y) => y.n - x.n).map((m) =>
        `<tr><td class="left">${DB.mapName(m.map_id)}</td><td class="left"><span class="pill-mode">${DB.modeName(m.mode_id)}</span></td><td>${recCell(m.pWins, m.qWins)}</td></tr>`).join("");
      h2hTables = `<h3 class="sub">Map record by mode</h3><div class="table-wrap"><table><thead><tr><th class="left">Mode</th><th>${DB.playerTag(p)}–${DB.playerTag(q)}</th><th>Maps</th></tr></thead><tbody>${modeRows}</tbody></table></div>
        <h3 class="sub">Map record by map</h3><div class="table-wrap"><table><thead><tr><th class="left">Map</th><th class="left">Mode</th><th>${DB.playerTag(p)}–${DB.playerTag(q)}</th></tr></thead><tbody>${mapRows}</tbody></table></div>`;
    } else {
      h2hTables = `<div class="empty">These two haven't faced each other on opposing teams this season (they may be teammates, or their rosters never overlapped in a match).</div>`;
    }

    // Side-by-side season stats.
    let cmp = "";
    if (sp && sq) {
      const metrics = [
        ["BP Rating", "bp_rating", 2], ["K/D", "kd", 2], ["Kills", "kills", 0], ["Deaths", "deaths", 0, true],
        ["Slayer", "slayer_rating", 1], ["Dmg/min", "dmg_per_min", 0], ["HP K/D", "hp_kd", 2], ["SnD K/D", "snd_kd", 2], ["OVL K/D", "ovl_kd", 2],
      ];
      const rows = metrics.map(([label, k, d, lowerBetter]) => {
        const va = sp[k], vb = sq[k];
        const aBest = lowerBetter ? va < vb : va > vb, bBest = lowerBetter ? vb < va : vb > va;
        return `<tr><td class="cmp-a ${aBest ? "best" : ""}">${fx(va, d)}</td><td class="cmp-metric">${label}</td><td class="cmp-b ${bBest ? "best" : ""}">${fx(vb, d)}</td></tr>`;
      }).join("");
      cmp = `<h3 class="sub">Season stats (${DB.playerTag(p)} vs ${DB.playerTag(q)})</h3>
        <div class="table-wrap"><table><thead><tr><th style="text-align:right">${DB.playerTag(p)}</th><th class="cmp-metric">Metric</th><th class="left">${DB.playerTag(q)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const note = `<p class="muted" style="margin-top:.8rem">Head-to-head is a per-map win/loss record (did ${DB.playerTag(p)}'s team win the map with ${DB.playerTag(q)} across from them). Breaking Point doesn't publish per-map individual scoreboards, so this isn't an individual-kill duel.</p>`;
    return head + h2hTables + cmp + note;
  }

  Views.history = function () {
    view.innerHTML = `
      <h2 class="section">Roster history</h2>
      <div class="toolbar">
        <div class="seg" id="hMode"><button class="seg-btn active" data-m="team">Team rosters</button><button class="seg-btn" data-m="player">Player's teams</button></div>
        <div id="hPick"></div>
      </div>
      <div id="hBody"></div>`;
    const S = UIState.history;
    let mode = S.mode;
    let sel = null;

    function pick() {
      const list = mode === "team" ? teamSelectOptions() : playerSelectOptions();
      const valid = new Set(list.map((o) => o.value));
      const val = S[mode] != null && valid.has(S[mode]) ? S[mode] : (list[0] && list[0].value);
      S[mode] = val;
      $("#hPick").innerHTML = `<div id="hSel"></div>`;
      sel = new SearchSelect($("#hSel"), list, {
        value: val,
        placeholder: mode === "team" ? "Search teams…" : "Search players…",
        onChange: (v) => { S[mode] = v; render(); },
      });
      render();
    }
    function render() {
      const id = sel.getValue();
      $("#hBody").innerHTML = mode === "team" ? teamHistory(id) : playerHistory(id);
      $("#hBody").querySelectorAll("[data-pid]").forEach((e) => e.addEventListener("click", () => playerDetail(+e.dataset.pid)));
    }
    $("#hMode").querySelectorAll(".seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.m === mode);
      btn.addEventListener("click", () => {
        mode = btn.dataset.m; S.mode = mode;
        $("#hMode").querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x === btn));
        pick();
      });
    });
    pick();
  };

  function teamHistory(teamId) {
    const hist = Analysis.teamRosterHistory(teamId);
    if (!hist.length) return `<div class="empty">No roster history for ${DB.teamName(teamId)}.</div>`;
    let prev = null;
    const items = hist.map((e) => {
      const ids = [...e.players];
      const chips = ids.map((pid) => {
        const added = prev && !prev.has(pid);
        const img = DB.playerHeadshot(pid) ? `<img src="${DB.playerHeadshot(pid)}">` : "";
        return `<span class="tl-p ${added ? "added" : ""}" data-pid="${pid}">${img}${DB.playerTag(pid)}${added ? " ●" : ""}</span>`;
      }).join("");
      let change = "";
      if (prev) {
        const added = ids.filter((x) => !prev.has(x)).map(DB.playerTag);
        const removed = [...prev].filter((x) => !e.players.has(x)).map(DB.playerTag);
        if (added.length || removed.length) change = `<div class="tl-change">${added.length ? `<span class="add">+ ${added.join(", ")}</span> ` : ""}${removed.length ? `<span class="rem">− ${removed.join(", ")}</span>` : ""}</div>`;
        else change = `<div class="tl-change muted">no change</div>`;
      }
      prev = e.players;
      return `<div class="tl-item"><div class="tl-dot"></div><div class="tl-date">${DB.date(e.date)}</div>
        <div class="tl-title">${DB.eventName(e.event_id)}</div><div class="tl-players">${chips}</div>${change}</div>`;
    }).join("");
    return `<div class="card"><div class="timeline">${items}</div></div>`;
  }

  function playerHistory(pid) {
    const hist = Analysis.playerTeamHistory(pid);
    if (!hist.length) return `<div class="empty">No match history for ${DB.playerTag(pid)} this season.</div>`;
    let prevTeam = null;
    const items = hist.map((e) => {
      const teams = [...e.teams];
      const changed = prevTeam != null && !(teams.length === 1 && teams[0] === prevTeam);
      const tHtml = teams.map((t) => teamLogoChip(t)).join(" ");
      const note = changed ? `<div class="tl-change"><span class="add">team change</span></div>` : "";
      prevTeam = teams[teams.length - 1];
      return `<div class="tl-item"><div class="tl-dot" ${changed ? 'style="background:var(--red)"' : ""}></div><div class="tl-date">${DB.date(e.date)}</div>
        <div class="tl-title">${DB.eventName(e.event_id)}</div><div class="tl-players">${tHtml} <span class="muted">· ${e.games} maps</span></div>${note}</div>`;
    }).join("");
    return `<div class="detail-head"><div><div class="name">${DB.playerTag(pid)}</div><div class="meta">Team history across ${hist.length} events</div></div></div><div class="card"><div class="timeline">${items}</div></div>`;
  }

  // ================= DETAIL MODALS ========================================
  function playerDetail(pid) {
    const p = DB.player(pid) || {};
    const s = (DB.raw.playerStats || []).find((x) => x.player_id === pid);
    const teamId = DB.playerTeam[pid];
    const hs = DB.playerHeadshot(pid);
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.nickname || "";
    let statHtml = `<p class="muted">No season stats for this player.</p>`;
    let modeChart = "", trend = "";
    if (s) {
      const tiles = [
        ["BP Rating", fx(s.bp_rating, 2)], ["K/D", fx(s.kd, 2)], ["Kills", DB.num(s.kills)], ["Deaths", DB.num(s.deaths)],
        ["Slayer", fx(s.slayer_rating, 1)], ["Dmg/min", fx(s.dmg_per_min, 0)], ["Maps", DB.num(s.game_count)], ["First Blood %", DB.pct(s.first_blood_percentage)],
      ];
      statHtml = `<div class="statgrid">${tiles.map((t) => `<div class="s"><div class="v">${t[1]}</div><div class="k">${t[0]}</div></div>`).join("")}</div>`;
      const modes = [
        { label: "Hardpoint", value: +(s.hp_kd || 0).toFixed(2), display: fx(s.hp_kd, 2), color: "var(--accent)" },
        { label: "Search & D.", value: +(s.snd_kd || 0).toFixed(2), display: fx(s.snd_kd, 2), color: "var(--accent-2)" },
        { label: "Overload", value: +(s.ovl_kd || 0).toFixed(2), display: fx(s.ovl_kd, 2), color: "var(--purple)" },
      ].filter((m) => m.value > 0);
      if (modes.length) modeChart = `<h3 class="sub">K/D by mode</h3>${Charts.hbar(modes, { labelW: 110, rowH: 24 })}`;

      const pts = [];
      DB.eventsSorted().forEach((e) => {
        const arr = (DB.raw.playerStatsByEvent || {})[e.id] || (DB.raw.playerStatsByEvent || {})[String(e.id)];
        if (!arr) return;
        const rec = arr.find((x) => x.player_id === pid);
        if (rec && rec.bp_rating != null && rec.game_count > 0) pts.push({ x: DB.eventName(e.id, true), y: +rec.bp_rating.toFixed(3) });
      });
      if (pts.length > 1) trend = `<h3 class="sub">BP rating by event</h3>${Charts.line(pts)}`;
    }
    openModal(`
      <div class="detail-head">
        ${hs ? `<img class="big" src="${hs}" onerror="this.style.display='none'"/>` : ""}
        <div><div class="name">${DB.playerTag(pid)}</div>
          <div class="meta">${name}${p.hometown ? " · " + p.hometown : ""}</div>
          <div style="margin-top:.35rem">${teamChip(teamId)}</div></div>
      </div>${statHtml}${modeChart}${trend}`);
  }

  function teamDetail(teamId) {
    const t = DB.team(teamId) || {};
    const ts = (DB.raw.teamStats || []).find((x) => x.team_id === teamId);
    const rec = teamRecord(teamId);
    const rosterIds = [...(DB.teamRoster[teamId] || [])];
    const rosterRows = rosterIds.map((pid) => {
      const st = (DB.raw.playerStats || []).find((x) => x.player_id === pid);
      return { pid, rating: st ? st.bp_rating : null, kd: st ? st.kd : null };
    }).sort((a, b) => (b.rating || 0) - (a.rating || 0));

    let tiles = "";
    if (ts) {
      const t4 = [["K/D", fx(ts.kd, 2)], ["Kills", DB.num(ts.kills)], ["HP K/D", fx(ts.hp_kd, 2)], ["SnD K/D", fx(ts.snd_kd, 2)],
        ["OVL K/D", fx(ts.ovl_kd, 2)], ["HP Win%", DB.pct(ts.hp_map_win_percentage)], ["SnD Win%", DB.pct(ts.snd_map_win_percentage)], ["OVL Win%", DB.pct(ts.ovl_map_win_percentage)]];
      tiles = `<div class="statgrid">${t4.map((x) => `<div class="s"><div class="v">${x[1]}</div><div class="k">${x[0]}</div></div>`).join("")}</div>`;
    }
    const rosterHtml = rosterRows.length ? `<h3 class="sub">Roster (${rosterRows.length})</h3>
      <div class="table-wrap"><table><thead><tr><th class="left">Player</th><th>BP Rating</th><th>K/D</th></tr></thead>
      <tbody>${rosterRows.map((r) => `<tr class="clickable" data-pid="${r.pid}"><td class="left">${playerChip(r.pid)}</td><td>${fx(r.rating, 2)}</td><td>${fx(r.kd, 2)}</td></tr>`).join("")}</tbody></table></div>` : "";
    openModal(`
      <div class="detail-head">
        ${DB.teamLogo(teamId) ? `<img class="big" src="${DB.teamLogo(teamId)}" style="object-fit:contain;background:transparent" onerror="this.style.display='none'"/>` : ""}
        <div><div class="name" style="color:${DB.teamColor(teamId)}">${t.name || DB.teamName(teamId)}</div>
          <div class="meta">Match record: <b>${rec.w}–${rec.l}</b></div></div>
      </div>${tiles}${rosterHtml}`);
    modalBody.querySelectorAll("tr[data-pid]").forEach((tr) =>
      tr.addEventListener("click", () => playerDetail(+tr.dataset.pid)));
  }

  function matchDetail(matchId) {
    const md = (DB.raw.matches || []).find((m) => m.id === matchId) || {};
    const detail = (DB.raw.matchDetails || []).find((d) => d.id === matchId);
    let games = (DB.raw.games || []).filter((g) => g.match_id === matchId).sort((a, b) => (a.game_num || 0) - (b.game_num || 0));
    const t1 = md.team_1_id, t2 = md.team_2_id;
    const gamesHtml = games.length ? `<div class="table-wrap"><table><thead><tr>
        <th class="left">#</th><th class="left">Mode</th><th class="left">Map</th><th>${DB.teamName(t1, true)}</th><th>${DB.teamName(t2, true)}</th><th class="left">Winner</th><th>Length</th></tr></thead>
      <tbody>${games.map((g) => `<tr>
        <td class="left">${g.game_num}</td><td class="left"><span class="pill-mode">${DB.modeName(g.mode_id)}</span></td>
        <td class="left">${DB.mapName(g.map_id)}</td>
        <td class="${g.winner_id === t1 ? "pos tag-strong" : ""}">${g.team_1_score}</td>
        <td class="${g.winner_id === t2 ? "pos tag-strong" : ""}">${g.team_2_score}</td>
        <td class="left">${teamChip(g.winner_id, true)}</td>
        <td>${g.gametime_min || 0}m ${g.gametime_sec ? Math.round(g.gametime_sec % 60) : 0}s</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No per-map data for this match.</p>`;
    openModal(`
      <div class="detail-head" style="justify-content:space-between">
        <div class="match-side">${teamLogoChip(t1)}</div>
        <div class="match-score" style="font-size:1.8rem">${md.team_1_score ?? "-"} : ${md.team_2_score ?? "-"}</div>
        <div class="match-side">${teamLogoChip(t2)}</div>
      </div>
      <div class="meta muted" style="text-align:center;margin-bottom:1rem">${DB.eventName(md.event_id)} · ${DB.dateTime(md.datetime)} · Bo${md.best_of || "?"}</div>
      ${gamesHtml}`);
  }

  function eventDetail(eventId) {
    const e = DB.event(eventId) || {};
    const pbe = (DB.raw.playerStatsByEvent || {})[eventId] || (DB.raw.playerStatsByEvent || {})[String(eventId)] || [];
    const tbe = (DB.raw.teamStatsByEvent || {})[eventId] || (DB.raw.teamStatsByEvent || {})[String(eventId)] || [];
    const topP = pbe.slice().filter((p) => p.game_count > 0).sort((a, b) => b.bp_rating - a.bp_rating).slice(0, 15);
    const topT = tbe.slice().sort((a, b) => b.kd - a.kd);
    const info = [e.tier, e.location, e.number_of_teams ? e.number_of_teams + " teams" : null, e.prizepool ? "$" + DB.num(e.prizepool) : null].filter(Boolean).join(" · ");
    const pTable = topP.length ? `<h3 class="sub">Top players</h3><div class="table-wrap"><table><thead><tr><th class="left">#</th><th class="left">Player</th><th>BP Rtg</th><th>K/D</th><th>Kills</th></tr></thead>
      <tbody>${topP.map((p, i) => `<tr class="clickable" data-pid="${p.player_id}"><td class="left rank">${i + 1}</td><td class="left">${playerChip(p.player_id)}</td><td><b>${fx(p.bp_rating, 2)}</b></td><td>${fx(p.kd, 2)}</td><td>${DB.num(p.kills)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const tTable = topT.length ? `<h3 class="sub">Team K/D</h3><div class="table-wrap"><table><thead><tr><th class="left">Team</th><th>K/D</th><th>Kills</th></tr></thead>
      <tbody>${topT.map((t) => `<tr class="clickable" data-tid="${t.team_id}"><td class="left">${teamLogoChip(t.team_id)}</td><td>${fx(t.kd, 2)}</td><td>${DB.num(t.kills)}</td></tr>`).join("")}</tbody></table></div>` : "";
    openModal(`
      <div class="detail-head"><div><div class="name">${(e.name || "").trim()}</div>
        <div class="meta">${DB.date(e.start_date)} – ${DB.date(e.end_date)}${info ? " · " + info : ""}</div></div></div>
      ${(!topP.length && !topT.length) ? '<p class="muted">No per-event stats captured for this event.</p>' : ""}
      ${pTable}${tTable}`);
    modalBody.querySelectorAll("tr[data-pid]").forEach((tr) => tr.addEventListener("click", () => playerDetail(+tr.dataset.pid)));
    modalBody.querySelectorAll("tr[data-tid]").forEach((tr) => tr.addEventListener("click", () => teamDetail(+tr.dataset.tid)));
  }

  // ================= ROUTER ===============================================
  function route() {
    const tab = (location.hash.replace(/^#\//, "") || "overview").split("/")[0];
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    closeModal();
    (Views[tab] || Views.overview)();
    window.scrollTo(0, 0);
  }

  async function init() {
    try {
      await loadAll();
    } catch (e) {
      view.innerHTML = `<div class="error-box">
        <h2 class="section">Couldn't load the data</h2>
        <p>The app expects the scraped JSON in the <code>data/</code> folder, served over http.</p>
        <ol>
          <li>Run the scraper, then copy its output: <code>copy-data.bat</code></li>
          <li>Serve this folder over http (not file://): <code>serve.bat</code> or <code>python -m http.server 8080</code></li>
          <li>Open <code>http://127.0.0.1:8080</code></li>
        </ol>
        ${e.files ? `<p class="muted">Missing required files: ${e.files.join(", ")}</p>` : `<p class="muted">${e.message}</p>`}
      </div>`;
      return;
    }
    const e = DB.raw.events || [];
    const dates = e.map((x) => x.start_date).filter(Boolean).sort();
    document.getElementById("seasonSummary").textContent =
      `${(DB.raw.teams || []).length} teams · ${(DB.raw.playerStats || []).length} ranked players · ${(DB.raw.matches || []).filter((m) => m.status === "complete").length} matches`;
    // match_details is large; expose under a stable key for matchDetail lookups.
    DB.raw.matchDetails = DB.raw.matchDetails || null;
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
