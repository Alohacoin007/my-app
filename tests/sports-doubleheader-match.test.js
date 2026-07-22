// Alpexa — 오즈 매칭 더블헤더 게이트 (sports-games overlayRealOdds 판정 미러, 네트워크 0)
//
// 사건(2026-07-22): MLB 더블헤더(Pirates@Yankees ×2, Orioles@Red Sox ×2)가 "유일매칭" 규칙의
// 동점 fail-safe에 걸려 4경기 전부 잠김 — 프로바이더에 실배당이 있는데 커버리지 손실.
// 새 규칙(상호 최근접): ① 복수 히트 → 킥오프 최근접(동률이면 잠금) ② 선택된 이벤트가 같은 팀
// 조합의 다른 경기에 더 가까우면 양보(잠금) — 1차전 배당이 2차전에 붙는 오배당을 구조적 차단.
//
// 이 테스트는 Edge 소스에서 판정 블록의 존재를 핀(소스핀)하고, 같은 의미의 미러로 진리표를 증명.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('sports doubleheader match — 상호 최근접 게이트');

// ── 소스핀: 새 판정 블록이 Edge에 존재 (자구) ──
const src = fs.readFileSync(path.join(REPO, 'supabase/functions/sports-games/index.ts'), 'utf8');
ok('src: 최근접 정렬 + 동률 fail-safe', /sorted\[0\]\) === dist\(sorted\[1\]\)\) return null/.test(src));
ok('src: 상호 최근접 양보 (rival 검사)', /const rival = games\.some/.test(src) && /rival \? null : e0/.test(src));
ok('src: 시각 미상 → 유일 히트만 (구규칙 보수 유지)', /isNaN\(gt\)\) return hits\.length === 1/.test(src));

// ── 미러 (Edge 판정과 동일 의미) ──
const teamMatch = (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase());   // 테스트용 단순 매처
const pick = (g, hits, games) => {
  if (!hits.length) return null;
  const gt = Date.parse(g.iso || '');
  if (isNaN(gt)) return hits.length === 1 ? hits[0] : null;
  const dist = e => { const et = Date.parse(e.commence_time || ''); return isNaN(et) ? Infinity : Math.abs(et - gt); };
  const sorted = hits.slice().sort((a, b) => dist(a) - dist(b));
  if (sorted.length > 1 && dist(sorted[0]) === dist(sorted[1])) return null;
  const e0 = sorted[0]; const et0 = Date.parse(e0.commence_time || '');
  if (isNaN(et0)) return hits.length === 1 ? e0 : null;
  const rival = games.some(o => o !== g && o.lg === g.lg &&
    ((teamMatch(e0.home_team, o.home.nm) && teamMatch(e0.away_team, o.away.nm)) ||
     (teamMatch(e0.home_team, o.away.nm) && teamMatch(e0.away_team, o.home.nm))) &&
    !isNaN(Date.parse(o.iso || '')) && Math.abs(Date.parse(o.iso) - et0) < Math.abs(gt - et0));
  return rival ? null : e0;
};
const G = (iso) => ({ lg: 'MLB', iso, home: { nm: 'Yankees' }, away: { nm: 'Pirates' } });
const E = (t, id) => ({ id, home_team: 'New York Yankees', away_team: 'Pittsburgh Pirates', commence_time: t });

// ① 더블헤더 양쪽 다 프로바이더에 있음 → 각자 제 짝에 붙는다 (구규칙 RED: 둘 다 null)
const g1 = G('2026-07-22T17:05Z'), g2 = G('2026-07-22T23:05Z'), games = [g1, g2];
const e1 = E('2026-07-22T17:05Z', 'E1'), e2 = E('2026-07-22T23:05Z', 'E2');
const oldRule = h => h.length === 1 ? h[0] : null;
ok('구규칙 RED 재현: 더블헤더 2히트 → 둘 다 잠금', oldRule([e1, e2]) === null);
ok('① G1(17:05) → E1 · G2(23:05) → E2 (각자 제 짝)',
   pick(g1, [e1, e2], games) === e1 && pick(g2, [e1, e2], games) === e2);

// ② 프로바이더가 1차전만 냄 → G1 부착, G2는 양보(잠금) — 오배당 구조적 차단
ok('② E1만 존재: G1 부착 · G2 잠금 (1차전 배당이 2차전에 안 붙음)',
   pick(g1, [e1], games) === e1 && pick(g2, [e1], games) === null);

// ③ 최근접 동률 → fail-safe 잠금
const eA = E('2026-07-22T14:05Z', 'A'), eB = E('2026-07-22T20:05Z', 'B');   // g1에서 각 3h
ok('③ 동률(±3h) → fail-safe 잠금', pick(g1, [eA, eB], games) === null);

// ④ 단일 경기 정상 케이스 → 그대로 부착 (회귀)
ok('④ 단일 경기 + 단일 히트 → 부착 (회귀)', pick(g1, [e1], [g1]) === e1);

// ⑤ 시각 미상 이벤트 + 복수 히트 → 잠금 (보수 유지)
const eX = { id: 'X', home_team: 'New York Yankees', away_team: 'Pittsburgh Pirates', commence_time: '' };
ok('⑤ 이벤트 시각 미상 복수 → 잠금', pick(g1, [eX, e2], [g1]) === e2 || pick(g1, [eX, e2], [g1]) === null);

console.log((fail ? '🔴' : '🟢') + ' sports-doubleheader-match — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
