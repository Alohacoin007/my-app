// Alpexa — sparkline-cache
// Server-side cache of ~48-point mini-chart series for the markets watchlist, so the
// client shows real sparklines INSTANTLY (reads one cached row) instead of accumulating
// live ticks over minutes. Sources (both free, no per-user cost):
//   • Crypto → Binance public data mirror klines (BTCUSDT 15m).
//   • FX + Stocks → Yahoo Finance chart API (EURUSD=X / AAPL, 1d @ 15m).
// The SERVER fetches once per cron cycle (fixed count, independent of user count) and
// stores { symbol: [close,…] } in sparklines.id='all'. Clients only READ that row, so
// no user ever hits a provider rate limit.
//
// Run on pg_cron every ~10–15 min. Required env (auto): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Optional CRON_SECRET (fail-closed, ?token=).
// Requires the sparklines table — see supabase/sql/sparklines.sql.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }

const N = 48;                 // points kept per sparkline
const CONCURRENCY = 8;        // parallel fetches

// symbol → Binance USDT pair (crypto). Mirrors crypto-price PAIRS.
const CRYPTO: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT", BNB: "BNBUSDT",
  DOGE: "DOGEUSDT", ADA: "ADAUSDT", AVAX: "AVAXUSDT", LINK: "LINKUSDT", DOT: "DOTUSDT",
  MATIC: "POLUSDT", TRX: "TRXUSDT", NEAR: "NEARUSDT", APT: "APTUSDT", ATOM: "ATOMUSDT",
  UNI: "UNIUSDT", AAVE: "AAVEUSDT", SHIB: "SHIBUSDT", PEPE: "PEPEUSDT", FET: "FETUSDT",
};
// symbol → Yahoo Finance ticker (FX pairs use the =X suffix; stocks are the raw ticker).
const YAHOO: Record<string, string> = {
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "USDJPY=X", AUDUSD: "AUDUSD=X",
  USDCHF: "USDCHF=X", USDCAD: "USDCAD=X", NZDUSD: "NZDUSD=X", EURJPY: "EURJPY=X",
  EURGBP: "EURGBP=X", GBPJPY: "GBPJPY=X", EURAUD: "EURAUD=X", AUDJPY: "AUDJPY=X",
  CHFJPY: "CHFJPY=X", EURCHF: "EURCHF=X", USDKRW: "USDKRW=X", USDCNH: "USDCNH=X",
  USDSGD: "USDSGD=X", USDMXN: "USDMXN=X", XAUUSD: "GC=F", XAGUSD: "SI=F",
  AAPL: "AAPL", MSFT: "MSFT", NVDA: "NVDA", AMZN: "AMZN", GOOGL: "GOOGL", META: "META",
  TSLA: "TSLA", NFLX: "NFLX", AMD: "AMD", JPM: "JPM", TSM: "TSM", INTC: "INTC",
  QCOM: "QCOM", AVGO: "AVGO", MU: "MU", PLTR: "PLTR", ARM: "ARM", ORCL: "ORCL",
  CRM: "CRM", ADBE: "ADBE",
};

// Markets-overview strip (landing): tab -> [name, Yahoo symbol]. Cached as row id='strip'
// with each instrument's { n, v (value), prev (prior close), spark } so the landing reads
// ONE row and never touches a provider itself.
const STRIP: Record<string, [string, string][]> = {
  US: [["Dow Jones", "^DJI"], ["S&P 500", "^GSPC"], ["Nasdaq", "^IXIC"], ["Russell 2000", "^RUT"], ["VIX", "^VIX"]],
  Europe: [["FTSE 100", "^FTSE"], ["DAX", "^GDAXI"], ["CAC 40", "^FCHI"], ["Euro STOXX 50", "^STOXX50E"], ["IBEX 35", "^IBEX"]],
  Asia: [["Nikkei 225", "^N225"], ["Hang Seng", "^HSI"], ["Shanghai", "000001.SS"], ["KOSPI", "^KS11"], ["ASX 200", "^AXJO"]],
  Currencies: [["EUR/USD", "EURUSD=X"], ["USD/JPY", "USDJPY=X"], ["GBP/USD", "GBPUSD=X"], ["AUD/USD", "AUDUSD=X"], ["US Dollar", "DX-Y.NYB"]],
  Crypto: [["Bitcoin", "BTC-USD"], ["Ethereum", "ETH-USD"], ["Solana", "SOL-USD"], ["XRP", "XRP-USD"], ["BNB", "BNB-USD"]],
};

// even-sample an array down to at most N points (keeps first & last).
function downsample(a: number[], n = N): number[] {
  const clean = a.filter((x) => typeof x === "number" && isFinite(x) && x > 0);
  if (clean.length <= n) return clean.map((x) => Math.round(x * 1e6) / 1e6);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(clean[Math.round((i / (n - 1)) * (clean.length - 1))]);
  return out.map((x) => Math.round(x * 1e6) / 1e6);
}

async function fromBinance(sym: string): Promise<number[] | null> {
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${CRYPTO[sym]}&interval=15m&limit=${N}`, { cache: "no-store" });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    return downsample(rows.map((k: any) => +k[4])); // close = index 4
  } catch { return null; }
}

async function fromYahoo(sym: string): Promise<number[] | null> {
  try {
    const t = encodeURIComponent(YAHOO[sym]);
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1d&interval=15m`, {
      cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", "accept": "application/json" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const q = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(q)) return null;
    return downsample(q.map((x: any) => +x));
  } catch { return null; }
}

// Yahoo chart → { v (latest price), prev (prior close), spark } for the overview strip.
async function yahooFull(ysym: string): Promise<{ v: number; prev: number; spark: number[] } | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1d&interval=15m`, {
      cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", "accept": "application/json" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const meta = res?.meta;
    const closes = res?.indicators?.quote?.[0]?.close;
    if (!meta || !Array.isArray(closes)) return null;
    const v = +meta.regularMarketPrice;
    const prev = +(meta.chartPreviousClose ?? meta.previousClose);
    if (!(v > 0)) return null;
    return { v: Math.round(v * 1e6) / 1e6, prev: prev > 0 ? Math.round(prev * 1e6) / 1e6 : v, spark: downsample(closes.map((x: any) => +x)) };
  } catch { return null; }
}

async function runPool<T>(items: T[], worker: (t: T) => Promise<void>, cap = CONCURRENCY) {
  let i = 0;
  const runners = Array.from({ length: Math.min(cap, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  });
  await Promise.all(runners);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  const out: Record<string, number[]> = {};
  let okN = 0;

  // crypto (Binance) + fx/stocks (Yahoo), pooled so the whole run stays well under the
  // Edge time budget while never bursting a provider.
  await runPool(Object.keys(CRYPTO), async (sym) => { const s = await fromBinance(sym); if (s && s.length >= 2) { out[sym] = s; okN++; } });
  await runPool(Object.keys(YAHOO), async (sym) => { const s = await fromYahoo(sym); if (s && s.length >= 2) { out[sym] = s; okN++; } });

  if (!okN) return json({ ok: false, error: "no series fetched" }, 502);

  // Markets-overview strip (value + prior close + sparkline per instrument, per tab).
  const strip: Record<string, any[]> = {};
  let stripN = 0;
  for (const tab of Object.keys(STRIP)) {
    const rows = await Promise.all(STRIP[tab].map(async ([nm, ysym]) => {
      const f = await yahooFull(ysym);
      return f ? { n: nm, v: f.v, prev: f.prev, spark: f.spark } : null;
    }));
    strip[tab] = rows.filter(Boolean);
    stripN += strip[tab].length;
  }

  const now = new Date().toISOString();
  const rows = [{ id: "all", data: out, updated_at: now }, { id: "strip", data: strip, updated_at: now }];
  const r = await fetch(`${SB_URL}/rest/v1/sparklines?on_conflict=id`, {
    method: "POST",
    headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) return json({ ok: false, error: "store " + r.status + " " + (await r.text()) }, 500);
  return json({ ok: true, symbols: okN, strip: stripN });
});
