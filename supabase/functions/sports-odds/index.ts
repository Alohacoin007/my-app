// Alpexa — sports-odds
// Polls The Odds API for each league and stores the raw odds in the shared
// `sports_odds` table (sport → jsonb). The sports app reads that table, so the
// paid Odds API key NEVER touches the client and there's no per-client quota
// burn. Also reports the account quota to `api_usage` for the back office.
//
// Trigger on a schedule (every ~5–10 min for pre-match) via pg_cron.
//
// Required env (Edge Function secrets):
//   ODDS_API_KEY     your The Odds API key (paid plan)
//   SUPABASE_URL     (auto)
//   one of SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (auto; RLS is open)
// Optional: CRON_SECRET (require ?token=… to stop public abuse)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Default leagues to poll. ?sport=americanfootball_nfl polls just one.
const SPORTS = [
  "americanfootball_nfl", "basketball_nba", "baseball_mlb", "icehockey_nhl",
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

  const KEY = Deno.env.get("ODDS_API_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!KEY) return json({ ok: false, error: "ODDS_API_KEY not set" }, 500);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);

  const only = url.searchParams.get("sport");
  const list = only ? [only] : SPORTS;
  const out: any[] = [];
  let remaining: string | null = null, usedH: string | null = null;

  for (const sp of list) {
    try {
      const oddsUrl =
        `https://api.the-odds-api.com/v4/sports/${sp}/odds/?apiKey=${KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
      const r = await fetch(oddsUrl);
      remaining = r.headers.get("x-requests-remaining") ?? remaining;
      usedH = r.headers.get("x-requests-used") ?? usedH;
      if (!r.ok) { out.push({ sport: sp, error: r.status }); continue; }
      const data = await r.json();
      // Upsert the raw odds blob (the app already knows how to parse this shape).
      await fetch(`${SB_URL}/rest/v1/sports_odds?on_conflict=sport`, {
        method: "POST",
        headers: {
          "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ sport: sp, data, updated_at: new Date().toISOString() }),
      });
      out.push({ sport: sp, events: Array.isArray(data) ? data.length : 0 });
    } catch (e) {
      out.push({ sport: sp, error: String(e) });
    }
  }

  // Report the account-wide quota to the back office.
  if (remaining != null) {
    try {
      await fetch(`${SB_URL}/rest/v1/api_usage?on_conflict=provider`, {
        method: "POST",
        headers: {
          "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          provider: "odds_api",
          remaining: Math.round(+remaining),
          used: Math.round(+(usedH || 0)),
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (_e) { /* ignore */ }
  }

  return json({ ok: true, polled: out, remaining });
});
