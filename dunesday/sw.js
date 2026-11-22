/* DUNESDAY service worker: lets the home-screen app open offline.
   Network first (so updates show right away), falling back to the cached copy.
   Bump VERSION when you add or rename files below. */
const VERSION = "dunesday-v3";
const FILES = [
  "./",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/audio.js",
  "js/main.js",
  "manifest.webmanifest",
  "assets/favicon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Ask the server whether files changed instead of trusting the browser's 10-minute cache.
  // (A page navigation can't take extra options, so the page is re-requested by its URL.)
  const fresh = req.mode === "navigate"
    ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
    : fetch(req, { cache: "no-cache" });
  e.respondWith(
    fresh
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./")))
  );
});
