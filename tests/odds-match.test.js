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


// ══════════════════════════════════════════════════════════════════════════════
// 아웃컴 배정 (2026-09-11 D.C. United 오버라운드 93% 사고)
// ──────────────────────────────────────────────────────────────────────────────
// 실측: MLS "D.C. United(홈) vs Atlanta United FC(원정)" 가 양쪽 다 +196 으로 실렸다.
// 1X2 암시확률 합 93.3% → **100% 미만 = 고객 무위험 차익** (양쪽+무승부 다 사면 확정 이익).
// 원인: teamMatch 는 3글자 미만 토큰을 버린다 → "D.C. United" 의 유효 토큰이 ["united"] 하나뿐.
//   그 한 토큰이 "Atlanta United FC"(["atlanta","united"]) 에도 부분집합으로 맞아 홈/원정 아웃컴이
//   둘 다 두 팀에 매칭됐고, bestOutcome 이 "가장 좋은 가격"을 고르니 양쪽 모두 원정 +196 을 집었다.
// 관대한 매칭은 **이벤트 찾기**엔 필요하지만 **아웃컴 배정**엔 독이다. 두 용도를 분리한다.
//   sideOf: ① 엄격(모든 토큰 유지) 한쪽만 → 확정  ② 엄격 양쪽 → 배정 안 함(모호)
//           ③ 엄격 0개일 때만 관대 매칭  ④ 관대도 양쪽/0개 → 배정 안 함 (fail-closed)
// + 오버라운드 가드: 합 < 100% 인 시장은 배정 오류의 증상 → **그 시장을 버린다**(라인 조작 아님).
const allToks = (s) => {
  const base = normBase(s), out = [stripClub(base)];
  for (const [re, to] of NAME_ALIAS) { if (re.test(base)) { const v = stripClub(base.replace(re, to)); if (v && !out.includes(v)) out.push(v); } }
  return out.map((v) => v.split(' ').filter((t) => t.length > 0)).filter((t) => t.length > 0);
};
function teamMatchStrict(a, b) {
  for (const A of allToks(a)) for (const B of allToks(b)) {
    const [short, long] = A.length <= B.length ? [A, B] : [B, A];
    if (short.every((t) => long.includes(t))) return true;
  }
  return false;
}
function sideOf(name, home, away) {
  const sh = teamMatchStrict(name, home.nm), sa = teamMatchStrict(name, away.nm);
  if (sh !== sa) return sh ? 'H' : 'A';
  if (sh && sa) return null;
  const lh = teamMatch(name, home.nm), la = teamMatch(name, away.nm);
  if (lh !== la) return lh ? 'H' : 'A';
  return null;
}
const decP = (p) => (p > 0 ? 1 + p / 100 : 1 + 100 / -p);
const impliedSum = (ps) => ps.reduce((s, p) => s + 1 / decP(p), 0);

console.log('\n=== RED→GREEN: D.C. United ⇄ Atlanta United (아웃컴 교차배정) ===');
const DCATL = { home: { nm: 'D.C. United' }, away: { nm: 'Atlanta United FC' } };
// 버그의 뿌리 — 관대 매칭은 실제로 교차한다 (이 사실 자체를 고정해 둔다)
ok('관대 teamMatch 는 Atlanta United FC 를 D.C. United 로도 본다 (버그의 뿌리)',
   teamMatch('Atlanta United FC', 'D.C. United') === true);
// 배정은 그 관대함을 쓰면 안 된다
ok('sideOf("Atlanta United FC") = 원정(A)', sideOf('Atlanta United FC', DCATL.home, DCATL.away) === 'A');
ok('sideOf("D.C. United") = 홈(H)', sideOf('D.C. United', DCATL.home, DCATL.away) === 'H');
ok('실측 가격이 제자리로: 홈 +120 / 원정 +196 (양쪽 +196 아님)',
   sideOf('D.C. United', DCATL.home, DCATL.away) === 'H' && sideOf('Atlanta United FC', DCATL.home, DCATL.away) === 'A');
// 가드 임계값 95% — 2026-09-11 프로덕션 363 이벤트 실측에서 잡았다 (추측 금지):
//   3-way 최소 101.7% · 2-way(무無) 최소 96.1% · 사고 라인 90.2~93.3%.
//   100% 로 두면 정상 NFL/MLB 12건이 사라진다 → 가드가 고객 시장을 뺏는다. 95% = 오늘 삭제 0건.
const OVERROUND_MIN = 0.95;
ok('사고 라인 [196,289,196] 은 93.3% → 가드가 버린다', impliedSum([196, 289, 196]) < OVERROUND_MIN);
ok('정상 3-way [120,289,196] 은 통과', impliedSum([120, 289, 196]) >= OVERROUND_MIN);
ok('실측 최저 3-way 101.7% 는 통과 (정상 시장을 뺏지 않는다)', impliedSum([155, 250, 175]) >= OVERROUND_MIN);
ok('실측 최저 2-way 96.1% 는 통과 (NFL/MLB 12건 보호)', impliedSum([-118, 138]) >= OVERROUND_MIN);
ok('가드 임계값이 원본과 같다 (95%)', /OVERROUND_MIN = 0\.95/.test(SRC));

console.log('\n=== 배정 회귀: 기존 매칭은 그대로 (약어·접미사·별칭) ===');
ok('Whitecaps: sideOf 홈 정상', sideOf('Vancouver Whitecaps FC', { nm: 'Vancouver' }, { nm: 'Seattle Sounders FC' }) === 'H');
ok('Sounders: sideOf 원정 정상', sideOf('Seattle Sounders FC', { nm: 'Vancouver' }, { nm: 'Seattle Sounders FC' }) === 'A');
ok('PSG: sideOf 홈 정상 (별칭 경유)', sideOf('Paris Saint Germain', { nm: 'PSG' }, { nm: 'Slovan Bratislava' }) === 'H');
ok('Bodø/Glimt: sideOf 원정 정상 (글자 폴딩)', sideOf('Bodø/Glimt', { nm: 'Bayern Munich' }, { nm: 'Bodo/Glimt' }) === 'A');
// 같은 도시·같은 접미사 더비도 안전해야 한다 (엄격 매칭이 구분)
ok('맨체스터 더비: City 는 홈', sideOf('Manchester City', { nm: 'Manchester City' }, { nm: 'Manchester United' }) === 'H');
ok('맨체스터 더비: United 는 원정', sideOf('Manchester United', { nm: 'Manchester City' }, { nm: 'Manchester United' }) === 'A');
// 모호하면 배정하지 않는다 (fail-closed — 틀린 팀에 가격을 붙이느니 시장을 빼는 게 낫다)
ok('완전 동명이면 배정 안 함 (null)', sideOf('United', { nm: 'United' }, { nm: 'United' }) === null);
ok('아무 팀도 아니면 배정 안 함 (Draw)', sideOf('Draw', DCATL.home, DCATL.away) === null);

console.log('\n=== 락스텝: Edge 원본이 이 규칙을 실제로 쓴다 ===');
ok('원본에 sideOf 가 있다', /function sideOf\(/.test(SRC));
ok('원본에 teamMatchStrict(모든 토큰) 가 있다', /function teamMatchStrict\(/.test(SRC) && /filter\(\(t\) => t\.length > 0\)/.test(SRC));
ok('h2h 배정이 sideOf 경유 (teamMatch(o.name 직접 사용 0곳)', !/teamMatch\(o\.name/.test(SRC));
ok('원본에 오버라운드 가드가 있다', /impliedSum/.test(SRC));
ok('가드는 라인을 고치지 않고 버린다 (delete/조건부 생략)', /delete core\.ml/.test(SRC));

console.log('\n' + (pass ? '🟢 team matching recovers soccer odds without cross-matching' : '🔴 matcher broken') + '\n');
process.exit(pass ? 0 : 1);
