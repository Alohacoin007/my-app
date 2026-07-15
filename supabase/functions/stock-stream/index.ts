// Alpexa — stock-stream (stage 3: break the 1-minute stock ceiling)
// Holds the Finnhub WEBSOCKET (free tier includes real-time US trades) for ~50s per
// invocation and upserts each traded symbol's last price into the shared `prices` table
// as it arrives (throttled to ≥1s per symbol). Clients already receive `prices` via
// Supabase Realtime push, so stocks go near-real-time END TO END while the FINNHUB_KEY
// stays in the function env — never in any client (a public HTML key = quota theft =
// dead feed for everyone).
//
// Trigger every minute via pg_cron (see feed_speed_tune.sql §5) — back-to-back runs give
// continuous coverage; overlapping runs are harmless (idempotent merge upserts of the
// same last price). Off-hours Finnhub simply sends no trades → the run writes nothing.
// stock-prices-1m (REST snapshot) stays as the fallback + ALPXS writer: if this socket
// is down, stocks degrade to exactly the pre-stage-3 one-minute feed.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Same universe as stock-prices (SPACEX trades as SPCX; stored under the app symbol).
const STOCKS = [
  "AAPL","TSLA","NVDA","MSFT","GOOGL","META","AMZN","NFLX","AMD","JPM",
  "IONQ","RGTI","QBTS","QUBT","ARQQ","TSM","INTC","QCOM","AVGO","ASML",
  "MU","TXN","AMAT","LRCX","KLAC","PLTR","SMCI","ANET","CRWD","ARM",
  "ORCL","NOW","CRM","SNOW","ADBE","SPACEX",
];
const FINNHUB_TICKER: Record<string, string> = { SPACEX: "SPCX" };
const APP_SYMBOL: Record<string, string> = {};   // reverse map (real ticker → app symbol)
for (const s of STOCKS) APP_SYMBOL[FINNHUB_TICKER[s] || s] = s;

const HOLD_MS = 50_000;        // socket hold per invocation (cron re-invokes every minute)
const PER_SYMBOL_MS = 1_000;   // min gap between DB writes for one symbol

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  // FAIL-CLOSED: no CRON_SECRET → 503; with it, require ?token= (matches stock-prices).
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  const KEY = Deno.env.get("FINNHUB_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!KEY) return json({ ok: false, error: "FINNHUB_KEY not set" }, 500);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);

  const lastWrite: Record<string, number> = {};
  let wrote = 0, frames = 0;

  const upsert = async (rows: { symbol: string; mid: number; spr_pts: number }[]) => {
    const up = await fetch(`${SB_URL}/rest/v1/prices?on_conflict=symbol`, {
      method: "POST",
      headers: {
        "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (up.ok) wrote += rows.length;
  };

  await new Promise<void>((resolve) => {
    let ws: WebSocket | null = null;
    const done = () => { try { ws?.close(); } catch (_e) { /* closed */ } resolve(); };
    const timer = setTimeout(done, HOLD_MS);
    try {
      ws = new WebSocket(`wss://ws.finnhub.io?token=${KEY}`);
      ws.onopen = () => {
        for (const s of STOCKS) ws!.send(JSON.stringify({ type: "subscribe", symbol: FINNHUB_TICKER[s] || s }));
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(String(ev.data));
          if (m.type !== "trade" || !Array.isArray(m.data)) return;
          frames++;
          const now = Date.now();
          const rows: { symbol: string; mid: number; spr_pts: number }[] = [];
          for (const t of m.data) {
            const sym = APP_SYMBOL[t.s]; const px = +t.p || 0;
            if (!sym || px <= 0) continue;
            if (lastWrite[sym] && now - lastWrite[sym] < PER_SYMBOL_MS) continue;
            lastWrite[sym] = now;
            rows.push({ symbol: sym, mid: Math.round(px * 100) / 100, spr_pts: 0 });
          }
          if (rows.length) upsert(rows);
        } catch (_e) { /* junk frame */ }
      };
      ws.onerror = () => { clearTimeout(timer); done(); };
      ws.onclose = () => { clearTimeout(timer); resolve(); };
    } catch (_e) { clearTimeout(timer); resolve(); }
  });

  return json({ ok: true, frames, wrote });
});
