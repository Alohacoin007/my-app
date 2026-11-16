#!/usr/bin/env node
// REGRESSION (webtrade) — Method A session freeze. Trading was gated by marketOpen() but the CHART and
// PRICE FEED were not: on weekends the random-walk _simulate() (and the throttled onTick) kept animating
// closed Forex/US-stock candles — "거래는 닫혔는데 차트만 산다". Fix (lockstep):
//   [1] onTick aborts (return) when !marketOpen(symbol) → the live bar freezes at the Fri/close price.
//   [2] crypto is 24/7 (marketOpen === true) → chart + quotes keep flowing.
//   [3] (2026-11-15) 시세 저장소는 **어떤 종목도** 지어내 움직이지 않는다 — 예전의 랜덤워크 폴백은 통째로 삭제.
//       닫힌 시장뿐 아니라 열린 시장도, 시세를 못 받으면 마지막 값에서 멈춘다. 행위 핀 = tests/webtrade-feed-down.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: both gates are present ──
if (!/const onTick=throttle\(\(mids\)=>\{\s*\n\s*if\(!marketOpen\(symbol\)\) return;/.test(src))
  bad('[1] onTick must abort at the top when the symbol session is closed');
if (/_simulate\(/.test(src) || /\(Math\.random\(\)-0\.5\)\*0\.0006/.test(src))
  bad('[3] the random-walk price fallback must be gone — prices move only on received feed data');

// ── behavioural: marketOpen is correct (crypto 24/7, FX weekend closed, stock weekend closed) ──
// 2026-08-15: marketOpen 이 ET 벽시계 헬퍼(etWall)·반일 셋과 한 몸이 됐다 → 함수만 뽑으면
// ReferenceError. SESSION-CALENDAR 마커 블록을 통째로 뽑는다 (fx-session-gate.test.js 와 동일 방식).
const mo_src = grab(/\/\* ══ SESSION-CALENDAR[\s\S]*?══ \*\/[\s\S]*?\/\* ══ \/SESSION-CALENDAR ══ \*\//, 'SESSION-CALENDAR 블록');
if (!fail) {
  // marketOpen classifies via catOf now (so dynamic stocks like SPACEX gate as stocks, not Forex)
  const catOf = (s)=> ({BTCUSD:'Crypto',EURUSD:'Forex',AAPL:'Stocks',SPACEX:'Stocks'}[s]||'Forex');
  const marketOpen = new Function('catOf', mo_src + '\nreturn marketOpen;')(catOf);
  const SAT = Date.UTC(2026,6,11,12,0), WED = Date.UTC(2026,6,8,12,0);   // 2026-07-11 Sat, 2026-07-08 Wed
  if (marketOpen('BTCUSD', SAT) !== true) bad('crypto must be OPEN 24/7 (Saturday)');
  if (marketOpen('BTCUSD', WED) !== true) bad('crypto must be OPEN 24/7 (Wednesday)');
  if (marketOpen('EURUSD', SAT) !== false) bad('Forex must be CLOSED on Saturday');
  if (marketOpen('EURUSD', WED) !== true) bad('Forex must be OPEN Wednesday noon');
  if (marketOpen('AAPL', SAT) !== false) bad('US stock must be CLOSED on Saturday');
  // the SPACEX bug: a dynamic stock must gate as a STOCK (closed weekend), not slip through as Forex
  if (marketOpen('SPACEX', SAT) !== false) bad('dynamic stock SPACEX must be CLOSED on Saturday (catOf classification)');
}

// ── (옛 행위 핀 삭제, 2026-11-15) 예전엔 여기서 "닫힌 종목은 멈추고 열린 크립토는 랜덤워크한다"를 강제했다.
//    그 랜덤워크 자체가 결함이었다(시세 끊김 중 가짜 시세·가짜 손익). 새 계약 "아무 종목도 안 움직인다"의
//    행위 테스트는 tests/webtrade-feed-down.test.js (A·B·C) 에 있다.

if (fail) { console.error(`\n🔴 FAIL — ${fail} market-freeze problem(s).`); process.exit(1); }
console.log('🟢 PASS: Method A — onTick honours marketOpen; closed Forex/stock candles freeze at the last close, crypto keeps flowing 24/7; no random-walk price fallback.');
