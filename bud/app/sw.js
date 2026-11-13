/* Service worker: offline app shell.
   To ship an update: bump CACHE here AND the ?v= number on the <link>/<script> tags in
   index.html (the ?v= makes a previously-cached copy of the old file unmatchable). */
const CACHE = "budget-v25";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "js/model.js",
  "js/excel.js",
  "js/store.js",
  "js/ui.js",
  "js/app.js",
  "lib/xlsx.full.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // cache each asset independently so one bad path can't abort the whole install
      .then((c) =>
        Promise.all(
          ASSETS.map((a) =>
            c.add(a).catch((err) => console.warn("SW: could not cache", a, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never cache cross-origin

  // Navigations: network-first so updates appear; fall back to cached shell offline.
  if (req.mode === "navigate") {
    e.respondWith(
      // no-cache = always revalidate with the server, so hosted updates aren't held back
      // by the HTTP cache (GitHub Pages sends max-age=600)
      fetch(req, { cache: "no-cache" })
        .then((r) => {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put("index.html", cp));
          return r;
        })
        .catch(() => caches.match("index.html").then((m) => m || caches.match("./")))
    );
    return;
  }

  // Same-origin assets: network-first, so every load gets one consistent set of files (a
  // stale-while-revalidate cache can pair a new index.html with an old app.js and break the
  // page right after an update). Offline, fall back to the cached copy.
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((r) => {
        if (r && r.ok) {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
        }
        return r;
      })
      .catch(() =>
        // ignoreSearch: index.html asks for app.js?v=N, the precache holds plain app.js
        caches.match(req, { ignoreSearch: true }).then((m) => m || Response.error())
      )
  );
});
