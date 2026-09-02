# RBS Budget

A private budgeting app that runs entirely in your browser. No server, no login,
no database. Your data lives in this browser's IndexedDB; you move it between
devices by exporting/importing a JSON file.

## Run it

```
python tools/serve.py
```

Then open <http://localhost:4173>. (`tools/serve.py` is a plain static file
server that disables caching so edits show on reload. `python -m http.server`
also works but caches JS modules hard.)

**No build step.** Hand-written HTML/CSS/ES-modules. The only libraries are
vendored, unbuilt files in `js/vendor/` — Preact + htm (~13 KB) and Chart.js.

## Deploy to GitHub Pages

1. `git init`, commit, push to a **public** repo (Pages needs public on a free
   account). The code has no secrets; your data is never in it — `.gitignore`
   blocks every `*.json`.
2. Repo → Settings → Pages → deploy from `main`, root.
3. Served at `https://<you>.github.io/<repo>/`. Every device opens it empty;
   load your data with **Data → Import a backup**.

`git push` redeploys.

## Your data

Everything is one JSON object in IndexedDB (DB `rbs-budget`, key `state`).

- **Back up:** Data → *Export everything (JSON)*.
- **Restore / switch devices:** Data → *Import a backup*. This **replaces
  everything** in the current browser — there is no merge. Keep one device
  primary and export from it before switching.
- The app nags you on load if the last export is more than 7 days old.

**Risks:** clearing site data wipes it; iOS Safari evicts storage for sites
unused ~7 days. Your JSON exports are the only real backup.

## Getting your existing data in

This app was migrated from an earlier Flask version. To bring that data over,
run its `tools/export_db.py` (in the old project folder — it needs the old
`models.py` / `database.py` / `budget.db`), which writes `rbs-seed.json`. Then
here: **Data → Import a backup → pick `rbs-seed.json`**, and delete the file.

## Layout

```
index.html            app shell
css/style.css          styles
js/
  app.js               boot + root component
  store.js             dataset <-> IndexedDB, mutation API
  seed.js              data shape, defaults, schema migration
  router.js            hash router
  shell.js             sidebar, privacy mode, mobile drawer
  backup.js toast.js ui.js csv.js charts.js
  logic/               pure functions: balances, budget, bills, reports,
                       categories, tags, transactions
  views/               one file per screen
  vendor/              Preact+htm, Chart.js (vendored, unbuilt)
tools/serve.py          no-cache dev server
```
