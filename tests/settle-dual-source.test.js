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

console.log(failed ? `\n🔴 settle-dual-source FAIL — ${failed}건` : '\n🟢 settle-dual-source — 이중 출처·void 커버리지 전부 초록');
process.exit(failed ? 1 : 0);
