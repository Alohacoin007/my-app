#!/usr/bin/env node
// Alpexa — 경기 목록 "Odds 1차 + ESPN 보조" 핀 (2026-09-17, 사장님 지시 "경기 목록 1차 출처 전환도 해")
// ============================================================================
// 왜: 목록이 ESPN 단일 출처라 2026-09-15 ESPN 범위 400 때 484→16 경기로 줄었다. 이제 목록 = ESPN ∪ Odds:
//     ESPN 이 모르는(매칭 안 된) Odds 이벤트는 `LG_o<oddsId>` 경기로 추가된다 — ESPN 이 죽어도 프로바이더가
//     가격 낸 경기는 전부 남는다.
// 불변식 (승인 2026-09-17):
//   1. 같은 경기가 두 gid 로 동시에 뜨지 않는다 — overlay 가 소비한 이벤트는 `_o` 로 안 만든다.
//   2. `_o` 경기 가격은 기존 oddsToCore(오버라운드 가드·상호배제 배정) 그대로.
//   3. `_o` 경기는 정산에서 oid 로만 채점되고 규칙 B void 는 절대 안 된다 (ESPN 커버리지는 이 경기의 증거가 아님).
//   4. 시작된 이벤트는 추가 안 함(ESPN 없인 라이브 상태를 모름) · 지평 밖 제외.
// 방식: sports-games 의 실제 함수(oddsOnlyGames + oddsToCore 사슬)를 TS 스트립 후 추출해 실행.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), mod = require('module');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let failed = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  🔴 ') + m); if (!c) failed++; };

const games = R('supabase/functions/sports-games/index.ts');
const settle = R('supabase/functions/sports-settle/index.ts');

console.log('── (A) 소스 핀 ──');
ok(/function oddsOnlyGames\(/.test(games), 'sports-games: Odds 전용 경기 생성 함수 oddsOnlyGames 존재');
ok(/consumed\.add\(String\(ev\.id/.test(games), 'sports-games: overlay 가 소비한 Odds 이벤트 id 를 기록한다 (중복 방지)');
ok(/const oddsOnly = oddsOnlyGames\(oddsRows, consumed/.test(games) && /games\.push\(\.\.\.oddsOnly\)/.test(games), 'sports-games: overlay 뒤에 Odds 전용 경기를 합친다 (소비 집합 전달)');
ok(games.indexOf('games.push(...oddsOnly)') > games.indexOf('await overlayRealOdds(games, oddsRows, consumed)') && games.indexOf('games.push(...oddsOnly)') < games.indexOf('collapse-guard'), 'sports-games: 합치기가 overlay 뒤 · 붕괴 가드 앞 (가드가 합친 목록을 본다)');
ok(/_o[0-9a-f]\{6,\}\$/.test(settle) || /_o\[0-9a-f\]\{6,\}\$/.test(settle), 'settle: `_o` gid 는 규칙 B void 금지 (legVerdict)');

// ── TS 스트립 + 함수/상수 추출 ──
function extractor(src) {
  const js = mod.stripTypeScriptTypes(src, { mode: 'strip' });
  const fn = (name) => {
    const i = js.indexOf('function ' + name + '(');
    if (i < 0) return '';
    let j = js.indexOf('{', i), depth = 0;
    for (; j < js.length; j++) { if (js[j] === '{') depth++; else if (js[j] === '}') { depth--; if (!depth) break; } }
    return js.slice(i, j + 1);
  };
  const cst = (name) => {
    const i = js.indexOf('const ' + name + ' ');
    const i2 = js.indexOf('const ' + name + ':');
    const k = i >= 0 ? i : i2; if (k < 0) return '';
    let j = k, depth = 0;
    for (; j < js.length; j++) { const c = js[j]; if (c === '[' || c === '{' || c === '(') depth++; else if (c === ']' || c === '}' || c === ')') depth--; else if (c === ';' && depth === 0) break; }
    return js.slice(k, j + 1);
  };
  return { fn, cst };
}
const G = extractor(games);
const gcode = ['NAME_ALIAS', 'LETTER_FOLD', 'ODDS_SPORT', 'ODDS_EXTRA', 'SPORT_OF'].map(G.cst).join('\n') + '\n' +
  ['nick', 'normBase', 'stripClub', 'normNm', 'sigToks', 'nameVariants', 'teamMatch', 'allToks', 'teamMatchStrict', 'sideOf',
   'impliedSum', 'decP', 'fmtPt', 'bestOutcome', 'bestPair', 'oddsToCore', 'fmtTime', 'lgOfKey', 'abOf', 'oddsOnlyGames'].map(G.fn).join('\n');
let oddsOnlyGames = null;
try { oddsOnlyGames = new Function(gcode + '\nreturn oddsOnlyGames;')(); } catch (e) { ok(false, 'oddsOnlyGames 추출 실패: ' + e.message); }

console.log('── (B) 행위: 목록 생성 ──');
if (oddsOnlyGames) {
  const NOW = Date.parse('2026-09-17T12:00:00Z');
  const iso = (h) => new Date(NOW + h * 3600e3).toISOString();
  const bk = (h, a, hp, ap, draw) => [{ key: 'b1', markets: [{ key: 'h2h', outcomes: [{ name: h, price: hp }, { name: a, price: ap }].concat(draw ? [{ name: 'Draw', price: draw }] : []) }] }];
  const rows = [
    { sport: 'americanfootball_nfl', data: [
      { id: 'aaaaaa1111', commence_time: iso(30), home_team: 'Buffalo Bills', away_team: 'Detroit Lions', bookmakers: bk('Buffalo Bills', 'Detroit Lions', -150, 130) },
      { id: 'bbbbbb2222', commence_time: iso(50), home_team: 'Chicago Bears', away_team: 'Minnesota Vikings', bookmakers: bk('Chicago Bears', 'Minnesota Vikings', 110, -130) },
      { id: 'cccccc3333', commence_time: iso(-2), home_team: 'Atlanta Falcons', away_team: 'Carolina Panthers', bookmakers: bk('Atlanta Falcons', 'Carolina Panthers', -200, 170) },   // 이미 시작
      { id: 'dddddd4444', commence_time: iso(24 * 20), home_team: 'Denver Broncos', away_team: 'Las Vegas Raiders', bookmakers: bk('Denver Broncos', 'Las Vegas Raiders', -120, 100) },   // 20일 뒤
    ] },
    { sport: 'soccer_epl', data: [
      { id: 'eeeeee5555', commence_time: iso(70), home_team: 'Manchester City', away_team: 'Liverpool', bookmakers: bk('Manchester City', 'Liverpool', 120, 210, 250) },
    ] },
    { sport: 'soccer_bundesliga', data: [   // 우리 미취급 키 → lgOfKey 가 SOC 로 받음 (축구는 soccer_* 전부 SOC)
      { id: 'ffffff6666', commence_time: iso(70), home_team: 'Bayern Munich', away_team: 'Dortmund', bookmakers: bk('Bayern Munich', 'Dortmund', -150, 400, 300) },
    ] },
    { sport: 'golf_masters_tournament_winner', data: [{ id: 'gggggg7777', commence_time: iso(100), home_team: '', away_team: '', bookmakers: [] }] },
  ];
  const hz8 = { NFL: NOW + 8 * 86400e3, SOC: NOW + 8 * 86400e3 };
  const out = oddsOnlyGames(rows, new Set(), NOW, hz8);
  const gids = out.map((g) => g.gid).sort();
  ok(out.length === 4, `ESPN 0건이면 Odds 만으로 목록 생성 — 4경기 (NFL 2 · SOC 2), 실제 ${out.length}: ${gids.join(' ')}`);
  ok(gids.includes('NFL_oaaaaaa1111') && gids.includes('NFL_obbbbbb2222'), 'gid 형식 = LG_o<oddsId>');
  ok(!gids.some((g) => g.indexOf('cccccc3333') >= 0), '이미 시작된 이벤트는 추가 안 함');
  ok(!gids.some((g) => g.indexOf('dddddd4444') >= 0), '지평(8일) 밖 이벤트는 추가 안 함');
  ok(!gids.some((g) => g.indexOf('gggggg7777') >= 0), '골프 outright 키는 여기서 만들지 않는다 (fetchGolf 몫)');
  const g1 = out.find((g) => g.gid === 'NFL_oaaaaaa1111') || {};
  ok(g1.oddsReal === true && Array.isArray(g1.ml) && g1.ml.length === 2 && g1.ml[0].am === -150 && g1.ml[0].sel === 'Buffalo Bills ML', 'NFL: 실배당(ml) 부착 · sel = "<Odds 풀네임> ML" (정산 teamSide 가 그대로 매칭)');
  ok(g1.oid === 'aaaaaa1111' && g1.hn === 'Buffalo Bills' && g1.an === 'Detroit Lions', 'oid·hn·an 도장 = 자기 id/이름 (정산 2차 출처 키)');
  ok(g1.home && g1.home.nm === 'Buffalo Bills' && g1.away && g1.away.nm === 'Detroit Lions' && typeof g1.home.ab === 'string' && g1.home.ab.length === 3, '표시 필드 형식 유지 (home/away nm + 3글자 ab)');
  ok(g1.live === false && typeof g1.time === 'string' && g1.iso === iso(30), '라이브 아님 · time/iso 채움');
  const s1 = out.find((g) => g.gid === 'SOC_oeeeeee5555') || {};
  ok(s1.oddsReal === true && Array.isArray(s1.threeWay) && s1.threeWay.length === 3 && s1.threeWay[1].sel === 'Draw', 'SOC: 1X2(threeWay) 부착 · Draw 포함');
  const hz30 = { NFL: NOW + 30 * 86400e3, SOC: NOW + 8 * 86400e3 };
  const out30 = oddsOnlyGames(rows, new Set(), NOW, hz30);
  ok(out30.some((g) => g.gid === 'NFL_odddddd4444'), '배당 지평이 30일이면 20일 뒤 경기도 포함 (지평 규칙 일관)');
  const out2 = oddsOnlyGames(rows, new Set(['aaaaaa1111', 'eeeeee5555']), NOW, hz8);
  ok(out2.length === 2 && !out2.some((g) => g.gid.indexOf('aaaaaa1111') >= 0 || g.gid.indexOf('eeeeee5555') >= 0), 'overlay 가 소비한 이벤트는 중복 생성 안 함 (불변식 1)');
  const badRows = [{ sport: 'americanfootball_nfl', data: [{ id: 'hhhhhh8888', commence_time: iso(30), home_team: 'Buffalo Bills', away_team: 'Detroit Lions', bookmakers: bk('Buffalo Bills', 'Detroit Lions', 300, 300) }] }];
  const out3 = oddsOnlyGames(badRows, new Set(), NOW, hz8);
  ok(out3.length === 0, '오버라운드 50% 같은 불가능 시장은 oddsToCore 가드가 버림 → 경기 자체를 안 만든다 (가짜/차익 라인 0)');
}

console.log('── (C) 행위: 정산 — `_o` gid 는 void 금지 ──');
{
  const S = extractor(settle);
  const scode = ['VOID_AFTER_MS', 'PROVABLE_MS', 'ODDS_KICKOFF_MS'].map(S.cst).join('\n') + '\n' + ['normTeam', 'nameHit', 'teamSide', 'gradeLeg', 'legVerdict'].map(S.fn).join('\n');
  let legVerdict = null;
  try { legVerdict = new Function(scode + '\nreturn legVerdict;')(); } catch (e) { ok(false, 'legVerdict 추출 실패: ' + e.message); }
  if (legVerdict) {
    const NOW = Date.parse('2026-09-17T12:00:00Z');
    const kt = new Date(NOW - 3 * 86400e3).toISOString();   // 3일 전 킥오프 (48h 초과 · 6일 안)
    const leg = { gid: 'NFL_oaaaaaa1111', oid: 'aaaaaa1111', lg: 'NFL', sel: 'Buffalo Bills ML', market: 'Moneyline', kt, hn: 'Buffalo Bills', an: 'Detroit Lions' };
    ok(legVerdict(leg, {}, {}, () => true, NOW) === 'pending', '`_o` gid: 두 출처 다 없고 ESPN 커버리지가 있어도 void 안 함 → 보류 (불변식 3)');
    const odds = { aaaaaa1111: { completed: true, commence: Date.parse(kt), home: 'Buffalo Bills', away: 'Detroit Lions', hs: 24, as: 17 } };
    ok(legVerdict(leg, {}, odds, () => false, NOW) === 'won', '`_o` gid: Odds scores 로는 정상 채점 (won)');
    const legEspn = { ...leg, gid: 'NFL_401872932' };
    ok(legVerdict(legEspn, {}, {}, () => true, NOW) === 'void', 'ESPN gid 는 종전대로 커버리지 증명 시 void (회귀 없음)');
  }
}

console.log(failed ? `\n🔴 feed-odds-primary FAIL — ${failed}건` : '\n🟢 feed-odds-primary — Odds 1차 목록·중복 없음·void 금지 전부 초록');
process.exit(failed ? 1 : 0);
