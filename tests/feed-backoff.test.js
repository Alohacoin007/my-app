#!/usr/bin/env node
// REGRESSION — 죽은 Edge 함수를 **매 틱마다** 두들기지 않는다 (2026-08-18 사장님 콘솔 264 에러).
//
// 실측: Edge `feed` 가 배포돼 있지 않아 POST/OPTIONS 모두 404
//   {"code":"NOT_FOUND","message":"Requested function was not found"}
// 프리플라이트가 404 라 브라우저는 CORS 위반으로 보고한다 — 그래서 "CORS 문제"처럼 보였지만
// 원인은 **함수 부재**였다. feedPrices() 는 feed 실패 시 DB 직접 읽기로 폴백하므로 시세는
// 계속 나왔고(화면 정상), 대신 폴링마다 실패 왕복이 한 번씩 더 갔다.
//
// 계약: 한 번 실패하면 일정 시간 건너뛰고(스톰 차단), 시간이 지나면 다시 시도해
//       **함수가 배포되면 자동 복귀**한다. 성공하면 백오프를 즉시 푼다.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const fn = (src.match(/async function feedPrices\(\)\{[\s\S]*?\n\}/) || [''])[0];
if (!fn) { bad('feedPrices 를 찾을 수 없다'); }
else {
  if (!/feedOffUntil/.test(fn)) bad('feedPrices 에 실패 백오프가 없다 — 죽은 함수를 매 틱마다 두들긴다');
  if (!/Date\.now\(\)>=feedOffUntil/.test(fn)) bad('백오프 중에도 호출을 건너뛰지 않는다');
  if (!/feedOffUntil=Date\.now\(\)\+/.test(fn)) bad('실패해도 백오프를 설정하지 않는다');
  if (!/feedOffUntil=0; return x\.data/.test(fn)) bad('성공 시 백오프를 풀지 않는다 — 배포돼도 계속 건너뛴다');
  // 폴백(DB 직접 읽기)은 반드시 남아 있어야 한다 — 없으면 feed 가 죽는 순간 시세가 통째로 멈춘다
  if (!/from\('prices'\)\.select/.test(fn)) bad('DB 직접 읽기 폴백이 사라졌다 — feed 장애 시 시세가 멈춘다');
}
if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: feed 실패 시 5분 백오프(에러 스톰 차단) + 성공 시 즉시 복귀 + DB 직접 읽기 폴백 유지.');
