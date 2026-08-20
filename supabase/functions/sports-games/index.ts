// Alpexa — sports-games
// SERVER-SIDE game + odds feed for ALL clients (mobile app + desktop website).
// Fetches ESPN scoreboards (FREE, no key) for each league, builds games in the
// app's GAMES format with gid = "<LG>_<espnEventId>" so the server settler
// (sports-settle) recognises bets placed against them, and stores everything in
// the `live_games` table (single row id='all'). Clients just READ this row — one
// source of truth, no per-client ESPN calls. Run on a ~1-minute pg_cron.
//
// Required env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional CRON_SECRET.

// 🚫 ESPN 에 **브라우저 위장 헤더를 붙이지 않는다** (2026-08-20 실측).
//    2026-08-19 블랙아웃 때 "데이터센터 IP 차단이겠지"라는 *가설*로 크롬 UA + `Referer:
//    espn.com` 을 붙였는데, 그게 오히려 403 을 만들었다. 같은 러너·같은 IP·같은 URL 을
//    ms 차이로 비교한 실측 (`tests/espn-transport-probe.js`, GitHub Actions 로그):
//        헤더 없음  → 200, events=632 / 111 / 50   (MLB / NFL / EPL)
//        위장 헤더  → 403, 403, 403
//    ESPN(Akamai)은 크롬 UA 인데 TLS 지문이 크롬이 아닌 요청을 봇으로 본다 — 위장은
//    통과가 아니라 **탐지 신호**다. ⚠️ 다시 붙이지 말 것(`tests/diagnose.js` 가 막는다).
//
// 🔬 그런데 위장 헤더를 지운 뒤에도 Supabase Edge 는 전 리그 403 이었다(04:00 실측).
//    두 위치의 차이는 IP 만이 아니다 — **Deno 는 헤더를 안 붙여도 `User-Agent: Deno/x.x`
//    를 자동으로 보내고**, 200 을 받은 GitHub 러너(Node)는 UA 를 안 보낸다. 그래서 남은
//    변수는 "Deno 의 자동 UA" 하나다. 별도 진단 함수를 만들지 않고 **폴백 사슬 안에서**
//    UA 변형을 차례로 시도한다 — 되는 게 있으면 그 자리에서 피드가 살아나고(자가치유),
//    전부 막히면 DIAG 에 전 변형의 403 이 남아 IP 차단이 확정된다. 진단과 수정이 한 배포.
//    ⚠️ 여기 UA 는 **정직한 식별자이거나 빈 값**이다. 브라우저인 척하지 않는다.
// ✅ 확정 (2026-08-20 04:16, live_games diag 실측):
//        deno-default (Deno 자동 UA)  → 403 ×11
//        ua-empty (빈 UA)             → 403 ×11
//        ua-alpexa ("alpexa-feed/1.0") → 200, 전 리그 정상 (449경기 복구)
//    ESPN 이 막던 건 IP 가 아니라 **`User-Agent: Deno/x.x`** 였다. 정직한 자기 식별 UA 는
//    그대로 통과한다. 그래서 그걸 **맨 앞**에 둔다 — 뒤에 두면 매 분 403 을 22번 두들긴다.
//    나머지 둘은 남겨둔다: ESPN 이 정책을 또 바꿔 우리 UA 를 막으면 자동으로 다음을 시도한다.
export const ESPN_UA = "alpexa-feed/1.0";
const UA_TRIES: Array<[string, Record<string, string>]> = [
  ["ua-alpexa", { "User-Agent": ESPN_UA }],             // ✅ 유일하게 통하는 경로 (실측)
  ["deno-default", {}],                                 // Deno 자동 UA — 현재 403, 정책 변경 대비 폴백
  ["ua-empty", { "User-Agent": "" }],                   // 빈 UA — 현재 403, 폴백
];
const FETCH_TIMEOUT_MS = 8000;
function espnFetch(u: string, headers: Record<string, string>): Promise<Response> {
  // 미러가 20초씩 매달려 전체 갱신을 잡아먹지 않게 (실측: allorigins/codetabs 19.7초 행).
  return fetch(u, { cache: "no-store", headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}
// URL 목록 × UA 변형 → 시도 목록. 직접 호출에만 UA 변형을 곱한다(프록시는 자기 UA 로
// 나가므로 무의미). 성공하면 즉시 끊기니 실제 요청 수는 대부분 1회다.
function withUAs(direct: string[], viaProxy: string[]): Array<[string, string, Record<string, string>]> {
  const out: Array<[string, string, Record<string, string>]> = [];
  for (const u of direct) for (const [nm, h] of UA_TRIES) out.push([nm, u, h]);
  for (const u of viaProxy) out.push(["proxy", u, {}]);
  return out;
}

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
  // 🎓 NCAAB (2026-07-27 서버 이식 — 탭만 있고 피드가 없던 마지막 리그. NBA와 동일 이벤트 구조.)
  { lg: "NCAAB", sport: "Basketball", path: "basketball/mens-college-basketball" },
  { lg: "MLB", sport: "Baseball",   path: "baseball/mlb" },
  { lg: "NHL", sport: "Hockey",     path: "hockey/nhl" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/eng.1" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/uefa.champions" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/usa.1" },
  { lg: "SOC", sport: "Soccer",     path: "soccer/fifa.world" },
];

// ⛳ Golf — OUTRIGHT (tournament winner) events. A golf "game" is one tournament:
// gid = "GOLF_<espnEventId>", markets empty except `outright` (filled by the odds
// overlay below). No real outright prices → oddsReal:false → locked, unbettable
// (same NO FABRICATION gate as team sports). Old clients that require ml/spread/
// total simply drop these entries, so this is deploy-order safe.
async function fetchGolf(out: any[]) {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ymd = (x: Date) => "" + x.getUTCFullYear() + p2(x.getUTCMonth() + 1) + p2(x.getUTCDate());
  const range = ymd(new Date()) + "-" + ymd(new Date(Date.now() + 8 * 86400000));
  const base = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
  const cp = (u: string) => "https://corsproxy.io/?url=" + encodeURIComponent(u);
  const tries = withUAs([base + "?dates=" + range, base], [cp(base + "?dates=" + range), cp(base)]);
  const before = out.length;
  for (const [, u, h] of tries) {
    try {
      const res = await espnFetch(u, h);
      if (!res.ok) continue;
      const d = await res.json();
      for (const ev of (d.events || [])) {
        try {
          const st = (ev.status && ev.status.type) ? ev.status.type : {};
          const state = st.state; // "pre" | "in" | "post"
          if (state === "post") continue; // finished tournaments aren't bettable
          const nm = ev.name || ev.shortName || "Golf";
          out.push({
            gid: "GOLF_" + ev.id, lg: "GOLF", sport: "Golf",
            live: state === "in", time: state === "in" ? (st.shortDetail || "Live") : fmtTime(ev.date),
            iso: ev.date || "",
            name: nm, // tournament title — used by clients AND by the outright odds matcher
            // home/away stubs so generic 2-team renderers never crash on a GOLF row
            home: { ab: "GOLF", nm }, away: { ab: "", nm: "" },
            spread: [], total: [], ml: [], outright: [],
            oddsReal: false, // flips true only when the overlay attaches real outright prices
          });
        } catch (_e) { /* skip one event */ }
      }
      if (out.length > before) return;
    } catch (_e) { /* try next mirror */ }
  }
}

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
  // NO FABRICATION: if ESPN gave us no moneyline we emit EMPTY odds arrays and flag
  // real:false — we never invent a -140/120 line. A fake price that leaks anywhere (the
  // app, place_bet, a future reader) is a money risk. The overlay fills real lines and
  // flips real:true; until then the client shows the game LOCKED and place_bet rejects it.
  const mlReal = (mlHome != null && mlAway != null);
  if (isSoc) {
    // Soccer = 1X2 (Home/Draw/Away). Real prices (incl. the Draw) come only from the
    // overlay, so real stays false here even if ESPN gave a 2-way price. No ESPN price →
    // fully empty (no fabricated numbers at all).
    if (!mlReal) return { spread: [], total: [], ml: [], threeWay: [], real: false };
    const ml = [{ ln: "", am: mlHome, sel: home.nm + " ML" }, { ln: "", am: mlAway, sel: away.nm + " ML" }];
    const threeWay = [
      { ln: "1", am: mlHome, sel: home.nm + " ML" },
      { ln: "X", am: 230, sel: "Draw" },   // Draw only becomes real via the overlay
      { ln: "2", am: mlAway, sel: away.nm + " ML" },
    ];
    return { spread: [], total: [], ml, threeWay, real: false };
  }
  // Non-soccer: no real moneyline → empty everything, unbettable. No -140/120 fallback.
  if (!mlReal) return { spread: [], total: [], ml: [], real: false };
  const sp = (spreadVal != null && spreadVal > 0) ? spreadVal : 3.5;
  const tot = (total != null && total > 0) ? total : 45.5;
  const homeFav = favAbbr ? (home.ab === favAbbr) : (mlHome < mlAway);
  const spread = homeFav
    ? [{ ln: "-" + sp, am: -110, sel: home.nm + " -" + sp }, { ln: "+" + sp, am: -110, sel: away.nm + " +" + sp }]
    : [{ ln: "+" + sp, am: -110, sel: home.nm + " +" + sp }, { ln: "-" + sp, am: -110, sel: away.nm + " -" + sp }];
  const total2 = [{ ln: "Over " + tot, am: -110, sel: "Over " + tot }, { ln: "Under " + tot, am: -110, sel: "Under " + tot }];
  const ml = [{ ln: "", am: mlHome, sel: home.nm + " ML" }, { ln: "", am: mlAway, sel: away.nm + " ML" }];
  return { spread, total: total2, ml, real: true };
}

// 사람이 읽는 킥오프 문자열. 클라는 원본 `iso` 로 자기 시간대에 맞춰 다시 만들지만(그게 정답),
// 서비스워커 캐시 때문에 **옛 클라가 한동안 이 문자열을 폴백으로** 쓴다. 그래서 여기도
//   ① 월·일 포함 (요일만 있으면 몇 주 뒤 경기가 이번 주처럼 보인다 — 2026-07-24 / 08-14 사고)
//   ② timeZone 명시 (미지정이면 서버=UTC 기준이라 손님 시간과 어긋난다) → 베가스 기준
// 문자열이 길어질 뿐이라 옛 클라도 그대로 렌더된다(하위호환).
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
    });
  } catch (_e) { return ""; }
}

// ── Overlay REAL odds from the sports_odds table (already populated by the
// sports-odds function from The Odds API). No extra Odds API credits — we just
// read what's stored — so the dashboard shows the SAME real odds as the app.
const ODDS_SPORT: Record<string, string> = { NFL: "americanfootball_nfl", NBA: "basketball_nba", NCAAB: "basketball_ncaab", MLB: "baseball_mlb", NHL: "icehockey_nhl" };
// 한 리그가 배당 키를 여러 개 갖는 경우 (축구가 이미 그렇다). NFL = 정규시즌 + **프리시즌 별도 키**
// (2026-08-14: 프리시즌 라인이 americanfootball_nfl 에 없어 12경기 전부 잠겼었다). 축구와 동일하게
// 풀을 합쳐 매칭한다 — 팀명이 유일하므로 오매칭 위험은 없고, 킥오프 6h 게이트도 그대로 걸린다.
const ODDS_EXTRA: Record<string, string[]> = { NFL: ["americanfootball_nfl_preseason"] };
function nick(name: string): string { return String(name || "").trim().toLowerCase().split(/\s+/).pop() || ""; }
// Robust team-name match. nick() (last word) breaks on soccer clubs whose feeds differ:
// ESPN "Vancouver" vs Odds "Vancouver Whitecaps FC" → last words "vancouver" ≠ "fc".
// Instead: strip club suffixes, take significant tokens (len>2), and require every token
// of the SHORTER name to appear in the longer (subset). Safe for US sports too
// ("Reds" ⊆ "Cincinnati Reds"); "Red Sox" ⊄ "Chicago White Sox" so no cross-match.
function normNm(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(fc|sc|cf|afc|ac|sd|cd)\b/g, " ").replace(/\s+/g, " ").trim();
}
function sigToks(s: string): string[] { return normNm(s).split(" ").filter((t) => t.length > 2); }
function teamMatch(a: string, b: string): boolean {
  const A = sigToks(a), B = sigToks(b);
  if (!A.length || !B.length) return false;
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  return short.every((t) => long.includes(t));
}
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
// A COMPLEMENTARY PAIR from a SINGLE bookmaker (2026-08-08 fix). spreads/totals are two-sided
// markets that must share one line: spread home.point === -away.point ; total over.point === under.point.
// The old per-side bestOutcome picked each side's best price across DIFFERENT books, so pick'em games
// (books disagree on the runline favorite) produced both sides at -1.5, and totals like Over 9.5/Under 9
// — non-complementary, malformed, and best-price-both-sides eroded the hold. Here we pick, within one
// book, the valid complementary pair with the best combined customer price (same generous philosophy,
// but coherent). No valid pair → return null → the market is OMITTED (never fabricate a line).
function bestPair(ev: any, marketKey: string, hMatch: (o: any) => boolean, aMatch: (o: any) => boolean, pairOk: (hp: number, ap: number) => boolean): any {
  let best: any = null, bestVal = -Infinity;
  (ev.bookmakers || []).forEach((bk: any) => {
    const m = (bk.markets || []).find((x: any) => x.key === marketKey); if (!m) return;
    const outs = m.outcomes || [];
    const h = outs.find(hMatch), a = outs.find(aMatch);
    if (!h || !a || h.point == null || a.point == null) return;
    if (!pairOk(h.point, a.point)) return;
    const val = decP(h.price) + decP(a.price);   // best combined customer value among valid pairs
    if (val > bestVal) { bestVal = val; best = { h: { price: h.price, point: h.point }, a: { price: a.price, point: a.point } }; }
  });
  return best;
}
function oddsToCore(ev: any, home: any, away: any): any {
  if (!ev.bookmakers || !ev.bookmakers.length) return null;
  const core: any = {};
  const mlH = bestOutcome(ev, "h2h", (o) => teamMatch(o.name, home.nm)), mlA = bestOutcome(ev, "h2h", (o) => teamMatch(o.name, away.nm));
  if (mlH && mlA) core.ml = [{ ln: "", am: mlH.price, sel: home.nm + " ML" }, { ln: "", am: mlA.price, sel: away.nm + " ML" }];
  // Soccer 1X2: the h2h market has a third "Draw" outcome. Capture it → threeWay
  // [Home, Draw, Away]. sel = "<team> ML" / "Draw"; graded by the 1X2 settler branch.
  const drawO = bestOutcome(ev, "h2h", (o) => /draw/i.test(o.name));
  if (mlH && mlA && drawO) core.threeWay = [
    { ln: "1", am: mlH.price, sel: home.nm + " ML" },
    { ln: "X", am: drawO.price, sel: "Draw" },
    { ln: "2", am: mlA.price, sel: away.nm + " ML" },
  ];
  // spreads — one book's complementary runline (home.point === -away.point), else omit (no fabrication)
  const sp = bestPair(ev, "spreads", (o) => teamMatch(o.name, home.nm), (o) => teamMatch(o.name, away.nm), (hp, ap) => hp === -ap && hp !== 0);
  if (sp) core.spread = [{ ln: fmtPt(sp.h.point), am: sp.h.price, sel: home.nm + " " + fmtPt(sp.h.point) }, { ln: fmtPt(sp.a.point), am: sp.a.price, sel: away.nm + " " + fmtPt(sp.a.point) }];
  // totals — one book's Over/Under sharing the same point, else omit
  const tp = bestPair(ev, "totals", (o) => /over/i.test(o.name), (o) => /under/i.test(o.name), (op, up) => op === up);
  if (tp) core.total = [{ ln: "Over " + tp.h.point, am: tp.h.price, sel: "Over " + tp.h.point }, { ln: "Under " + tp.a.point, am: tp.a.price, sel: "Under " + tp.a.point }];
  return (core.ml || core.spread || core.total || core.threeWay) ? core : null;
}
// ⛳ Which Odds-API golf key prices a given ESPN tournament name. Strict on purpose:
// a wrong match would pin another tournament's winner odds to this event (money bug).
// "The Open" must NOT swallow "U.S. Open" / "3M Open" / "Houston Open" etc.
const GOLF_KEY_MATCH: Record<string, (n: string) => boolean> = {
  golf_masters_tournament_winner: (n) => n.indexOf("masters") >= 0,
  golf_pga_championship_winner: (n) => n.indexOf("pga championship") >= 0,
  golf_us_open_winner: (n) => n.indexOf("u.s. open") >= 0 || n.indexOf("us open") >= 0,
  golf_the_open_championship_winner: (n) =>
    (n.indexOf("open championship") >= 0 || /\bthe (\d+\w{0,2} )?open\b/.test(n)) &&
    n.indexOf("u.s.") < 0 && n.indexOf("us open") < 0 && n.indexOf("pga") < 0 && n.indexOf("women") < 0,
};
// Best (highest-decimal, same rule as bestOutcome) outright price per player, favorites
// first, capped at 60 names so the live_games row stays small. sel = the player's name
// exactly as priced — place_bet re-prices against it and sports-settle grades against it.
function outrightToCore(ev: any): any[] {
  const best: Record<string, number> = {};
  (ev.bookmakers || []).forEach((bk: any) => {
    const m = (bk.markets || []).find((x: any) => x.key === "outrights"); if (!m) return;
    (m.outcomes || []).forEach((o: any) => {
      const nm = String(o.name || "").trim(); if (!nm || typeof o.price !== "number") return;
      if (best[nm] == null || decP(o.price) > decP(best[nm])) best[nm] = o.price;
    });
  });
  return Object.keys(best)
    .sort((a, b) => decP(best[a]) - decP(best[b]))
    .slice(0, 60)
    .map((nm) => ({ ln: "", am: best[nm], sel: nm }));
}
// sports_odds 전체 행 1회 로드 — overlay와 배당 지평 계산이 공유 (이중 fetch 금지).
async function fetchOddsRows(SB_URL: string, H: Record<string, string>): Promise<any[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/sports_odds?select=sport,data,updated_at`, { headers: H });
    if (res.ok) return await res.json();
  } catch (_e) { /* 지평·overlay 없이도 기본 피드는 돈다 */ }
  return [];
}
// ⏱️ 배당 지평 (2026-07-27 사장님 "일관성이 없잖아"): 리그별 경기 목록 창을 "프로바이더가
// 가격을 낸 가장 먼 경기"까지 자동 확장한다. NFL 개막전이 몇 주 전부터 가격이 나오면 그때부터
// 목록·베팅 가능, MLB처럼 하루 전에야 나오면 기본 8일 창 — 규칙은 하나: "배당이 있으면 판다".
// 상한 +60일 (row 비대 방지), 하한 = 기본 8일.
function oddsHorizons(rows: any[]): Record<string, number> {
  const hz: Record<string, number> = {};
  const now = Date.now(), MIN = now + 8 * 86400000, MAX = now + 60 * 86400000;
  const lgOfKey = (k: string): string | null => {
    if (k.indexOf("soccer_") === 0) return "SOC";
    for (const lg of Object.keys(ODDS_SPORT)) if (ODDS_SPORT[lg] === k) return lg;
    for (const lg of Object.keys(ODDS_EXTRA)) if (ODDS_EXTRA[lg].indexOf(k) >= 0) return lg;   // 보조 키도 자기 리그로
    return null;
  };
  (rows || []).forEach((row: any) => {
    const lg = lgOfKey(String(row?.sport || "")); if (!lg) return;
    (Array.isArray(row.data) ? row.data : []).forEach((e: any) => {
      const t = Date.parse(e?.commence_time || "");
      if (!Number.isFinite(t) || t <= now || t > MAX) return;
      if (!hz[lg] || t > hz[lg]) hz[lg] = t;
    });
  });
  Object.keys(hz).forEach((lg) => { hz[lg] = Math.max(hz[lg], MIN); });
  return hz;
}
async function overlayRealOdds(games: any[], rows: any[]) {
  try {
    const bySport: Record<string, any[]> = {};
    const byUpd: Record<string, string> = {};
    (rows || []).forEach((row: any) => {
      if (!row || !row.sport) return;
      bySport[row.sport] = Array.isArray(row.data) ? row.data : [];
      if (row.updated_at) byUpd[row.sport] = row.updated_at;
    });
    games.forEach((g: any) => {
      let data: any[] = [];
      if (g.lg === "GOLF") {
        // Tournament-name match against the golf_* outright feeds, then require a
        // UNIQUE event within ±6 days of the ESPN start date — ambiguous → stay locked.
        const n = String(g.name || "").toLowerCase();
        const gt = Date.parse(g.iso || "");
        const hits: any[] = []; let hitKey = "";
        Object.keys(bySport).forEach((k) => {
          const match = GOLF_KEY_MATCH[k]; if (!match || !match(n)) return;
          (bySport[k] || []).forEach((e: any) => {
            const et = Date.parse(e.commence_time || "");
            if (isNaN(gt) || isNaN(et) || Math.abs(et - gt) <= 6 * 86400000) { hits.push(e); hitKey = k; }
          });
        });
        if (hits.length !== 1) return;
        const outright = outrightToCore(hits[0]);
        if (outright.length >= 2) {
          g.outright = outright; g.oddsReal = true;
          // Freshness stamp for the money gate: place_bet only accepts a LIVE
          // tournament's outright leg when this board was refreshed recently.
          if (byUpd[hitKey]) g.oddsTs = byUpd[hitKey];
        }
        return;
      }
      if (g.lg === "SOC") {
        // Soccer competitions live under several odds keys (soccer_fifa_world_cup,
        // soccer_epl, soccer_usa_mls, …) but all share lg:"SOC". Team names are unique,
        // so match across every soccer_* feed at once.
        Object.keys(bySport).forEach((k) => { if (k.indexOf("soccer_") === 0) data = data.concat(bySport[k] || []); });
      } else {
        const sk = ODDS_SPORT[g.lg]; if (!sk) return;
        data = bySport[sk] || [];
        for (const ek of (ODDS_EXTRA[g.lg] || [])) data = data.concat(bySport[ek] || []);   // NFL 프리시즌 등 보조 키 병합
      }
      if (!data.length) return;
      // Match by robust team tokens + kickoff proximity. 판정 규칙 (2026-07-22 더블헤더 사건):
      //  · 히트 0 → 잠금 유지. 히트 1 이상이면 킥오프 "상호 최근접"으로 부착 —
      //    ① 복수 히트: 이 경기에 가장 가까운 이벤트(유일 최솟값, 동률이면 fail-safe 잠금).
      //    ② 그 이벤트가 같은 팀 조합의 "다른" 경기(더블헤더 상대편)에 더 가깝다면 양보(잠금) —
      //       프로바이더가 1차전 배당만 냈을 때 그게 2차전에 붙는 오배당을 구조적으로 차단.
      //  타임스탬프를 모르면 예전처럼 유일 히트만 수락. gt/et within 6h when both known.
      const gt = Date.parse(g.iso || "");
      const hits = data.filter((e: any) => {
        const teamsOk = (teamMatch(e.home_team, g.home.nm) && teamMatch(e.away_team, g.away.nm)) ||
                        (teamMatch(e.home_team, g.away.nm) && teamMatch(e.away_team, g.home.nm));
        if (!teamsOk) return false;
        const et = Date.parse(e.commence_time || "");
        return (isNaN(gt) || isNaN(et)) ? true : Math.abs(et - gt) <= 6 * 3600 * 1000;
      });
      const ev = (() => {
        if (!hits.length) return null;
        if (isNaN(gt)) return hits.length === 1 ? hits[0] : null;   // 우리 시각 미상 → 보수적(구규칙)
        const dist = (e: any) => { const et = Date.parse(e.commence_time || ""); return isNaN(et) ? Infinity : Math.abs(et - gt); };
        const sorted = hits.slice().sort((a: any, b: any) => dist(a) - dist(b));
        if (sorted.length > 1 && dist(sorted[0]) === dist(sorted[1])) return null;   // 최근접 동률 → fail-safe
        const e0 = sorted[0]; const et0 = Date.parse(e0.commence_time || "");
        if (isNaN(et0)) return hits.length === 1 ? e0 : null;        // 이벤트 시각 미상 → 유일 히트만
        // 상호 최근접: 같은 리그·같은 팀 조합의 다른 경기가 이 이벤트에 더 가까우면 그쪽 몫
        const rival = games.some((o: any) => o !== g && o.lg === g.lg &&
          ((teamMatch(e0.home_team, o.home.nm) && teamMatch(e0.away_team, o.away.nm)) ||
           (teamMatch(e0.home_team, o.away.nm) && teamMatch(e0.away_team, o.home.nm))) &&
          !isNaN(Date.parse(o.iso || "")) && Math.abs(Date.parse(o.iso) - et0) < Math.abs(gt - et0));
        return rival ? null : e0;
      })();
      if (!ev) return;
      const core = oddsToCore(ev, g.home, g.away);
      if (core) {
        if (g.lg === "SOC") {
          // Soccer 1X2 (Home/Draw/Away). Real 3-way odds → threeWay; also refresh the
          // 2-way ml (backward-compat for stale clients). Spread/total stay empty.
          if (core.threeWay) { g.threeWay = core.threeWay; g.oddsReal = true; }
          if (core.ml) g.ml = core.ml;
        } else {
          if (core.ml) { g.ml = core.ml; g.oddsReal = true; } if (core.spread) g.spread = core.spread; if (core.total) g.total = core.total;
        }
      }
    });
  } catch (_e) { /* keep ESPN odds if the overlay fails */ }
}

// 🧷 STICKY OPEN-BET GAMES (2026-07-27 사장님 지시 "이렇게 되면 안 되잖아"):
// 열린 베팅이 걸린 "미래" 경기는 ESPN의 기본 창(8일/다음 경기)에서 밀려나도 일정에서
// 사라지지 않는다 — NFL 개막전(9/10)에 벳을 걸었는데 프리시즌이 다음 경기가 되며 목록에서
// 증발한 사건. 우선 직전 live_games 행에서 이월(팀 풀네임 유지 → overlay가 실배당 재부착
// 가능), 거기에도 없으면 베팅 leg 정보로 최소 표시 행을 합성한다(잠금 표시 전용).
// 이월/합성 행은 배당을 비우고 oddsReal:false로 시작 — 묵은 가격이 살아남지 않는다(오즈
// 불변식). overlay가 실배당을 찾으면 그때만 다시 열린다. 과거 경기는 제외(정산 엔진 몫).
async function stickyOpenBetGames(games: any[], SB_URL: string, H: Record<string, string>) {
  try {
    const have = new Set(games.map((g: any) => g.gid));
    const pr = await fetch(`${SB_URL}/rest/v1/positions?server=eq.sports&status=eq.open&select=meta`, { headers: H });
    if (!pr.ok) return;
    const pos = await pr.json();
    const want: Record<string, any> = {};   // gid → 대표 leg (표시 합성용)
    (pos || []).forEach((p: any) => {
      const legs = (p.meta && Array.isArray(p.meta.legs)) ? p.meta.legs : [];
      legs.forEach((l: any) => { if (l && l.gid && !have.has(l.gid) && !want[l.gid]) want[l.gid] = l; });
    });
    const gids = Object.keys(want);
    if (!gids.length) return;
    // ① 직전 행에서 이월 (팀 이름 온전 → overlay 재부착 가능)
    let prev: any[] = [];
    try {
      const old = await fetch(`${SB_URL}/rest/v1/live_games?select=data&id=eq.all`, { headers: H });
      if (old.ok) { const rows = await old.json(); prev = (rows?.[0]?.data) || []; }
    } catch (_e) { /* prev 없이도 ②로 진행 */ }
    for (const gid of gids) {
      const l = want[gid];
      const pg = prev.find((g: any) => g && g.gid === gid);
      const iso = (pg && pg.iso) || l.kt || "";
      const t = Date.parse(iso || "");
      if (!Number.isFinite(t) || t < Date.now()) continue;   // 시작됐거나 시각 미상 → 이월 안 함
      if (pg) {
        games.push({ ...pg, live: false, time: fmtTime(iso),
          ml: [], spread: [], total: [], threeWay: [], outright: [], oddsReal: false });
      } else {
        // ② 부트스트랩 합성 — 이미 밀려난 경기 (leg의 "AWAY @ HOME" 문자열로 최소 행)
        const gm = String(l.gm || l.game || "").split("@").map((x: string) => x.trim());
        const awayAb = gm[0] || "?", homeAb = gm[1] || "?";
        games.push({ gid, lg: String(l.lg || gid.split("_")[0] || ""), sport: "",
          live: false, time: fmtTime(iso), iso,
          home: { ab: homeAb, nm: homeAb }, away: { ab: awayAb, nm: awayAb },
          spread: [], total: [], ml: [], threeWay: [], outright: [], oddsReal: false });
      }
    }
  } catch (_e) { /* sticky는 표시 연속성 — 실패해도 본 피드는 그대로 */ }
}

// 🔎 진단 (2026-08-19 블랙아웃). 예전엔 `!res.ok` 를 **조용히 건너뛰어** 왜 0경기인지 알 길이 없었다
//    — 로그에도 안 남아 사장님 화면이 유일한 신호였다. 시도별 결과를 모아 응답에 실어 보낸다.
//    한 번 호출하면 어느 리그가 어떤 상태로 죽었는지 바로 보인다(부작용 없음, 순수 관측).
const DIAG: any[] = [];

async function fetchLeague(L: { lg: string; sport: string; path: string }, out: any[], endMs?: number) {
  // Request a date RANGE (today → +8d, 또는 배당 지평 endMs까지) so live_games carries
  // UPCOMING fixtures — ESPN's default scoreboard is today-only. 배당 지평(oddsHorizons)이
  // 더 멀면 거기까지 늘려서 "가격 나온 경기는 전부 목록에" (일관성 규칙, 2026-07-27).
  // BUT if a league has NO games in that window (e.g. an off-season NFL whose next game is
  // weeks out — the +8d range dropped it), fall back to the PLAIN scoreboard so its next
  // scheduled games still show. Order: ranged (+mirror) → plain (+mirror). Never fewer.
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ymd = (x: Date) => "" + x.getUTCFullYear() + p2(x.getUTCMonth() + 1) + p2(x.getUTCDate());
  const endTs = Math.max(endMs || 0, Date.now() + 8 * 86400000);
  const range = ymd(new Date()) + "-" + ymd(new Date(endTs));
  const base = `https://site.api.espn.com/apis/site/v2/sports/${L.path}/scoreboard`;
  const cp = (u: string) => "https://corsproxy.io/?url=" + encodeURIComponent(u);
  // 미러 2종 — 한 프록시가 죽어도 보드가 통째로 비지 않게 (2026-08-19: 전 리그 0경기 사고).
  const ao = (u: string) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u);
  const tries = withUAs(
    [base + "?dates=" + range, base],
    [cp(base + "?dates=" + range), ao(base + "?dates=" + range), cp(base), ao(base)]);
  const before = out.length;
  for (const [ua, u, h] of tries) {
    try {
      const res = await espnFetch(u, h);
      if (!res.ok) { DIAG.push({ lg: L.lg, ua, url: u.slice(0, 50), status: res.status }); continue; }
      const d = await res.json();
      DIAG.push({ lg: L.lg, ua, url: u.slice(0, 50), status: 200, events: (d.events || []).length });
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
            oddsReal: core.real === true,   // false = fabricated placeholder line → not bettable
          });
        } catch (_e) { /* skip one event */ }
      }
      if (out.length > before) return; // got games from this URL → done
      // else: 200 OK but 0 games (an off-season league in the ranged window) → keep going
      // so the plain (default) scoreboard fallback can add its next scheduled games.
    } catch (e) { DIAG.push({ lg: L.lg, ua, url: u.slice(0, 50), err: String((e as Error).message).slice(0, 80) }); }
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

  // 배당 행 1회 로드 → ① 리그별 목록 지평 계산 ② overlay 재사용
  const oddsRows = await fetchOddsRows(SB_URL, H);
  const hz = oddsHorizons(oddsRows);

  const games: any[] = [];
  await Promise.all([...LEAGUES.map((L) => fetchLeague(L, games, hz[L.lg])), fetchGolf(games)]);

  // 🧷 베팅 걸린 미래 경기 이월 — overlay 전에 넣어야 실배당이 재부착된다.
  await stickyOpenBetGames(games, SB_URL, H);

  // Overlay the REAL odds the app already uses (sports_odds table) so the
  // dashboard's live_games carries the same real moneyline/spread/total.
  await overlayRealOdds(games, oddsRows);

  // 🛡️ 붕괴 가드 (2026-08-19 실사고). 상류(ESPN)가 빈 값을 주면 games 에는 sticky 이월분만
  //    남는데, 예전엔 그걸로 **멀쩡한 441경기 행을 그대로 덮어썼다** → 고객 스포츠북이 2경기로
  //    비었다. 크론은 계속 돌아 updated_at 이 갱신되니 신선도 감시는 내내 초록이었다.
  //    규칙: 직전 행이 건강(20경기+)하고 **최근(2h 이내)** 인데 새 목록이 그 절반 미만이면
  //    **덮어쓰지 않고 실패로 보고**한다. 옛 데이터가 잠시 남는 게 빈 화면보다 낫다.
  //    자가치유: 진짜로 경기가 줄어든 경우(시즌 종료 등)엔 2시간 뒤 직전 행이 낡아 가드가 풀려
  //    정상적으로 축소분이 반영된다 — 상태 저장 없이 스스로 빠져나온다.
  let prevCount = 0, prevAgeMs = Number.POSITIVE_INFINITY;
  try {
    const pr = await fetch(`${SB_URL}/rest/v1/live_games?select=data,updated_at&id=eq.all`, { headers: H });
    if (pr.ok) { const rows = await pr.json(); const row = rows?.[0];
      if (row) { prevCount = Array.isArray(row.data) ? row.data.length : 0;
                 prevAgeMs = Date.now() - Date.parse(row.updated_at || 0); } }
  } catch (_e) { /* 직전 행을 못 읽으면 가드 없이 진행 (첫 배포·빈 테이블) */ }
  const floor = Math.max(10, Math.floor(prevCount * 0.5));
  if (prevCount >= 20 && games.length < floor && prevAgeMs < 2 * 3600 * 1000) {
    return json({ ok: false, error: "collapse-guard: refused to overwrite a healthy feed",
      got: games.length, prev: prevCount, floor, prev_age_min: Math.round(prevAgeMs / 60000),
      diag: DIAG.slice(0, 40) }, 500);
  }

  // 🔎 진단을 **DB 에 남긴다** (2026-08-20). 응답에만 실으면 크론이 받아가고 끝이라 사람이
  //    대시보드를 뒤져야 했다 — 그 사이 원인 파악이 하루 늦었다. live_games 에 id='diag' 행으로
  //    적어두면 누구든(운영 스크립트 포함) 바로 읽는다. 클라는 id='all' 만 읽으므로 무해하다.
  try {
    await fetch(`${SB_URL}/rest/v1/live_games?on_conflict=id`, {
      method: "POST",
      headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: "diag", data: DIAG.slice(0, 60), updated_at: new Date().toISOString() }),
    });
  } catch (_e) { /* 진단 기록 실패가 본 피드를 막으면 안 된다 */ }

  // Upsert the single 'all' row (clients read this).
  const r = await fetch(`${SB_URL}/rest/v1/live_games?on_conflict=id`, {
    method: "POST",
    headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "all", data: games, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) return json({ ok: false, error: "store " + r.status + " " + (await r.text()) }, 500);
  // 진단은 항상 실어 보낸다 — 0경기일 때 "왜"를 한 번의 호출로 알 수 있어야 한다.
  return json({ ok: true, games: games.length, diag: DIAG.slice(0, 40) });
});
