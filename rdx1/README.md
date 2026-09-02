# RDX1 — Rolodex One

A private contact & relationship tracker that runs entirely in your browser.
No accounts, no server, no tracking. Your data lives in `localStorage`; you move
it between devices with a JSON export/import.

## Features

- **Dashboard** — who you're due to reach out to, upcoming birthdays (next 30 days),
  recent activity, and a backup reminder.
- **Contacts** — search (name, company, title, tag, note, email, phone), filter by
  tag / favorite / overdue, sort by last name, first name, recently added,
  recently contacted, or most overdue.
- **Contact fields** — first/last name, company, title, multiple labeled phones &
  emails, address (opens in maps), birthday (month/day + optional year), notes,
  favorite, and free-form **custom fields** (label/value).
- **Tags** — type to add; existing tags autocomplete, Enter accepts the highlighted
  suggestion (or creates a new tag), Backspace removes the last chip.
- **Keep in touch** — set a cadence per contact (e.g. quarterly). The dashboard
  flags anyone overdue based on the last logged interaction.
- **Interaction log** — record calls / meetings / messages / emails / notes with a
  date. "Last contacted" is derived from this.
- **Follow-ups** — one-off dated reminders with done/reopen.
- **Import / export** — JSON only. Export filename is `yyyy-MM-dd RDX1_Export.json`.
  Import offers **Replace** (default — wipe & load, for moving devices) or **Merge**
  (add new, update matches by id), with duplicate detection by name / email / phone.
- **Theme** — auto / light / dark (toggle in the top bar or Settings).
- **PWA** — installable, works fully offline after the first visit.

## Hosting on GitHub Pages

1. Create a repo (e.g. `rdx1`) and add every file in this folder, keeping the
   structure (`index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`,
   `service-worker.js`, `.nojekyll`).
2. Push to `main`.
3. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
4. Open `https://<your-username>.github.io/rdx1/`.

All paths are relative, so it works from a project subpath. `.nojekyll` stops
GitHub from processing the site with Jekyll.

### Installing as an app

- **Desktop Chrome/Edge:** click the install icon in the address bar.
- **iPhone Safari:** Share → *Add to Home Screen*.
- **Android Chrome:** menu → *Install app* / *Add to Home Screen*.

Once installed it opens in its own window and works with no connection. Data still
does not sync between devices — use Export/Import for that.

## Moving to a new device

1. On the old device: **Settings → Export JSON**.
2. Transfer the file (AirDrop, email, cloud drive, USB…).
3. On the new device: open the site once, then **Settings → Import JSON → Replace all**.

## Updating the app

After changing any file in the app shell, bump `CACHE` in `service-worker.js`
(e.g. `rdx1-v2`) so installed clients pick up the new version.

## Local development

Any static file server works. A `python` launch config is included:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`. (Opening `index.html` via `file://` won't work —
ES modules and the service worker require `http`.)

## Data format

```jsonc
{
  "app": "RDX1",
  "schemaVersion": 1,
  "exportedAt": "2026-09-02T15:00:00.000Z",
  "settings": { "theme": "auto", "backupReminderDays": 30, "lastExportAt": null },
  "contacts": [
    {
      "id": "uuid",
      "firstName": "", "lastName": "", "company": "", "title": "",
      "phones": [{ "label": "mobile", "value": "" }],
      "emails": [{ "label": "work", "value": "" }],
      "address": "", "notes": "", "favorite": false,
      "birthday": { "month": 9, "day": 8, "year": 1986 },
      "tags": ["work"],
      "customFields": [{ "label": "Assistant", "value": "Marco" }],
      "keepInTouch": { "enabled": true, "intervalDays": 90 },
      "interactions": [{ "id": "uuid", "date": "2026-07-19", "type": "meeting", "note": "" }],
      "followUps": [{ "id": "uuid", "date": "2026-09-05", "note": "", "done": false }],
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

## Files

| Path | Purpose |
|---|---|
| `index.html` | App shell |
| `css/styles.css` | All styles, light/dark theming |
| `js/app.js` | Routing, theme, backup banner, SW registration |
| `js/store.js` | `localStorage` persistence, schema, migration |
| `js/model.js` | Derived data — cadence status, birthdays, search, dedupe |
| `js/components.js` | Avatar, contact row, tag input, modals |
| `js/views.js` | Dashboard, Contacts, Detail, Add/Edit, Settings |
| `js/importExport.js` | JSON export / import / validation |
| `js/util.js` | DOM + date helpers |
| `service-worker.js` | Offline cache |
| `manifest.webmanifest` | PWA metadata |
