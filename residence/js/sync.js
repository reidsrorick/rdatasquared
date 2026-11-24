/*
 * sync.js — keeping two copies of the workbook (main + secondary) honest.
 *
 * Every save stamps the workbook with a content hash of its data and a short
 * history of the hashes it has had (like a tiny git log, stored on the
 * Settings sheet). Comparing two copies is then simple:
 *
 *   same hash                      -> nothing to do
 *   other copy's hash is in my log -> I'm ahead: copy me over it
 *   my hash is in its log          -> it's ahead: take it
 *   neither                        -> both were edited separately: MERGE
 *
 * A merge is done row by row. When a snapshot of the last common state is
 * available it is a true three-way merge (changes made on only one side are
 * taken automatically, including deletions) and only rows changed on BOTH
 * sides need a decision. Without a snapshot every difference needs a decision.
 *
 * Pure logic, no DOM: works in the browser and in Node tests.
 */
(function (root) {
  'use strict';
  const RT = (root.RT = root.RT || {});
  const MAX_HISTORY = 60;

  /* --------------------------------------------------------------- hashing */

  const round = (v, p) => Math.round((Number(v) || 0) * p) / p;

  function normCell(col, v) {
    switch (col.t) {
      case 'money': return round(v, 100);
      case 'num': return round(v, 1e6);
      case 'bool': case 'amounttype': return v ? 1 : 0;
      default: return v === undefined || v === null ? '' : String(v).trim();
    }
  }

  function dataCols(def) { return def.cols.filter((c) => c.k && !c.info && !c.legacy); }

  function rowSig(def, row) {
    return JSON.stringify(dataCols(def).map((c) => normCell(c, row[c.k])));
  }

  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }

  /** Order-independent fingerprint of everything that matters in the workbook. */
  function hashDb(db) {
    const parts = RT.store.SHEETS.map((def) => def.key + ':' + (db[def.key] || []).map((r) => rowSig(def, r)).sort().join('|'));
    parts.push('currency:' + String((db.settings && db.settings.currency) || 'USD').toUpperCase());
    return cyrb53(parts.join('\n'));
  }

  /* --------------------------------------------------------------- history */

  function historyOf(db) {
    const raw = (db.settings && db.settings.synchistory) || '';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /** Stamp a db just before it is written. `extraHistory` is merged in (used after a merge). */
  function stamp(db, { device = '', extraHistory = [], now = new Date() } = {}) {
    const hash = hashDb(db);
    let hist = [...historyOf(db), ...extraHistory];
    hist = hist.filter((h, i) => hist.indexOf(h) === i); // de-dupe, keep first order
    hist = hist.filter((h) => h !== hash);
    hist.push(hash);
    if (hist.length > MAX_HISTORY) hist = hist.slice(hist.length - MAX_HISTORY);
    db.settings.synchash = hash;
    db.settings.synchistory = hist.join(',');
    db.settings.savedat = now.toISOString();
    db.settings.savedby = device || '';
    return hash;
  }

  /** Relationship between two copies: 'same' | 'a-ahead' | 'b-ahead' | 'diverged'. */
  function compare(a, b) {
    const ha = hashDb(a), hb = hashDb(b);
    if (ha === hb) return 'same';
    if (historyOf(a).includes(hb)) return 'a-ahead';
    if (historyOf(b).includes(ha)) return 'b-ahead';
    return 'diverged';
  }

  /** Newest hash present in both histories (a common ancestor), or ''. */
  function commonAncestor(a, b) {
    const hb = new Set([...historyOf(b), hashDb(b)]);
    const ha = [...historyOf(a), hashDb(a)];
    for (let i = ha.length - 1; i >= 0; i--) if (hb.has(ha[i])) return ha[i];
    return '';
  }

  /* ----------------------------------------------------------------- merge */

  const COMPOSITE = { residents: ['residenceId', 'personId'], splits: ['expenseId', 'personId'] };
  const rowKey = (def, row) => (COMPOSITE[def.key] ? COMPOSITE[def.key].map((k) => row[k]).join('|') : row.id);

  function label(key, row, dbs) {
    const find = (coll, id) => { for (const d of dbs) { const hit = (d[coll] || []).find((x) => x.id === id); if (hit) return hit; } return null; };
    const nm = (coll, id) => (find(coll, id) || {}).name || '(removed)';
    switch (key) {
      case 'people': return `Person: ${row.name}`;
      case 'residences': return `Residence: ${row.name}`;
      case 'expenseTypes': return `Expense list: ${row.name}`;
      case 'expenses': return `Expense: ${row.name}`;
      case 'residents': return `Resident: ${nm('people', row.personId)} at ${nm('residences', row.residenceId)}`;
      case 'splits': return `Split: ${nm('people', row.personId)} on ${nm('expenses', row.expenseId)}`;
      case 'payments': return `Payment: ${nm('expenses', row.expenseId)} · ${row.period}`;
      case 'settlements': return `Settlement: ${nm('people', row.fromId)} → ${nm('people', row.toId)} · ${row.amount}`;
      default: return key;
    }
  }

  function fieldDiffs(def, x, y) {
    if (!x || !y) return [];
    return dataCols(def)
      .filter((c) => JSON.stringify(normCell(c, x[c.k])) !== JSON.stringify(normCell(c, y[c.k])))
      .map((c) => ({ field: c.h, a: x[c.k], b: y[c.k] }));
  }

  /**
   * Merge copies A (main) and B (secondary). `base` is the last common state or null.
   * `choices` maps conflict id -> 'a' | 'b'. Returns { db, conflicts, auto }.
  
   */
  function mergeDbs(base, a, b, choices = {}) {
    const out = RT.store.emptyDb();
    const conflicts = [];
    let auto = 0;
    RT.store.SHEETS.forEach((def) => {
      const key = def.key;
      const index = (db) => { const m = new Map(); (db ? db[key] : []).forEach((r) => m.set(rowKey(def, r), r)); return m; };
      const ma = index(a), mb = index(b), mo = base ? index(base) : null;
      const sig = (r) => (r ? rowSig(def, r) : null);
      const ids = [...ma.keys(), ...[...mb.keys()].filter((k) => !ma.has(k))];
      if (mo) mo.forEach((_, k) => { if (!ids.includes(k)) ids.push(k); });
      ids.forEach((id) => {
        const ra = ma.get(id), rb = mb.get(id), ro = mo ? mo.get(id) : undefined;
        let pick;
        if (sig(ra) === sig(rb)) pick = ra || rb;
        else if (mo && sig(ro) === sig(ra)) { pick = rb; auto++; }
        else if (mo && sig(ro) === sig(rb)) { pick = ra; auto++; }
        else {
          const cid = key + '#' + id;
          const kind = !ra ? (mo ? 'deleted-main' : 'only-secondary') : !rb ? (mo ? 'deleted-secondary' : 'only-main') : 'changed';
          const dflt = !ra ? 'b' : 'a'; // when in doubt keep the row rather than lose it
          const choice = choices[cid] || dflt;
          conflicts.push({ id: cid, key, kind, label: label(key, ra || rb, [a, b]), a: ra || null, b: rb || null, fields: fieldDiffs(def, ra, rb), dflt });
          pick = choice === 'b' ? rb : ra;
        }
        if (pick) out[key].push(JSON.parse(JSON.stringify(pick)));
      });
    });
    out.settings = Object.assign({}, a.settings);
    delete out.settings.synchash; delete out.settings.synchistory;
    return { db: out, conflicts, auto };
  }

  RT.sync = { hashDb, historyOf, stamp, compare, commonAncestor, mergeDbs, MAX_HISTORY };
})(typeof window !== 'undefined' ? window : globalThis);
