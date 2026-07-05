// Alpexa — sports-odds (SMART POLLING)
// Polls The Odds API for each league and stores the raw odds in the shared
// `sports_odds` table (sport → jsonb). The sports app reads that table, so the
// paid Odds API key NEVER touches the client and there's no per-client quota burn.
// Also reports the account quota to `api_usage` for the back office.
//
// SMART POLLING (keeps credits low on the $59 / 100K plan):
//   • Run this on a 1-minute pg_cron.
//   • Each run checks ESPN (FREE, no key) for which leagues have an IN-PROGRESS
//     game right now.
//   • A league is polled from the paid Odds API only when EITHER:
//       - it has a live game now (→ fresh odds every ~1 min for in-play betting), OR
//       - its stored odds are stale (>~9 min old → normal pre-match refresh).
//   • Idle, fresh leagues are skipped → 0 credits. So credits scale with how many
//     games are actually live, not with the cron frequency.
//   • ?sport=<key> polls just that league (always). ?force=1 polls all (always).
//
// Required env (Edge Function secrets):
//   ODDS_API_KEY  your The Odds API key (paid plan)
//   SUPABASE_URL  (auto) + SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (auto)
// Optional: CRON_SECRET (require ?token=… to stop public abuse)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Leagues to poll, with the matching ESPN scoreboard path used to detect live games.
const SPORTS = [
  "americanfootball_nfl", "basketball_nba", "baseball_mlb", "icehockey_nhl",
];
const ESPN_PATH: Record<string, string> = {
  americanfootball_nfl: "football/nfl",
  basketball_nba: "basketball/nba",
  baseball_mlb: "baseball/mlb",
  icehockey_nhl: "hockey/nhl",
};
const STALE_MS = 9 * 60 * 1000; // refresh an idle league's odds ~every 10 min

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Which leagues have an in-progress game right now (ESPN, free, no key).
async function liveSports(keys: string[]): Promise<Set<string>> {
  const live = new Set<string>();
  await Promise.all(keys.map(async (sp) => {
    const path = ESPN_PATH[sp]; if (!path) return;
    const direct = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
    const tries = [direct, "https://corsproxy.io/?url=" + encodeURIComponent(direct)];
    for (const u of tries) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (!r.ok) continue;
        const d = await r.json();
        const anyLive = (d.events || []).some((ev: any) => {
          const st = ev?.status?.type?.state || ev?.competitions?.[0]?.status?.type?.state;
          return st === "in";
        });
        if (anyLive) live.add(sp);
        return;
      } catch (_e) { /* try next mirror */ }
    }
  }));
  return live;
}

// When each league's stored odds were last refreshed (epoch ms).
async function lastUpdated(SB_URL: string, SB_KEY: string): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  try {
    const r = await fetch(`${SB_URL}/rest/v1/sports_odds?select=sport,updated_at`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
    });
    if (r.ok) {
      const rows = await r.json();
      (rows || []).forEach((x: any) => { map[x.sport] = x.updated_at ? new Date(x.updated_at).getTime() : 0; });
    }
  } catch (_e) { /* ignore */ }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  // FAIL-CLOSED: no CRON_SECRET → 503 (a misconfig is loud, not silently world-callable).
  // With the secret set, require ?token=<CRON_SECRET>. Matches sports-settle/stake-accrue.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const KEY = Deno.env.get("ODDS_API_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!KEY) return json({ ok: false, error: "ODDS_API_KEY not set" }, 500);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);

  const only = url.searchParams.get("sport");
  const force = url.searchParams.get("force") === "1";
  const candidates = only ? [only] : SPORTS;

  // Decide which leagues to actually spend Odds API credits on this run.
  const now = Date.now();
  const live = (only || force) ? new Set(candidates) : await liveSports(candidates);
  const updated = (only || force) ? {} : await lastUpdated(SB_URL, SB_KEY);
  const toPoll = candidates.filter((sp) =>
    only || force || live.has(sp) || (now - (updated[sp] || 0) >= STALE_MS)
  );
  const skipped = candidates.filter((sp) => !toPoll.includes(sp));

  const out: any[] = [];
  let remaining: string | null = null, usedH: string | null = null;

  for (const sp of toPoll) {
    try {
      const oddsUrl =
        `https://api.the-odds-api.com/v4/sports/${sp}/odds/?apiKey=${KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
      const r = await fetch(oddsUrl);
      remaining = r.headers.get("x-requests-remaining") ?? remaining;
      usedH = r.headers.get("x-requests-used") ?? usedH;
      if (!r.ok) { out.push({ sport: sp, error: r.status }); continue; }
      const data = await r.json();
      await fetch(`${SB_URL}/rest/v1/sports_odds?on_conflict=sport`, {
        method: "POST",
        headers: {
          "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ sport: sp, data, updated_at: new Date().toISOString() }),
      });
      out.push({ sport: sp, events: Array.isArray(data) ? data.length : 0, live: live.has(sp) });
    } catch (e) {
      out.push({ sport: sp, error: String(e) });
    }
  }

  // Report the account-wide quota to the back office (only if we actually called).
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

  return json({ ok: true, live: [...live], polled: out, skipped, remaining });
});
