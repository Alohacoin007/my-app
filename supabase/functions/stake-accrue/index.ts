// Alpexa — stake-accrue (DAILY staking interest, COMPOUNDED)
// Runs once a day via pg_cron. For every crypto_stakes row it credits the elapsed
// full days of interest (principal × APY ÷ 365 × days), COMPOUNDS it into the stake
// principal (usd), advances `since` past the credited days, and writes a
// "Staking reward" row to the `activity` log so it appears in the customer's history
// (the crypto app already merges server activity into its history).
//
// Compounding + the `since` advance keep this in sync with the app's live display:
// the app shows usd (now grown) + only the sub-day pending accrual, so there is no
// double-count. Re-running the same day is a no-op (days < 1).
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto). Optional CRON_SECRET.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// MUST mirror the app's STAKE_RATES / stakePeriodApy.
const RATES: Record<string, Record<string, number>> = {
  ALPXS: { flexible: 7, "90d": 10, "1y": 18 },
  SOL:   { flexible: 5, "90d": 6,  "1y": 7  },
  USDT:  { flexible: 3, "90d": 6,  "1y": 9  },
  ETH:   { flexible: 3, "90d": 4,  "1y": 5  },
};
const RATE_DEFAULT: Record<string, number> = { flexible: 5, "90d": 7, "1y": 9 };
function apyFor(sym: string, period: string): number {
  const r = RATES[sym] || RATE_DEFAULT;
  if (r[period] != null) return r[period];
  return period === "1y" ? 18 : period === "90d" ? 10 : 7;
}
const DAY = 86400000;
const r8 = (n: number) => Math.round(n * 1e8) / 1e8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  // B8 CLOSED — FAIL-CLOSED. No CRON_SECRET → 503 (a misconfig is loud, not silently
  // world-callable). With the secret set, require ?token=<CRON_SECRET> (cron_secure.sql).
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  // 1) Stakes + an acct_no -> cust_id map (for the history record).
  const stakes = await (await fetch(`${SB_URL}/rest/v1/crypto_stakes?select=acct_no,asset,usd,period,since`, { headers: H })).json();
  const accs   = await (await fetch(`${SB_URL}/rest/v1/accounts?server=eq.crypto&select=acct_no,player_id`, { headers: H })).json();
  const players= await (await fetch(`${SB_URL}/rest/v1/players?select=id,cust_id`, { headers: H })).json();
  const pid2cust: Record<string, string> = {}; (players || []).forEach((p: any) => { pid2cust[p.id] = p.cust_id; });
  const acct2cust: Record<string, string> = {}; (accs || []).forEach((a: any) => { acct2cust[a.acct_no] = pid2cust[a.player_id]; });

  const now = Date.now();
  const out: any[] = [];
  for (const s of (stakes || [])) {
    try {
      const usd = +s.usd || 0, since = +s.since || 0;
      if (usd <= 0.005 || since <= 0) continue;
      const days = Math.floor((now - since) / DAY);
      if (days < 1) continue; // less than a full day since last accrual
      const apy = apyFor(s.asset, s.period || "flexible");
      const interest = r8(usd * (apy / 100) * days / 365);
      if (interest <= 0) continue;
      const newUsd = r8(usd + interest);            // COMPOUND into the stake
      const newSince = since + days * DAY;          // advance past the credited days

      await fetch(`${SB_URL}/rest/v1/crypto_stakes?acct_no=eq.${encodeURIComponent(s.acct_no)}&asset=eq.${encodeURIComponent(s.asset)}`, {
        method: "PATCH", headers: { ...H, "Prefer": "return=minimal" },
        body: JSON.stringify({ usd: newUsd, since: newSince, updated_at: new Date().toISOString() }),
      });

      const cust = acct2cust[s.acct_no];
      if (cust) {
        await fetch(`${SB_URL}/rest/v1/activity`, {
          method: "POST", headers: { ...H, "Prefer": "return=minimal" },
          body: JSON.stringify({
            cust_id: cust, server: "crypto", kind: "reward", symbol: s.asset,
            amount: Math.round(interest * 100) / 100, detail: "Staking reward",
            ticket: "stkrwd-" + s.acct_no + "-" + s.asset + "-" + new Date(newSince).toISOString().slice(0, 10),
          }),
        });
      }
      out.push({ acct: s.acct_no, asset: s.asset, period: s.period, days, apy, interest, newUsd });
    } catch (e) { out.push({ acct: s.acct_no, error: String(e) }); }
  }
  return json({ ok: true, stakes: (stakes || []).length, accrued: out.length, detail: out });
});
