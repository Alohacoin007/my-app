#!/usr/bin/env node
// REGRESSION (webtrade) — Method A session freeze. Trading was gated by marketOpen() but the CHART and
// PRICE FEED were not: on weekends the random-walk _simulate() (and the throttled onTick) kept animating
// closed Forex/US-stock candles — "거래는 닫혔는데 차트만 산다". Fix (lockstep):
//   [1] onTick aborts (return) when !marketOpen(symbol) → the live bar freezes at the Fri/close price.
//   [2] crypto is 24/7 (marketOpen === true) → chart + quotes keep flowing.
//   [3] _simulate() must NOT random-walk a closed symbol — it freezes it at its last/close price.
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
if (!/if\(!marketOpen\(sym\)\)\{ if\(!this\.mids\[sym\]\) this\._set\(sym, cur, 10\*pip\(sym\)\/2, 10, now\); return; \}/.test(src))
  bad('[3] _simulate must freeze (not random-walk) a closed symbol');

// ── behavioural: marketOpen is correct (crypto 24/7, FX weekend closed, stock weekend closed) ──
const mo_src = grab(/function marketOpen\(symbol, at\)\{[\s\S]*?\n\}/, 'marketOpen');
if (!fail) {
  const marketOpen = new Function('SYM_CAT','US_MARKET_HOLIDAYS',
    mo_src + '\nreturn marketOpen;')({BTCUSD:'Crypto',EURUSD:'Forex',AAPL:'Stocks'}, new Set());
  const SAT = Date.UTC(2026,6,11,12,0), WED = Date.UTC(2026,6,8,12,0);   // 2026-07-11 Sat, 2026-07-08 Wed
  if (marketOpen('BTCUSD', SAT) !== true) bad('crypto must be OPEN 24/7 (Saturday)');
  if (marketOpen('BTCUSD', WED) !== true) bad('crypto must be OPEN 24/7 (Wednesday)');
  if (marketOpen('EURUSD', SAT) !== false) bad('Forex must be CLOSED on Saturday');
  if (marketOpen('EURUSD', WED) !== true) bad('Forex must be OPEN Wednesday noon');
  if (marketOpen('AAPL', SAT) !== false) bad('US stock must be CLOSED on Saturday');
}

// ── behavioural: _simulate FREEZES a closed symbol but WALKS an open one (crypto) ──
const set_src = grab(/_set\(sym,mid,half,spr,now,jit\)\{[\s\S]*?\n  \},/, '_set');
const sim_src = grab(/_simulate\(\)\{[\s\S]*?\n  \},/, '_simulate');
if (!fail) {
  const store = new Function('marketOpen','WATCH','BASE','pip',
    'const store={ mids:{}, drift:null,\n' + set_src + '\n' + sim_src + '\n};\nreturn store;'
  )((sym)=> sym==='BTCUSD',              // BTCUSD open (crypto), EURUSD closed (weekend FX)
    ['EURUSD','BTCUSD'], {EURUSD:1.1, BTCUSD:64000}, ()=>0.0001);
  store._simulate();
  const eur1 = store.mids.EURUSD.mid, btc1 = store.mids.BTCUSD.mid;
  store._simulate();
  const eur2 = store.mids.EURUSD.mid, btc2 = store.mids.BTCUSD.mid;
  if (eur1 !== 1.1 || eur2 !== 1.1) bad(`closed FX must freeze at 1.1 (got ${eur1} then ${eur2}) — simulator moved a closed market`);
  if (btc1 === 64000) bad('open crypto must random-walk off its base (it froze)');
  if (btc2 === btc1) bad('open crypto must keep walking each tick (it froze after one)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} market-freeze problem(s).`); process.exit(1); }
console.log('🟢 PASS: Method A — onTick + _simulate honour marketOpen; closed Forex/stock candles freeze at the last close, crypto keeps flowing 24/7.');
