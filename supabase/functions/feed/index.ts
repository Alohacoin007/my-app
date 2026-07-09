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
import { TTLCache } from "../_shared/ttl-cache.ts";

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
