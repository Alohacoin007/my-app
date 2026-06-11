// Alpexa — fx-prices
// Pulls real-time FX/metals quotes from Polygon.io and writes them into the
// shared `prices` table (symbol, mid, spr_pts). The trading app reads `prices`
// every ~1.5s, so the whole platform tracks the real market — and the paid
// Polygon key NEVER touches the client (it lives only in this function's env).
//
// Trigger this on a schedule (e.g. every 5–10s) via Supabase Cron / pg_cron.
//
// Required env (set as Edge Function secrets — see deploy notes):
//   POLYGON_KEY      your Polygon.io API key (paid Currencies plan)
//   SUPABASE_URL     (auto-provided by Supabase)
//   one of: SUPABASE_SERVICE_ROLE_KEY  (auto, classic projects)
//           SUPABASE_ANON_KEY          (auto, fallback — RLS on `prices` is open)
// Optional:
//   CRON_SECRET      if set, callers must pass ?token=<CRON_SECRET> (stops abuse)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// App symbols we want a real feed for. Anything Polygon doesn't return is simply
// skipped (the app falls back to its own simulation for those).
const WANT = [
  "EURUSD","GBPUSD","USDJPY","AUDUSD","USDCHF","USDCAD","NZDUSD",
  "EURJPY","EURGBP","GBPJPY","EURAUD","AUDJPY","EURCHF",
  "USDKRW","USDCNH","USDSGD","USDMXN","XAUUSD",
];

// Pip size per symbol so the spread can be reported in points.
function pip(sym: string): number {
  if (sym.endsWith("JPY")) return 0.01;
  if (sym === "XAUUSD") return 0.01;
  return 0.0001;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && url.searchParams.get("token") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const POLY = Deno.env.get("POLYGON_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!POLY) return json({ ok: false, error: "POLYGON_KEY not set" }, 500);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);

  // One call returns every forex ticker Polygon tracks.
  const snapUrl =
    `https://api.polygon.io/v2/snapshot/locale/global/markets/forex/tickers?apiKey=${POLY}`;
  let snap: any;
  try {
    const r = await fetch(snapUrl);
    snap = await r.json();
    if (!r.ok) return json({ ok: false, error: "polygon " + r.status, detail: snap }, 502);
  } catch (e) {
    return json({ ok: false, error: "polygon fetch failed: " + String(e) }, 502);
  }

  const tickers: any[] = Array.isArray(snap?.tickers) ? snap.tickers : [];
  const bySym: Record<string, any> = {};
  for (const t of tickers) {
    // Polygon forex tickers look like "C:EURUSD".
    const sym = String(t.ticker || "").replace(/^C:/, "");
    bySym[sym] = t;
  }

  const rows: { symbol: string; mid: number; spr_pts: number }[] = [];
  for (const sym of WANT) {
    const t = bySym[sym];
    if (!t) continue;
    // Prefer the last quote (bid/ask); fall back to last trade / day close.
    const q = t.lastQuote || {};
    const bid = +q.b || 0, ask = +q.a || 0;
    let mid = 0, spr = 0;
    if (bid > 0 && ask > 0) {
      mid = (bid + ask) / 2;
      spr = Math.max(0, Math.round((ask - bid) / pip(sym)));
    } else {
      const last = +(t.lastTrade?.p) || +(t.day?.c) || +(t.prevDay?.c) || 0;
      if (last > 0) { mid = last; spr = 0; }
    }
    if (mid > 0) rows.push({ symbol: sym, mid: Math.round(mid * 1e6) / 1e6, spr_pts: spr });
  }

  if (!rows.length) return json({ ok: false, error: "no usable quotes", sampleKeys: Object.keys(bySym).slice(0, 5) }, 502);

  // Upsert into `prices` (merge on the symbol key).
  try {
    const up = await fetch(
      `${SB_URL}/rest/v1/prices?on_conflict=symbol`,
      {
        method: "POST",
        headers: {
          "apikey": SB_KEY,
          "Authorization": `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      },
    );
    if (!up.ok) {
      const txt = await up.text();
      return json({ ok: false, error: "upsert " + up.status, detail: txt }, 502);
    }
  } catch (e) {
    return json({ ok: false, error: "upsert failed: " + String(e) }, 502);
  }

  return json({ ok: true, wrote: rows.length, symbols: rows.map((r) => r.symbol), time: new Date().toISOString() });
});
