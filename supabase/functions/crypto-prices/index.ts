// Alpexa — crypto-price (server-side, real-time)
// Pulls spot prices from BINANCE on the SERVER and writes them into the shared
// `prices` table. KEY POINT: Binance is reachable from the Supabase server even
// where the user's browser/region blocks it — so this gives true real-time crypto
// prices EVERYWHERE (incl. browsers where the client WebSocket is blocked).
// The crypto_trade RPC reads `prices`, so trades execute at the fresh server price.
// Binance limits are generous (one weight-~4 call), so run every few seconds.
//
// Required env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional CRON_SECRET.
// NOTE: deployed as Edge function name `crypto-price` (singular).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// our symbol → Binance trading pair (USDT-quoted). MATIC trades as POL, RNDR as
// RENDER on Binance now. Stablecoins are pinned to $1 (no pair needed).
const PAIRS: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", LINK: "LINKUSDT", DOGE: "DOGEUSDT",
  AVAX: "AVAXUSDT", MATIC: "POLUSDT", XRP: "XRPUSDT", BNB: "BNBUSDT", ADA: "ADAUSDT",
  DOT: "DOTUSDT", TON: "TONUSDT", NEAR: "NEARUSDT", APT: "APTUSDT", TRX: "TRXUSDT",
  ATOM: "ATOMUSDT", AAVE: "AAVEUSDT", UNI: "UNIUSDT", MKR: "MKRUSDT", SHIB: "SHIBUSDT",
  PEPE: "PEPEUSDT", BONK: "BONKUSDT", WIF: "WIFUSDT", WLD: "WLDUSDT", RNDR: "RENDERUSDT",
  FET: "FETUSDT", TAO: "TAOUSDT",
};
const STABLES: Record<string, number> = { USDT: 1, USDC: 1, DAI: 1 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  // 1) Real-time spot prices from Binance (server-side → not region-blocked).
  let tickers: any[];
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price", { cache: "no-store", headers: { "accept": "application/json" } });
    if (!res.ok) return json({ ok: false, error: "binance " + res.status }, 502);
    tickers = await res.json();
  } catch (e) { return json({ ok: false, error: "fetch failed " + (e as Error).message }, 502); }
  const px: Record<string, number> = {};
  for (const t of tickers) { if (t && t.symbol) px[t.symbol] = +t.price; }

  // 2) Build rows for the prices table (symbol, mid, spr_pts).
  const rows: { symbol: string; mid: number; spr_pts: number }[] = [];
  for (const sym of Object.keys(STABLES)) rows.push({ symbol: sym, mid: STABLES[sym], spr_pts: 0 });
  for (const sym of Object.keys(PAIRS)) {
    const p = px[PAIRS[sym]];
    if (p > 0) rows.push({ symbol: sym, mid: Math.round(p * 1e6) / 1e6, spr_pts: 0 });
  }
  if (!rows.length) return json({ ok: false, error: "no prices" }, 502);

  // 3) Upsert into the shared `prices` table (merge on symbol).
  const r = await fetch(`${SB_URL}/rest/v1/prices?on_conflict=symbol`, {
    method: "POST",
    headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) return json({ ok: false, error: "store " + r.status + " " + (await r.text()) }, 500);
  return json({ ok: true, wrote: rows.length, symbols: rows.map((x) => x.symbol) });
});
