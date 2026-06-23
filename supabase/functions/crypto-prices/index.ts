// Alpexa — crypto-prices
// SERVER-SIDE crypto price feed. Pulls real spot prices from CoinGecko (free, no
// key) and writes them into the shared `prices` table (symbol, mid, spr_pts) — the
// SAME table the FX app reads. This lets the server price crypto authoritatively
// (the crypto_trade RPC reads `prices`), so trades execute at the SERVER price,
// never a stale client price. Run on a ~1-minute pg_cron.
//
// Required env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional CRON_SECRET.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// symbol → CoinGecko id (mirrors the app's ALPEXA_LIVE_IDS).
const IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", LINK: "chainlink",
  DOGE: "dogecoin", AVAX: "avalanche-2", MATIC: "matic-network", XRP: "ripple",
  BNB: "binancecoin", ADA: "cardano", DOT: "polkadot", TON: "the-open-network",
  NEAR: "near", APT: "aptos", TRX: "tron", ATOM: "cosmos", AAVE: "aave", UNI: "uniswap",
  MKR: "maker", USDC: "usd-coin", DAI: "dai", SHIB: "shiba-inu", PEPE: "pepe",
  BONK: "bonk", WIF: "dogwifcoin", WLD: "worldcoin-wld", RNDR: "render-token",
  FET: "fetch-ai", TAO: "bittensor",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  // 1) Fetch real spot prices from CoinGecko.
  const ids = Array.from(new Set(Object.values(IDS))).join(",");
  const cg = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  let data: any = {};
  try {
    const res = await fetch(cg, { cache: "no-store", headers: { "accept": "application/json" } });
    if (!res.ok) return json({ ok: false, error: "coingecko " + res.status }, 502);
    data = await res.json();
  } catch (e) { return json({ ok: false, error: "fetch failed " + (e as Error).message }, 502); }

  // 2) Build rows for the prices table (symbol, mid, spr_pts).
  const rows: { symbol: string; mid: number; spr_pts: number }[] = [];
  for (const sym of Object.keys(IDS)) {
    const id = IDS[sym];
    const p = data[id] && typeof data[id].usd === "number" ? data[id].usd : 0;
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
