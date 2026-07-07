// Alpexa — price-monitor (REAL-TIME crypto price integrity alert)
// Run on a ~1-minute pg_cron. Two independent failure modes are caught BEFORE they cost
// money, and the owner is EMAILED immediately (deduped so a lingering issue isn't spammed):
//   1) STALE — a 24/7 crypto major in `prices` hasn't updated in >STALE_S (feed stopped;
//      the crypto_trade / fx_open RPCs already reject at 120s, but we alert sooner so it's
//      fixed before that).
//   2) DIVERGENT — our `prices.mid` disagrees with an INDEPENDENT source (CoinGecko) by
//      >DIVERGE_PCT. Freshness alone can't catch a "fresh but WRONG" feed (bad mirror data),
//      and a wrong price is what actually drains money — this is the guard for it.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), RESEND_API_KEY (same as statements),
//      optional ALERT_EMAIL (default owner), ALERT_FROM, CRON_SECRET.
// Requires the price_alerts table — see supabase/sql/price_alerts.sql.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }

const STALE_S = 90;        // a 24/7 crypto major older than this = feed stalled
const DIVERGE_PCT = 2.5;   // our price vs CoinGecko off by more than this = wrong feed
const RENOTIFY_MIN = 20;   // don't re-email the same problem more often than this

// crypto major → CoinGecko id (independent reference). Keep in sync with crypto-price.
const REF: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", BNB: "binancecoin",
  DOGE: "dogecoin", ADA: "cardano", AVAX: "avalanche-2", LINK: "chainlink", DOT: "polkadot",
};

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

  // 1) our prices
  const pr = await fetch(`${SB_URL}/rest/v1/prices?select=symbol,mid,updated_at`, { headers: H });
  if (!pr.ok) return json({ ok: false, error: "prices read " + pr.status }, 500);
  const rows: any[] = await pr.json();
  const bySym: Record<string, any> = {}; rows.forEach((r) => { bySym[r.symbol] = r; });
  const now = Date.now();
  const ageS = (r: any) => r && r.updated_at ? (now - new Date(r.updated_at).getTime()) / 1000 : Infinity;

  const problems: string[] = [];

  // 2) staleness of the 24/7 majors
  for (const m of Object.keys(REF)) {
    const r = bySym[m];
    if (!r) { problems.push(`${m}: prices에 없음`); continue; }
    if (ageS(r) > STALE_S) problems.push(`${m}: ${Math.round(ageS(r))}s 째 미갱신 (피드 멈춤?)`);
    if (!(+r.mid > 0)) problems.push(`${m}: 시세 0/음수 (${r.mid})`);
  }

  // 3) divergence vs CoinGecko (independent). Skip a symbol if we couldn't fetch its ref.
  try {
    const ids = Array.from(new Set(Object.values(REF))).join(",");
    const cg = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { headers: { accept: "application/json" } });
    if (cg.ok) {
      const data = await cg.json();
      for (const m of Object.keys(REF)) {
        const r = bySym[m]; const ref = data[REF[m]] && +data[REF[m]].usd;
        if (!r || !(+r.mid > 0) || !(ref > 0)) continue;
        const diff = Math.abs((+r.mid - ref) / ref) * 100;
        if (diff > DIVERGE_PCT) problems.push(`${m}: 우리 $${(+r.mid).toFixed(2)} vs CoinGecko $${ref.toFixed(2)} = ${diff.toFixed(1)}% 오차`);
      }
    }
  } catch (_e) { /* CoinGecko down → staleness check still stands */ }

  const sig = problems.slice().sort().join(" | ");
  if (!problems.length) return json({ ok: true, healthy: true, checked: Object.keys(REF).length });

  // 4) dedup — only email if this is a NEW problem set, or it's been >RENOTIFY_MIN.
  let shouldEmail = true;
  try {
    const last = await (await fetch(`${SB_URL}/rest/v1/price_alerts?select=sig,created_at&order=created_at.desc&limit=1`, { headers: H })).json();
    if (Array.isArray(last) && last[0] && last[0].sig === sig) {
      const mins = (now - new Date(last[0].created_at).getTime()) / 60000;
      if (mins < RENOTIFY_MIN) shouldEmail = false;
    }
  } catch (_e) { /* if the state read fails, err on the side of alerting */ }

  if (shouldEmail) {
    // record it (also the dedup state)
    await fetch(`${SB_URL}/rest/v1/price_alerts`, { method: "POST", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify({ sig, detail: problems.join("\n") }) }).catch(() => {});
    // email the owner
    const KEY = Deno.env.get("RESEND_API_KEY");
    const TO = Deno.env.get("ALERT_EMAIL") || "zbnyme@gmail.com";
    const FROM = Deno.env.get("ALERT_FROM") || "Alpexa Alerts <alerts@alpexa-sports.com>";
    if (KEY) {
      const html = `<h2>🔴 Alpexa price feed alert</h2><p>${problems.length} issue(s) — the crypto price feed is stale or divergent. Trades reject at 120s stale, but check the feed now.</p><ul>${problems.map((p) => `<li>${p}</li>`).join("")}</ul><p style="color:#888;font-size:12px">price-monitor · ${new Date().toISOString()}</p>`;
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to: [TO], subject: `🔴 Alpexa price feed: ${problems.length} issue(s)`, html }) }).catch(() => {});
    }
  }

  return json({ ok: true, healthy: false, emailed: shouldEmail, problems });
});
