#!/usr/bin/env node
// REGRESSION (webtrade) — client trading-hours SESSION GATE. prices.updated_at re-stamps even on
// weekends (harness finding) so it can't signal "market open". A regulated broker gates by session:
//   Crypto 24/7 · Forex Sun 17:00→Fri 17:00 ET · US stocks Mon–Fri 09:30–16:00 ET (반일 13:00) − 휴일.
//   (경계는 뉴욕 현지시각 앵커 = 서머타임 자동 추종. 서버 fx_market_open 과 락스텝.)
// When a symbol's session is CLOSED: Market Watch shows 'Closed' (frozen, no tick colour), the
// one-click BUY/SELL panel and the New Order Buy/Sell are locked, and the demo order path refuses
// the trade with the error sound (뚜엑/timeout.wav) instead of calling fx_open.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── behavioural: extract the SESSION-CALENDAR block and exercise the boundaries ──
// 2026-08-15: 경계가 UTC 고정 → **뉴욕 현지시각(ET)** 앵커로 교체됐다. 아래 두 케이스는 그래서
// 기대값이 뒤집혔는데, 그건 이 테스트가 **버그를 박제하고 있었기 때문**이다:
//   · FX 일 21:00 UTC (= 7월엔 17:00 ET) — 실제로는 개장 직후인데 구버전은 닫혀 있다고 했다
//   · FX 금 21:00 UTC (= 7월엔 17:00 ET) — 실제로는 마감인데 구버전은 한 시간 더 열어뒀다
const fnSrc = (src.match(/\/\* ══ SESSION-CALENDAR[\s\S]*?══ \*\/[\s\S]*?\/\* ══ \/SESSION-CALENDAR ══ \*\//) || [])[0];
if (!fnSrc) { bad('SESSION-CALENDAR 블록을 찾을 수 없다 (마커가 지워졌나?)'); }
else {
  // marketOpen classifies via catOf now (dynamic stocks gate correctly, not as Forex)
  const catOf = (s)=> ({ BTCUSD:'Crypto', EURUSD:'Forex', AAPL:'Stocks' }[s] || 'Forex');
  const marketOpen = new Function('catOf', fnSrc + '\nreturn marketOpen;')(catOf);
  const chk = (label, got, want) => { if (got !== want) bad(`${label}: got ${got}, want ${want}`); };
  // Crypto — always open
  chk('Crypto Sat', marketOpen('BTCUSD', '2026-07-11T03:00:00Z'), true);
  // Forex — Sun 17:00 ET → Fri 17:00 ET  (2026-07-11 Sat, 12 Sun, 08 Wed, 10 Fri · 여름이라 ET=UTC−4)
  chk('FX Sat closed',        marketOpen('EURUSD', '2026-07-11T12:00:00Z'), false);
  chk('FX Sun 16:30ET closed',marketOpen('EURUSD', '2026-07-12T20:30:00Z'), false);
  chk('FX Sun 17:00ET open',  marketOpen('EURUSD', '2026-07-12T21:00:00Z'), true);
  chk('FX Wed open',          marketOpen('EURUSD', '2026-07-08T12:00:00Z'), true);
  chk('FX Fri 16:30ET open',  marketOpen('EURUSD', '2026-07-10T20:30:00Z'), true);
  chk('FX Fri 17:00ET closed',marketOpen('EURUSD', '2026-07-10T21:00:00Z'), false);
  // US stocks — Mon–Fri 09:30–16:00 ET minus holidays (반일 13:00 ET)
  chk('STK Sat closed',       marketOpen('AAPL', '2026-07-11T15:00:00Z'), false);
  chk('STK Wed 11:00ET open', marketOpen('AAPL', '2026-07-08T15:00:00Z'), true);
  chk('STK Wed 08:00ET closed',marketOpen('AAPL', '2026-07-08T12:00:00Z'), false);
  chk('STK Wed 16:00ET closed',marketOpen('AAPL', '2026-07-08T20:00:00Z'), false);
  chk('STK open boundary',    marketOpen('AAPL', '2026-07-08T13:30:00Z'), true);
  chk('STK holiday closed',   marketOpen('AAPL', '2026-07-03T15:00:00Z'), false);   // Independence Day (observed)
  // ── DST: 겨울(EST)에도 경계가 뉴욕 09:30–16:00 을 따라가야 한다 (구버전은 UTC 고정이라 1h 어긋남) ──
  chk('STK 겨울 09:00ET closed', marketOpen('AAPL', '2026-11-02T14:00:00Z'), false);  // 구버전: 열림(정지가 차익거래)
  chk('STK 겨울 09:30ET open',   marketOpen('AAPL', '2026-11-02T14:30:00Z'), true);
  chk('STK 겨울 15:30ET open',   marketOpen('AAPL', '2026-11-02T20:30:00Z'), true);   // 구버전: 닫힘(정상 고객 차단)
  chk('STK 겨울 16:00ET closed', marketOpen('AAPL', '2026-11-02T21:00:00Z'), false);
  chk('STK 반일 13:30ET closed', marketOpen('AAPL', '2026-11-27T18:30:00Z'), false);  // 추수감사절 다음날 조기폐장
  // 금·은은 fx_specs.cls='FX' — catOf 가 못 읽어 Crypto 라 답해도 주말엔 닫혀야 한다
  chk('XAU Sat closed',       marketOpen('XAUUSD', '2026-07-11T12:00:00Z'), false);
}

// ── Market Watch 'Closed' mask ──
if (!/const open=marketOpen\(sym\);/.test(src)) bad('Market Watch row must compute the session state per symbol');
if (!/\+\(open\?'':' mw-closed'\)/.test(src)) bad('closed rows need the mw-closed class');
if (!/<td className="mw-closed-tag">Closed<\/td>/.test(src)) bad("closed rows must show a grey 'Closed' tag at the right end");
if (!/className=\{open\?tc\(d\.bid\):'mw-closed-cell'\}/.test(src)) bad('closed rows must drop the tick colour (mw-closed-cell)');
if (!/\.mwt td\.mw-closed-tag\{/.test(src)) bad("'Closed' tag needs a grey style");

// ── one-click panel (OrderBox) lock + refusal ──
if (!/const open=marketOpen\(symbol\);   \/\/ session gate — closed → BUY\/SELL locked/.test(src)) bad('OrderBox must compute session state');
if (!/if\(!marketOpen\(symbol\)\)\{ playSnd\(sndError\); alert\(t\('Market closed'\)\); return; \}[\s\S]*?debounce/.test(src)) bad('OrderBox.send must refuse a closed-market order with the error sound BEFORE any RPC');
if (!/\(tradable\?'':' oc-closed'\)/.test(src)) bad('OrderBox must dim/disable (oc-closed) when the market is closed or free margin is gone');
if (!/\.obox\.oc-closed \.oc-lbl,\.obox\.oc-closed \.oc-price\{pointer-events:none;opacity:\.4\}/.test(src)) bad('closed one-click panel must be pointer-events:none; opacity:.4');

// ── New Order popup (OrderModal) lock + refusal ──
if (!/if\(!marketOpen\(symbol\)\)\{ playSnd\(sndError\); alert\(t\('Market closed'\)\); return; \}[\s\S]*?server gate is the real authority/.test(src)) bad('OrderModal.submit must refuse a closed-market order with the error sound');
if (!/disabled=\{!canAfford\|\|!open\} onClick=\{\(\)=>submit\('sell'\)\}/.test(src)) bad('New Order Sell button must be disabled when closed');
if (!/disabled=\{!canAfford\|\|!open\} onClick=\{\(\)=>submit\('buy'\)\}/.test(src)) bad('New Order Buy button must be disabled when closed');
if (!/\{!open && <div className="om-closed">/.test(src)) bad('New Order popup must show a Market-closed note');

if (fail) { console.error(`\n🔴 FAIL — ${fail} session-gate problem(s).`); process.exit(1); }
console.log('🟢 PASS: session calendar gates display + demo orders (Crypto 24/7 · FX 일17:00–금17:00 ET · 주식 09:30–16:00 ET 반일13:00 − 휴일, DST 자동 추종); closed = Closed mask + locked BUY/SELL + refused order with 뚜엑.');
