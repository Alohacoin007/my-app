// Alpexa — odds team-name matching (RED→GREEN). #odds-coverage
//
// nick() (last word) silently dropped REAL soccer odds because club feeds differ:
// ESPN "Vancouver" vs The Odds API "Vancouver Whitecaps FC" → last words don't match,
// so 4 soccer games sat LOCKED while real lines existed (lost revenue). teamMatch()
// strips club suffixes and requires the shorter name's significant tokens to be a subset
// of the longer — recovering those while NOT cross-matching different teams.
//
// Mirrors normNm/sigToks/teamMatch + the overlay's unique-match rule in
// supabase/functions/sports-games/index.ts.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// 별칭은 **후보 확장**이다 — 이름을 덮어쓰지 않는다. (덮어쓰면 NBA "Spurs"가
// "tottenham hotspur"로 바뀌어 San Antonio Spurs 매칭이 깨진다 = 농구 블랙아웃.)
const NAME_ALIAS = [
  [/\bman city\b/, 'manchester city'],
  [/\bman (?:united|utd)\b/, 'manchester united'],
  [/\bnottm forest\b/, 'nottingham forest'],
  [/\bspurs\b/, 'tottenham hotspur'],
  [/\bwolves\b/, 'wolverhampton wanderers'],
  [/\bsheff (?:utd|united)\b/, 'sheffield united'],
  [/\bsheff wed\b/, 'sheffield wednesday'],
  [/\bwest brom\b/, 'west bromwich albion'],
  [/\blafc\b/, 'los angeles'],
  [/\bnycfc\b/, 'new york city'],
  [/\b(?:red bull ny|ny red bulls?)\b/, 'new york red bulls'],
  [/\bpsg\b/, 'saint germain'],
];
const normBase = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const stripClub = (s) => s.replace(/\b(fc|sc|cf|afc|ac|sd|cd)\b/g, ' ').replace(/\s+/g, ' ').trim();
const normNm = (s) => stripClub(normBase(s));
const sigToks = (s) => normNm(s).split(' ').filter((t) => t.length > 2);
function nameVariants(s) {
  const base = normBase(s), out = [stripClub(base)];
  for (const [re, to] of NAME_ALIAS) {
    if (re.test(base)) { const v = stripClub(base.replace(re, to)); if (v && !out.includes(v)) out.push(v); }
  }
  return out.map((v) => v.split(' ').filter((t) => t.length > 2)).filter((t) => t.length > 0);
}
function teamMatch(a, b) {
  for (const A of nameVariants(a)) for (const B of nameVariants(b)) {
    const [short, long] = A.length <= B.length ? [A, B] : [B, A];
    if (short.every((t) => long.includes(t))) return true;
  }
  return false;
}

console.log('\n=== GREEN: soccer club names now match (the 4 that were wrongly locked) ===');
ok('Vancouver ⇄ Vancouver Whitecaps FC', teamMatch('Vancouver Whitecaps FC', 'Vancouver'));
ok('Kansas City ⇄ Sporting Kansas City', teamMatch('Sporting Kansas City', 'Kansas City'));
ok('St. Louis ⇄ St. Louis City SC', teamMatch('St. Louis City SC', 'St. Louis'));
ok('Seattle ⇄ Seattle Sounders FC', teamMatch('Seattle Sounders FC', 'Seattle'));
ok('Coventry ⇄ Coventry City', teamMatch('Coventry City', 'Coventry'));

console.log('\n=== GREEN: US sports (nicknames) still match ===');
ok('Reds ⇄ Cincinnati Reds', teamMatch('Cincinnati Reds', 'Reds'));
ok('Yankees ⇄ New York Yankees', teamMatch('New York Yankees', 'Yankees'));

console.log('\n=== RED→GREEN: must NOT cross-match different teams ===');
ok('Red Sox ⇏ Chicago White Sox', !teamMatch('Chicago White Sox', 'Red Sox'));
ok('Yankees ⇏ Mets (both New York)', !teamMatch('New York Yankees', 'New York Mets'));
ok('Man United ⇏ Man City is not asserted here; City token differs', !teamMatch('Manchester United', 'Manchester City'));
ok('empty name → no match', !teamMatch('', 'Arsenal'));

// Unique-match rule the overlay enforces: if two events both match, attach NOTHING (lock).
function uniqueEvent(events, home, away) {
  const hits = events.filter((e) => (teamMatch(e.h, home) && teamMatch(e.a, away)) || (teamMatch(e.h, away) && teamMatch(e.a, home)));
  return hits.length === 1 ? hits[0] : null;
}
console.log('\n=== SAFETY: ambiguous (2 possible events) → attach nothing (stay locked) ===');
{
  const evs = [{ h: 'Arsenal', a: 'Coventry City' }, { h: 'Arsenal', a: 'Coventry City' }];
  ok('two identical matches → null (locked, not wrong odds)', uniqueEvent(evs, 'Coventry', 'Arsenal') === null);
  const one = [{ h: 'Arsenal', a: 'Coventry City' }, { h: 'Chelsea', a: 'Fulham' }];
  ok('exactly one match → that event', uniqueEvent(one, 'Coventry', 'Arsenal') && uniqueEvent(one, 'Coventry', 'Arsenal').h === 'Arsenal');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2026-08-28 — 약어·악센트로 **간판 경기가 잠겨 있었다** (아침 점검에서 실측 발견).
// live_games(ESPN) 와 sports_odds(The Odds API) 의 **실제 저장값**으로 재현했다:
//   ESPN "Man City" ⊄ Odds "Manchester City"   → 맨시티-팰리스 잠김 (킥오프 4h 전)
//   ESPN "Nottm Forest" ⊄ "Nottingham Forest"  → 포레스트-리버풀 잠김
//   ESPN "Spurs" ⊄ "Tottenham Hotspur"         → 뉴캐슬-토트넘 잠김
//   ESPN "LAFC"/"NYCFC"/"Red Bull NY"          → MLS 4경기 잠김
//   ESPN "CF Montréal" → "montr al"            → 악센트가 토큰을 잘라 잠김
// 프로바이더에 라인이 **있는데** 우리가 못 붙인 것 = 손님이 제일 찾는 경기를 못 판다.
// (오즈 불변식은 그대로다 — 실라인이 없으면 여전히 잠긴다. 여기서 푼 건 "있는데 못 찾던" 쪽뿐.)
console.log('\n=== RED→GREEN: ESPN 약어 ⇄ Odds API 풀네임 (실제 피드 값) ===');
ok('Man City ⇄ Manchester City',        teamMatch('Man City', 'Manchester City'));
ok('Nottm Forest ⇄ Nottingham Forest',  teamMatch('Nottm Forest', 'Nottingham Forest'));
ok('Spurs ⇄ Tottenham Hotspur',         teamMatch('Spurs', 'Tottenham Hotspur'));
ok('LAFC ⇄ Los Angeles FC',             teamMatch('LAFC', 'Los Angeles FC'));
ok('NYCFC ⇄ New York City FC',          teamMatch('NYCFC', 'New York City FC'));
ok('Red Bull NY ⇄ New York Red Bulls',  teamMatch('Red Bull NY', 'New York Red Bulls'));
ok('CF Montréal ⇄ CF Montreal (악센트)', teamMatch('CF Montréal', 'CF Montreal'));

// 2026-09-03 — odds-crosscheck 가 실측으로 잡은 첫 건. UEFA 챔피언스리그
// "S Bratislava @ PSG"(ESPN) 가 시즌 개막전인데 잠겨 있었다. 프로바이더에는
// "ŠK Slovan Bratislava @ Paris Saint Germain" 라인이 그대로 남아 있었다.
//   · Bratislava 쪽은 원래 붙었다 (["bratislava"] ⊂ ["slovan","bratislava"])
//   · 깨진 건 PSG 뿐 — ["psg"] 는 ["paris","saint","germain"] 의 부분집합이 아니다.
// 8/28 약어 사고와 같은 클래스이고, 이번엔 사람 신고가 아니라 **교차검증이 먼저 잡았다.**
console.log('\n=== RED→GREEN: PSG 약어 (2026-09-03 crosscheck 실측) ===');
ok('PSG ⇄ Paris Saint Germain',        teamMatch('PSG', 'Paris Saint Germain'));
ok('PSG ⇄ Paris Saint-Germain (하이픈)', teamMatch('PSG', 'Paris Saint-Germain'));
ok('S Bratislava ⇄ ŠK Slovan Bratislava (원래도 붙었음 — 회귀 방지)',
   teamMatch('S Bratislava', 'ŠK Slovan Bratislava'));

console.log('\n=== SAFETY: 별칭이 다른 팀을 끌어오면 안 된다 ===');
ok('PSG ⇏ Paris FC (같은 도시 다른 팀)', !teamMatch('PSG', 'Paris FC'));
ok('PSG ⇏ Saint-Etienne',               !teamMatch('PSG', 'Saint-Etienne'));
ok('Man City ⇏ Manchester United',      !teamMatch('Man City', 'Manchester United'));
ok('Nottm Forest ⇏ Nottingham(다른팀 아님) — Forest 토큰 필수',
   !teamMatch('Nottm Forest', 'Nottingham County'));
ok('Spurs ⇏ Tottenham 이 아닌 팀',       !teamMatch('Spurs', 'Arsenal'));
ok('NYCFC ⇏ New York Red Bulls',        !teamMatch('NYCFC', 'New York Red Bulls'));
ok('LAFC ⇏ LA Galaxy',                  !teamMatch('LAFC', 'LA Galaxy'));

// 별칭을 **덮어쓰기**로 구현하면 여기가 깨진다 — 다른 종목의 같은 별명을 죽이기 때문.
// (NBA Spurs = San Antonio Spurs. 이 한 줄이 그 회귀를 영구히 막는다.)
console.log('\n=== SAFETY: 별칭은 후보 확장 — 기존 매칭을 절대 잃지 않는다 ===');
ok('NBA Spurs ⇄ San Antonio Spurs (축구 별칭이 농구를 죽이지 않는다)',
   teamMatch('Spurs', 'San Antonio Spurs'));
ok('Wolves(NBA 아님) ⇄ Minnesota Timberwolves 는 원래도 불일치 — 변화 없음',
   !teamMatch('Wolves', 'Minnesota Timberwolves'));

// ── 락스텝: 테스트 거울과 Edge 원본이 갈리면 이 테스트는 거짓 초록이 된다.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'sports-games', 'index.ts'), 'utf8');
console.log('\n=== 락스텝: Edge 원본과 별칭표가 같은가 ===');
for (const [re, to] of NAME_ALIAS) {
  const body = re.source.replace(/\\/g, '\\');
  ok(`원본에 별칭 존재: ${to}`, SRC.includes(body) && SRC.includes(`"${to}"`));
}
ok('원본이 후보 확장(nameVariants)을 쓴다 — 덮어쓰기 아님', /function nameVariants/.test(SRC));
ok('원본이 악센트를 폴딩한다 (NFD)', /normalize\("NFD"\)/.test(SRC));
ok('유일매칭 게이트가 살아있다', /hits\.length === 1|length === 1/.test(SRC));

console.log('\n' + (pass ? '🟢 team matching recovers soccer odds without cross-matching' : '🔴 matcher broken') + '\n');
process.exit(pass ? 0 : 1);
