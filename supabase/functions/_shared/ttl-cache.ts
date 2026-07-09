// Alpexa — TTL MEMORY CACHE with single-flight, for the price/odds read-proxy Edge.
// ============================================================================
// Clients read live_games/prices very frequently; with N users hitting PostgREST directly
// that's N DB reads/sec. This collapses them: a module-level cache holds the last read for
// `ttlMs` (default 1s), and SINGLE-FLIGHT means concurrent cache-misses share ONE fetch
// instead of all stampeding the DB. Deno Deploy reuses warm isolates, so the module-level
// instance is shared across concurrent requests → within any 1s window the DB is hit ~once,
// no matter how many users ask.
// ============================================================================

export class TTLCache<T> {
  private store = new Map<string, { v: T; exp: number }>();
  private inflight = new Map<string, Promise<T>>();
  private hits = 0; private misses = 0; private coalesced = 0;

  constructor(private ttlMs = 1000) {}

  // get(key, fetcher): returns the cached value if fresh; else fetches once (others joining
  // an in-flight fetch), caches it for ttlMs, and returns it. `now` is injectable for tests.
  async get(key: string, fetcher: () => Promise<T>, now: number = Date.now()): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.exp > now) { this.hits++; return hit.v; }        // fresh → 0 DB reads

    const flying = this.inflight.get(key);
    if (flying) { this.coalesced++; return flying; }                // single-flight: join the one fetch

    this.misses++;
    const p = fetcher()
      .then((v) => { this.store.set(key, { v, exp: now + this.ttlMs }); this.inflight.delete(key); return v; })
      .catch((e) => { this.inflight.delete(key); throw e; });
    this.inflight.set(key, p);
    return p;
  }

  stats() { return { hits: this.hits, misses: this.misses, coalesced: this.coalesced, keys: this.store.size }; }
}
