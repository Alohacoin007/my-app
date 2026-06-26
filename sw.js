/* Alpexa PWA service worker.
   Strategy: NETWORK-FIRST. Online always fetches the live build (so the app is
   never stale — important for a trading/betting app with frequent updates and
   ?v= cache-busting). A copy of successful same-origin GETs is cached purely as
   an OFFLINE fallback; the cache is only consulted when the network fails. */
const CACHE = 'alpexa-v1';

self.addEventListener('install', function () {
  // Activate the new worker immediately instead of waiting for old tabs to close.
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
  if (req.method !== 'GET') return;                 // only cache GETs
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;  // skip cross-origin (CDNs, Supabase)

  e.respondWith(
    fetch(req)
      .then(function (res) {
        // Stash a copy for offline use; never block the response on caching.
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      })
      .catch(function () {
        // Offline: serve the cached copy, or fall back to the login shell.
        return caches.match(req).then(function (r) { return r || caches.match('./login.html'); });
      })
  );
});
