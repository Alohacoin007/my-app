// Alpexa — sports-settle
// SERVER-SIDE bet settlement. Replaces the old client-side "I won, credit me"
// path (which let a customer post their own ledger credit = self-credit fraud).
//
// Flow:
//   1) Pull final scores from ESPN (public, no key) for NFL/NBA/MLB/NHL.
//   2) Load open sports bets from `positions` (status=open).
//   3) Grade every leg (moneyline / spread / total) — same rules as the app.
//   4) For each fully-graded bet, atomically CLAIM it (delete the row; the app's
//      claim does the same, so only ONE actor credits a bet) and then, server-
//      side with the service role:
//        • winner  → ledger credit of the payout (ref=betpay-<id>, idempotent)
//        • write a settlements record (bet_won / bet_lost) for the back office
//   The trg_apply_ledger trigger applies the ledger row to accounts.balance.
//
// Trigger on a schedule (every ~3–5 min) via pg_cron, like sports-odds.
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto). Optional CRON_SECRET.

// 🪪 ESPN 요청은 **정직한 자기 식별 UA** 로 나간다 (2026-08-20 실측으로 확정).
//    ESPN 은 `User-Agent: Deno/x.x`(Deno 가 자동으로 붙이는 값)를 403 으로 막는다.
//    sports-games 의 UA 매트릭스 실측(live_games diag 04:16):
//        deno-default → 403 ×11 · 빈 UA → 403 ×11 · "alpexa-feed/1.0" → 200 전 리그
//    ⚠️ 정산에서 이게 왜 돈 문제인가: 여기 403 이면 최종 스코어가 안 들어와 **끝난 경기의
//    베팅이 영원히 열린 채로 남는다**(고객 돈이 묶임). 2026-08-19~20 블랙아웃 동안 실제로
//    그 상태였다. 표시 피드(sports-games)만 고치면 화면은 살아나도 정산은 계속 죽어 있다.
//    ⚠️ 브라우저인 척(크롬 UA / Referer: espn.com)은 금지 — 그건 오히려 403 을 부른다.
//       sports-games 와 **같은 값**을 쓴다. 한쪽만 바꾸면 한쪽이 다시 조용히 죽는다.
const ESPN_UA = "alpexa-feed/1.0";
const ESPN_INIT: RequestInit = { cache: "no-store", headers: { "User-Agent": ESPN_UA } };

// ── 판정 상수 (모듈 레벨: tests/settle-dual-source.test.js 가 legVerdict 와 함께 추출해 실제 코드로 행위 검증) ──
// 업계 표준 규칙 2종 (2026-07-19 사장님 승인 — SP-100058 연기경기 무한대기 사고):
//  A. 조기 패배 확정 — 한 leg라도 확정 패배면 나머지를 기다리지 않고 즉시 LOST (죽은 팔레이는 안 기다린다).
//  B. 연기 void — 예정 킥오프 +48h에도 최종 결과가 없으면 그 leg는 무효(배당 1.0)로 제외.
//     단, "안 열렸음"이 6일 결과 조회창 안에서 **증명**될 때만. ⚠️ 2026-09-16 fail-open 폐쇄: 예전엔 "결과 없음"
//     이면 조회 **실패**(ESPN 400/403)도 같은 취급이라 실제로 열린 경기가 환불될 뻔했다. 이제 void 는 그 리그의
//     킥오프 날(+전날) 스코어보드를 200 으로 받았다는 커버리지 증명이 있을 때만(legVerdict).
const VOID_AFTER_MS = 48 * 3600e3;
const PROVABLE_MS = 6 * 86400000;   // fetchLeagueResults 의 캐치업 창과 반드시 동일
// 2차 출처(The Odds API scores)의 이벤트를 "같은 경기"로 인정하는 킥오프 허용차 — 오즈 overlay 와 동일 6h.
const ODDS_KICKOFF_MS = 6 * 3600e3;
// lg → The Odds API 종목 키 (sports-games ODDS_SPORT/ODDS_EXTRA + 축구 4키와 락스텝). UFC·GOLF 는 2차 출처 없음.
const ODDS_KEYS: Record<string, string[]> = {
  NFL: ["americanfootball_nfl", "americanfootball_nfl_preseason"], NBA: ["basketball_nba"], NCAAB: ["basketball_ncaab"],
  MLB: ["baseball_mlb"], NHL: ["icehockey_nhl"],
  SOC: ["soccer_epl", "soccer_usa_mls", "soccer_uefa_champs_league", "soccer_fifa_world_cup"],
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const LEAGUES = [
  { lg: "NFL", path: "football/nfl" },
  { lg: "NBA", path: "basketball/nba" },
  // 🎓 NCAAB (2026-07-27) — sports-games와 같은 gid 체계 (NCAAB_<eventId>), NBA와 동일 채점.
  { lg: "NCAAB", path: "basketball/mens-college-basketball" },
  { lg: "MLB", path: "baseball/mlb" },
  { lg: "NHL", path: "hockey/nhl" },
  // ⚽ Soccer — must mirror the app's LEAGUES (same lg:'SOC' + paths) so the
  // gid (lg + "_" + eventId) matches between the bet legs and these results.
  // A drawn match makes moneyline legs grade as "push" (refund) = Draw No Bet.
  { lg: "SOC", path: "soccer/fifa.world" },
  { lg: "SOC", path: "soccer/eng.1" },
  { lg: "SOC", path: "soccer/uefa.champions" },
  { lg: "SOC", path: "soccer/usa.1" },
];

type Result = { hs: number; as: number; homeNm: string; awayNm: string; homeAb: string; awayAb: string;
  homeAll?: string[]; awayAll?: string[] };   // 모든 이름 변형(short/display/name/location) — 팀명 매칭용

// cov: `${lg}|${YYYYMMDD}` → 그날 스코어보드를 200 으로 받은 경로 수. SOC 처럼 한 lg 에 경로가 여러 개면 전부
//      성공해야 "그날을 다 봤다"(covered) — 하나라도 실패한 날은 그 리그 경기가 빠졌을 수 있으니 void 금지.
async function fetchLeagueResults(L: { lg: string; path: string }, out: Record<string, Result>, cov: Record<string, number>) {
  // CATCH-UP WINDOW (#33): ESPN's default scoreboard returns ONLY the current day. A game that
  // finished but wasn't settled the same day (settle downtime / late finish) fell off the feed
  // → its still-open bet could never settle and was orphaned forever (the daily audit's C1
  // "묵은 미정산" catches these — that's how this was found). Fetch the last 6 days via a dates
  // range so recently-finished games are re-included and still settle (self-heal).
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  // ⚠️ 2026-09-16: ESPN 이 `?dates=A-B` 범위를 전 리그 400 으로 거절한다 (러너 프로브 실측, 단일 일자
  //    `dates=YYYYMMDD` 는 200). 같은 7일 catch-up 을 **일자별 7회** 로 받는다. 하루라도 실패하면 그날은
  //    건너뛰고 나머지는 처리 — 부분 실패가 전체 정산을 막지 않게.
  const today = new Date();
  for (let k = 6; k >= 0; k--) {
    const dayStr = ymd(new Date(today.getTime() - k * 86400000));
    const direct = `https://site.api.espn.com/apis/site/v2/sports/${L.path}/scoreboard?dates=${dayStr}`;
    const tries = [direct, "https://corsproxy.io/?url=" + encodeURIComponent(direct)];
    for (const u of tries) {
    try {
      const res = await fetch(u, ESPN_INIT);
      if (!res.ok) continue;
      const d = await res.json();
      for (const ev of (d.events || [])) {
        try {
          const comp = ev.competitions && ev.competitions[0];
          if (!comp || !comp.competitors) continue;
          const st = (ev.status && ev.status.type) ? ev.status.type : {};
          if (st.state !== "post") continue; // only FINAL games
          const hc = comp.competitors.find((c: any) => c.homeAway === "home");
          const ac = comp.competitors.find((c: any) => c.homeAway === "away");
          if (!hc || !ac || !hc.team || !ac.team) continue;
          const hs = parseInt(hc.score, 10), as = parseInt(ac.score, 10);
          if (isNaN(hs) || isNaN(as)) continue;
          const gid = L.lg + "_" + ev.id;
          // 이름 변형 전부 수록 — MLS/축구 클럽은 shortDisplayName("Sporting KC")과 베팅 leg의
          // 픽 이름("Kansas City")이 다르다. displayName("Sporting Kansas City")·location까지
          // 가지고 있어야 토큰 매칭이 산다 (2026-07-19 SP-100058 영구 미정산 사고).
          const variants = (t: any) => [t.shortDisplayName, t.displayName, t.name, t.location]
            .filter((x: any) => typeof x === "string" && x.trim());
          out[gid] = {
            hs, as,
            homeNm: hc.team.shortDisplayName || hc.team.name || hc.team.displayName || "Home",
            awayNm: ac.team.shortDisplayName || ac.team.name || ac.team.displayName || "Away",
            homeAb: String(hc.team.abbreviation || hc.team.shortDisplayName || "").toUpperCase(),
            awayAb: String(ac.team.abbreviation || ac.team.shortDisplayName || "").toUpperCase(),
            homeAll: variants(hc.team), awayAll: variants(ac.team),
          };
        } catch (_e) { /* skip event */ }
      }
      cov[L.lg + "|" + dayStr] = (cov[L.lg + "|" + dayStr] || 0) + 1;   // 이 경로가 그날을 성공적으로 봤다
      break; // got this day → next day
    } catch (_e) { /* try next mirror */ }
    }
  }
}

// ── 2차 출처: The Odds API `scores` (2026-09-16 사장님 승인 "정산 스코어 이중 출처") ──
// ESPN 에 결과가 없는 leg 가 있을 때 **그 리그만**, 그 leg 들의 oid 로만 조회한다(on-demand — 평상시 호출 0).
// 우리가 이미 유료 구독 중인 같은 프로바이더라 키 추가 없음. daysFrom=3 이 API 상한(ESPN 캐치업은 6일).
// 반환: oid → { completed, commence, home, away, hs, as }. 채점은 legVerdict 가 completed:true + 킥오프 ±6h 일 때만.
type OddsScore = { completed: boolean; commence: number; home: string; away: string; hs: number | null; as: number | null };
async function fetchOddsScores(KEY: string, sportKey: string, oids: string[], out: Record<string, OddsScore>, diag: any[]) {
  if (!oids.length) return;
  try {
    const u = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${KEY}&daysFrom=3&eventIds=${encodeURIComponent(oids.join(","))}`;
    // 정직한 자기 식별 UA 그대로 (ESPN 과 같은 값 — 위장 금지 규율 동일)
    const res = await fetch(u, { cache: "no-store", headers: { "User-Agent": ESPN_UA } });
    if (!res.ok) { diag.push({ sportKey, status: res.status }); return; }
    const arr = await res.json();
    let hit = 0;
    for (const ev of (Array.isArray(arr) ? arr : [])) {
      try {
        const id = String(ev.id || ""); if (!oids.includes(id)) continue;
        const sc = Array.isArray(ev.scores) ? ev.scores : [];
        const num = (nm: string) => { const s = sc.find((x: any) => x && x.name === nm); const n = s ? parseInt(String(s.score), 10) : NaN; return Number.isFinite(n) ? n : null; };
        out[id] = { completed: ev.completed === true, commence: Date.parse(ev.commence_time || ""), home: String(ev.home_team || ""), away: String(ev.away_team || ""), hs: num(ev.home_team), as: num(ev.away_team) };
        hit++;
      } catch (_e) { /* skip one */ }
    }
    diag.push({ sportKey, status: 200, asked: oids.length, hit });
  } catch (e) { diag.push({ sportKey, err: String((e as Error).message).slice(0, 80) }); }
}

// ── leg 판정 (순수 함수 — 돈 규칙의 진실. tests/settle-dual-source.test.js 가 이 코드를 그대로 추출해 9케이스 실행) ──
// 반환: "won" | "lost" | "push" | "void" | "pending"
//   ① ESPN 결과가 있으면 ESPN 으로만 채점 (2차 출처는 보지도 않는다 — 한 출처 불변식).
//   ② ESPN 없음 + leg 에 oid + Odds 결과가 completed:true 이고 킥오프 ±6h 일치 → Odds 로 채점.
//      팀 이름은 Odds 이름 + place_bet 이 도장한 hn/an 둘 다로 매칭(teamSide 가 못 정하면 보류).
//   ③ 둘 다 없음 → 규칙 B: 48h 초과 · 6일 증명창 안 · **킥오프 날과 전날을 그 리그가 200 으로 다 봤을 때만** void.
//      조회 실패한 날은 "경기가 없다"의 증거가 아니다 → 보류. (2026-09-16 fail-open 폐쇄)
function legVerdict(l: any, espn: Record<string, Result>, odds: Record<string, OddsScore>, covered: (lg: string, ymd: string) => boolean, now: number): string {
  const r = espn[l.gid];
  if (r) return gradeLeg(l, r) ?? "pending";
  const oid = l.oid ? String(l.oid) : "";
  const kt = Date.parse(l.kt || "");
  if (oid && odds[oid]) {
    const o = odds[oid];
    if (o.completed === true && Number.isFinite(kt) && Number.isFinite(o.commence) && Math.abs(o.commence - kt) <= ODDS_KICKOFF_MS
        && typeof o.hs === "number" && typeof o.as === "number") {
      const rr: Result = { hs: o.hs, as: o.as, homeNm: o.home, awayNm: o.away, homeAb: "", awayAb: "",
        homeAll: [o.home, l.hn].filter((x: any) => typeof x === "string" && x.trim()),
        awayAll: [o.away, l.an].filter((x: any) => typeof x === "string" && x.trim()) };
      return gradeLeg(l, rr) ?? "pending";
    }
    return "pending";   // 진행중/미완/킥오프 불일치/스코어 결손 → 추측 안 함
  }
  // `LG_o<oddsId>` = Odds 1차 목록에서 온 경기 (2026-09-17). ESPN 은 이 경기를 모르므로 ESPN 커버리지는
  // "경기가 없다"의 증거가 될 수 없다 → 규칙 B void 금지. Odds scores 가 올 때까지 보류 (C1 이 36h 에 잡는다).
  if (/_o[0-9a-f]{6,}$/i.test(String(l.gid || ""))) return "pending";
  const age = Number.isFinite(kt) ? now - kt : NaN;
  if (!(age > VOID_AFTER_MS && age < PROVABLE_MS)) return "pending";
  const day = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
  if (covered(String(l.lg || ""), day(kt)) && covered(String(l.lg || ""), day(kt - 86400000))) return "void";
  return "pending";
}

// 🥊 UFC/MMA — a fight card (event) holds many bouts (ev.competitions[]). The
// winner gets score 1, loser 0, so the shared gradeLeg moneyline (my>op) works.
// gid = "UFC_" + bout id, mirroring the app's mapUFC so legs line up.
async function fetchUFCResults(out: Record<string, Result>) {
  // Same catch-up window (#33) — a UFC card a couple days old must still settle.
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  // ⚠️ 2026-09-16: 팀 종목과 같은 이유로 `dates=A-B` 범위 대신 **일자별 7회** (ESPN 범위 400).
  const today = new Date();
  for (let k = 6; k >= 0; k--) {
    const dayStr = ymd(new Date(today.getTime() - k * 86400000));
    const direct = `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${dayStr}`;
    const tries = [direct, "https://corsproxy.io/?url=" + encodeURIComponent(direct)];
    for (const u of tries) {
      try {
        const res = await fetch(u, ESPN_INIT);
        if (!res.ok) continue;
        const d = await res.json();
        for (const ev of (d.events || [])) {
          for (const comp of (ev.competitions || [])) {
            try {
              const st = (comp.status && comp.status.type) ? comp.status.type : {};
              if (st.state !== "post") continue; // only finished bouts
              const cs = comp.competitors || []; if (cs.length < 2) continue;
              let A = cs.find((c: any) => c.homeAway === "home") || cs[0];
              let B = cs.find((c: any) => c.homeAway === "away") || cs[1];
              if (A === B) { A = cs[0]; B = cs[1]; }
              const nameOf = (c: any) => { const a = c.athlete || c.team || {}; return a.shortName || a.displayName || a.name || ""; };
              const aw = A.winner === true, bw = B.winner === true;
              if (!aw && !bw) continue; // no winner recorded (e.g., no contest) → leave ungraded
              out["UFC_" + comp.id] = { hs: aw ? 1 : 0, as: bw ? 1 : 0, homeNm: nameOf(A), awayNm: nameOf(B), homeAb: "", awayAb: "" };
            } catch (_e) { /* skip bout */ }
          }
        }
        break; // got this day → next day
      } catch (_e) { /* try next mirror */ }
    }
  }
}

// ⛳ Golf OUTRIGHT winners — gid "GOLF_<espnEventId>" → champion's name. Only FINAL
// tournaments with an unambiguous winner land in the map; anything else stays
// ungraded (bet stays open) rather than guessing. Same 6-day catch-up window (#33).
async function fetchGolfWinners(out: Record<string, string>) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const today = new Date(); const from = new Date(today.getTime() - 6 * 86400000);
  const direct = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${ymd(from)}-${ymd(today)}`;
  const tries = [direct, "https://corsproxy.io/?url=" + encodeURIComponent(direct)];
  for (const u of tries) {
    try {
      const res = await fetch(u, ESPN_INIT);
      if (!res.ok) continue;
      const d = await res.json();
      for (const ev of (d.events || [])) {
        try {
          const st = (ev.status && ev.status.type) ? ev.status.type : {};
          if (st.state !== "post") continue; // only FINAL tournaments
          const cs = (ev.competitions && ev.competitions[0] && ev.competitions[0].competitors) || [];
          const nameOf = (c: any) => { const a = c.athlete || {}; return a.displayName || a.shortName || a.fullName || ""; };
          // Champion = the explicit winner flag; fallback: exactly ONE player at position 1
          // (a tie at #1 on a "final" board = unresolved playoff → leave ungraded).
          let champs = cs.filter((c: any) => c.winner === true);
          if (!champs.length) champs = cs.filter((c: any) => String(c?.status?.position?.id || "") === "1");
          if (champs.length !== 1) continue;
          const nm = nameOf(champs[0]); if (!nm) continue;
          out["GOLF_" + ev.id] = nm;
        } catch (_e) { /* skip event */ }
      }
      return;
    } catch (_e) { /* try next mirror */ }
  }
}
// Player-name match for grading (Odds API sel vs ESPN winner). Exact normalized
// equality first; else token subset ("S. Scheffler" ⊆ "Scottie Scheffler" fails safely —
// initials are dropped as short tokens, leaving "scheffler" ⊆ full name).
function normPlayer(s: string): string { return String(s || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim(); }
function playerMatch(a: string, b: string): boolean {
  const A = normPlayer(a), B = normPlayer(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const at = A.split(" ").filter((t) => t.length > 2), bt = B.split(" ").filter((t) => t.length > 2);
  if (!at.length || !bt.length) return false;
  const [short, long] = at.length <= bt.length ? [at, bt] : [bt, at];
  return short.every((t) => long.includes(t));
}

// 팀 → 홈/원정 판정. 오즈 매칭과 같은 규율(정규화 토큰 부분집합 + 유일매칭 — 2026-07-08 오즈 불변식):
// "Kansas City" ⊆ "Sporting Kansas City" ✓, "Vancouver" ⊆ "Vancouver Whitecaps FC" ✓.
// 양쪽 다 맞으면(모호) null = 채점 보류 — 돈은 절대 추측으로 안 움직인다(fail-safe).
function normTeam(s: string): string { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function nameHit(t: string, names: string[]): number {   // 0=불일치 · 1=토큰/부분 · 2=정확
  const tt = normTeam(t); if (!tt) return 0;
  const toks = tt.split(" ").filter((w) => w.length > 1);
  let best = 0;
  for (const n of names) {
    const nn = normTeam(n); if (!nn) continue;
    if (nn === tt) return 2;
    const nt = nn.split(" ").filter((w) => w.length > 1);
    const sub = toks.length && nt.length && (toks.every((w) => nt.includes(w)) || nt.every((w) => toks.includes(w)));
    if (sub || nn.indexOf(tt) >= 0) best = Math.max(best, 1);
  }
  return best;
}
function teamSide(team: string, r: Result): "home" | "away" | null {
  const t = (team || "").trim(); if (!t) return null;
  const H = (r.homeAll && r.homeAll.length ? r.homeAll : [r.homeNm]).concat(r.homeAb ? [r.homeAb] : []);
  const A = (r.awayAll && r.awayAll.length ? r.awayAll : [r.awayNm]).concat(r.awayAb ? [r.awayAb] : []);
  const h = nameHit(t, H), a = nameHit(t, A);
  if (h > a) return "home";
  if (a > h) return "away";
  return null;   // 동점(모호) 또는 무일치 → 채점 불가(베팅 열린 채 유지)
}
// Returns 'won' | 'lost' | 'push' | null(not gradeable). Mirrors the app's gradeLeg.
function gradeLeg(l: any, r: Result): string | null {
  const sel = (l.sel || l.pk || "").trim();
  const mkt = (l.market || "").toLowerCase();
  const hs = r.hs, as = r.as;
  if (typeof hs !== "number" || typeof as !== "number") return null;
  if (mkt.indexOf("total") >= 0 || /^(over|under)/i.test(sel)) {
    const m = sel.match(/(over|under)\s+([\d.]+)/i); if (!m) return null;
    const tot = hs + as, line = parseFloat(m[2]); if (tot === line) return "push";
    return (m[1].toLowerCase() === "over") ? (tot > line ? "won" : "lost") : (tot < line ? "won" : "lost");
  }
  // SOCCER 1X2 (Full-Time Result: Home / Draw / Away). Unlike the 2-way "Draw No Bet"
  // moneyline below, a DRAW is its own bettable outcome here: a TEAM pick LOSES on a draw
  // (not push), and a "Draw" pick WINS on a draw. Routed by market='1X2' so it never
  // collides with the classic moneyline. MUST come before the moneyline branch.
  if (mkt.indexOf("1x2") >= 0) {
    const s = sel.replace(/\s*ML$/i, "").trim();
    if (/^(draw|x)$/i.test(s)) return hs === as ? "won" : "lost";
    const side = teamSide(s, r); if (!side) return null;
    const my = side === "home" ? hs : as, op = side === "home" ? as : hs;
    return my > op ? "won" : "lost"; // team must WIN outright; draw = lost
  }
  if (mkt.indexOf("money") >= 0 || / ML$/i.test(sel)) {
    const team = sel.replace(/\s*ML$/i, "").trim(), side = teamSide(team, r); if (!side) return null;
    const my = side === "home" ? hs : as, op = side === "home" ? as : hs; if (my === op) return "push"; return my > op ? "won" : "lost";
  }
  if (mkt.indexOf("spread") >= 0 || /[-+][\d.]+\s*$/.test(sel)) {
    const m = sel.match(/([-+]?[\d.]+)\s*$/); if (!m) return null;
    const line = parseFloat(m[1]), team = sel.replace(/\s*[-+]?[\d.]+\s*$/, "").trim(), side = teamSide(team, r); if (!side) return null;
    const my = side === "home" ? hs : as, op = side === "home" ? as : hs, diff = (my + line) - op;
    if (diff === 0) return "push"; return diff > 0 ? "won" : "lost";
  }
  return null;
}
function decOf(l: any): number {
  if (+l.dec0 > 1) return +l.dec0;
  const am = +(l.am0 != null ? l.am0 : l.am) || 0;
  if (!am) return 1;
  return am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  // B8 CLOSED — FAIL-CLOSED. No CRON_SECRET → 503 (a misconfig is loud, not silently
  // world-callable payout). With the secret set, require ?token=<CRON_SECRET> (cron_secure.sql).
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  // 1) Final scores from ESPN (team leagues + UFC bouts + golf tournament winners).
  const results: Record<string, Result> = {};
  const golfWin: Record<string, string> = {};
  const cov: Record<string, number> = {};   // `${lg}|${YYYYMMDD}` → 200 받은 경로 수 (void 커버리지 증명)
  await Promise.all([...LEAGUES.map((L) => fetchLeagueResults(L, results, cov)), fetchUFCResults(results), fetchGolfWinners(golfWin)]);
  const pathsOf: Record<string, number> = {}; LEAGUES.forEach((L) => { pathsOf[L.lg] = (pathsOf[L.lg] || 0) + 1; });
  const covered = (lg: string, ymd: string) => (cov[lg + "|" + ymd] || 0) >= (pathsOf[lg] || Infinity);
  // Debug: ?debug=1 returns the final-game results map (gid -> score) so we can
  // craft a controlled test bet on a real finished game.
  if (url.searchParams.get("debug")) return json({ ok: true, results, golfWin, cov });

  // 2) Open sports bets.
  const posRes = await fetch(`${SB_URL}/rest/v1/positions?server=eq.sports&status=eq.open&select=id,cust_id,acct_no,local_id,stake,meta,symbol`, { headers: H });
  if (!posRes.ok) return json({ ok: false, error: "positions read " + posRes.status }, 500);
  const positions = await posRes.json();

  // 2b) 2차 출처 on-demand (2026-09-16): ESPN 에 결과가 없는 팀 종목 leg 중 oid 가 있는 것만 모아 리그별로
  //     The Odds API scores 를 조회한다. 평상시(ESPN 정상) 호출 0. 키 없으면 조용히 생략 = 종전 ESPN 전용과 동일.
  const odds: Record<string, OddsScore> = {};
  const oddsDiag: any[] = [];
  {
    const ODDS_KEY = Deno.env.get("ODDS_API_KEY");
    const want: Record<string, Set<string>> = {};
    for (const p of positions) {
      const legs = (p.meta && Array.isArray(p.meta.legs)) ? p.meta.legs : [];
      for (const l of legs) {
        if (!l || /outright/i.test(String(l.market || "")) || results[l.gid] || !l.oid) continue;
        const lg = String(l.lg || String(l.gid || "").split("_")[0] || "");
        if (!ODDS_KEYS[lg]) continue;
        (want[lg] || (want[lg] = new Set())).add(String(l.oid));
      }
    }
    const lgs = Object.keys(want);
    if (lgs.length && !ODDS_KEY) oddsDiag.push({ skipped: "ODDS_API_KEY not set", legs: lgs.map((lg) => lg + ":" + want[lg].size) });
    if (lgs.length && ODDS_KEY) {
      await Promise.all(lgs.flatMap((lg) => ODDS_KEYS[lg].map((k) => fetchOddsScores(ODDS_KEY, k, [...want[lg]], odds, oddsDiag))));
    }
  }

  const settled: any[] = [];
  const NOW = Date.now();
  for (const p of positions) {
    try {
      const meta = (p.meta && typeof p.meta === "object") ? p.meta : {};
      const legs = Array.isArray(meta.legs) ? meta.legs : [];
      if (!legs.length) continue;
      // stake = 서버가 실제 차감한 positions.stake 컬럼만 (2026-07-27 전수감사).
      // 종전 `+meta.stake || +p.stake`는 클라가 보낸 meta.stake를 우선 신뢰 —
      // $10 걸고 meta.stake=25000 넣으면 승리 시 25000 기준 지급되는 구멍이었다.
      const stake = +p.stake || 0;
      let anyLost = false, pending = 0, decMul = 1;
      const legResults: any[] = [];
      for (const l of legs) {
        let g: string;
        const push = (r: string) => legResults.push({ pk: (l.sel || l.pk || ""), gm: (l.gm || l.game || ""), am: (+l.am || 0), gid: (l.gid || ""), lg: (l.lg || ""), r });
        if (/outright/i.test(String(l.market || ""))) {
          // ⛳ OUTRIGHT: graded only against a FINAL tournament's confirmed champion.
          // No winner yet (still playing / playoff / no data) → leg pending.
          const w = golfWin[l.gid];
          if (!w) { pending++; push("pending"); continue; }
          g = playerMatch(l.sel || l.pk || "", w) ? "won" : "lost"; // cut/WD/runner-up = not the winner = lost
        } else {
          // 팀 종목: ESPN → (없으면) Odds oid → (둘 다 없으면) 규칙 B — 전부 legVerdict 한 곳 (순수 함수, 테스트 추출)
          g = legVerdict(l, results, odds, covered, NOW);
          if (g === "pending") { pending++; push("pending"); continue; }
        }
        if (g === "lost") anyLost = true;
        else if (g === "won") decMul *= decOf(l);
        // "void"/"push"는 곱셈 제외(배당 1.0 취급) — 패배 아님
        push(g);
      }
      // 규칙 A: 확정 패배가 있으면 pending 무시하고 즉시 LOST. 아니면 pending 있는 동안 보류.
      if (!anyLost && pending > 0) continue;

      // 3) CLAIM atomically: delete the open row. Only the actor that actually
      // removes it proceeds — prevents double credit (app uses the same claim).
      const claim = await fetch(`${SB_URL}/rest/v1/positions?id=eq.${encodeURIComponent(p.id)}&status=eq.open`, {
        method: "DELETE", headers: { ...H, "Prefer": "return=representation" },
      });
      const claimed = claim.ok ? await claim.json() : [];
      if (!Array.isArray(claimed) || !claimed.length) continue; // someone else settled it

      const won = !anyLost;
      // SGP correlation haircut (D1): a same-game parlay (all legs share one gid) is
      // correlated, so the naive odds product over-pays. Shave the combined multiplier
      // by the same factor the app shows. MUST match sports-live.html SGP_HAIRCUT.
      const SGP_HAIRCUT = 0.25;
      const isSGP = legs.length >= 2 && legs.every((l: any) => l.gid && l.gid === legs[0].gid);
      const mult = (won && isSGP) ? 1 + (decMul - 1) * (1 - SGP_HAIRCUT) : decMul;
      const payout = won ? Math.round(stake * mult * 100) / 100 : 0;
      const ref = "betpay-" + String(p.local_id || p.id);

      // 4a) Credit the payout to the ledger (winners only). Idempotent via ref.
      if (won && payout > 0 && p.acct_no) {
        await fetch(`${SB_URL}/rest/v1/ledger`, {
          method: "POST", headers: { ...H, "Prefer": "return=minimal" },
          body: JSON.stringify({ acct_no: p.acct_no, cust_id: p.cust_id, server: "sports", kind: "bet_won", amount: payout, ref }),
        });
      }
      // 4b) Settlement record for the back office (company P&L by period).
      await fetch(`${SB_URL}/rest/v1/settlements`, {
        method: "POST", headers: { ...H, "Prefer": "return=minimal" },
        body: JSON.stringify({
          cust_id: p.cust_id, acct_no: p.acct_no, server: "sports",
          kind: won ? "bet_won" : "bet_lost", local_id: String(p.local_id || p.id),
          ticket: String(meta.ticket || ""), symbol: p.symbol || meta.type || "Bet",
          stake, pnl: won ? (payout - stake) : -stake, detail: JSON.stringify({ legs: legResults }),
        }),
      });
      settled.push({ local_id: p.local_id, result: won ? "won" : "lost", payout });
    } catch (e) { /* skip this bet */ }
  }

  return json({ ok: true, finalGames: Object.keys(results).length, openBets: positions.length, settled,
    oddsFallback: { hits: Object.keys(odds).length, diag: oddsDiag.slice(0, 20) } });
});
