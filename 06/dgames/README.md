# Game Hub

A local-first, arcade-style browser game library. Browse, launch, organize, and manage your favorite web games — all stored in your browser.

---

## Quick Start

**Option A — Live server (recommended)**

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code: install "Live Server" extension → click "Go Live"
```

Then open `http://localhost:8080` in your browser.

**Option B — GitHub Pages**

Push the repo to GitHub and enable Pages from the `main` branch root. Done.

> ⚠️ **Do not open `index.html` directly via `file://`** — the browser will block the `fetch()` call that loads `data/games.json`. Always use a local server or GitHub Pages.

---

## Architecture

```
Game Hub (static site)
│
├── data/games.json          ← Shipped default catalog (source of truth base)
│
├── Browser IndexedDB        ← All local user modifications layered on top
│     ├── userGames store    ← Overrides, user-added games, delete markers
│     └── settings store     ← Theme, launch mode, favorites order, etc.
│
└── Resolved catalog         ← defaults + IndexedDB merged at runtime
```

### How the merge works

1. App fetches `data/games.json` on startup.
2. All records in IndexedDB `userGames` are loaded.
3. For each default game:
   - If a `{ id, _deleted: true }` marker exists → the game is skipped.
   - If a full override record exists → the override replaces the default entry.
   - Otherwise → the default entry is used as-is.
4. User-added games (`userAdded: true`) are appended after the defaults.
5. Duplicate URLs are removed (first occurrence wins).
6. The result is `AppState.catalog` — what you see rendered.

---

## Features

| Feature | Details |
|---|---|
| Game cards | Title, description, tags, thumbnail/placeholder, Play / ★ / ⋮ menu |
| Favorites | Dedicated top section; drag-and-drop reorder; persisted to IndexedDB |
| Search | Live search by title, description, tags, and category |
| Tag filters | One-click filter bar generated from all tags in the catalog |
| Sort | A→Z, Z→A, Recently Added, Recently Updated |
| Add game | URL, title, description, category, tags, thumbnail, favorite flag |
| Edit game | Edit any game; default games are stored as overrides, not modified in the JSON |
| Archive | Hides game from Hub without deleting; toggle via card menu or Manage view |
| Delete | Requires confirmation; default games get a `_deleted` marker; user-added games are fully removed |
| Manage view | Full library list with search and filter tabs (All / Active / Custom / Archived) |
| Archived view | Dedicated view for archived games with Restore action |
| Settings | Theme, launch mode, show-archived toggle, import, export, reset |
| Dark / light mode | Dark is default; toggle in header or Settings |
| Import | JSON file → Merge or Replace; validates structure before applying |
| Export | Downloads full resolved catalog as `game-hub-catalog-YYYY-MM-DD.json` |
| Reset | Wipes all IndexedDB data and reloads — reverts to shipped `games.json` |
| Responsive | Works on desktop, tablet (640+px), and mobile (<600px) |
| Accessible | Semantic HTML, ARIA labels, keyboard-navigable modals, visible focus rings |

---

## Default Catalog (`data/games.json`)

The shipped catalog is the base dataset. It is **never modified** by the app at runtime. User changes are stored separately in IndexedDB and merged on top.

### File format

```json
{
  "schemaVersion": "1.0.0",
  "exportedAt": "2026-04-17T00:00:00.000Z",
  "games": [
    {
      "id": "game_001",
      "title": "2048",
      "description": "Join the tiles to reach 2048!",
      "url": "https://play2048.co/",
      "tags": ["puzzle", "numbers", "classic"],
      "thumbnail": "",
      "category": "Puzzle",
      "favorite": true,
      "archived": false,
      "userAdded": false,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### Field reference

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique identifier. Default games use `game_NNN`; user-added use `user_<hash>` |
| `title` | string | Required |
| `description` | string | Optional; shown on card |
| `url` | string | Required; used for duplicate detection |
| `tags` | string[] | Freeform; drives the tag filter bar |
| `thumbnail` | string | Optional URL; falls back to gradient placeholder |
| `category` | string | Optional; for display/filtering |
| `favorite` | boolean | Whether it appears in the Favorites section |
| `archived` | boolean | Hides game from Hub |
| `userAdded` | boolean | `true` for user-created games; `false` for defaults |
| `createdAt` | ISO string | When the game was first added |
| `updatedAt` | ISO string | When the game was last modified |

---

## IndexedDB Details

**Database name:** `gameHubDB`  
**Version:** 1

| Store | Key | Contents |
|---|---|---|
| `userGames` | `id` | Override records, user-added games, delete markers (`{id, _deleted:true}`) |
| `settings` | `key` | Key-value pairs: `theme`, `launchMode`, `showArchived`, `favoritesOrder`, `_lastBackup` |

The `userGames` store never grows unboundedly for default games — each game has at most one record (override or delete marker). User-added games each get their own record.

---

## Import

Click **Settings → Import JSON** or **Manage → Import**.

1. Select a `.json` file (must match Game Hub export format).
2. Preview shows how many valid games were found.
3. Choose a mode:

| Mode | Behavior |
|---|---|
| **Merge** | New games are added to your existing catalog. If a game's URL already exists, the incoming game is skipped. First URL wins. |
| **Replace** | Your entire local catalog is replaced. A backup is saved to `settings._lastBackup` in IndexedDB before the operation. |

### Validation

The import validates:
- Root must be a JSON object
- `games` must be an array
- Each entry must have `id`, `title`, and a valid `https://` URL
- Invalid entries are skipped with a warning; valid entries proceed
- If zero valid entries remain, the import is rejected

---

## Export

Click **Settings → Export JSON** or **Manage → Export**.

- Produces the **fully resolved catalog** (defaults + all local overrides merged).
- Includes `schemaVersion` and `exportedAt` metadata.
- File is named `game-hub-catalog-YYYY-MM-DD.json`.
- The exported file is directly usable as a new `data/games.json`.

---

## Duplicate URL Handling

Duplicate detection compares **normalized URLs** (lowercase, trailing slash stripped, query string preserved). Rules:
- When **adding** a game: rejected if URL matches any existing game.
- During **merge import**: incoming games with duplicate URLs are skipped.
- During **replace import**: the incoming array itself is deduplicated; first occurrence of each URL wins.

---

## Reset to Default

**Settings → Reset to Default Catalog**

1. Clears all records from `userGames` and `settings` IndexedDB stores.
2. Reloads the page — app re-fetches `data/games.json` with a clean slate.

This is irreversible unless you exported your catalog first.

---

## Updating the Default Catalog for GitHub Pages

To ship a new baseline catalog:

1. Customize your catalog in the app.
2. **Export** (`Settings → Export JSON`).
3. Rename the file to `games.json`.
4. Replace `data/games.json` in your repo with the new file.
5. Commit and push.

The next time any user opens the site (or resets), they'll see your updated defaults. Users who already have local changes are unaffected — their IndexedDB overrides still apply on top.

---

## Launch Modes

| Mode | Behavior |
|---|---|
| **New Tab** (default) | `window.open(url, '_blank')` |
| **Same Tab** | `window.location.href = url` |
| **Embedded** | Iframe modal inside Game Hub |

### Iframe limitations

Many sites set `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`, which prevents iframe embedding. When this happens:
- A "blocked" message is shown after 8 seconds.
- An "Open in New Tab" fallback is provided.
- This is a browser/site security restriction that cannot be overridden.

---

## Adding New Fields to the Schema

1. Add the field to entries in `data/games.json`.
2. Update the form in `index.html` (add an `<input>`).
3. In `scripts/catalog.js` → `addGame()` and `updateGame()`, include the new field.
4. In `scripts/ui.js` → `createGameCard()` and/or `createManageItem()`, render it.
5. In `scripts/validation.js` → `validateGame()`, add any validation.
6. Bump `schemaVersion` to `1.1.0` in both the JSON file and the export payload in `importExport.js`.
7. Update `SUPPORTED_SCHEMA_VERSIONS` in `validation.js` to include `'1.1.0'`.

---

## File Structure

```
index.html               Main HTML (all views inline)
styles/
  themes.css             CSS custom properties (dark + light)
  main.css               Layout, typography, nav, views, responsive
  components.css         Buttons, cards, modals, toasts, forms, badges
scripts/
  utils.js               Pure helpers (ID gen, debounce, toast, URL utils)
  storage.js             IndexedDB wrapper (promise-based)
  validation.js          Import and form validation
  catalog.js             Merge logic + all CRUD operations
  dragdrop.js            Favorites drag-and-drop reordering
  importExport.js        Export builder + import processor
  settings.js            Settings load/save/apply
  ui.js                  All DOM rendering and modal logic
  app.js                 Entry point, global state, event wiring
data/
  games.json             Default catalog (shipped with the site)
README.md
```

---

## Browser Compatibility

Requires a modern browser with support for:
- `IndexedDB` (all modern browsers)
- `fetch()` (requires HTTP server or GitHub Pages, not `file://`)
- CSS custom properties
- ES6+ JavaScript (no transpilation)

Tested in Chrome, Firefox, Edge, and Safari.
