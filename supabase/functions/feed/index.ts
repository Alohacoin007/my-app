// Alpexa — feed (READ-PROXY with 1-second cache)
// ============================================================================
// Single entry point clients hit for live prices/odds instead of reading PostgREST directly.
// A module-level TTLCache (1s + single-flight) means: no matter how many users ask in a given
// second, the DB is read ONCE. Turns N-users × polls/sec of DB load into ~1 read/sec.
//
//   GET /functions/v1/feed?t=games   → the live_games 'all' row's data array
//   GET /functions/v1/feed?t=prices  → the prices table (symbol, mid, spr_pts)
//
// Adoption (client): replace
//     AlpexaSync.db.from('live_games').select('data').eq('id','all')   →  fetch(FEED+'?t=games')
//     AlpexaSync.db.from('prices').select('symbol,mid,spr_pts')        →  fetch(FEED+'?t=prices')
// Layered HTTP cache header (max-age=1) lets Supabase's CDN absorb even more.
// ============================================================================
// ⚠️ 캐시를 **이 파일 안에** 둔다 (2026-08-18). 예전엔 `../_shared/ttl-cache.ts` 를 임포트했는데,
//    Supabase 대시보드 편집기는 함수 폴더 **밖의 상대 임포트를 못 읽는다** → 대시보드로 배포하면
//    실패한다. 실제로 이 함수는 배포돼 있지 않았고(실측 404 NOT_FOUND), 클라 5종이 매 폴링마다
//    404 를 두들겨 콘솔에 CORS 에러가 쌓였다. 붙여넣는 코드 == 리포 코드가 되도록 한 파일로 합친다.
//
// TTL 메모리 캐시 + single-flight: 같은 1초 안에 몇 명이 물어도 DB 는 **한 번만** 읽는다.
// Deno Deploy 가 웜 아이솔레이트를 재사용하므로 모듈 레벨 인스턴스가 요청들 사이에서 공유된다.
class TTLCache<T> {
  private store = new Map<string, { v: T; exp: number }>();
  private inflight = new Map<string, Promise<T>>();
  constructor(private ttlMs = 1000) {}
  async get(key: string, fetcher: () => Promise<T>, now: number = Date.now()): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.exp > now) return hit.v;                    // 신선 → DB 0회
    const flying = this.inflight.get(key);
    if (flying) return flying;                                 // single-flight: 진행 중인 fetch 에 합류
    const p = fetcher()
      .then((v) => { this.store.set(key, { v, exp: now + this.ttlMs }); this.inflight.delete(key); return v; })
      .catch((e) => { this.inflight.delete(key); throw e; });
    this.inflight.set(key, p);
    return p;
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=1" },
  });
}

// ONE cache instance per warm isolate — shared across concurrent requests.
const cache = new TTLCache<unknown>(1000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

  // `t` from the query string (GET) OR the JSON body (supabase-js functions.invoke → POST).
  let t = new URL(req.url).searchParams.get("t");
  if (!t && req.method === "POST") { try { t = (await req.json())?.t; } catch (_e) { /* no body */ } }
  const what = t === "prices" ? "prices" : "games";
  try {
    const data = await cache.get(what, async () => {
      if (what === "prices") {
        const r = await fetch(`${SB_URL}/rest/v1/prices?select=symbol,mid,spr_pts`, { headers: H });
        if (!r.ok) throw new Error("prices " + r.status);
        return await r.json();
      }
      const r = await fetch(`${SB_URL}/rest/v1/live_games?select=data&id=eq.all`, { headers: H });
      if (!r.ok) throw new Error("live_games " + r.status);
      const rows = await r.json();
      return (rows[0] && rows[0].data) || [];
    });
    return json(data);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message) }, 502);
  }
});
