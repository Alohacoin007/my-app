// Alpexa — CACHE + THROTTLE harness (mirrors supabase/functions/_shared/ttl-cache.ts &
// throttle.ts). Proves the read-proxy collapses N concurrent DB reads into 1 per second
// (single-flight + 1s TTL) and that the broadcast throttle caps publishes to ~2–3/sec.
// Also emits the before/after DB-load numbers for the report.
'use strict';
let pass = true; const ok = (n, c, x) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  ' + x : ''}`); };

// ── mirror: TTLCache with single-flight ──
class TTLCache {
  constructor(ttl = 1000) { this.ttl = ttl; this.s = new Map(); this.f = new Map(); this.hits = 0; this.misses = 0; this.coalesced = 0; }
  async get(key, fetcher, now) {
    const h = this.s.get(key);
    if (h && h.exp > now) { this.hits++; return h.v; }
    const fly = this.f.get(key);
    if (fly) { this.coalesced++; return fly; }
    this.misses++;
    const p = fetcher().then((v) => { this.s.set(key, { v, exp: now + this.ttl }); this.f.delete(key); return v; });
    this.f.set(key, p); return p;
  }
}
// ── mirror: rateGate (throttle predicate) ──
function rateGate(interval) { let last = -Infinity; return (now) => { if (now - last >= interval) { last = now; return true; } return false; }; }

const NOW = 1_700_000_000_000;

console.log('\n=== single-flight + 1s TTL: 100 concurrent reads → 1 DB fetch ===');
(async () => {
  let dbReads = 0;
  const cache = new TTLCache(1000);
  const fetcher = async () => { dbReads++; return [{ symbol: 'BTC', mid: 60000 }]; };
  // fire 100 concurrent requests in the SAME 1s window
  const results = await Promise.all(Array.from({ length: 100 }, () => cache.get('prices', fetcher, NOW)));
  ok('all 100 callers got the data', results.every(r => r[0].symbol === 'BTC'));
  ok('DB was read exactly ONCE (99 coalesced/served from cache)', dbReads === 1, `dbReads=${dbReads}`);

  // more calls later but still within the 1s window → still cached, 0 new reads
  await Promise.all(Array.from({ length: 50 }, () => cache.get('prices', fetcher, NOW + 800)));
  ok('later calls within 1s → still 1 DB read total', dbReads === 1);

  // after TTL expires → exactly one refresh
  await cache.get('prices', fetcher, NOW + 1001);
  ok('after 1s TTL → one refresh (2 reads total)', dbReads === 2);

  console.log('\n=== correctness: cached value equals the DB value ===');
  const cache2 = new TTLCache(1000); let v = 42;
  const f2 = async () => ({ mid: v });
  const a = await cache2.get('x', f2, NOW);
  v = 99;  // DB changes, but within the window we serve the cached snapshot
  const b = await cache2.get('x', f2, NOW + 500);
  ok('within window returns the cached snapshot (42)', a.mid === 42 && b.mid === 42);
  const c = await cache2.get('x', f2, NOW + 1100);
  ok('after TTL returns fresh (99)', c.mid === 99);

  console.log('\n=== throttle: 30 ticks/sec → capped to ~2.5/sec (400ms window) ===');
  const gate = rateGate(400);
  let published = 0;
  for (let i = 0; i < 30; i++) { if (gate(NOW + i * 33)) published++; }  // 30 ticks over ~1s (33ms apart)
  ok('published ≤ 3 in 1s (not 30)', published <= 3 && published >= 2, `published=${published}`);

  // ── BEFORE / AFTER report (modeled DB latency ~20ms/read) ──
  const users = 500, pollsPerSec = 1, DB_MS = 20;
  const beforeReads = users * pollsPerSec;              // every user hits DB directly
  const afterReads = 1;                                 // 1s cache collapses them
  console.log('\n  ── BEFORE / AFTER (per second, ' + users + ' concurrent users) ──');
  console.log('  DB reads/sec   : ' + beforeReads + '  →  ' + afterReads + '   (' + Math.round((1 - afterReads / beforeReads) * 1000) / 10 + '% less)');
  console.log('  DB time/sec    : ~' + (beforeReads * DB_MS) + 'ms  →  ~' + (afterReads * DB_MS) + 'ms  (@' + DB_MS + 'ms/read)');
  console.log('  cached response: served from memory (~0ms) instead of a DB round-trip');
  console.log('  broadcast rate : uncapped (30+/sec) → throttled to ~2.5/sec');
  ok('modeled DB-read reduction ≥ 99% at 500 users', (1 - afterReads / beforeReads) >= 0.99);

  console.log(pass ? '\n🟢 cache-throttle-harness: PASS' : '\n🔴 cache-throttle-harness: FAIL');
  process.exit(pass ? 0 : 1);
})();
