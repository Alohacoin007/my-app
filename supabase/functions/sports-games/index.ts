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
  if (isSoc) {
    // Soccer = 1X2 (Home / Draw / Away) — the standard football market. US-style
    // spread/total don't apply (left empty). Real prices come from the overlay; these
    // are placeholders shown only until The Odds API prices load.
    const threeWay = [
      { ln: "1", am: (mlHome != null ? mlHome : (homeFav ? -120 : 220)), sel: home.nm + " ML" },
      { ln: "X", am: 230, sel: "Draw" },
      { ln: "2", am: (mlAway != null ? mlAway : (homeFav ? 220 : -120)), sel: away.nm + " ML" },
    ];
    // BACKWARD-COMPAT: also keep the 2-way ml. New clients render 1X2 from threeWay; OLD
    // (still-cached) clients require ml>=2 to accept a game, so leaving ml populated stops
    // soccer from vanishing on a stale client during the deploy transition.
    return { spread: [], total: [], ml, threeWay };
  }
  return { spread, total: total2, ml };
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }); }
  catch (_e) { return ""; }
}

// ── Overlay REAL odds from the sports_odds table (already populated by the
// sports-odds function from The Odds API). No extra Odds API credits — we just
// read what's stored — so the dashboard shows the SAME real odds as the app.
const ODDS_SPORT: Record<string, string> = { NFL: "americanfootball_nfl", NBA: "basketball_nba", MLB: "baseball_mlb", NHL: "icehockey_nhl" };
function nick(name: string): string { return String(name || "").trim().toLowerCase().split(/\s+/).pop() || ""; }
function decP(p: number): number { return p > 0 ? 1 + p / 100 : 1 + 100 / (-p); }
function fmtPt(p: number): string { return (p > 0 ? "+" : "") + p; }
function bestOutcome(ev: any, marketKey: string, matchFn: (o: any) => boolean): any {
  let b: any = null;
  (ev.bookmakers || []).forEach((bk: any) => {
    const m = (bk.markets || []).find((x: any) => x.key === marketKey); if (!m) return;
    (m.outcomes || []).forEach((o: any) => { if (matchFn(o)) { if (b === null || decP(o.price) > decP(b.price)) b = { price: o.price, point: o.point }; } });
  });
  return b;
}
function oddsToCore(ev: any, home: any, away: any): any {
  if (!ev.bookmakers || !ev.bookmakers.length) return null;
  const core: any = {};
  const mlH = bestOutcome(ev, "h2h", (o) => nick(o.name) === nick(home.nm)), mlA = bestOutcome(ev, "h2h", (o) => nick(o.name) === nick(away.nm));
  if (mlH && mlA) core.ml = [{ ln: "", am: mlH.price, sel: home.nm + " ML" }, { ln: "", am: mlA.price, sel: away.nm + " ML" }];
  // Soccer 1X2: the h2h market has a third "Draw" outcome. Capture it → threeWay
  // [Home, Draw, Away]. sel = "<team> ML" / "Draw"; graded by the 1X2 settler branch.
  const drawO = bestOutcome(ev, "h2h", (o) => /draw/i.test(o.name));
  if (mlH && mlA && drawO) core.threeWay = [
    { ln: "1", am: mlH.price, sel: home.nm + " ML" },
    { ln: "X", am: drawO.price, sel: "Draw" },
    { ln: "2", am: mlA.price, sel: away.nm + " ML" },
  ];
  const spH = bestOutcome(ev, "spreads", (o) => nick(o.name) === nick(home.nm)), spA = bestOutcome(ev, "spreads", (o) => nick(o.name) === nick(away.nm));
  if (spH && spA && spH.point != null && spA.point != null) core.spread = [{ ln: fmtPt(spH.point), am: spH.price, sel: home.nm + " " + fmtPt(spH.point) }, { ln: fmtPt(spA.point), am: spA.price, sel: away.nm + " " + fmtPt(spA.point) }];
  const ov = bestOutcome(ev, "totals", (o) => /over/i.test(o.name)), un = bestOutcome(ev, "totals", (o) => /under/i.test(o.name));
  if (ov && un && ov.point != null && un.point != null) core.total = [{ ln: "Over " + ov.point, am: ov.price, sel: "Over " + ov.point }, { ln: "Under " + un.point, am: un.price, sel: "Under " + un.point }];
  return (core.ml || core.spread || core.total || core.threeWay) ? core : null;
}
async function overlayRealOdds(games: any[], SB_URL: string, H: Record<string, string>) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/sports_odds?select=sport,data`, { headers: H });
    if (!res.ok) return;
    const rows = await res.json();
    const bySport: Record<string, any[]> = {};
    (rows || []).forEach((row: any) => { if (row && row.sport) bySport[row.sport] = Array.isArray(row.data) ? row.data : []; });
    games.forEach((g: any) => {
      let data: any[] = [];
      if (g.lg === "SOC") {
        // Soccer competitions live under several odds keys (soccer_fifa_world_cup,
        // soccer_epl, soccer_usa_mls, …) but all share lg:"SOC". Team names are unique,
        // so match across every soccer_* feed at once.
        Object.keys(bySport).forEach((k) => { if (k.indexOf("soccer_") === 0) data = data.concat(bySport[k] || []); });
      } else {
        const sk = ODDS_SPORT[g.lg]; if (!sk) return;
        data = bySport[sk] || [];
      }
      if (!data.length) return;
      const ev = data.find((e: any) => { const s = new Set([nick(e.home_team), nick(e.away_team)]); return s.has(nick(g.home.nm)) && s.has(nick(g.away.nm)); });
      if (!ev) return;
      const core = oddsToCore(ev, g.home, g.away);
      if (core) {
        if (g.lg === "SOC") {
          // Soccer 1X2 (Home/Draw/Away). Real 3-way odds → threeWay; also refresh the
          // 2-way ml (backward-compat for stale clients). Spread/total stay empty.
          if (core.threeWay) g.threeWay = core.threeWay;
          if (core.ml) g.ml = core.ml;
        } else {
          if (core.ml) g.ml = core.ml; if (core.spread) g.spread = core.spread; if (core.total) g.total = core.total;
        }
      }
    });
  } catch (_e) { /* keep ESPN odds if the overlay fails */ }
}

async function fetchLeague(L: { lg: string; sport: string; path: string }, out: any[]) {
  // Request a date RANGE (today → +8d) so live_games carries UPCOMING fixtures (e.g.
  // tomorrow's World Cup match), not only today — ESPN's default scoreboard is today-only.
  // BUT if a league has NO games in that window (e.g. an off-season NFL whose next game is
  // weeks out — the +8d range dropped it), fall back to the PLAIN scoreboard so its next
  // scheduled games still show. Order: ranged (+mirror) → plain (+mirror). Never fewer.
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ymd = (x: Date) => "" + x.getUTCFullYear() + p2(x.getUTCMonth() + 1) + p2(x.getUTCDate());
  const range = ymd(new Date()) + "-" + ymd(new Date(Date.now() + 8 * 86400000));
  const base = `https://site.api.espn.com/apis/site/v2/sports/${L.path}/scoreboard`;
  const cp = (u: string) => "https://corsproxy.io/?url=" + encodeURIComponent(u);
  const tries = [base + "?dates=" + range, cp(base + "?dates=" + range), base, cp(base)];
  const before = out.length;
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
            home, away, spread: core.spread, total: core.total, ml: core.ml, threeWay: core.threeWay || [],
          });
        } catch (_e) { /* skip one event */ }
      }
      if (out.length > before) return; // got games from this URL → done
      // else: 200 OK but 0 games (an off-season league in the ranged window) → keep going
      // so the plain (default) scoreboard fallback can add its next scheduled games.
    } catch (_e) { /* try next mirror */ }
  }
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

  const games: any[] = [];
  await Promise.all(LEAGUES.map((L) => fetchLeague(L, games)));

  // Overlay the REAL odds the app already uses (sports_odds table) so the
  // dashboard's live_games carries the same real moneyline/spread/total.
  await overlayRealOdds(games, SB_URL, H);

  // Upsert the single 'all' row (clients read this).
  const r = await fetch(`${SB_URL}/rest/v1/live_games?on_conflict=id`, {
    method: "POST",
    headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "all", data: games, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) return json({ ok: false, error: "store " + r.status + " " + (await r.text()) }, 500);
  return json({ ok: true, games: games.length });
});
