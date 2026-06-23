// Alpexa — sports-games  (The Odds API version)
// SERVER-SIDE game + REAL odds feed for ALL clients (mobile app + desktop website).
// Pulls real bookmaker odds (moneyline / spread / total) from The Odds API
// (https://the-odds-api.com) for each league, builds games in the app's format
// with gid = "<LG>_<oddsApiEventId>", and stores everything in the `live_games`
// table (single row id='all'). Clients just READ this row — one source of truth.
//
// Required secret: ODDS_API_KEY  (set in Supabase → Edge Functions → Secrets)
// Auto env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional CRON_SECRET.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// The Odds API sport keys → our league/sport labels. gids stay "<LG>_<eventId>"
// so the settler can recognise bets placed against them.
const SPORTS = [
  { key: "americanfootball_nfl",        lg: "NFL", sport: "Football" },
  { key: "basketball_nba",              lg: "NBA", sport: "Basketball" },
  { key: "baseball_mlb",                lg: "MLB", sport: "Baseball" },
  { key: "icehockey_nhl",               lg: "NHL", sport: "Hockey" },
  { key: "soccer_epl",                  lg: "SOC", sport: "Soccer" },
  { key: "soccer_uefa_champs_league",   lg: "SOC", sport: "Soccer" },
  { key: "soccer_usa_mls",              lg: "SOC", sport: "Soccer" },
];

// Prefer a major US book for a stable, consistent line; fall back to the first.
const BOOK_PRIORITY = ["draftkings", "fanduel", "betmgm", "williamhill_us", "betrivers", "bovada"];

// Short code shown in the UI (Odds API gives full team names only).
function abbr(name: string): string {
  const words = String(name || "").trim().split(/\s+/);
  const last = words[words.length - 1] || name || "";
  return last.slice(0, 3).toUpperCase();
}
function signed(n: number): string { return (n > 0 ? "+" : "") + n; }

function pickBook(ev: any): any {
  const books = ev.bookmakers || [];
  for (const want of BOOK_PRIORITY) { const b = books.find((x: any) => x.key === want); if (b) return b; }
  return books[0] || null;
}
function market(book: any, key: string): any {
  return (book && book.markets || []).find((m: any) => m.key === key) || null;
}

function mkGame(ev: any, L: { lg: string; sport: string }) {
  const book = pickBook(ev);
  if (!book) return null;
  const homeNm = ev.home_team, awayNm = ev.away_team;
  if (!homeNm || !awayNm) return null;
  const isSoc = L.lg === "SOC";

  // Moneyline (h2h) — required.
  const h2h = market(book, "h2h");
  const hO = h2h && (h2h.outcomes || []).find((o: any) => o.name === homeNm);
  const aO = h2h && (h2h.outcomes || []).find((o: any) => o.name === awayNm);
  const mlHome = hO && typeof hO.price === "number" ? hO.price : (isSoc ? 150 : -140);
  const mlAway = aO && typeof aO.price === "number" ? aO.price : (isSoc ? 180 : 120);
  const ml = [
    { ln: "", am: mlHome, sel: homeNm + " ML" },
    { ln: "", am: mlAway, sel: awayNm + " ML" },
  ];

  // Spread — use real if present, else a sensible default priced at -110.
  const spM = market(book, "spreads");
  const spH = spM && (spM.outcomes || []).find((o: any) => o.name === homeNm);
  const spA = spM && (spM.outcomes || []).find((o: any) => o.name === awayNm);
  let spread;
  if (spH && spA && typeof spH.point === "number" && typeof spA.point === "number") {
    spread = [
      { ln: signed(spH.point), am: (typeof spH.price === "number" ? spH.price : -110), sel: homeNm + " " + signed(spH.point) },
      { ln: signed(spA.point), am: (typeof spA.price === "number" ? spA.price : -110), sel: awayNm + " " + signed(spA.point) },
    ];
  } else {
    const d = isSoc ? 0.5 : 3.5;
    spread = [
      { ln: signed(-d), am: -110, sel: homeNm + " " + signed(-d) },
      { ln: signed(d),  am: -110, sel: awayNm + " " + signed(d) },
    ];
  }

  // Total — use real if present, else default priced at -110.
  const toM = market(book, "totals");
  const ovr = toM && (toM.outcomes || []).find((o: any) => /over/i.test(o.name));
  const und = toM && (toM.outcomes || []).find((o: any) => /under/i.test(o.name));
  let total;
  if (ovr && und && typeof ovr.point === "number") {
    total = [
      { ln: "Over " + ovr.point,  am: (typeof ovr.price === "number" ? ovr.price : -110), sel: "Over " + ovr.point },
      { ln: "Under " + und.point, am: (typeof und.price === "number" ? und.price : -110), sel: "Under " + und.point },
    ];
  } else {
    const t = isSoc ? 2.5 : 45.5;
    total = [
      { ln: "Over " + t,  am: -110, sel: "Over " + t },
      { ln: "Under " + t, am: -110, sel: "Under " + t },
    ];
  }

  const now = Date.now();
  const start = ev.commence_time ? new Date(ev.commence_time).getTime() : 0;
  const live = start > 0 && start <= now; // basic in-play flag (scores feed handles grading)

  return {
    gid: L.lg + "_" + ev.id, lg: L.lg, sport: L.sport,
    live, time: live ? "Live" : "", iso: ev.commence_time || "",
    home: { ab: abbr(homeNm), nm: homeNm },
    away: { ab: abbr(awayNm), nm: awayNm },
    spread, total, ml,
  };
}

async function fetchSport(L: { key: string; lg: string; sport: string }, apiKey: string, out: any[]) {
  const u = `https://api.the-odds-api.com/v4/sports/${L.key}/odds/?apiKey=${apiKey}`
    + `&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
  try {
    const res = await fetch(u, { cache: "no-store" });
    if (!res.ok) return; // skip this league (e.g. out of season → 404/422)
    const events = await res.json();
    if (!Array.isArray(events)) return;
    for (const ev of events) {
      try { const g = mkGame(ev, L); if (g) out.push(g); } catch (_e) { /* skip one */ }
    }
  } catch (_e) { /* skip league on network error */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const API_KEY = Deno.env.get("ODDS_API_KEY");
  if (!API_KEY) return json({ ok: false, error: "ODDS_API_KEY secret missing" }, 500);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  const games: any[] = [];
  await Promise.all(SPORTS.map((L) => fetchSport(L, API_KEY, games)));

  const r = await fetch(`${SB_URL}/rest/v1/live_games?on_conflict=id`, {
    method: "POST",
    headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "all", data: games, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) return json({ ok: false, error: "store " + r.status + " " + (await r.text()) }, 500);
  return json({ ok: true, games: games.length });
});
