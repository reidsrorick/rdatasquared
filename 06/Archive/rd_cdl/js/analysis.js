/* Head-to-head + roster-history engine.
   Builds a per-match index that joins rosters (who played) with games (per-map
   winner + scores), then derives team/player matchup records and roster timelines.

   Note on player-vs-player: BP does not publish per-map individual scoreboards,
   so a P-v-P record is a MAP win/loss record — did your team win that map while
   the opponent was on the roster across from you — not an individual-kill duel.
   Rosters are per match, so it assumes listed players played every map (subs are
   rare mid-series in CDL). */
(function () {
  const A = { index: [], ready: false };

  function build() {
    if (A.ready) return A;
    const gbm = {};
    (DB.raw.games || []).forEach((g) => { (gbm[g.match_id] = gbm[g.match_id] || []).push(g); });
    const rbm = {};
    (DB.raw.rosters || []).forEach((r) => { rbm[r.match_id] = r; });

    (DB.raw.matches || []).forEach((m) => {
      if (m.status !== "complete") return;
      const r = rbm[m.id];
      const pl = r && r.players ? r.players : {};
      A.index.push({
        id: m.id, event_id: m.event_id, datetime: m.datetime,
        t1: m.team_1_id, t2: m.team_2_id, winner: m.winner_id,
        s1: m.team_1_score, s2: m.team_2_score, best_of: m.best_of,
        rteam1: r ? r.team_1_id : m.team_1_id,
        rteam2: r ? r.team_2_id : m.team_2_id,
        r1: r ? new Set((pl.team1Players || []).map((p) => p.id)) : null,
        r2: r ? new Set((pl.team2Players || []).map((p) => p.id)) : null,
        games: (gbm[m.id] || []).slice().sort((a, b) => (a.game_num || 0) - (b.game_num || 0)),
      });
    });
    A.index.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    A.ready = true;
    return A;
  }

  // ---- Team vs Team -------------------------------------------------------
  function teamH2H(a, b) {
    build();
    const res = { a, b, matches: [], aWins: 0, bWins: 0, mapA: 0, mapB: 0, byMode: {}, byMap: {} };
    A.index.forEach((mi) => {
      const s = new Set([mi.t1, mi.t2]);
      if (!(s.has(a) && s.has(b))) return;
      res.matches.push(mi);
      if (mi.winner === a) res.aWins++; else if (mi.winner === b) res.bWins++;
      mi.games.forEach((g) => {
        const aScore = g.team_1_id === a ? g.team_1_score : g.team_2_score;
        const bScore = g.team_1_id === b ? g.team_1_score : g.team_2_score;
        const aWon = g.winner_id === a, bWon = g.winner_id === b;
        if (aWon) res.mapA++; else if (bWon) res.mapB++;
        for (const bucket of [
          res.byMode[g.mode_id] || (res.byMode[g.mode_id] = { mode_id: g.mode_id, aWins: 0, bWins: 0, aScore: 0, bScore: 0, n: 0 }),
          res.byMap[g.map_id + "_" + g.mode_id] || (res.byMap[g.map_id + "_" + g.mode_id] = { map_id: g.map_id, mode_id: g.mode_id, aWins: 0, bWins: 0, aScore: 0, bScore: 0, n: 0 }),
        ]) {
          bucket.n++; bucket.aScore += aScore || 0; bucket.bScore += bScore || 0;
          if (aWon) bucket.aWins++; else if (bWon) bucket.bWins++;
        }
      });
    });
    res.matches.sort((x, y) => new Date(y.datetime) - new Date(x.datetime));
    return res;
  }

  // ---- Player vs Player ---------------------------------------------------
  function playerH2H(p, q) {
    build();
    const res = { p, q, matchesFaced: 0, pWins: 0, qWins: 0, byMode: {}, byMap: {}, meetings: [] };
    A.index.forEach((mi) => {
      if (!mi.r1 || !mi.r2) return;
      let pTeam = null, qTeam = null;
      if (mi.r1.has(p) && mi.r2.has(q)) { pTeam = mi.rteam1; qTeam = mi.rteam2; }
      else if (mi.r2.has(p) && mi.r1.has(q)) { pTeam = mi.rteam2; qTeam = mi.rteam1; }
      else return;
      res.matchesFaced++;
      res.meetings.push({ mi, pTeam, qTeam });
      mi.games.forEach((g) => {
        const pWon = g.winner_id === pTeam, qWon = g.winner_id === qTeam;
        for (const bucket of [
          res.byMode[g.mode_id] || (res.byMode[g.mode_id] = { mode_id: g.mode_id, pWins: 0, qWins: 0, n: 0 }),
          res.byMap[g.map_id + "_" + g.mode_id] || (res.byMap[g.map_id + "_" + g.mode_id] = { map_id: g.map_id, mode_id: g.mode_id, pWins: 0, qWins: 0, n: 0 }),
        ]) {
          bucket.n++; if (pWon) bucket.pWins++; else if (qWon) bucket.qWins++;
        }
        if (pWon) res.pWins++; else if (qWon) res.qWins++;
      });
    });
    res.meetings.sort((x, y) => new Date(y.mi.datetime) - new Date(x.mi.datetime));
    return res;
  }

  // ---- Roster history -----------------------------------------------------
  // Per event, the set of players who appeared for a team (chronological).
  function teamRosterHistory(teamId) {
    build();
    const byEvent = {};
    A.index.forEach((mi) => {
      let players = null;
      if (mi.rteam1 === teamId) players = mi.r1;
      else if (mi.rteam2 === teamId) players = mi.r2;
      if (!players) return;
      const e = byEvent[mi.event_id] || (byEvent[mi.event_id] = { event_id: mi.event_id, date: mi.datetime, players: new Set() });
      players.forEach((pid) => e.players.add(pid));
      if (new Date(mi.datetime) < new Date(e.date)) e.date = mi.datetime;
    });
    return Object.values(byEvent).sort((x, y) => new Date(x.date) - new Date(y.date));
  }

  // Per event, which team(s) a player appeared for (chronological).
  function playerTeamHistory(pid) {
    build();
    const byEvent = {};
    A.index.forEach((mi) => {
      if (!mi.r1 || !mi.r2) return;
      let team = null;
      if (mi.r1.has(pid)) team = mi.rteam1;
      else if (mi.r2.has(pid)) team = mi.rteam2;
      if (!team) return;
      const e = byEvent[mi.event_id] || (byEvent[mi.event_id] = { event_id: mi.event_id, date: mi.datetime, teams: new Set(), games: 0 });
      e.teams.add(team); e.games++;
      if (new Date(mi.datetime) < new Date(e.date)) e.date = mi.datetime;
    });
    return Object.values(byEvent).sort((x, y) => new Date(x.date) - new Date(y.date));
  }

  window.Analysis = { build, teamH2H, playerH2H, teamRosterHistory, playerTeamHistory, _index: () => A.index };
})();
