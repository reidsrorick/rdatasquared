# App &amp; Bug Tracker

A single-page, dependency-free tracker for the apps you're building (or want to
build) and the features, enhancements, and bugs attached to each one. Plain HTML,
CSS, and JavaScript — no build step, no backend.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup and layout shell |
| `styles.css` | All styling, light + dark themes |
| `app.js` | State, routing, rendering, import/export |

## Running locally

Just open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Hosting on GitHub Pages

1. Create a repo (e.g. `app-tracker`) and push these three files to the root.
2. Repo **Settings → Pages → Build and deployment**: set **Source** to
   *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Your site publishes at `https://<username>.github.io/app-tracker/`.

No framework or Jekyll config is required.

## How data is stored

All data lives in your browser's `localStorage` under the key `app-tracker:v1`.
It is per-device and per-origin — it does **not** sync between machines on its
own, and clearing browser data will erase it.

## Backups &amp; moving between devices

### Export

How Export behaves depends on the browser:

- **Chrome / Edge / other Chromium on desktop** — the first Export opens a save
  dialog. Pick a file (e.g. `YYYY-MM-DD App-Bug_Tracker_Backup.json` in your
  cloud-synced folder). The app remembers that file, and **every later Export
  overwrites it in place** — no `… (1).json` pile-up. The button tooltip shows
  which file it will overwrite. Use **Export as…** to point it at a different
  file, or after moving/renaming the old one.
- **Firefox / Safari / mobile** — Export downloads a dated file
  (`YYYY-MM-DD App-Bug_Tracker_Backup.json`). Browsers on these platforms give
  web pages **no way to overwrite** an existing download — they always append
  `(1)`, `(2)`, … There is no flag to change that; it's the browser's download
  manager, not the app. Either let the dated copies accumulate, or delete/replace
  the old one yourself.

Either way the JSON carries an `exportedAt` timestamp, so you can always tell how
fresh a backup is.

### Import

**Import** reads a backup file and asks whether to:

- **replace** — wipe current data and load the file, or
- **merge** — add new records and update existing ones by `id`.

A banner reminds you to export whenever you have changes newer than your last
export.

### Swapping devices

Export on device A → put the file in the cloud → open the site on device B →
Import → choose *replace*. (The remembered-file overwrite is per-browser, so
you'll pick the file once on each device.)

## Adding items in bulk

The **Bulk add** button (Dashboard, any item list, or an app's detail page) opens
a modal where you set a shared **type / app / status / priority** once, then paste
a list — **one item per line**. A live counter shows how many will be created.

Per-line overrides:

- Start a line with `feature:`, `enhancement:`, or `bug:` (also `f:` / `e:` / `b:`)
  to override the default type for that line.
- Add ` | some text` to give that item a description.

```
Dark mode toggle | respect prefers-color-scheme
enhancement: speed up initial load
b: login button does nothing on Safari
```

Blank lines are ignored.

## Filtering &amp; sorting

Every item list — **All items**, the **Features / Enhancements / Bugs** views, and
an **app's detail page** — has the same control bar:

- Filter by **type**, **status**, **priority**, **app** (the app filter is hidden
  on an app's own page, since it's already scoped), and free-text **search** over
  title + details.
- The type / status / priority / app filters are **multi-select** dropdowns. Each
  opens with a **Select all** box checked and every option ticked (nothing is
  filtered out). Untick an option to exclude it; the Select-all box goes to a
  dash to show a partial selection. Unticking Select-all clears the whole group,
  which — like everything ticked — means "don't filter on this".
- **Sort:** open first (default), priority high→low, recently updated, newest,
  oldest, or title A→Z.
- **Clear** resets everything.

The **Apps** page has the same style of bar: a multi-select **status** filter,
**search** over name / description / notes, and sorts for status, name, most open
items, recently updated, or newest.

The current filters and sort are written to the URL, so a filtered view is
bookmarkable and survives a reload or the browser back button (e.g.
`#/app/<id>?type=bug` or `#/items?type=feature,bug&priority=high`).

## Selecting &amp; copying items

On any item list (the Features / Enhancements / Bugs views, All items, or an app's
detail page) each row has a checkbox, plus a **Select all** toggle above the
list. Once one or more items are checked, a bar appears at the bottom:

- **Copy** — puts the selected items on the clipboard as readable text
  (`Type: Title`, then an `App | Status | Priority` line, then details).
- **Copy as JSON** — the raw item records, for pasting into another tool or file.
- **Clear** — deselects everything.

Items are copied in the order they appear on screen, so sorting/filtering first
lets you control the output. Selection is temporary and resets when you change
views. Clipboard access needs a secure context — fine on GitHub Pages (HTTPS) or
`localhost`; a plain `file://` open falls back to a legacy copy method.

## Data model

```jsonc
{
  "version": 1,
  "apps": [
    {
      "id": "uuid",
      "name": "Recipe Keeper",
      "status": "idea",         // idea | planned | building | live | paused | archived
      "blurb": "short description",
      "url": "https://...",     // optional live URL
      "repo": "https://...",    // optional repository URL
      "notes": "free text",
      "createdAt": "ISO", "updatedAt": "ISO"
    }
  ],
  "items": [
    {
      "id": "uuid",
      "appId": "uuid | null",   // null = not tied to a specific app
      "type": "feature",        // feature | enhancement | bug
      "title": "short summary",
      "details": "free text",
      "status": "open",         // open | in-progress | resolved | closed
      "priority": "medium",     // low | medium | high
      "createdAt": "ISO", "updatedAt": "ISO"
    }
  ]
}
```

An exported file is the same shape plus an `exportedAt` timestamp.
