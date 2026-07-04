/* Alpexa PWA service worker — v3 (launch speed).
   STALE-WHILE-REVALIDATE for same-origin pages/assets AND the CDN libraries the
   apps boot from (jsdelivr/unpkg: supabase-js, React, Babel, jsQR):
     - launch: the cached copy is served INSTANTLY (no network wait),
     - a fresh copy downloads in the background and is used on the NEXT launch.
   Money safety: balances/odds/positions are fetched live from Supabase at
   runtime — the Supabase origin is never touched by this worker and non-GET
   requests pass through, so a cached HTML *shell* can never show stale money.
   Trade-off (accepted 2026-07-04): code updates apply one launch late. */
const CACHE = 'alpexa-v3';
const SHELL = './login.html';
const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com'];

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
  if (req.method !== 'GET') return;                 // only GETs (API writes untouched)
  var url; try { url = new URL(req.url); } catch (err) { return; }
  var sameOrigin = url.origin === self.location.origin;
  var isCdn = CDN_HOSTS.indexOf(url.hostname) >= 0;
  if (!sameOrigin && !isCdn) return;                // Supabase & everything else: always live

  e.respondWith(swr(req));
});

// Stale-while-revalidate: cached copy now, refresh in the background.
function swr(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var refresh = fetch(req).then(function (res) {
        // Cache good responses; CDN <script> fetches are opaque (check type, not status).
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone()).catch(function () {});
        }
        return res;
      }).catch(function () { return null; });

      if (cached) return cached;                    // instant launch; refresh continues in bg
      return refresh.then(function (res) {
        if (res) return res;
        // Offline with nothing cached: navigations fall back to the login shell.
        if (req.mode === 'navigate') return caches.match(SHELL);
        return Response.error();
      });
    });
  });
}
