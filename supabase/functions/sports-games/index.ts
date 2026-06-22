// Alpexa — sports-games
// SERVER-SIDE game + odds feed for ALL clients (mobile app + desktop website).
// Fetches ESPN scoreboards (FREE, no key) for each league, builds games in the
// app's GAMES format with gid = "<LG>_<espnEventId>" so the server settler
// (sports-settle) recognises bets placed against them, and stores everything in
// the `live_games` table (single row id='all'). Clients just READ this row — one
// source of truth, no per-client ESPN calls. Run on a ~1-minute pg_cron.
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

// Mirrors the app's LEAGUES + the settler's leagues so gids line up everywhere.
const LEAGUES = [
  { lg: "NFL", sport: "Football",   path: "football/nfl" },
  { lg: "NBA", sport: "Basketball", path: "basketball/nba" },
  { lg: "MLB", sport: "Baseball",   path: "baseball/mlb" },
  { lg: "NHL", sport: "Hockey",     path: "hockey/nhl" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/eng.1" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/uefa.champions" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/usa.1" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/fifa.world" },
];

// Build spread/total/ml in the app's leg format ({ln,am,sel}) from ESPN odds,
// with sensible defaults when a market is missing. am = American odds; sel is the
// exact selection string the settler's gradeLeg parses ("Team ML", "Over 45.5"...).
function mkCore(home: any, away: any, ev: any, lg: string) {
  const isSoc = lg === "SOC";
  let total: number | null = null, spreadVal: number | null = null, favAbbr: string | null = null, mlHome: number | null = null, mlAway: number | null = null;
  try {
    const comp = ev.competitions && ev.competitions[0];
    const od = comp && comp.odds && comp.odds[0];
    if (od) {
      if (typeof od.overUnder === "number") total = od.overUnder;
      if (typeof od.spread === "number") spreadVal = Math.abs(od.spread);
      if (od.details) {
        const parts = String(od.details).trim().split(/\s+/); favAbbr = parts[0];
        const m = String(od.details).match(/(-?\d+(?:\.\d+)?)\s*$/); if (m) spreadVal = Math.abs(parseFloat(m[1]));
      }
      if (od.homeTeamOdds && typeof od.homeTeamOdds.moneyLine === "number") mlHome = od.homeTeamOdds.moneyLine;
      if (od.awayTeamOdds && typeof od.awayTeamOdds.moneyLine === "number") mlAway = od.awayTeamOdds.moneyLine;
    }
  } catch (_e) { /* defaults below */ }
  const sp = (spreadVal != null && spreadVal > 0) ? spreadVal : (isSoc ? 0.5 : 3.5);
  const tot = (total != null && total > 0) ? total : (isSoc ? 2.5 : 45.5);
  const homeFav = favAbbr ? (home.ab === favAbbr) : true;
  const spread = homeFav
    ? [{ ln: "-" + sp, am: -110, sel: home.nm + " -" + sp }, { ln: "+" + sp, am: -110, sel: away.nm + " +" + sp }]
    : [{ ln: "+" + sp, am: -110, sel: home.nm + " +" + sp }, { ln: "-" + sp, am: -110, sel: away.nm + " -" + sp }];
  const total2 = [{ ln: "Over " + tot, am: -110, sel: "Over " + tot }, { ln: "Under " + tot, am: -110, sel: "Under " + tot }];
  const ml = [
    { ln: "", am: (mlHome != null ? mlHome : (homeFav ? -140 : 120)), sel: home.nm + " ML" },
    { ln: "", am: (mlAway != null ? mlAway : (homeFav ? 120 : -140)), sel: away.nm + " ML" },
  ];
  return { spread, total: total2, ml };
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }); }
  catch (_e) { return ""; }
}

async function fetchLeague(L: { lg: string; sport: string; path: string }, out: any[]) {
  const direct = `https://site.api.espn.com/apis/site/v2/sports/${L.path}/scoreboard`;
  const tries = [direct, "https://corsproxy.io/?url=" + encodeURIComponent(direct)];
  for (const u of tries) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) continue;
      const d = await res.json();
      for (const ev of (d.events || [])) {
        try {
          const comp = ev.competitions && ev.competitions[0];
          if (!comp || !comp.competitors) continue;
          const hc = comp.competitors.find((c: any) => c.homeAway === "home");
          const ac = comp.competitors.find((c: any) => c.homeAway === "away");
          if (!hc || !ac || !hc.team || !ac.team) continue;
          const st = (ev.status && ev.status.type) ? ev.status.type : {};
          const state = st.state; // "pre" | "in" | "post"
          if (state === "post") continue; // finished games aren't bettable
          const home: any = { ab: String(hc.team.abbreviation || hc.team.shortDisplayName || "").toUpperCase(), nm: hc.team.shortDisplayName || hc.team.name || hc.team.displayName || "Home" };
          const away: any = { ab: String(ac.team.abbreviation || ac.team.shortDisplayName || "").toUpperCase(), nm: ac.team.shortDisplayName || ac.team.name || ac.team.displayName || "Away" };
          if (state === "in") { const hs = parseInt(hc.score, 10), as = parseInt(ac.score, 10); if (!isNaN(hs)) home.sc = hs; if (!isNaN(as)) away.sc = as; }
          const core = mkCore(home, away, ev, L.lg);
          out.push({
            gid: L.lg + "_" + ev.id, lg: L.lg, sport: L.sport,
            live: state === "in", time: state === "in" ? (st.shortDetail || "Live") : fmtTime(ev.date),
            iso: ev.date || "", // raw kickoff time — each client renders it in the viewer's local timezone
            home, away, spread: core.spread, total: core.total, ml: core.ml,
          });
        } catch (_e) { /* skip one event */ }
      }
      return; // got this league from a working mirror
    } catch (_e) { /* try next mirror */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  const games: any[] = [];
  await Promise.all(LEAGUES.map((L) => fetchLeague(L, games)));

  // Upsert the single 'all' row (clients read this).
  const r = await fetch(`${SB_URL}/rest/v1/live_games?on_conflict=id`, {
    method: "POST",
    headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "all", data: games, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) return json({ ok: false, error: "store " + r.status + " " + (await r.text()) }, 500);
  return json({ ok: true, games: games.length });
});
