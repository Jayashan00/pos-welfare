// Offline support: the till keeps working if the camp internet drops.
const CACHE = 'canteen-pos-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page, fall back to the cached copy when offline.
    e.respondWith(
      fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put('/index.html', c)); return res; })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // Cache first for scripts, styles, fonts and images (file names are versioned by the build).
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
      return res;
    }))
  );
});
