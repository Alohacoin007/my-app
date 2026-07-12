#!/usr/bin/env node
// REGRESSION (webtrade) — client trading-hours SESSION GATE. prices.updated_at re-stamps even on
// weekends (harness finding) so it can't signal "market open". A regulated broker gates by session:
//   Crypto 24/7 · Forex Sun 22:00→Fri 22:00 UTC · US stocks Mon–Fri 13:30–20:00 UTC minus holidays.
// When a symbol's session is CLOSED: Market Watch shows 'Closed' (frozen, no tick colour), the
// one-click BUY/SELL panel and the New Order Buy/Sell are locked, and the demo order path refuses
// the trade with the error sound (뚜엑/timeout.wav) instead of calling fx_open.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── behavioural: extract marketOpen + holidays and exercise the boundaries ──
const holidaysSrc = (src.match(/const US_MARKET_HOLIDAYS = new Set\(\[[\s\S]*?\]\);/) || [])[0];
const fnSrc = (src.match(/function marketOpen\(symbol, at\)\{[\s\S]*?\n\}/) || [])[0];
if (!holidaysSrc || !fnSrc) { bad('marketOpen / US_MARKET_HOLIDAYS not found'); }
else {
  const SYM_CAT = { BTCUSD:'Crypto', EURUSD:'Forex', AAPL:'Stocks' };
  const marketOpen = new Function('SYM_CAT', holidaysSrc + '\n' + fnSrc + '\nreturn marketOpen;')(SYM_CAT);
  const chk = (label, got, want) => { if (got !== want) bad(`${label}: got ${got}, want ${want}`); };
  // Crypto — always open
  chk('Crypto Sat', marketOpen('BTCUSD', '2026-07-11T03:00:00Z'), true);
  // Forex — Sun 22:00 → Fri 22:00 UTC  (2026-07-11 Sat, 12 Sun, 08 Wed, 10 Fri)
  chk('FX Sat closed',        marketOpen('EURUSD', '2026-07-11T12:00:00Z'), false);
  chk('FX Sun 21:00 closed',  marketOpen('EURUSD', '2026-07-12T21:00:00Z'), false);
  chk('FX Sun 22:30 open',    marketOpen('EURUSD', '2026-07-12T22:30:00Z'), true);
  chk('FX Wed open',          marketOpen('EURUSD', '2026-07-08T12:00:00Z'), true);
  chk('FX Fri 21:00 open',    marketOpen('EURUSD', '2026-07-10T21:00:00Z'), true);
  chk('FX Fri 22:30 closed',  marketOpen('EURUSD', '2026-07-10T22:30:00Z'), false);
  // US stocks — Mon–Fri 13:30–20:00 UTC minus holidays
  chk('STK Sat closed',       marketOpen('AAPL', '2026-07-11T15:00:00Z'), false);
  chk('STK Wed 15:00 open',   marketOpen('AAPL', '2026-07-08T15:00:00Z'), true);
  chk('STK Wed 12:00 closed', marketOpen('AAPL', '2026-07-08T12:00:00Z'), false);
  chk('STK Wed 20:00 closed', marketOpen('AAPL', '2026-07-08T20:00:00Z'), false);
  chk('STK open boundary',    marketOpen('AAPL', '2026-07-08T13:30:00Z'), true);
  chk('STK holiday closed',   marketOpen('AAPL', '2026-07-03T15:00:00Z'), false);   // Independence Day (observed)
}

// ── Market Watch 'Closed' mask ──
if (!/const open=marketOpen\(sym\);/.test(src)) bad('Market Watch row must compute the session state per symbol');
if (!/\+\(open\?'':' mw-closed'\)/.test(src)) bad('closed rows need the mw-closed class');
if (!/<td className="mw-closed-tag">Closed<\/td>/.test(src)) bad("closed rows must show a grey 'Closed' tag at the right end");
if (!/className=\{open\?tc\(d\.bid\):'mw-closed-cell'\}/.test(src)) bad('closed rows must drop the tick colour (mw-closed-cell)');
if (!/\.mwt td\.mw-closed-tag\{/.test(src)) bad("'Closed' tag needs a grey style");

// ── one-click panel (OrderBox) lock + refusal ──
if (!/const open=marketOpen\(symbol\);   \/\/ session gate — closed → BUY\/SELL locked/.test(src)) bad('OrderBox must compute session state');
if (!/if\(!marketOpen\(symbol\)\)\{ playSnd\(sndError\); alert\('장 마감 시간입니다 \(Market closed\)'\); return; \}[\s\S]*?debounce/.test(src)) bad('OrderBox.send must refuse a closed-market order with the error sound BEFORE any RPC');
if (!/\(open\?'':' oc-closed'\)/.test(src)) bad('OrderBox must add oc-closed when the market is closed');
if (!/\.obox\.oc-closed \.oc-lbl,\.obox\.oc-closed \.oc-price\{pointer-events:none;opacity:\.4\}/.test(src)) bad('closed one-click panel must be pointer-events:none; opacity:.4');

// ── New Order popup (OrderModal) lock + refusal ──
if (!/if\(!marketOpen\(symbol\)\)\{ playSnd\(sndError\); alert\('장 마감 시간입니다 \(Market closed\)'\); return; \}[\s\S]*?client pre-gate/.test(src)) bad('OrderModal.submit must refuse a closed-market order with the error sound');
if (!/disabled=\{!canAfford\|\|!open\} onClick=\{\(\)=>submit\('sell'\)\}/.test(src)) bad('New Order Sell button must be disabled when closed');
if (!/disabled=\{!canAfford\|\|!open\} onClick=\{\(\)=>submit\('buy'\)\}/.test(src)) bad('New Order Buy button must be disabled when closed');
if (!/\{!open && <div className="om-closed">/.test(src)) bad('New Order popup must show a Market-closed note');

if (fail) { console.error(`\n🔴 FAIL — ${fail} session-gate problem(s).`); process.exit(1); }
console.log('🟢 PASS: session calendar gates display + demo orders (Crypto 24/7 · FX Sun22–Fri22 UTC · stocks 13:30–20:00 UTC − holidays); closed = Closed mask + locked BUY/SELL + refused order with 뚜엑.');
