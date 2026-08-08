#!/usr/bin/env node
// PIN — 스프레드/토탈은 상호보완 쌍 (2026-08-08 아침점검 발견 + 사장님 gogo).
// 버그: sports-games 오버레이가 각 사이드를 북마커 전체에서 "가격 최고"로 독립 선택 → 픽엠 경기
//   런라인이 둘 다 -1.5(다른 북), 토탈이 Over 9.5/Under 9(기준 불일치). 원본 The Odds API는 정상.
// 계약: spread home.point === -away.point · total over.point === under.point · 쌍 없으면 마켓 생략(가짜 금지).
//  [OP1] 행위 RED→GREEN: 실제 크로스북 시나리오에서 옛 로직=비상보, 새 로직(bestPair)=상보
//  [OP2] 정적: Edge가 bestPair 상호보완 제약을 실제로 사용 (per-side 독립 spread 선택 제거)
'use strict';
const fs = require('fs');
const path = require('path');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── 알고리즘 포트 (Edge와 동일 규칙) ──
const decP = (p) => p > 0 ? 1 + p / 100 : 1 + 100 / (-p);
// 옛 로직: 팀별로 북마커 전체에서 최고가 독립 선택 (point 무시) — 버그 재현용
function oldPerSide(ev, key, matchFn) {
  let b = null;
  (ev.bookmakers || []).forEach((bk) => {
    const m = (bk.markets || []).find((x) => x.key === key); if (!m) return;
    (m.outcomes || []).forEach((o) => { if (matchFn(o)) { if (b === null || decP(o.price) > decP(b.price)) b = { price: o.price, point: o.point }; } });
  });
  return b;
}
// 새 로직: 한 북마커 내 상호보완 쌍 중 최고 합산가
function bestPair(ev, key, hMatch, aMatch, pairOk) {
  let best = null, bestVal = -Infinity;
  (ev.bookmakers || []).forEach((bk) => {
    const m = (bk.markets || []).find((x) => x.key === key); if (!m) return;
    const outs = m.outcomes || [];
    const h = outs.find(hMatch), a = outs.find(aMatch);
    if (!h || !a || h.point == null || a.point == null) return;
    if (!pairOk(h.point, a.point)) return;
    const val = decP(h.price) + decP(a.price);
    if (val > bestVal) { bestVal = val; best = { h: { price: h.price, point: h.point }, a: { price: a.price, point: a.point } }; }
  });
  return best;
}

// 실제 픽엠 시나리오: 북마다 런라인 favorite가 갈림 (오늘 Astros@Padres 실측 재현)
// home=Padres, away=Astros. bookA: Padres -1.5/Astros +1.5 · bookB: Astros -1.5/Padres +1.5
const HOME = 'Padres', AWAY = 'Astros';
const ev = { bookmakers: [
  { key: 'bookA', markets: [
    { key: 'spreads', outcomes: [ { name: 'Padres', point: -1.5, price: -200 }, { name: 'Astros', point: 1.5, price: 170 } ] },
    { key: 'totals',  outcomes: [ { name: 'Over',  point: 8.5, price: -110 }, { name: 'Under', point: 8.5, price: -110 } ] },
  ] },
  { key: 'bookB', markets: [
    { key: 'spreads', outcomes: [ { name: 'Astros', point: -1.5, price: 179 }, { name: 'Padres', point: 1.5, price: -210 } ] },
    { key: 'totals',  outcomes: [ { name: 'Over',  point: 8.0, price: 100 }, { name: 'Under', point: 8.0, price: -120 } ] },
  ] },
] };
const hM = (o) => o.name === HOME, aM = (o) => o.name === AWAY;

// [OP1a] RED: 옛 per-side 로직은 둘 다 -1.5 를 뽑는다 (버그 재현)
const oH = oldPerSide(ev, 'spreads', hM), oA = oldPerSide(ev, 'spreads', aM);
if (!(oH.point === -1.5 && oA.point === -1.5)) bad('시나리오 무효 — 옛 로직이 둘다 -1.5를 재현하지 못함 (테스트 픽스처 점검)');
// 옛 로직이 상보였다면 이 테스트는 버그를 못 잡는 것 → 시나리오가 실제 버그를 담보하는지 확인
if (oH.point === -oA.point) bad('픽스처가 버그를 재현하지 않음 (옛 로직이 이미 상보)');

// [OP1b] GREEN: 새 bestPair 는 상호보완 쌍만 뽑는다
const sp = bestPair(ev, 'spreads', hM, aM, (hp, ap) => hp === -ap && hp !== 0);
if (!sp) bad('bestPair가 유효 런라인 쌍을 못 찾음');
else if (sp.h.point !== -sp.a.point) bad(`런라인 비상보: home ${sp.h.point} / away ${sp.a.point}`);
const tp = bestPair(ev, 'totals', (o) => /over/i.test(o.name), (o) => /under/i.test(o.name), (op, up) => op === up);
if (!tp) bad('bestPair가 유효 토탈 쌍을 못 찾음');
else if (tp.h.point !== tp.a.point) bad(`토탈 기준 불일치: Over ${tp.h.point} / Under ${tp.a.point}`);
// 상보 쌍은 오즈합이 정상 홀드(>100%)여야 — 엣지 릭 없음
if (sp) { const s = (1 / decP(sp.h.price) + 1 / decP(sp.a.price)) * 100; if (s < 100) bad(`상보 런라인인데 오즈합 ${s.toFixed(0)}% <100% (아비트라지/엣지릭)`); }

// [OP2] 정적: Edge가 실제로 bestPair 상호보완 제약을 사용
const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'sports-games', 'index.ts'), 'utf8');
if (!/function bestPair\(/.test(edge)) bad('bestPair helper missing in sports-games Edge');
if (!/"spreads"[\s\S]{0,140}hp === -ap/.test(edge)) bad('spread must require complementary points (hp === -ap)');
if (!/"totals"[\s\S]{0,140}op === up/.test(edge)) bad('total must require same base point (op === up)');
// 옛 버그 경로 제거: 스프레드/토탈을 팀별 bestOutcome 독립 선택하면 안 됨
if (/bestOutcome\(ev, "spreads"/.test(edge)) bad('spread must NOT use per-side bestOutcome (cross-book mismatch bug)');
if (/bestOutcome\(ev, "totals"/.test(edge)) bad('total must NOT use per-side bestOutcome');

if (fail) { console.error(`\n🔴 FAIL — ${fail} odds-pairing problem(s).`); process.exit(1); }
console.log('🟢 PASS: 스프레드/토탈 상호보완 쌍 (단일북, 가짜 라인 생략) — 크로스북 mismatch 버그 차단.');
