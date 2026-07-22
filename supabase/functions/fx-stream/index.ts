// Alpexa — fx-stream (stage 3: sub-second FX, zero new cost)
// The paid Polygon Currencies plan already includes the REAL-TIME forex websocket —
// this pump holds it for ~50s per invocation and upserts each quote into the shared
// `prices` table (throttled to ≥1s per symbol). Clients already receive `prices` via
// Supabase Realtime push, so FX goes sub-second END TO END while POLYGON_KEY stays in
// the function env — never in any client. Same pattern as stock-stream.
//
// UNIT LOCKSTEP (do not change): spr_pts for FX is written in INTEGER PIPS —
// Math.round((ask−bid)/pip) — exactly like the fx-prices Edge, because fx_close.sql
// and the clients' halfPx read FX spr_pts as pips. A different unit here = the
// 2026-07-13 spread-mixup bug all over again (결함-로그.md).
//
// Trigger every minute via pg_cron (feed_speed_tune.sql §6). fx-prices-5s (REST
// snapshot, currently 3s) stays as the fallback: if this socket is down, FX degrades
// to exactly the pre-stage-3 3-second feed. Weekend: Polygon sends no quotes → no writes.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Same universe as fx-prices (app symbol → Polygon C.<FROM>/<TO> quote channel).
const WANT = [
  "EURUSD","GBPUSD","USDJPY","AUDUSD","USDCHF","USDCAD","NZDUSD",
  "EURJPY","EURGBP","GBPJPY","EURAUD","AUDJPY","CHFJPY","EURCHF",
  "USDKRW","USDCNH","USDSGD","USDMXN","XAUUSD","XAGUSD",
];
const chan = (sym: string) => `C.${sym.slice(0, 3)}/${sym.slice(3)}`;
const APP_SYMBOL: Record<string, string> = {};   // "EUR/USD" → "EURUSD"
for (const s of WANT) APP_SYMBOL[`${s.slice(0, 3)}/${s.slice(3)}`] = s;

// Pip size — MUST mirror fx-prices pip() (it produced every FX spr_pts row so far).
function pip(sym: string): number {
  if (sym.endsWith("JPY")) return 0.01;
  if (sym === "XAUUSD") return 0.01;
  if (sym === "XAGUSD") return 0.001;
  return 0.0001;
}

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
  // FAIL-CLOSED: no CRON_SECRET → 503; with it, require ?token= (matches stock-stream).
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  const KEY = Deno.env.get("POLYGON_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!KEY) return json({ ok: false, error: "POLYGON_KEY not set" }, 500);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);

  const lastWrite: Record<string, number> = {};
  // 스파이크 워터마크(v1): 1s 스로틀로 버려지던 프레임들의 mid 고저를 누적 → 다음 기록에 포함 후 리셋.
  const wmHi: Record<string, number> = {}, wmLo: Record<string, number> = {};
  let wrote = 0, frames = 0, authErr = "";

  // 초단위 스위프 (2026-07-20 "청산은 초단위로" + 2026-07-22 대기주문 M4.5) — 가격을 쓴 직후
  // fx_sweep_all(SL/TP + 대기주문 매칭)을 돌린다. 1s 스로틀. 실패해도 무해 — 1분 pg_cron 폴백.
  let lastSweep = 0;
  const sweep = async () => {
    const now = Date.now();
    if (now - lastSweep < 1_000) return;
    lastSweep = now;
    try {
      await fetch(`${SB_URL}/rest/v1/rpc/fx_sweep_all`, {
        method: "POST",
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
        body: "{}",
      });
    } catch (_e) { /* cron fallback */ }
  };

  const upsert = async (rows: { symbol: string; mid: number; spr_pts: number; tick_hi?: number; tick_lo?: number }[]) => {
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
      ws = new WebSocket("wss://socket.polygon.io/forex");
      ws.onopen = () => ws!.send(JSON.stringify({ action: "auth", params: KEY }));
      ws.onmessage = (ev) => {
        try {
          const msgs = JSON.parse(String(ev.data));
          for (const m of Array.isArray(msgs) ? msgs : [msgs]) {
            if (m.ev === "status") {
              if (m.status === "auth_success") ws!.send(JSON.stringify({ action: "subscribe", params: WANT.map(chan).join(",") }));
              if (m.status === "auth_failed") { authErr = m.message || "auth_failed"; clearTimeout(timer); done(); }
              continue;
            }
            if (m.ev !== "C" || !m.p) continue;   // C = currency quote: {p:"EUR/USD", b:bid, a:ask}
            frames++;
            const sym = APP_SYMBOL[m.p]; const b = +m.b, a = +m.a;
            if (!sym || !(b > 0 && a > 0)) continue;
            const now = Date.now();
            const midRaw = Math.round(((a + b) / 2) * 1e6) / 1e6;
            wmHi[sym] = wmHi[sym] == null ? midRaw : Math.max(wmHi[sym], midRaw);   // 워터마크 누적(스킵 프레임 포함)
            wmLo[sym] = wmLo[sym] == null ? midRaw : Math.min(wmLo[sym], midRaw);
            if (lastWrite[sym] && now - lastWrite[sym] < PER_SYMBOL_MS) continue;
            lastWrite[sym] = now;
            const mid = midRaw;
            // PIPS at 0.1 precision (unit unchanged — fx_close reads pips). Never round a real spread to 0.
            const spr = Math.max(0, Math.round((a - b) / pip(sym) * 10) / 10);
            upsert([{ symbol: sym, mid, spr_pts: spr, tick_hi: wmHi[sym], tick_lo: wmLo[sym] } as any]);
            delete wmHi[sym]; delete wmLo[sym];   // 창 하나짜리 — 기록 후 리셋(유령 발동 금지)
            sweep();   // 새 가격 반영 직후 SL/TP 검사 (1s 스로틀)
          }
        } catch (_e) { /* junk frame */ }
      };
      ws.onerror = () => { clearTimeout(timer); done(); };
      ws.onclose = () => { clearTimeout(timer); resolve(); };
    } catch (_e) { clearTimeout(timer); resolve(); }
  });

  if (authErr) return json({ ok: false, error: "polygon ws: " + authErr + " (plan tier without WS? cron fallback keeps FX at 3s)" }, 502);
  return json({ ok: true, frames, wrote });
});
