// Caches the app so it opens offline. Your notes are NOT stored here: they live in your own JSON file.
const PFX = 'notebooktest-', CACHE = PFX + '20261120145110';          // a copy of the app at another address of the same site (the test copy) uses another prefix, so the two never delete or read each other's stored files
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PFX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {                         // the page itself: network first (so you get updates), cache when offline
    const own = () => caches.open(CACHE), stored = () => own().then(c => c.match('index.html').then(r => r || c.match('./')));          // a slow or failing connection falls back to the stored copy after 4 seconds
    const fresh = fetch(req).then(res => { if (!res.ok) throw new Error('bad response'); const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return res; });
    e.respondWith(Promise.race([fresh, new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]).catch(stored));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c => c.match(req)).then(r => r || fetch(req)));
});
