#!/usr/bin/env node
// Alpexa — 정산 스코어 이중 출처 + void 커버리지 핀 (2026-09-16, 사장님 지시 "정산 스코어 이중 출처부터 해")
// ============================================================================
// 왜: 정산의 최종 스코어가 ESPN(계약 없는 공짜 API) 하나에 걸려 있었다. 2026-09-15 22:50Z ESPN 이
//     날짜범위 쿼리를 400 으로 끊자 정산이 final 을 0건 찾아 24시간 미청산. 더 위험한 건 규칙 B(연기 void):
//     "결과 없음" 이면 48h 뒤 무효 환불인데, **조회 실패**도 "없음"으로 취급했다(fail-open) — 하루만 더
//     갔으면 실제로 열린 경기가 환불됐다.
// 불변식 (CLAUDE.md 승인 2026-09-16):
//   1. 한 leg 는 한 출처로만 채점: ESPN 결과가 있으면 ESPN, 없을 때만 oid 일치 + completed:true + 킥오프 ±6h 인 Odds.
//   2. Odds 는 ESPN 에 없는 leg 가 있을 때만 호출(on-demand) — 두 출처 충돌 경로 자체가 없다.
//   3. void 는 "출처가 그날을 성공적으로 봤는데(200) 경기가 없음" 일 때만. 조회 실패 = 보류.
//   4. oid·hn·an 은 서버(place_bet)가 live_games 에서 도장. 클라 값은 버린다.
//   5. 지급 경로·멱등 ref·선점 삭제 0줄 변경.
// 방식: (A) 소스 핀 3파일 + (B) sports-settle 의 순수 판정 함수 legVerdict 를 추출해 행위 8케이스.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), mod = require('module');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let failed = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  🔴 ') + m); if (!c) failed++; };

const settle = R('supabase/functions/sports-settle/index.ts');
const games = R('supabase/functions/sports-games/index.ts');
const sql = R('supabase/sql/place_bet_server_odds.sql');

console.log('── (A) 소스 핀 ──');
ok(/api\.the-odds-api\.com\/v4\/sports\/[^"'`]*\/scores/.test(settle), 'settle: The Odds API scores 엔드포인트를 2차 출처로 부른다');
ok(settle.includes('Deno.env.get("ODDS_API_KEY")'), 'settle: ODDS_API_KEY 는 env (키 없으면 2차 출처만 조용히 생략)');
ok(settle.includes('completed === true'), 'settle: Odds 결과는 completed:true 만 채점 (진행중/미개시 = 보류)');
ok(/ODDS_KICKOFF_MS\s*=\s*6\s*\*\s*3600e3/.test(settle), 'settle: Odds 이벤트는 leg 킥오프 ±6h 안일 때만 같은 경기로 본다');
ok(/function legVerdict\(/.test(settle), 'settle: leg 판정이 순수 함수 legVerdict 로 분리돼 있다 (여기서 행위 검증)');
ok(/covered\(/.test(settle) && /VOID_AFTER_MS/.test(settle), 'settle: 규칙 B void 는 커버리지 증명(covered) 이 있어야 한다');
ok(!/if \(!r\) \{\s*\/\/ 규칙 B/.test(settle), 'settle: 옛 fail-open 분기(결과 없음 → 바로 void 판단) 제거');
ok(/g\.oid\s*=\s*String\(ev\.id/.test(games) && /g\.hn\s*=\s*String\(ev\.home_team/.test(games) && /g\.an\s*=\s*String\(ev\.away_team/.test(games), 'sports-games: 매칭된 Odds 이벤트의 oid·hn·an 을 live_games 에 도장');
ok(/'oid',\s*v_game->>'oid'/.test(sql) && /'hn',\s*v_game->>'hn'/.test(sql) && /'an',\s*v_game->>'an'/.test(sql), 'place_bet: oid·hn·an 을 live_games 값으로 서버 도장 (클라 값 덮어씀)');
ok(/betpay-/.test(settle) && /status=eq\.open`/.test(settle) && /rest\/v1\/ledger`/.test(settle), 'settle: 지급 경로(betpay 멱등 ref · 선점 삭제 · ledger) 그대로');
ok(!/if \(st\.state !== "post"\) continue; \/\/ only FINAL games/.test(settle), 'settle: 팀 종목 파서가 state=post 단독으로 최종 판정하지 않는다 (연기·취소 0-0 채점 금지)');
ok(/legVerdict\(l, results, odds, covered, NOW, off\)/.test(settle), 'settle: 메인 루프가 연기·취소 증거(off)를 legVerdict 에 넘긴다');

const TS = require('./ts-strip-guard');
{ const g = TS.deployGatesOnNode22(); ok(g.ok, '배포 게이트(deploy.yml·deploy-edge.yml) Node ≥22 — 아래 행위 검증이 실제로 도는 곳' + (g.ok ? '' : ' ✗ ' + g.bad.join(' '))); }
if (!TS.canStrip) {
  console.log(`── (B) ⏭️  Node ${process.version} 에 TS 스트립 없음 → 행위 절 생략 (배포 게이트 Node 22 에서 강제)`);
  console.log(failed ? `\n🔴 settle-dual-source FAIL — ${failed}건` : '\n🟢 settle-dual-source — 소스 핀 초록 (행위 절은 Node 22 게이트에서)');
  process.exit(failed ? 1 : 0);
}

console.log('── (B) 행위: legVerdict 8케이스 ──');
// TS → JS 스트립 후 필요한 함수·상수만 추출 (settle-team-match 처럼 재구현하지 않고 **실제 코드**를 돌린다)
const js = mod.stripTypeScriptTypes(settle, { mode: 'strip' });
function grab(name) {
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = js.indexOf('{', i), depth = 0;
  for (; j < js.length; j++) { if (js[j] === '{') depth++; else if (js[j] === '}') { depth--; if (!depth) break; } }
  return js.slice(i, j + 1);
}
const consts = ['VOID_AFTER_MS', 'PROVABLE_MS', 'ODDS_KICKOFF_MS'].map((k) => { const m = js.match(new RegExp('const ' + k + '\\s*=\\s*[^;]+;')); return m ? m[0] : ''; }).join('\n');
const code = consts + '\n' + ['normTeam', 'nameHit', 'teamSide', 'gradeLeg', 'legVerdict'].map(grab).join('\n');
let legVerdict = null;
try { legVerdict = new Function(code + '\nreturn legVerdict;')(); } catch (e) { ok(false, 'legVerdict 추출 실패: ' + e.message); }

if (legVerdict) {
  const NOW = Date.parse('2026-09-16T22:00:00Z');
  const kt = '2026-09-14T20:00:00Z';   // 킥오프 = 2일 전 (48h 초과)
  const leg = { gid: 'NFL_1', oid: 'o1', lg: 'NFL', sel: 'Chiefs ML', market: 'Moneyline', kt, hn: 'Chiefs', an: 'Bills' };
  const espn = { NFL_1: { hs: 27, as: 20, homeNm: 'Chiefs', awayNm: 'Bills', homeAb: 'KC', awayAb: 'BUF' } };
  const oddsWon = { o1: { completed: true, commence: Date.parse(kt), home: 'Kansas City Chiefs', away: 'Buffalo Bills', hs: 27, as: 20 } };
  const oddsLost = { o1: { ...oddsWon.o1, hs: 10, as: 20 } };
  const all = () => true, none = () => false;
  const v = (l, e, o, cov) => legVerdict(l, e, o, cov, NOW);
  ok(v(leg, espn, oddsLost, all) === 'won', '1. ESPN 결과 있으면 ESPN 으로 채점 (Odds 가 반대라도 무시 — 한 출처)');
  ok(v(leg, {}, oddsWon, none) === 'won', '2. ESPN 없음 + Odds completed·킥오프 일치 → Odds 로 채점 (won)');
  ok(v(leg, {}, oddsLost, none) === 'lost', '2b. 같은 조건, 스코어 반대 → lost');
  ok(v(leg, {}, { o1: { ...oddsWon.o1, completed: false } }, none) === 'pending', '3. Odds 가 completed:false → 보류');
  ok(v(leg, {}, { o1: { ...oddsWon.o1, commence: Date.parse(kt) + 2 * 86400e3 } }, none) === 'pending', '4. Odds 킥오프가 2일 어긋남 → 다른 경기로 보고 보류');
  ok(v(leg, {}, {}, none) === 'pending', '5. 두 출처 다 없음 + 48h 초과 + 그날 조회 **실패** → 보류 (fail-open 폐쇄: 환불 안 함)');
  ok(v(leg, {}, {}, all) === 'void', '6. 두 출처 다 없음 + 48h 초과 + 그날 조회 **성공** → 연기 확정 void');
  ok(v({ ...leg, kt: new Date(NOW - 3600e3).toISOString() }, {}, {}, all) === 'pending', '7. 48h 미만이면 조회 성공이어도 보류');
  ok(v({ ...leg, oid: undefined }, {}, oddsWon, none) === 'pending', '8. oid 없는 옛 베팅은 Odds 를 안 본다 (ESPN 전용, 하위호환)');
  ok(v({ ...leg, kt: '2026-09-01T20:00:00Z' }, {}, {}, all) === 'pending', '9. 6일 증명창 밖이면 void 금지 (PROVABLE_MS)');
}

console.log('── (C) 행위: 연기·취소(POSTPONED) — 2026-09-22 BAL@TOR 실사고 재현 ──');
// ESPN 실측 그대로: MLB_401817035 · STATUS_POSTPONED · state=post · completed=false · 0-0 (espn-range-probe 러너 출력)
let espnStatusKind = null;
try { espnStatusKind = new Function(grab('espnStatusKind') + '\nreturn espnStatusKind;')(); } catch (e) { ok(false, 'espnStatusKind 추출 실패: ' + e.message); }
ok(typeof espnStatusKind === 'function', 'settle: ESPN 상태 판정이 순수 함수 espnStatusKind 로 분리 (state=post 단독 판정 금지)');
if (typeof espnStatusKind === 'function') {
  const K = espnStatusKind;
  ok(K({ name: 'STATUS_POSTPONED', state: 'post', completed: false }) === 'off', 'C1. POSTPONED (state=post·completed:false) → 채점 금지·연기 (0-0 을 최종으로 안 씀 → Under 지급 차단)');
  ok(K({ name: 'STATUS_CANCELED', state: 'post', completed: false }) === 'off', 'C2. CANCELED → 연기·취소');
  ok(K({ name: 'STATUS_FINAL', state: 'post', completed: true }) === 'final', 'C3. FINAL completed:true → 채점 (회귀 없음)');
  ok(K({ name: 'STATUS_FULL_TIME', state: 'post', completed: true }) === 'final', 'C4. 축구 FULL_TIME → 채점 (회귀 없음)');
  ok(K({ name: 'STATUS_FINAL', state: 'post' }) === 'final', 'C5. completed 필드 없는 FINAL → 채점 (피드 모양 차이 대비)');
  ok(K({ name: 'STATUS_SUSPENDED', state: 'post', completed: false }) === null, 'C6. SUSPENDED → 보류 (재개될 수 있음)');
  ok(K({ name: 'STATUS_IN_PROGRESS', state: 'in', completed: false }) === null, 'C7. 진행중 → 보류');
  ok(K({ name: 'STATUS_POSTPONED', state: 'post', completed: true }) === 'off', 'C8. 이름이 POSTPONED 면 completed 가 이상해도 스코어 안 씀');
}
if (legVerdict) {
  const NOW = Date.parse('2026-09-28T16:00:00Z');
  const orig = Date.parse('2026-09-22T22:35:00Z');   // ESPN 원일정
  const off = { MLB_401817035: orig };
  // 합성 봇 leg 실모양: kt·lg·oid 없음 (결함-로그 2026-09-24 원인 ②)
  const botLeg = { gid: 'MLB_401817035', sel: 'Baltimore Orioles ML', market: 'Moneyline' };
  ok(legVerdict(botLeg, {}, {}, () => false, NOW, off) === 'void', 'C9. 실사고: kt 없는 봇 leg + ESPN POSTPONED + 원일정 6일 경과 → void (환불)');
  ok(legVerdict({ ...botLeg, sel: 'Under 8.5', market: 'Total' }, {}, {}, () => false, NOW, off) === 'void', 'C10. 같은 경기 Under → 지급 아닌 void');
  ok(legVerdict(botLeg, {}, {}, () => false, orig + 3600e3, off) === 'pending', 'C11. 연기 확정이어도 48h 안에는 보류 (같은 날 재개 대비)');
  ok(legVerdict({ ...botLeg, kt: '2026-09-27T20:00:00Z' }, {}, {}, () => false, NOW, off) === 'pending', 'C12. leg kt 가 있으면 kt 기준 (재편성 킥오프 24h → 보류)');
  const fin = { MLB_401817035: { hs: 5, as: 3, homeNm: 'Blue Jays', awayNm: 'Orioles', homeAb: 'TOR', awayAb: 'BAL' } };
  ok(legVerdict(botLeg, fin, {}, () => false, NOW, off) === 'lost', 'C13. 최종 스코어가 있으면 그게 우선 (off 무시)');
  ok(legVerdict(botLeg, {}, {}, () => true, NOW) === 'pending', 'C14. off 증거 없고 kt 없으면 종전대로 보류 (규칙 B 는 kt 필수)');
}

console.log(failed ? `\n🔴 settle-dual-source FAIL — ${failed}건` : '\n🟢 settle-dual-source — 이중 출처·void 커버리지 전부 초록');
process.exit(failed ? 1 : 0);
