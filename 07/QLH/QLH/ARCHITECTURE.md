# Quick Links Hub — Architecture & Reasoning

## The Core Idea

Most bookmark managers are either too heavy (browser sync accounts, cloud databases, Electron apps) or too fragile (browser bookmarks that disappear when you switch machines or profiles). Quick Links Hub sits in a different spot: it's a single HTML file you can open from a USB drive, host on GitHub Pages for free, or just keep on your desktop — and it works the same everywhere.

The guiding constraint was **zero infrastructure**. No server, no database, no build step, no login. Open the file, use it.

---

## Why Vanilla JS (No Framework)

The instinct when starting a web app is to reach for React, Vue, or Svelte. For this project that would be counterproductive:

- **No build toolchain.** No `npm install`, no bundler, no transpiler. The project is exactly what you see: four JS files and a CSS file loaded directly by `index.html`. Anyone can open the source, read it, and understand the full app in under an hour.
- **No dependency rot.** A React app from 2021 will have hundreds of transitive dependencies and break when Node or package versions drift. This app has none. It will work identically in 10 years.
- **Appropriate complexity.** The app is a CRUD interface over a list of objects. That does not require a virtual DOM diffing algorithm. The render model — `innerHTML =` on a known container — is simple, explicit, and fast enough.
- **Portability.** The whole app can be hosted anywhere that serves static files: GitHub Pages, Netlify, an S3 bucket, or a local file system. No Node runtime required.

The tradeoff is that dynamic UI (tag chips, modal forms) requires manual DOM manipulation rather than reactive state. For an app this size that's an acceptable cost.

---

## Why `localStorage`

`localStorage` was chosen over alternatives for the same reason as vanilla JS — it requires nothing outside the browser:

| Option | Requires |
|---|---|
| `localStorage` | Nothing |
| IndexedDB | Nothing, but far more complex API for simple key/value |
| SQLite via WASM | Large binary download |
| Hosted database | A server, an account, a network connection |
| File System Access API | User permission prompt + limited browser support |

The practical limit of `localStorage` is ~5–10 MB depending on the browser. A link entry (all fields as JSON) is roughly 300–500 bytes. That gives comfortable headroom for tens of thousands of links before hitting the ceiling.

The single risk is data loss — clearing browser storage wipes everything. The export/import backup system exists entirely to address this.

---

## The Backup System

Data is exported as a plain `.json` file with a datestamped filename (`quick-links-hub-2026-04-10.json`). The schema is intentionally simple and human-readable:

```json
{
  "version": "1.0",
  "settings": { "theme": "system", "defaultOpenInNewTab": true },
  "categories": [ { "id": "...", "name": "Work", "color": "#3b82f6" } ],
  "links": [
    {
      "id": "...",
      "title": "GitHub",
      "url": "https://github.com",
      "description": "Code repositories",
      "notes": "",
      "category": "Work",
      "tags": ["dev", "code"],
      "favorite": true,
      "openInNewTab": true,
      "parentId": "",
      "createdAt": "2026-04-10T00:00:00.000Z",
      "updatedAt": "2026-04-10T00:00:00.000Z",
      "lastUsed": ""
    }
  ]
}
```

Because it's just JSON, backups can be:
- Opened in any text editor
- Diffed in git
- Migrated to another tool without a special exporter
- Edited by hand to fix data

On import, the file is validated for the three required top-level keys before anything is written. A corrupt or wrong file won't silently destroy existing data.

---

## File Structure

```
index.html          Entry point — thin shell, no logic
js/
  storage.js        localStorage read/write, export, import
  data.js           CRUD operations, all business logic
  ui.js             DOM helpers — modal, toast, theme, favicon, escaping
  pages.js          HTML string templates for every page and modal
  app.js            Event delegation, routing, state, orchestration
css/
  styles.css        All styles — CSS custom properties for theming
```

Each file has a single, clear responsibility. `data.js` never touches the DOM. `pages.js` never reads from storage. `app.js` wires them together and owns state.

The rendering model is a simple SPA: `app.js` holds a `state` object, and any state change calls `render()`, which replaces `innerHTML` on `#app-nav` and `#app-main`. Routing is hash-based (`#/`, `#/manage`, `#/settings`, `#/link/:id`, `#/bulk-add`) so no server configuration is needed for deep links.

Event handling uses delegation — one listener on `document` reads `data-action` attributes rather than attaching handlers to individual elements. This means event listeners survive re-renders automatically.

---

## Hosting Options

Because the app is static files with no server-side requirements:

| Platform | Cost | Notes |
|---|---|---|
| **GitHub Pages** | Free | Push to a repo, enable Pages in settings — done |
| **Netlify** | Free tier | Drag-and-drop deploy of the project folder |
| **Cloudflare Pages** | Free tier | Git-connected, fast global CDN |
| **Local file** | Free | Open `index.html` directly in a browser |
| **USB drive** | Free | Truly portable, works without internet |
| **VS Code Live Server** | Free | Convenient during development |

The only thing that doesn't work is opening `index.html` as a `file://` URL in some browsers with strict local file restrictions (mainly Firefox with certain security settings). A basic local HTTP server resolves this: `python -m http.server 8080`.

---

## Resources

### Core Web APIs Used

- [localStorage — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [crypto.randomUUID() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
- [Blob + URL.createObjectURL() for file download — MDN](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
- [FileReader API for import — MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- [CSS Custom Properties — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [CSS Grid — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout)

### Patterns Used

- **Event delegation** — attach one listener high in the DOM, read `data-action` attributes to route behavior. Avoids re-binding on re-render.
- **Stretched link** — `::after` pseudo-element on an anchor covers the parent card, making the whole card clickable without wrapping everything in an `<a>`.
- **Hash-based routing** — listen to `hashchange`, parse `window.location.hash`, render the matching page. No history API complexity, works on `file://`.
- **Object literal modules** — `const App = { ... }`, `const Data = { ... }` etc. Simple namespacing without ES modules or a bundler.

### Similar Approaches / Inspiration

- [plainvanilaweb.com](https://plainvanilaweb.com) — philosophy of building without frameworks
- [You Don't Need jQuery](https://github.com/nefe/You-Dont-Need-jQuery) — reference for vanilla DOM equivalents
- [The Grug Brained Developer](https://grugbrain.dev) — the case against complexity (relevant to the no-framework choice)
- Browser bookmark managers like Raindrop.io and Pinboard — what this is a local-first alternative to
