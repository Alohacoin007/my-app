// Alpexa — 정산 팀명 매칭 (2026-07-19 SP-100058 영구 미정산 사고의 영구핀)
//
// 사고: MLS 팔레이(Kansas City ML + Vancouver ML)가 경기 종료 2일 후에도 미정산.
// 근본원인: sports-settle teamSide가 ESPN shortDisplayName("Sporting KC"·"Whitecaps")에
// 부분문자열 매칭만 사용 → 픽 이름("Kansas City"·"Vancouver")과 불일치 → gradeLeg null
// → 영구 보류. 오즈 매칭은 2026-07-08에 토큰 부분집합으로 고쳤는데 정산 쪽은 미적용이었다.
// 수정: 이름 변형 전부(homeAll) + 정규화 토큰 부분집합 + 유일매칭(모호=null, 돈은 추측 금지).
// 이 테스트 = supabase/functions/sports-settle/index.ts 로직 미러 (golf-outright 패턴).
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

/* ── 구버전 teamSide (사고 당시) — RED 증명용 ── */
function teamSideOld(team, r) {
  const t = (team || '').toLowerCase().trim(); if (!t) return null;
  if (r.homeNm && r.homeNm.toLowerCase() === t) return 'home';
  if (r.awayNm && r.awayNm.toLowerCase() === t) return 'away';
  if (r.homeAb && r.homeAb.toLowerCase() === t) return 'home';
  if (r.awayAb && r.awayAb.toLowerCase() === t) return 'away';
  if (r.homeNm && r.homeNm.toLowerCase().indexOf(t) >= 0) return 'home';
  if (r.awayNm && r.awayNm.toLowerCase().indexOf(t) >= 0) return 'away';
  return null;
}
/* ── 신버전 (index.ts 미러 — 여기 바꾸면 Edge도 같이 바꿀 것) ── */
function normTeam(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function nameHit(t, names) {
  const tt = normTeam(t); if (!tt) return 0;
  const toks = tt.split(' ').filter((w) => w.length > 1);
  let best = 0;
  for (const n of names) {
    const nn = normTeam(n); if (!nn) continue;
    if (nn === tt) return 2;
    const nt = nn.split(' ').filter((w) => w.length > 1);
    const sub = toks.length && nt.length && (toks.every((w) => nt.includes(w)) || nt.every((w) => toks.includes(w)));
    if (sub || nn.indexOf(tt) >= 0) best = Math.max(best, 1);
  }
  return best;
}
function teamSide(team, r) {
  const t = (team || '').trim(); if (!t) return null;
  const H = (r.homeAll && r.homeAll.length ? r.homeAll : [r.homeNm]).concat(r.homeAb ? [r.homeAb] : []);
  const A = (r.awayAll && r.awayAll.length ? r.awayAll : [r.awayNm]).concat(r.awayAb ? [r.awayAb] : []);
  const h = nameHit(t, H), a = nameHit(t, A);
  if (h > a) return 'home';
  if (a > h) return 'away';
  return null;
}

console.log('settle team-match — 사고 재현(RED) → 수정(GREEN)');

// 사고 당사자 경기: SKC @ STL — ESPN 축약명은 픽 이름을 포함하지 않는다
const SKC_STL = { hs: 1, as: 2,
  homeNm: 'St. Louis CITY', awayNm: 'Sporting KC', homeAb: 'STL', awayAb: 'SKC',
  homeAll: ['St. Louis CITY', 'St. Louis CITY SC'], awayAll: ['Sporting KC', 'Sporting Kansas City'] };
const VAN_CHI = { hs: 0, as: 0,
  homeNm: 'Fire', awayNm: 'Whitecaps', homeAb: 'CHI', awayAb: 'VAN',
  homeAll: ['Fire', 'Chicago Fire FC'], awayAll: ['Whitecaps', 'Vancouver Whitecaps FC'] };

// RED — 구버전은 두 픽 모두 판정 불가 (= 영구 미정산의 원인)
ok('RED 재현: 구버전 "Kansas City" → null (정산 불가)', teamSideOld('Kansas City', SKC_STL) === null);
ok('RED 재현: 구버전 "Vancouver" → null (정산 불가)', teamSideOld('Vancouver', VAN_CHI) === null);

// GREEN — 신버전은 정확히 판정
ok('GREEN: "Kansas City" → away (Sporting Kansas City)', teamSide('Kansas City', SKC_STL) === 'away');
ok('GREEN: "Vancouver" → away (Vancouver Whitecaps FC)', teamSide('Vancouver', VAN_CHI) === 'away');
ok('GREEN: 오즈피드 풀네임 "Sporting Kansas City" → away', teamSide('Sporting Kansas City', SKC_STL) === 'away');
ok('GREEN: 축약 "SKC" → away (기존 동작 유지)', teamSide('SKC', SKC_STL) === 'away');
ok('GREEN: 정확명 "St. Louis CITY" → home (기존 동작 유지)', teamSide('St. Louis CITY', SKC_STL) === 'home');

// 유일매칭 fail-safe — 모호하면 돈을 안 움직인다
const CITY_DERBY = { hs: 1, as: 0, homeNm: 'Manchester City', awayNm: 'St. Louis City SC',
  homeAb: 'MNC', awayAb: 'STL', homeAll: ['Manchester City'], awayAll: ['St. Louis City SC'] };
ok('모호("City" 단독, 양쪽 매칭) → null (채점 보류, 추측 금지)', teamSide('City', CITY_DERBY) === null);
ok('모호 상황에서도 구체적 픽은 판정("Manchester City" → home)', teamSide('Manchester City', CITY_DERBY) === 'home');

// homeAll 없는 구형 Result(하위호환) — 기존 필드만으로도 동작
const LEGACY = { hs: 3, as: 1, homeNm: 'Chiefs', awayNm: 'Bills', homeAb: 'KC', awayAb: 'BUF' };
ok('하위호환: homeAll 없어도 "Chiefs" → home', teamSide('Chiefs', LEGACY) === 'home');
ok('하위호환: "Kansas City Chiefs" 토큰 → home', teamSide('Kansas City Chiefs', LEGACY) === 'home');

// 채점 통합 — DNB: 픽 팀 승=won · 무승부=push (기존 규칙 회귀 확인, gradeLeg ML 분기 미러)
function gradeML(sel, r) {
  const team = sel.replace(/\s*ML$/i, '').trim(), side = teamSide(team, r); if (!side) return null;
  const my = side === 'home' ? r.hs : r.as, op = side === 'home' ? r.as : r.hs;
  if (my === op) return 'push'; return my > op ? 'won' : 'lost';
}
ok('통합: "Kansas City ML" @ SKC 2-1 승 → won', gradeML('Kansas City ML', SKC_STL) === 'won');
ok('통합: "Vancouver ML" @ 0-0 무 → push (DNB 환불)', gradeML('Vancouver ML', VAN_CHI) === 'push');

console.log(pass ? '🟢 settle-team-match — all green' : '🔴 settle-team-match FAILED');
process.exit(pass ? 0 : 1);
