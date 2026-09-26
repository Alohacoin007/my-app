#!/usr/bin/env node
// Alpexa — feed-check 가짜 라인 판정 핀 (2026-09-26 아침 점검 🚨샘 오탐)
// ============================================================================
// 왜: sports-feed-check 가 ml 두 숫자(-140/+120)만 보고 "가짜 라인인데 베팅 가능"(🚨샘) 을 냈다.
//     실제는 Rangers@Red Wings 실북 가격 — Bovada -140/+120 그대로, DK -142/+120, oddsReal:true + oid.
//     오탐 경보는 무시당하고, 그러면 진짜 가짜라인까지 같이 묻힌다 (결함-로그 2026-09-26).
// 불변식: oddsReal:true 경기는 옛 가짜 라인의 **완전한 지문**(ml -140/120 + spread ±3.5 둘 다 -110
//         + total 45.5 둘 다 -110)이 전부 맞을 때만 가짜. oddsReal 미설정 + -140/120 은 여전히 가짜(샘).
//         daily-selfcheck 의 classify 와 같은 규칙.
// 방식: feed-check 의 **실제** oddsStatus/fullFakePrint 를 소스에서 떼어 돌린다 (재구현 금지).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'sports-feed-check.js'), 'utf8');
let failed = 0;
const ok = (c, m) => { console.log((c ? '  ✅ ' : '  🔴 ') + m); if (!c) failed++; };
function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), depth = 0;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) break; } }
  return src.slice(i, j + 1);
}
let oddsStatus = null;
try { oddsStatus = new Function(grab('oddsStatus') + '\n' + grab('fullFakePrint') + '\nreturn oddsStatus;')(); }
catch (e) { ok(false, 'oddsStatus 추출 실패: ' + e.message); }

if (oddsStatus) {
  const ml = (h, a) => [{ am: h, ln: '', sel: 'H ML' }, { am: a, ln: '', sel: 'A ML' }];
  // 2026-09-26 실측 live_games 행 그대로 (NHL, oid 5b5466f8…)
  const realNhl = { lg: 'NHL', oddsReal: true, oid: '5b5466f836933f5fb3ed4b9f267cce75', ml: ml(-140, 120),
    spread: [{ am: 180, ln: '-1.5' }, { am: -218, ln: '+1.5' }], total: [{ am: 132, ln: 'Over 6.5' }, { am: -164, ln: 'Under 6.5' }] };
  const fakePrint = { lg: 'NFL', ml: ml(-140, 120),
    spread: [{ am: -110, ln: '-3.5' }, { am: -110, ln: '+3.5' }], total: [{ am: -110, ln: 'Over 45.5' }, { am: -110, ln: 'Under 45.5' }] };
  ok(oddsStatus(realNhl) === 'REAL', '1. 실북 -140/+120 (oddsReal:true, 스프레드·토탈 실가격) → REAL (09-26 오탐 재현 경기)');
  ok(oddsStatus({ ...fakePrint, oddsReal: true }) === 'PLACEHOLDER', '2. oddsReal:true 인데 옛 가짜 지문 전부 일치 → 가짜 (카나리아 유지)');
  ok(oddsStatus({ ...realNhl, oddsReal: undefined }) === 'PLACEHOLDER', '3. oddsReal 미설정 + -140/120 → 가짜 (🚨샘 감지 유지)');
  ok(oddsStatus({ ...fakePrint }) === 'PLACEHOLDER', '4. oddsReal 미설정 + 전체 지문 → 가짜');
  ok(oddsStatus({ lg: 'NHL', oddsReal: true, ml: ml(-125, 115) }) === 'REAL', '5. 평범한 실배당 → REAL');
  ok(oddsStatus({ lg: 'NHL', oddsReal: false, ml: [] }) === 'MISSING', '6. 잠금(빈 보드) → MISSING');
  ok(oddsStatus({ lg: 'SOC', oddsReal: true, threeWay: [{ am: 150 }, { am: 230 }, { am: 180 }] }) === 'REAL', '7. SOC 실배당 Draw +230 → REAL (기존 규칙 유지)');
}
console.log(failed ? `\n🔴 feed-check-classify FAIL — ${failed}건` : '\n🟢 feed-check-classify — 가짜 라인 판정 = 완전 지문 규칙');
process.exit(failed ? 1 : 0);
