/* Alpexa PWA service worker.
   Money/trading app → freshness matters more than offline.
   - HTML documents (navigations): NETWORK-ONLY. The app is never served from
     cache while online, so a stale (possibly wrong-account) balances/odds page
     can never appear. Fully offline → fall back to the precached login shell.
   - Static assets (js/css/img/fonts): network-first, cache copy for offline.
   - Cross-origin (Supabase, CDNs): untouched. */
const CACHE = 'alpexa-v2';
const SHELL = './login.html';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.add(SHELL).catch(function () {}); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // only GETs
  var url; try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;  // skip cross-origin (Supabase, CDNs)

  // Is this an HTML document/navigation? Those must always be fresh.
  var isDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  if (isDoc) {
    // Network-only; offline → login shell. Never serve a cached app page.
    e.respondWith(fetch(req).catch(function () { return caches.match(SHELL); }));
    return;
  }

  // Static assets: network-first with cache fallback for offline.
  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      })
      .catch(function () { return caches.match(req); })
  );
});
