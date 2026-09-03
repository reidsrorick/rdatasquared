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

## Keyboard

- **Ctrl/⌘ + Enter** — save the open dialog (New/Edit app, New/Edit item, Bulk
  add), from any field including multi-line boxes.
- **Esc** — close the open dialog.

## How data is stored

All data lives in your browser's `localStorage` under the key `app-tracker:v1`.
It is per-device and per-origin — it does **not** sync between machines on its
own, and clearing browser data will erase it.

## Backups &amp; moving between devices

### Export

How Export behaves depends on the browser:

- **Chrome / Edge / other Chromium on desktop** — the first Export opens a save
  dialog. Pick a file (suggested name `YYYY-MM-DD App-Bug_Tracker_Backup.json`) in
  your cloud-synced folder. The app remembers that file, and **every later Export
  overwrites it in place** — no `… (1).json` pile-up. The Export button's tooltip
  shows which file it will overwrite. Use **Export as…** to point it at a
  different file, or after moving/renaming the old one.
- **Firefox / Safari / mobile** — Export downloads a dated file
  (`YYYY-MM-DD App-Bug_Tracker_Backup.json`). Browsers on these platforms give web
  pages **no way to overwrite** an existing download — they always append
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

## The Apps view

`Apps` in the nav is a sortable **list** (there's also a **Cards** toggle, and
your choice is remembered):

- Columns: **App**, **Status**, **Open** items, total **Items**, **Updated**.
  Click a column heading to sort; click again to reverse.
- **Status** filter (multi-select, same style as below) and a **search** box over
  name + description.
- The chosen sort / filters / search persist across reloads and are in the URL.

## Filtering &amp; sorting

Every item list — **All items**, the **Features / Enhancements / Bugs** views, and
an **app's detail page** — has the same control bar.

**Multi-select filters.** Type, Status, Priority, and App are dropdowns with a
checkbox per value plus a **Select all** row:

- All boxes checked (the default) = no filter on that facet (`Type: All`).
- Uncheck one value → narrows to the rest; **Select all** shows a dash (–) for a
  partial selection (`Type: 2 of 3`).
- Uncheck **Select all** → every box clears → that facet now matches **nothing**
  (`Type: None`), so the list is empty until you check something.
- The App filter is hidden on an app's own page (already scoped to that app).

**Search** matches item title + details. **Sort:** open first (default), priority
high→low, recently updated, newest, oldest, or title A→Z. **Clear** resets
everything (and forgets the saved state below).

**It stays where you left it.** Each view (Items, Apps, an app's items) remembers
its filters/sort. Opening the view again — a reload, the **Items**/**Apps** nav
link, or coming back from another tab — restores them. The state also lives in the
URL, so a filtered view is still bookmarkable and back-button friendly, e.g.
`#/items?type=feature,bug&status=open&sort=priority`. The **Features /
Enhancements / Bugs** nav links are explicit jumps that override the saved type.

## Selecting &amp; copying items

On any item list (the Features / Enhancements / Bugs views, All items, or an app's
detail page) each row has a checkbox, plus a **Select all** toggle above the
list. Once one or more items are checked, a bar appears at the bottom:

- **Set status… / Set priority…** — bulk-apply a status or priority to every
  selected item at once.
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
