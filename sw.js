/* Alpexa PWA service worker — v4 (auto-update, customers do nothing).
   PAGES (HTML) are NETWORK-FIRST: when online the customer ALWAYS gets the latest
   deployed code, with the cached copy used only as an OFFLINE fallback. This fixes
   the old v3 stale-while-revalidate behaviour where a code update applied "one
   launch late" (or never, if the customer never re-launched) — customers cannot be
   asked to clear their cache, so the app must refresh itself.
   CDN LIBRARIES (jsdelivr/unpkg: supabase-js, React, Babel, jsQR) stay
   stale-while-revalidate: they are version-pinned/immutable, so cache-first is safe
   and keeps launch fast.
   Money safety: balances/odds/positions are fetched live from Supabase at runtime —
   the Supabase origin is never touched by this worker and non-GET requests pass
   through, so a cached HTML *shell* can never show stale money.
   Bumping CACHE (v3 → v4) makes activate() delete the old cache on update. */
const CACHE = 'alpexa-v4';
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
          .map(function (k) { return caches.delete(k); }));   // wipe old versions (e.g. alpexa-v3)
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

  // Same-origin HTML pages (navigations, *.html, directory roots): NETWORK-FIRST so a
  // fresh deploy reaches customers automatically on their very next launch — no cache
  // clearing, no "one launch late". Cache is only the offline fallback.
  var path = url.pathname;
  var isPage = req.mode === 'navigate' || /\.html$/.test(path) || path === '/' || path.charAt(path.length - 1) === '/';
  if (sameOrigin && isPage) { e.respondWith(networkFirst(req)); return; }

  // CDN libraries + other same-origin assets: stale-while-revalidate (fast; versioned).
  e.respondWith(swr(req));
});

// Network-first: freshest copy when online; cached copy (or the login shell) offline.
function networkFirst(req) {
  return fetch(req, { cache: 'no-store' }).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy).catch(function () {}); });
    }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (cached) {
        if (cached) return cached;
        if (req.mode === 'navigate') return c.match(SHELL);
        return Response.error();
      });
    });
  });
}

// Stale-while-revalidate: cached copy now, refresh in the background (CDN libs/assets).
function swr(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var refresh = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone()).catch(function () {});
        }
        return res;
      }).catch(function () { return null; });

      if (cached) return cached;                    // instant; refresh continues in bg
      return refresh.then(function (res) {
        if (res) return res;
        if (req.mode === 'navigate') return caches.match(SHELL);
        return Response.error();
      });
    });
  });
}
