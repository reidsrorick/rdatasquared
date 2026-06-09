/* ═══════════════════════════════════════════════════════════
   shared.js — FilmNerdle shared logic
   Loaded by index.html, admin.html, archive.html
═══════════════════════════════════════════════════════════ */

/* ── Seeded PRNG ── */
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function strToSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return h >>> 0;
}
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function seededPick(arr, n, rng) {
  return seededShuffle(arr, rng).slice(0, n);
}

/* ── CSV parser ── */
function parseCSV(raw) {
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const rows = [];
  let i = 0, len = raw.length;
  while (i < len) {
    const row = [];
    while (i < len && raw[i] !== '\n' && raw[i] !== '\r') {
      if (raw[i] === '"') {
        i++; let f = '';
        while (i < len) {
          if (raw[i] === '"' && raw[i + 1] === '"') { f += '"'; i += 2; }
          else if (raw[i] === '"') { i++; break; }
          else f += raw[i++];
        }
        row.push(f);
        if (i < len && raw[i] === ',') i++;
      } else {
        let f = '';
        while (i < len && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '\r') f += raw[i++];
        row.push(f.trim());
        if (i < len && raw[i] === ',') i++;
      }
    }
    if (i < len && raw[i] === '\r') i++;
    if (i < len && raw[i] === '\n') i++;
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
  }
  return rows;
}

/* ── Library builder ── */
function buildLibrary(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  const hdr = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const films = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 5) continue;
    const o = {};
    hdr.forEach((h, j) => { o[h] = r[j] || ''; });
    o.year = parseInt(o.year) || 0;
    o.average_rating = parseFloat(o.average_rating) || 0;
    o.runtime = parseInt(o.runtime) || 0;
    o.decade = Math.floor(o.year / 10) * 10;
    o.decade_label = o.decade + 's';
    o.runtime_bracket = o.runtime < 90 ? 'Under 90 min' : o.runtime <= 120 ? '90–120 min' : 'Over 120 min';
    o.genres_arr = (o.genres || '').split(',').map(g => g.trim()).filter(Boolean);
    o.cast_names = [];
    for (let c = 1; c <= 5; c++) {
      const v = o[`cast_${c}`] || '';
      const name = v.includes('(') ? v.slice(0, v.indexOf('(')).trim() : v.trim();
      if (name) o.cast_names.push(name);
    }
    if (o.title && o.year) films.push(o);
  }
  return films;
}

/* ── Fetch CSV ── */
async function fetchCSV() {
  try {
    const r = await fetch('./letterboxd_scraped.csv', { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

/* ── Load games.json ── */
async function loadGamesJSON() {
  const empty = { generated: new Date().toISOString(), games: [] };
  try {
    const r = await fetch('./games.json', { cache: 'no-cache' });
    if (!r.ok) return empty;
    return await r.json();
  } catch (e) { return empty; }
}

/* ── Film pool helpers ── */
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'to', 'for', 'on', 'at', 'by', 'with', 'is', 'it', 'as', 'its']);

function filmPool(library, difficulty = 'easy') {
  const sorted = [...library].sort((a, b) =>
    difficulty === 'hard' ? a.average_rating - b.average_rating : b.average_rating - a.average_rating
  );
  return sorted.slice(0, Math.min(sorted.length, 80));
}

function directorCounts(library) {
  const m = {};
  library.forEach(f => { if (f.director) m[f.director] = (m[f.director] || 0) + 1; });
  return m;
}

function difficultyStars(movies) {
  const avg = movies.reduce((s, m) => s + (m.average_rating || 0), 0) / movies.length;
  if (avg >= 4.0) return 1;
  if (avg >= 3.5) return 2;
  if (avg >= 3.0) return 3;
  if (avg >= 2.5) return 4;
  return 5;
}

/* ── ORIGINAL puzzle generator ── */
function filmTilePool(film, dirCount) {
  const pool = [];
  const add = (v, type, pri) => { if (v && v.trim()) pool.push({ value: v.trim(), type, pri }); };
  film.cast_names.slice(0, 3).forEach(n => add(n, 'actor', 1));
  const words = film.title.split(/\s+/);
  if (words.length === 1) {
    add(film.title, 'title', 2);
  } else {
    words.forEach(w => {
      const clean = w.replace(/[^a-zA-Z0-9]/g, '');
      if (clean.length > 2 && !STOP_WORDS.has(clean.toLowerCase())) add(clean, 'title', 2);
    });
    if (!pool.find(t => t.type === 'title')) add(film.title, 'title', 2);
  }
  if (film.director && dirCount[film.director] >= 2) {
    const ln = film.director.split(' ').pop();
    add(ln, 'director', 3);
  }
  film.genres_arr.slice(0, 3).forEach(g => add(g, 'genre', 4));
  add(film.country, 'country', 5);
  add(film.decade_label, 'decade', 6);
  const seen = new Set();
  return pool
    .filter(t => { const k = t.value.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.pri - b.pri);
}

function generateOriginalPuzzle(library, usedMovieSets = [], seed = 'orig') {
  const pool = filmPool(library);
  if (pool.length < 4) return null;
  const dc = directorCounts(library);
  const usedKeys = new Set(usedMovieSets.map(s => [...s].sort().join('|')));

  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = mulberry32(strToSeed(seed + attempt));
    const movies = seededPick(pool, 4, rng);
    const key = movies.map(m => m.title).sort().join('|');
    if (usedKeys.has(key)) continue;

    const tilePools = movies.map(m => filmTilePool(m, dc));
    const used = new Set();
    const assigned = [];
    let valid = true;

    for (let mi = 0; mi < 4; mi++) {
      const picked = [];
      const rngM = mulberry32(strToSeed(seed + attempt + 'm' + mi));
      const candidates = seededShuffle(tilePools[mi], rngM);
      for (const t of candidates) {
        if (picked.length >= 4) break;
        const k = t.value.toLowerCase();
        if (!used.has(k)) { used.add(k); picked.push(t); }
      }
      if (picked.length < 4) { valid = false; break; }
      assigned.push(picked);
    }
    if (!valid) continue;

    const flat = [];
    assigned.forEach((tiles, mi) => {
      tiles.forEach((t, ti) => {
        flat.push({ text: t.value, movie: movies[mi].title, type: t.type });
      });
    });

    const shuffled = seededShuffle(flat, mulberry32(strToSeed(seed + attempt + 'shuffle')));
    return {
      movies: movies.map(m => m.title),
      tiles: shuffled,
      difficulty: difficultyStars(movies),
      movieObjects: movies,
    };
  }
  return null;
}

/* ── REVERSAL puzzle generator ── */
function buildClusterMaps(library) {
  const dir = {}, actor = {}, genre = {}, decade = {}, country = {}, runtime = {};
  library.forEach((f, i) => {
    if (f.director) { if (!dir[f.director]) dir[f.director] = []; dir[f.director].push(i); }
    if (f.cast_names[0]) { if (!actor[f.cast_names[0]]) actor[f.cast_names[0]] = []; actor[f.cast_names[0]].push(i); }
    f.genres_arr.forEach(g => { if (!genre[g]) genre[g] = []; genre[g].push(i); });
    if (!decade[f.decade_label]) decade[f.decade_label] = [];
    decade[f.decade_label].push(i);
    if (f.country) { if (!country[f.country]) country[f.country] = []; country[f.country].push(i); }
    if (!runtime[f.runtime_bracket]) runtime[f.runtime_bracket] = [];
    runtime[f.runtime_bracket].push(i);
  });
  const all = [];
  const addMap = (map, labelFn, type) => {
    Object.entries(map).forEach(([k, idxs]) => {
      if (idxs.length >= 4) all.push({ theme: labelFn(k), themeType: type, films: idxs });
    });
  };
  addMap(dir,     k => `Directed by ${k}`,    'director');
  addMap(actor,   k => `Starring ${k}`,        'actor');
  addMap(genre,   k => `${k} Films`,           'genre');
  addMap(decade,  k => `Films from the ${k}`,  'decade');
  addMap(country, k => `Films from ${k}`,      'country');
  addMap(runtime, k => `Runtime: ${k}`,        'runtime');
  return all;
}

function generateReversalPuzzle(library, usedMovieSets = [], seed = 'rev') {
  const allClusters = buildClusterMaps(library);
  const usedKeys = new Set(usedMovieSets.map(s => [...s].sort().join('|')));

  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = mulberry32(strToSeed(seed + attempt));
    const shuffledClusters = seededShuffle(allClusters, rng);
    const chosen = [];
    const usedFilms = new Set();

    for (const cl of shuffledClusters) {
      if (chosen.length >= 4) break;
      const avail = cl.films.filter(i => !usedFilms.has(i));
      if (avail.length < 4) continue;
      const picked = seededPick(avail, 4, mulberry32(strToSeed(seed + attempt + cl.theme)));
      picked.forEach(i => usedFilms.add(i));
      chosen.push({ ...cl, selectedFilms: picked.map(i => library[i]) });
    }
    if (chosen.length < 4) continue;

    const key = chosen.flatMap(c => c.selectedFilms.map(f => f.title)).sort().join('|');
    if (usedKeys.has(key)) continue;

    const groups = chosen.map(c => ({
      theme: c.theme,
      themeType: c.themeType,
      movies: c.selectedFilms.map(f => f.title),
    }));

    const flat = [];
    chosen.forEach((cl, ci) => {
      cl.selectedFilms.forEach(f => flat.push({ text: f.title, clusterIdx: ci }));
    });
    const shuffled = seededShuffle(flat, mulberry32(strToSeed(seed + attempt + 'shuffle')));

    return {
      groups,
      tiles: shuffled,
      difficulty: difficultyStars(chosen.flatMap(c => c.selectedFilms)),
      movieObjects: chosen.flatMap(c => c.selectedFilms),
    };
  }
  return null;
}

/* ── BURGLE puzzle generator ── */
const BURGLE_CLUES = [
  { key: 'decade',    label: 'Decade',          get: f => f.decade_label },
  { key: 'genres',    label: 'Genre(s)',         get: f => f.genres_arr.join(', ') || '—' },
  { key: 'runtime',   label: 'Runtime',          get: f => f.runtime_bracket },
  { key: 'support',   label: 'Supporting Actor', get: f => f.cast_names[1] || f.cast_names[2] || '—' },
  { key: 'director',  label: 'Director',         get: f => f.director || '—' },
  { key: 'lead',      label: 'Lead Actor',       get: f => f.cast_names[0] || '—' },
  { key: 'synopsis',  label: 'Synopsis',         get: f => { const s = f.synopsis || ''; const fs = s.split(/[.!?]/)[0]; return fs ? fs.trim() + '.' : '—'; } },
];

function generateBurglePuzzle(library, usedMovies = [], seed = 'burgle') {
  const pool = filmPool(library);
  if (pool.length < 5) return null;
  const usedTitles = new Set(usedMovies);

  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = mulberry32(strToSeed(seed + attempt));
    const candidates = pool.filter(f => !usedTitles.has(f.title));
    if (candidates.length < 5) break;
    const movies = seededPick(candidates, 5, rng);

    const movieDefs = movies.map(f => ({
      title: f.title,
      year: f.year,
      poster_url: f.poster_url || '',
      clues: BURGLE_CLUES.map((c, i) => ({
        order: i + 1,
        type: c.key,
        label: c.label,
        text: c.get(f),
      })),
    }));

    return {
      movies: movieDefs,
      difficulty: difficultyStars(movies),
      movieObjects: movies,
    };
  }
  return null;
}

/* ── Loose title matching ── */
function normTitle(t) {
  return t.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9\s]/g, '').trim();
}
function titleMatch(guess, target) {
  const g = normTitle(guess), t = normTitle(target);
  if (g === t) return true;
  const gw = g.split(/\s+/).filter(Boolean);
  const tw = new Set(t.split(/\s+/).filter(Boolean));
  if (!gw.length || !tw.size) return false;
  const hits = gw.filter(w => tw.has(w)).length;
  return hits / Math.max(gw.length, tw.size) >= 0.8;
}

/* ══════════════════════════════════════════════════════════
   TILE GRID RENDERER
   Handles Original and Reversal modes.

   tiles: array of { text, movie, type } (Original)
          or      { text, clusterIdx }  (Reversal)
   mode:  'original' | 'reversal'
   groups (Reversal only): array of { theme, movies }
   onComplete(won, swapsLeft): called when puzzle ends
   swapLimit: default 20
   locked initial rows: pass [] to start fresh
══════════════════════════════════════════════════════════ */
function createTileGrid(options) {
  const {
    container,
    tiles: initialTiles,
    mode,          // 'original' | 'reversal'
    groups = [],   // reversal only
    swapLimit = 20,
    onComplete = () => {},
    readOnly = false,
  } = options;

  let tiles = initialTiles.map((t, i) => ({ ...t, idx: i, locked: false }));
  let sel = null;
  let swaps = swapLimit;
  let locked = 0;
  let done = false;
  const _drag = { src: null };

  const groupCount = mode === 'reversal' ? groups.length : 4;
  const groupKey = mode === 'reversal' ? 'clusterIdx' : 'movie';

  // State accessors for external reads
  const state = {
    get swaps() { return swaps; },
    get locked() { return locked; },
    get done() { return done; },
    get tiles() { return tiles; },
  };

  function rowMatches() {
    const results = [];
    for (let row = 0; row < groupCount; row++) {
      const slice = tiles.slice(row * 4, row * 4 + 4);
      if (!slice.length) { results.push({ match: 0, top: null }); continue; }
      if (slice[0].locked) { results.push({ match: 4, top: slice[0][groupKey] }); continue; }
      const cnt = {};
      slice.forEach(t => { cnt[t[groupKey]] = (cnt[t[groupKey]] || 0) + 1; });
      const max = Math.max(...Object.values(cnt));
      const top = Object.entries(cnt).find(([, v]) => v === max)?.[0] || null;
      results.push({ match: max, top });
    }
    return results;
  }

  function render() {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'tile-grid';

    const matches = rowMatches();

    tiles.forEach((tile, idx) => {
      const el = document.createElement('div');
      el.className = 'tile' + (tile.locked ? ' locked' : '');
      el.textContent = tile.text;

      const len = tile.text.length;
      if (len > 20) el.style.fontSize = '.62rem';
      else if (len > 14) el.style.fontSize = '.68rem';

      if (!tile.locked && !readOnly) {
        const row = Math.floor(idx / 4);
        const rowMatch = matches[row];
        if (sel === idx) el.classList.add('selected');
        else if (rowMatch.match === 3 && String(tile[groupKey]) === String(rowMatch.top)) el.classList.add('near');

        el.addEventListener('click', () => handleClick(idx));
        el.addEventListener('touchstart', e => { e.preventDefault(); handleClick(idx); }, { passive: false });
        el.draggable = true;
        el.addEventListener('dragstart', e => {
          _drag.src = idx;
          e.dataTransfer.effectAllowed = 'move';
          el.classList.add('dragging');
        });
        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          container.querySelectorAll('.tile.drag-over').forEach(t => t.classList.remove('drag-over'));
          _drag.src = null;
        });
        el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        el.addEventListener('dragenter', e => {
          e.preventDefault();
          if (_drag.src !== null && _drag.src !== idx) el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', e => {
          e.preventDefault();
          el.classList.remove('drag-over');
          if (_drag.src === null || _drag.src === idx) return;
          doSwap(_drag.src, idx);
          _drag.src = null;
        });
      }
      grid.appendChild(el);
    });

    container.appendChild(grid);
    checkLocks(matches);
  }

  function checkLocks(matches) {
    let newLock = false;
    for (let row = 0; row < groupCount; row++) {
      const slice = tiles.slice(row * 4, row * 4 + 4);
      if (!slice.length || slice[0].locked) continue;
      if (matches[row].match === 4) {
        slice.forEach(t => { t.locked = true; });
        locked++;
        newLock = true;
      }
    }
    if (newLock) {
      render();
      if (locked === groupCount && !done) {
        done = true;
        setTimeout(() => onComplete(true, swaps), 450);
      }
    }
  }

  function handleClick(idx) {
    if (tiles[idx].locked || done) return;
    if (sel === null) { sel = idx; render(); }
    else if (sel === idx) { sel = null; render(); }
    else { doSwap(sel, idx); sel = null; }
  }

  function doSwap(a, b) {
    if (tiles[a].locked || tiles[b].locked || done) return;
    [tiles[a], tiles[b]] = [tiles[b], tiles[a]];
    swaps--;
    sel = null;
    render();
    // bounce
    const els = container.querySelectorAll('.tile');
    [els[a], els[b]].forEach(el => {
      if (el) { el.classList.add('swap-anim'); el.addEventListener('animationend', () => el.classList.remove('swap-anim'), { once: true }); }
    });
    if (swaps <= 0 && locked < groupCount && !done) {
      done = true;
      setTimeout(() => onComplete(false, 0), 500);
    }
  }

  render();
  return { state, render };
}

/* ── Poster item builder ── */
function posterItem(film) {
  const div = document.createElement('div');
  div.className = 'poster-item';
  const safeTitle = (film.title || '').replace(/"/g, '');
  div.innerHTML = film.poster_url
    ? `<img src="${film.poster_url}" alt="${safeTitle}" loading="lazy" onerror="this.style.display='none'"><div class="poster-title">${film.title} (${film.year})</div>`
    : `<div style="background:var(--surface2);aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;font-size:.6rem;color:var(--muted);padding:4px;text-align:center">${film.title}</div>`;
  return div;
}

/* ── Stars HTML ── */
function starsHtml(n) {
  return '<span class="stars">' + '★'.repeat(n) + '<span style="opacity:.3">' + '★'.repeat(5 - n) + '</span></span>';
}

/* ── Date helpers ── */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function nextUnscheduledDate(games) {
  const dates = games.filter(g => g.status === 'approved').map(g => g.date).sort();
  if (!dates.length) return todayStr();
  const last = new Date(dates[dates.length - 1]);
  last.setDate(last.getDate() + 1);
  return last.toISOString().split('T')[0];
}
