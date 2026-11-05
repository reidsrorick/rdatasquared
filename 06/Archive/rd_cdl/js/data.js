/* Loads the scraped JSON from data/ and builds lookup maps + helpers.
   Everything hangs off the global DB object. */
(function () {
  const FILES = {
    players: "players.json",
    teams: "teams.json",
    events: "events.json",
    maps: "maps.json",
    modes: "modes.json",
    matches: "matches.json",
    games: "games.json",
    rosters: "rosters.json",
    playerStats: "player_stats_season.json",
    teamStats: "team_stats_season.json",
    playerStatsByEvent: "player_stats_by_event.json",
    teamStatsByEvent: "team_stats_by_event.json",
  };
  // Files the app can't run without.
  const REQUIRED = ["players", "teams", "matches", "playerStats", "teamStats"];

  const DB = {
    raw: {},
    byId: {},        // players/teams/events/maps/modes -> {id: obj}
    playerTeam: {},  // player_id -> team_id
    teamRoster: {},  // team_id -> Set(player_id)
    loaded: false,
  };

  async function loadAll() {
    const missing = [];
    await Promise.all(Object.entries(FILES).map(async ([key, file]) => {
      try {
        const res = await fetch("data/" + file, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        DB.raw[key] = await res.json();
      } catch (e) {
        DB.raw[key] = null;
        missing.push(file);
      }
    }));

    const hardMissing = REQUIRED.filter((k) => !DB.raw[k]);
    if (hardMissing.length) {
      const err = new Error("missing-data");
      err.files = hardMissing.map((k) => FILES[k]);
      throw err;
    }

    index("players"); index("teams"); index("events"); index("maps"); index("modes");

    // player -> team (current team)
    (DB.raw.players || []).forEach((p) => {
      if (p.current_team_id) DB.playerTeam[p.id] = p.current_team_id;
    });

    // team -> roster (from per-match lineups; falls back to current_team_id)
    (DB.raw.rosters || []).forEach((r) => {
      const add = (teamId, arr) => {
        if (!teamId || !arr) return;
        DB.teamRoster[teamId] = DB.teamRoster[teamId] || new Set();
        arr.forEach((pl) => DB.teamRoster[teamId].add(pl.id));
      };
      const pl = r.players || {};
      add(r.team_1_id, pl.team1Players);
      add(r.team_2_id, pl.team2Players);
    });
    (DB.raw.players || []).forEach((p) => {
      if (p.current_team_id) {
        DB.teamRoster[p.current_team_id] = DB.teamRoster[p.current_team_id] || new Set();
        DB.teamRoster[p.current_team_id].add(p.id);
      }
    });

    DB.missing = missing;
    DB.loaded = true;
    return DB;
  }

  function index(key) {
    const m = {};
    (DB.raw[key] || []).forEach((o) => { m[o.id] = o; });
    DB.byId[key] = m;
  }

  // ---- lookups / formatting ------------------------------------------------
  DB.team = (id) => DB.byId.teams[id] || null;
  DB.player = (id) => DB.byId.players[id] || null;
  DB.event = (id) => DB.byId.events[id] || null;
  DB.map = (id) => DB.byId.maps[id] || null;
  DB.mode = (id) => DB.byId.modes[id] || null;

  DB.teamName = (id, short) => {
    const t = DB.team(id);
    if (!t) return "—";
    return short ? (t.name_short || t.name_medium || t.name) : (t.name_medium || t.name);
  };
  DB.teamColor = (id) => (DB.team(id) && DB.team(id).color_hex) || "#6b7684";
  DB.teamLogo = (id) => {
    const t = DB.team(id);
    return t && (t.logo_darkmode || t.logo_square || t.logo_main || t.logo_small) || "";
  };
  DB.playerTag = (id) => (DB.player(id) && DB.player(id).tag) || ("#" + id);
  DB.playerHeadshot = (id) => (DB.player(id) && DB.player(id).headshot) || "";
  DB.mapName = (id) => (DB.map(id) && DB.map(id).name) || ("map " + id);
  DB.modeName = (id) => (DB.mode(id) && (DB.mode(id).short_name || DB.mode(id).name)) || ("mode " + id);
  DB.eventName = (id, short) => {
    const e = DB.event(id);
    if (!e) return "event " + id;
    return (short && e.name_short) ? e.name_short : (e.name || "").trim();
  };

  DB.num = (v, d = 0) => (v == null || isNaN(v)) ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  DB.pct = (v) => {
    if (v == null || isNaN(v)) return "—";
    const x = v <= 1.5 ? v * 100 : v; // some fields are 0-1 fractions
    return x.toFixed(1) + "%";
  };
  DB.date = (s) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  DB.dateTime = (s) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  // Events sorted chronologically (for trend lines / dropdowns).
  DB.eventsSorted = () => (DB.raw.events || []).slice().sort(
    (a, b) => new Date(a.start_date) - new Date(b.start_date));

  window.DB = DB;
  window.loadAll = loadAll;
})();
