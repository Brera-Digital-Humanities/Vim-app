// VIM service worker — offline app shell cache.
// Network-first for the HTML document (so an updated build always loads when
// online, falling back to cache offline); cache-first for static same-origin
// assets and Google Fonts. Everything else (e.g. form submissions) → network.

const CACHE = 'vim-v2';
const CORE = ['./index.html', './manifest.json'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE))   // icons cached lazily on first fetch
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // let POST/submit pass through
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont     = FONT_HOSTS.includes(url.host); // Google Fonts CSS + .woff2
  if (!sameOrigin && !isFont) return;               // e.g. external APIs → network

  // The HTML document: network-first, so a rebuilt app loads when online.
  const isDoc = req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('.html'));
  if (isDoc) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Static assets + fonts: cache-first (grow the cache on first fetch).
  e.respondWith(
    caches.match(req).then(hit => hit ||
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => sameOrigin ? caches.match('./index.html') : undefined))
  );
});
