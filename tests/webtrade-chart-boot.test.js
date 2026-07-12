#!/usr/bin/env node
// REGRESSION (webtrade) — chart boot + history. After going live (WT_DEMO=false) the candle history
// switched to the fx-prices feed, which returns SPARSE data → short/broken charts, and 2 of the 4
// tiles looked empty on refresh. Two guarantees:
//   1) DESKTOP boots ALL charts eagerly (revealed = every chart id; lazy only on mobile).
//   2) loadCandles yields a FULL history for EVERY symbol (open OR closed — history is NOT gated by
//      market hours); it trusts the feed only when genuinely full (≥160 bars), else the 200-bar seed.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) desktop eager reveal — all charts mount on load; mobile stays lazy (active only)
if (!/new Set\(IS_MOBILE \? \(initCharts\[0\] \? \[initCharts\[0\]\.id\] : \[\]\) : initCharts\.map\(c=>c\.id\)\)/.test(src))
  bad('desktop must reveal ALL charts eagerly (revealed = initCharts.map ids); mobile stays lazy');
if (!/const \[hydrated,setHydrated\]=React\.useState\(!IS_MOBILE\)/.test(src)) bad('desktop must hydrate immediately (hydrated = !IS_MOBILE)');
if (!/lazyHold=\{IS_MOBILE && !revealed\.has\(c\.id\)\}/.test(src)) bad('lazyHold must be mobile-only (desktop never lazy-holds)');

// 2) loadCandles: full history, feed trusted only when complete, seed fallback
const lc = (src.match(/async function loadCandles\(symbol, tf\)\{[\s\S]*?\n\}/) || [''])[0];
if (!lc) bad('loadCandles not found');
if (/length>=30\b/.test(lc)) bad('loadCandles must NOT accept a sparse 30-bar feed (that drew short charts)');
if (!/candles\.length>=160/.test(lc)) bad('loadCandles must trust the feed only when it returns a FULL history (≥160 bars)');
if (!/return synthCandles\(symbol, tf\);/.test(lc)) bad('loadCandles must fall back to the full 200-bar seed');
// history must NOT be gated by the session/market-hours gate (closed symbols still load full history)
if (/\bmarketOpen\s*\(/.test(lc)) bad('loadCandles must NOT call marketOpen — closed symbols must still load full history');

// 3) the seed really is a full 200-bar history
if (!/const step=TF_SEC\[tf\]\|\|900, n=200;/.test(src)) bad('synthCandles must build a full 200-bar history');

if (fail) { console.error(`\n🔴 FAIL — ${fail} chart-boot problem(s).`); process.exit(1); }
console.log('🟢 PASS: desktop boots all 4 charts eagerly; loadCandles fills a full history for every symbol (open or closed), feed trusted only when complete else the 200-bar seed.');
