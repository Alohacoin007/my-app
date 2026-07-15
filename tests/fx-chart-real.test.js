#!/usr/bin/env node
// REGRESSION (trading.html) — the CHART follows the real market (2026-07-13).
// Two legs of the same "display track split" defect family (see fx-display-lockstep):
//  [A] the LIVE candle used the sim engine price (per-tick jitter beyond the real market) while
//      quotes/P&L already read the real feed → the current candle "danced" on its own.
//      Now: live candle price = __alpexaFXFeed mid (Realtime-pushed), sim last only as the
//      no-feed fallback (stocks/indices keep working).
//  [B] history depth: caps raised to the readability limit of this FIXED-WINDOW canvas chart
//      (no pan — deep multi-year scroll lives in webtrade). The seed fetch asks the Edge for
//      at least the cap via &n=.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'trading.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// [A] live candle anchored to the real feed mid, sim as fallback only
if (!/const f=\(typeof window!=='undefined'&&window\.__alpexaFXFeed\|\|\{\}\)\[sym\];/.test(src))
  bad('the main chart must read the real feed for the live candle');
if (!/const livePx=\(f&&\+f\.mid>0\)\?\+f\.mid:\(series&&series\.length\?series\[series\.length-1\]\.c:null\);/.test(src))
  bad('live candle price must be the REAL mid, falling back to the sim last only when no feed row exists');

// [B] readable-depth caps + the fetch asks for them
if (!/const TF_CONFIG=\{M1:\{n:120,/.test(src) || !/M5:\{n:120,/.test(src) || !/M15:\{n:120,/.test(src))
  bad('minute TF caps must be 120 (readability limit of the fixed-window canvas)');
if (!/H1:\{n:120,/.test(src) || !/H4:\{n:120,/.test(src)) bad('hour TF caps must be 120');
if (!/D1:\{n:180,/.test(src) || !/W1:\{n:104,/.test(src)) bad('D1 must cap 180 (~9mo) and W1 104 (~2y)');
if (!/\?candles='\+encodeURIComponent\(sym\)\+'&tf='\+encodeURIComponent\(tf\)\+'&n='\+Math\.max\(200,cap\)/.test(src))
  bad('the seed fetch must ask the Edge for at least the cap (&n=)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} fx-chart problem(s).`); process.exit(1); }
console.log('🟢 PASS: FX-app chart — live candle rides the real feed mid (sim only as no-feed fallback); history caps at the fixed-window readability limit with &n= seeding.');
