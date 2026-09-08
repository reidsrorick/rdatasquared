# Timesheet / PTO Tracker — static web app

A pure **HTML / CSS / JS** build of the Timesheet tracker. No server, no build
step, no Electron. Runs entirely in the browser and stores data in that
browser's `localStorage`. Move between computers with JSON backup files.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The app shell |
| `styles.css` | Styles |
| `app.js` | Application logic (unchanged from the desktop version) |
| `storage.js` | Browser storage layer — replaces the Electron file bridge |
| `backup.js` | Wires the JSON backup / restore buttons |
| `xlsx.full.min.js` | SheetJS, for Excel export/import |
| `favicon.svg` | Tab icon |
| `data.json` | **Optional** seed data (see below) |

## Hosting on GitHub Pages

1. Create a repo (e.g. `timesheet`) and copy **the contents of this folder** into
   its root.
2. Commit and push.
3. Repo **Settings → Pages → Build and deployment**: Source = "Deploy from a
   branch", Branch = `main`, folder = `/ (root)`. Save.
4. Wait ~1 minute. The app is at `https://<you>.github.io/timesheet/`.

(Any static host works too — Netlify, Cloudflare Pages, an S3 bucket, etc.)

## How data is stored

- All data lives in `localStorage` under the key `timesheet_tracker_data_v2`,
  scoped to the exact origin the page is served from.
- It survives reloads and browser restarts. It is **erased** if you clear site
  data / browsing history for that site, or use a different browser or profile.
- Nothing is uploaded anywhere.

## Backups (moving between computers)

**On the old computer:** Settings → Data Management → **Download Backup**. You get
`timesheet-backup-YYYY-MM-DD.json`. Keep it somewhere safe (OneDrive, etc.).

**On the new computer:** open the site → Settings → Data Management →
**Restore Backup** → pick the `.json` file → confirm. All data is replaced with
the backup's contents.

Do a fresh Download Backup whenever you've entered time you don't want to lose.

## The optional `data.json` seed

On the **first load in a browser that has no saved data**, the app tries to
`fetch('./data.json')` and, if found, loads it as the starting point. After that
first load the file is ignored — `localStorage` is the source of truth.

- **Keep `data.json`** if you want the app to open pre-populated with the data
  it currently contains. Note it will be committed to the repo (public if the
  repo is public).
- **Delete `data.json`** if you'd rather start empty and always seed via a
  Restore Backup. To refresh the seed later, just replace the file with a newly
  downloaded backup and push.

## Local testing

`localStorage` and the `data.json` fetch need a real origin, so serve the folder
rather than double-clicking `index.html`:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.
