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

// 2) the chart is seeded with the deterministic history FIRST (never empty), then upgraded async
if (!/applyBars\(synthCandles\(symbol, tf\)\);/.test(src)) bad('chart must paint the synth seed IMMEDIATELY so it is never empty');
if (!/fetchRealCandles\(symbol, tf\)\.then\(real=>\{ if\(real && series\.current===s\) applyBars\(real\)/.test(src)) bad('chart must upgrade to REAL bars only when a validated history returns');

// 3) fetchRealCandles: real-or-NULL, validated (full + sorted), timed out, NOT gated by market hours
const fr = (src.match(/async function fetchRealCandles\(symbol, tf\)\{[\s\S]*?\n\}/) || [''])[0];
if (!fr) bad('fetchRealCandles not found');
if (!/if\(WT_DEMO\) return null;/.test(fr)) bad('fetchRealCandles must no-op in demo');
if (!/bars\.length<160\) return null;/.test(fr)) bad('fetchRealCandles must require a FULL history (≥160) or return null (seed stays)');
if (!/bars\[i\]\.time<=bars\[i-1\]\.time\) return null;/.test(fr)) bad('fetchRealCandles must reject unsorted/duplicate bars (LWC would blank the chart)');
if (!/setTimeout\(\(\)=>res\(null\),4000\)/.test(fr)) bad('fetchRealCandles must time out (a slow feed must never stall the chart)');
if (/\bmarketOpen\s*\(/.test(fr)) bad('fetchRealCandles must NOT call marketOpen — closed symbols must still fetch history');

// 4) the seed is a LONG history for backward scroll
if (!/const step=TF_SEC\[tf\]\|\|900, n=400;/.test(src)) bad('synthCandles must build a long (400-bar) history for backward scroll');

if (fail) { console.error(`\n🔴 FAIL — ${fail} chart-boot problem(s).`); process.exit(1); }
console.log('🟢 PASS: desktop boots all 4 charts eagerly; loadCandles fills a full history for every symbol (open or closed), feed trusted only when complete else the 200-bar seed.');
