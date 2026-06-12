// Alpexa — stock-prices
// Pulls real US stock quotes from Finnhub and writes them into the shared
// `prices` table (symbol, mid, spr_pts). The trading app already reads `prices`
// as a trusted feed, so stocks light up automatically. Finnhub key stays in the
// function env (never in the client). SpaceX (private) has no quote → skipped.
//
// Trigger every ~1 min via pg_cron (35 symbols ≈ 35 calls/min, under Finnhub
// free tier's 60/min).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Public US-listed tickers from the trading app (SPACEX excluded — private).
const STOCKS = [
  "AAPL","TSLA","NVDA","MSFT","GOOGL","META","AMZN","NFLX","AMD","JPM",
  "IONQ","RGTI","QBTS","QUBT","ARQQ","TSM","INTC","QCOM","AVGO","ASML",
  "MU","TXN","AMAT","LRCX","KLAC","PLTR","SMCI","ANET","CRWD","ARM",
  "ORCL","NOW","CRM","SNOW","ADBE",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && url.searchParams.get("token") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const KEY = Deno.env.get("FINNHUB_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!KEY) return json({ ok: false, error: "FINNHUB_KEY not set" }, 500);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);

  // Optionally limit to one symbol for testing: ?symbol=AAPL
  const only = url.searchParams.get("symbol");
  const list = only ? [only.toUpperCase()] : STOCKS;

  const rows: { symbol: string; mid: number; spr_pts: number }[] = [];
  const results = await Promise.all(list.map(async (sym) => {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${KEY}`);
      const j = await r.json();
      const c = +j?.c || 0;
      return { sym, c, ok: r.ok };
    } catch (_e) { return { sym, c: 0, ok: false }; }
  }));
  for (const x of results) {
    if (x.c > 0) rows.push({ symbol: x.sym, mid: Math.round(x.c * 100) / 100, spr_pts: 0 });
  }
  if (!rows.length) return json({ ok: false, error: "no quotes (check key/limits)", sample: results.slice(0, 3) }, 502);

  try {
    const up = await fetch(`${SB_URL}/rest/v1/prices?on_conflict=symbol`, {
      method: "POST",
      headers: {
        "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!up.ok) return json({ ok: false, error: "upsert " + up.status, detail: await up.text() }, 502);
  } catch (e) {
    return json({ ok: false, error: "upsert failed: " + String(e) }, 502);
  }

  return json({ ok: true, wrote: rows.length, symbols: rows.map((r) => r.symbol) });
});
