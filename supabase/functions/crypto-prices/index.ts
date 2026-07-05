// Alpexa — crypto-price (server-side, resilient real-time)
// Writes spot prices into the shared `prices` table (read by the FX app and the
// crypto_trade RPC). Binance.com geo-blocks our server (HTTP 451), so we try the
// Binance public DATA mirror first (real-time, usually not geo-blocked), then fall
// back to CoinGecko (slower but reliable) — the feed never goes dark.
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
// our symbol → CoinGecko id (fallback source).
const CG_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", LINK: "chainlink", DOGE: "dogecoin",
  AVAX: "avalanche-2", MATIC: "matic-network", XRP: "ripple", BNB: "binancecoin",
  ADA: "cardano", DOT: "polkadot", TON: "the-open-network", NEAR: "near", APT: "aptos",
  TRX: "tron", ATOM: "cosmos", AAVE: "aave", UNI: "uniswap", MKR: "maker",
  SHIB: "shiba-inu", PEPE: "pepe", BONK: "bonk", WIF: "dogwifcoin", WLD: "worldcoin-wld",
  RNDR: "render-token", FET: "fetch-ai", TAO: "bittensor",
};
const STABLES: Record<string, number> = { USDT: 1, USDC: 1, DAI: 1 };

type Row = { symbol: string; mid: number; spr_pts: number };
const px2row = (sym: string, p: number): Row => ({ symbol: sym, mid: Math.round(p * 1e6) / 1e6, spr_pts: 0 });

// Source 1: Binance public data mirror (real-time, same API shape as binance.com).
async function fromBinance(): Promise<Row[]> {
  const res = await fetch("https://data-api.binance.vision/api/v3/ticker/price", { cache: "no-store", headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error("binance.vision " + res.status);
  const tickers = await res.json();
  const px: Record<string, number> = {};
  for (const t of tickers) { if (t && t.symbol) px[t.symbol] = +t.price; }
  const rows: Row[] = [];
  for (const sym of Object.keys(STABLES)) rows.push(px2row(sym, STABLES[sym]));
  // Write BOTH the short symbol (BTC — crypto spot app) AND the USD pair (BTCUSD — the FX
  // app's fx_open, so crypto CFDs are server-priced and pass the margin gate, no bypass).
  for (const sym of Object.keys(PAIRS)) { const p = px[PAIRS[sym]]; if (p > 0) { rows.push(px2row(sym, p)); rows.push(px2row(sym + "USD", p)); } }
  if (rows.length <= Object.keys(STABLES).length) throw new Error("binance.vision empty");
  return rows;
}
// Source 2: CoinGecko (fallback; slower, free, no key).
async function fromCoinGecko(): Promise<Row[]> {
  const ids = Array.from(new Set(Object.values(CG_IDS))).join(",");
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { cache: "no-store", headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error("coingecko " + res.status);
  const data = await res.json();
  const rows: Row[] = [];
  for (const sym of Object.keys(STABLES)) rows.push(px2row(sym, STABLES[sym]));
  for (const sym of Object.keys(CG_IDS)) { const p = data[CG_IDS[sym]] && +data[CG_IDS[sym]].usd; if (p > 0) { rows.push(px2row(sym, p)); rows.push(px2row(sym + "USD", p)); } }
  if (rows.length <= Object.keys(STABLES).length) throw new Error("coingecko empty");
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  // FAIL-CLOSED: no CRON_SECRET → 503 (a misconfig is loud, not silently world-callable).
  // With the secret set, require ?token=<CRON_SECRET>. Matches sports-settle/stake-accrue.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  // 1) Get prices: Binance mirror first (real-time), CoinGecko fallback.
  let rows: Row[]; let src = "binance";
  try { rows = await fromBinance(); }
  catch (e1) {
    try { rows = await fromCoinGecko(); src = "coingecko"; }
    catch (e2) { return json({ ok: false, error: "all sources failed", binance: (e1 as Error).message, coingecko: (e2 as Error).message }, 502); }
  }

  // 2) Upsert into the shared `prices` table (merge on symbol).
  const r = await fetch(`${SB_URL}/rest/v1/prices?on_conflict=symbol`, {
    method: "POST",
    headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) return json({ ok: false, error: "store " + r.status + " " + (await r.text()) }, 500);
  return json({ ok: true, src, wrote: rows.length, symbols: rows.map((x) => x.symbol) });
});
