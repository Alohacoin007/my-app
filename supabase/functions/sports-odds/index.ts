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

// 🪪 ESPN 요청은 **정직한 자기 식별 UA** 로 (2026-08-20 실측). ESPN 은 Deno 가 자동으로 붙이는
//    `User-Agent: Deno/x.x` 를 403 으로 막는다 — sports-games 의 UA 매트릭스 실측에서
//    deno-default 403 ×11 / 빈 UA 403 ×11 / "alpexa-feed/1.0" 200 전 리그. 여기 403 이면
//    라이브 판정(경기 진행중 여부)이 죽어 배당 갱신 주기가 어긋난다. sports-games·
//    sports-settle 과 **같은 값**을 쓴다 — 한쪽만 바꾸면 한쪽이 조용히 죽는다.
//    ⚠️ 브라우저 위장(크롬 UA / Referer: espn.com)은 금지 — 그게 오히려 403 을 부른다.
const ESPN_UA = "alpexa-feed/1.0";
const ESPN_INIT: RequestInit = { cache: "no-store", headers: { "User-Agent": ESPN_UA } };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Leagues to poll, with the matching ESPN scoreboard path used to detect live games.
const SPORTS = [
  "americanfootball_nfl", "basketball_nba", "basketball_ncaab", "baseball_mlb", "icehockey_nhl",
  // NFL 프리시즌은 The Odds API에서 **별도 키**다 (2026-08-14 아침점검 실측: americanfootball_nfl 의
  // 가장 이른 경기가 9/10 정규시즌 = 프리시즌 라인 0). ESPN 일정으로 경기는 뜨는데 붙일 라인이 없어
  // 12경기 전부 잠금이었다. 오프시즌엔 404라 크레딧 안 태움(골프 키와 동일 성질).
  "americanfootball_nfl_preseason",
  // UFC/MMA 제거 (2026-07-27 사장님 결정 "빼" — 서버 피드에 UFC 경기가 없어 배당만
  // 크레딧을 태우던 상태. 재개하려면 이 목록+ESPN_PATH+LG_OF 복원 + sports-games에 UFC 이식):
  // Soccer — incl. the FIFA World Cup (in season). Real odds so the app/board no longer
  // shows placeholder soccer prices. Smart polling only spends credits when live/stale.
  "soccer_fifa_world_cup", "soccer_epl", "soccer_usa_mls", "soccer_uefa_champs_league",
  // ⛳ Golf majors — OUTRIGHT (tournament winner) markets, not h2h. Off-season keys just
  // 404 (no credits burned) and pick themselves back up when the season starts.
  "golf_masters_tournament_winner", "golf_pga_championship_winner",
  "golf_the_open_championship_winner", "golf_us_open_winner",
];
// Sports priced as outrights (winner futures): different market param + a slower
// refresh — outright boards move in hours, not seconds, so 30 min saves credits.
const OUTRIGHTS = new Set([
  "golf_masters_tournament_winner", "golf_pga_championship_winner",
  "golf_the_open_championship_winner", "golf_us_open_winner",
]);
const STALE_OUTRIGHT_MS = 30 * 60 * 1000;
// While a golf tournament is IN PLAY the outright board must stay fresh (stale prices
// during a Sunday charge = arbitrage against the house) → 5-min refresh, not 30.
// place_bet enforces the same freshness server-side (live outright legs need a fresh
// oddsTs), so if this polling ever stalls, live golf betting locks itself.
const STALE_OUTRIGHT_LIVE_MS = 5 * 60 * 1000;
const ESPN_PATH: Record<string, string> = {
  americanfootball_nfl: "football/nfl",
  americanfootball_nfl_preseason: "football/nfl",   // 프리시즌도 같은 ESPN 스코어보드 (라이브 감지·정산 동일 경로)
  basketball_nba: "basketball/nba",
  basketball_ncaab: "basketball/mens-college-basketball",
  baseball_mlb: "baseball/mlb",
  icehockey_nhl: "hockey/nhl",
  soccer_fifa_world_cup: "soccer/fifa.world",
  soccer_epl: "soccer/eng.1",
  soccer_usa_mls: "soccer/usa.1",
  soccer_uefa_champs_league: "soccer/uefa.champions",
  // All golf majors share the one ESPN golf scoreboard for live detection.
  golf_masters_tournament_winner: "golf/pga",
  golf_pga_championship_winner: "golf/pga",
  golf_the_open_championship_winner: "golf/pga",
  golf_us_open_winner: "golf/pga",
};
// 폴링 다이어트 (2026-07-25, 쿼터 소진 사후대책 — 사장님 승인):
//   먼 경기만 있는 리그 = 30분, 임박(킥오프 2시간 전~)·라이브 리그 = 5분.
//   라이브 매분 폴링(구 동작)이 크레딧 주범이었다 → 5분이면 라인 안전 + ~70% 절감.
const STALE_MS = 30 * 60 * 1000;     // idle league (no game near): 30 min
const STALE_HOT_MS = 5 * 60 * 1000;  // imminent (starts ≤2h) or live league: 5 min
const HOT_BEFORE_MS = 2 * 60 * 60 * 1000;   // "임박" = starts within 2h
const HOT_AFTER_MS = 6 * 60 * 60 * 1000;    // still hot up to 6h after start (covers live+settling window)
// Odds-API sport key → live_games lg code (our own DB, free to read).
const LG_OF: Record<string, string> = {
  americanfootball_nfl: "NFL", americanfootball_nfl_preseason: "NFL", basketball_nba: "NBA", basketball_ncaab: "NCAAB",
  baseball_mlb: "MLB", icehockey_nhl: "NHL",
  soccer_fifa_world_cup: "SOC", soccer_epl: "SOC", soccer_usa_mls: "SOC",
  soccer_uefa_champs_league: "SOC",
};
// Which lg codes have a game inside the hot window right now — read from OUR live_games
// row (zero Odds-API credits, zero ESPN calls).
async function hotLeagues(SB_URL: string, SB_KEY: string): Promise<Set<string>> {
  const hot = new Set<string>();
  try {
    const r = await fetch(`${SB_URL}/rest/v1/live_games?select=data&id=eq.all`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return hot;
    const rows = await r.json();
    const games = rows?.[0]?.data;
    if (!Array.isArray(games)) return hot;
    const now = Date.now();
    for (const g of games) {
      const t = Date.parse(g?.iso || "");
      if (!Number.isFinite(t)) continue;
      if (g?.live === true || (t - now <= HOT_BEFORE_MS && now - t <= HOT_AFTER_MS)) {
        if (g?.lg) hot.add(String(g.lg));
      }
    }
  } catch (_e) { /* fail-open to cold cadence — betting gates stay fail-closed elsewhere */ }
  return hot;
}

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
        const r = await fetch(u, ESPN_INIT);
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
  // ESPN live check is only needed for golf outrights (their hot state can't come from
  // live_games windows alone); everything else derives "hot" from OUR live_games row.
  const live = (only || force) ? new Set(candidates)
    : await liveSports(candidates.filter((sp) => OUTRIGHTS.has(sp)));
  const hot = (only || force) ? new Set<string>() : await hotLeagues(SB_URL, SB_KEY);
  const updated = (only || force) ? {} : await lastUpdated(SB_URL, SB_KEY);
  const toPoll = candidates.filter((sp) => {
    if (only || force) return true;
    const age = now - (updated[sp] || 0);
    // Outrights: live tournament 5 min, idle 30 min (unchanged).
    if (OUTRIGHTS.has(sp)) return age >= (live.has(sp) ? STALE_OUTRIGHT_LIVE_MS : STALE_OUTRIGHT_MS);
    // Game leagues: imminent/live → 5 min, far-out only → 30 min (폴링 다이어트).
    return age >= (hot.has(LG_OF[sp] || "") ? STALE_HOT_MS : STALE_MS);
  });
  const skipped = candidates.filter((sp) => !toPoll.includes(sp));

  const out: any[] = [];
  let remaining: string | null = null, usedH: string | null = null;

  for (const sp of toPoll) {
    try {
      const markets = OUTRIGHTS.has(sp) ? "outrights" : "h2h,spreads,totals";
      const oddsUrl =
        `https://api.the-odds-api.com/v4/sports/${sp}/odds/?apiKey=${KEY}&regions=us&markets=${markets}&oddsFormat=american`;
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

  // 📋 SPORTS CATALOG — once a day store the full /v4/sports list (FREE endpoint, zero
  // quota cost) into sports_odds under '__sports_list'. The ops session can't reach the
  // Odds API directly (network policy), so the morning routine reads THIS row to watch
  // for new golf / LPGA keys appearing. The API key stays server-side, as always.
  try {
    let wantCat = false;
    if (only === "__sports_list") wantCat = true;
    else if (!only && !force) wantCat = now - (updated["__sports_list"] || 0) >= 24 * 3600 * 1000;
    if (wantCat) {
      const r = await fetch(`https://api.the-odds-api.com/v4/sports/?all=true&apiKey=${KEY}`);
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list) && list.length) {
          await fetch(`${SB_URL}/rest/v1/sports_odds?on_conflict=sport`, {
            method: "POST",
            headers: {
              "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
              "Content-Type": "application/json",
              "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify({ sport: "__sports_list", data: list, updated_at: new Date().toISOString() }),
          });
        }
      }
    }
  } catch (_e) { /* catalog is best-effort — never blocks odds polling */ }

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

  return json({ ok: true, live: [...live], hot: [...hot], polled: out, skipped, remaining });
});
