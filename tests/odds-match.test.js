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
  [/\bpraha\b/, 'prague'],
];
// NFD \ub294 **\uacb0\ud569 \uc545\uc13c\ud2b8**(\u00e9 = e + \u00b4)\ub9cc \ubd84\ud574\ud55c\ub2e4. \u00f8\u00b7\u00e6\u00b7\u0142\u00b7\u0111\u00b7\u00df \ub294 \uadf8 \uc790\uccb4\uac00 \ub3c5\ub9bd \uae00\uc790\ub77c
// \ubd84\ud574\ub418\uc9c0 \uc54a\uace0 \ub0a8\uc558\ub2e4\uac00 [^a-z0-9] \ud544\ud130\uc5d0 \ud1b5\uc9f8\ub85c \uc9c0\uc6cc\uc9c4\ub2e4 \u2192 "bod\u00f8" \uac00 "bod" \uc774 \ub41c\ub2e4.
// 8/28 \uc545\uc13c\ud2b8 \uc218\uc815\uc774 \uc808\ubc18\ub9cc \uace0\uce5c \uad6c\uba4d. \uae00\uc790\ub97c \uc9c0\uc6b0\uc9c0 \ub9d0\uace0 **\ubc14\uafd4\uc11c** \ud1a0\ud070\uc744 \uc0b4\ub9b0\ub2e4.
const LETTER_FOLD = [
  [/\u00f8/g, 'o'], [/\u00e6/g, 'ae'], [/\u0153/g, 'oe'], [/\u0142/g, 'l'],
  [/\u0111/g, 'd'], [/\u00f0/g, 'd'], [/\u00fe/g, 'th'], [/\u00df/g, 'ss'], [/\u0131/g, 'i'],
];
const normBase = (s) => {
  let t = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [re, to] of LETTER_FOLD) t = t.replace(re, to);
  return t.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
};
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

// 2026-09-04 — 같은 교차검증이 UCL 2건을 더 잡았다. 원인이 **서로 다르다**:
//   ① Bodo/Glimt(ESPN) ⇄ Bodø/Glimt(Odds) — NFD 가 ø 를 못 분해해 "bod" 로 잘림.
//      é 는 결합문자라 분해되지만 ø·æ·ł·đ·ß 는 독립 글자다. 이건 한 팀 문제가 아니라
//      **북유럽·동유럽 전체에 열려 있던 구멍**이라 글자 폴딩으로 클래스를 닫는다.
//   ② Slavia Prague(ESPN) ⇄ Slavia Praha(Odds) — 도시명 언어 변형. 별칭으로 해결.
console.log('\n=== RED→GREEN: 비결합 글자 폴딩 (2026-09-04 crosscheck 실측) ===');
ok('Bodo/Glimt ⇄ Bodø/Glimt (ø)',      teamMatch('Bodo/Glimt', 'Bodø/Glimt'));
ok('Bayern ⇄ Bayern Munich (원래 OK)',  teamMatch('Bayern', 'Bayern Munich'));
ok('Malmo ⇄ Malmö FF (ö 는 원래 NFD 로 됨 — 회귀 방지)', teamMatch('Malmo', 'Malmö FF'));
ok('Kobenhavn ⇄ FC København (ø)',     teamMatch('Kobenhavn', 'FC København'));

console.log('\n=== RED→GREEN: Praha ⇄ Prague (도시명 언어 변형) ===');
ok('Slavia Prague ⇄ Slavia Praha',     teamMatch('Slavia Prague', 'Slavia Praha'));
ok('Lens ⇄ RC Lens (원래 OK)',          teamMatch('Lens', 'RC Lens'));
ok('Slavia Praha ⇏ Sparta Praha (같은 도시 다른 팀)',
   !teamMatch('Slavia Praha', 'Sparta Praha'));

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
// 글자 폴딩도 락스텝 — 여기 거울만 고치고 원본을 빠뜨리면 이 테스트가 거짓 초록이 된다.
ok('원본에 LETTER_FOLD 표가 있다', /const LETTER_FOLD/.test(SRC));
for (const [re, to] of LETTER_FOLD) {
  const ch = re.source;
  ok(`원본이 ${ch} → "${to}" 를 폴딩한다`, new RegExp('\\[/' + ch + '/g,\\s*"' + to + '"\\]').test(SRC));
}
ok('원본이 폴딩을 [^a-z0-9] 치환 **전에** 적용한다',
   /for \(const \[re, to\] of LETTER_FOLD\)[\s\S]{0,120}\[\^a-z0-9 \]/.test(SRC));
ok('유일매칭 게이트가 살아있다', /hits\.length === 1|length === 1/.test(SRC));

console.log('\n' + (pass ? '🟢 team matching recovers soccer odds without cross-matching' : '🔴 matcher broken') + '\n');
process.exit(pass ? 0 : 1);
