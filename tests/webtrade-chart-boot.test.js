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

// 0) DEFAULT LOGIN LAYOUT (2026-07-13 user request, MT5-style): boot the FULL 2×2 —
//    TL EURUSD · TR USDJPY · BL GBPUSD · BR USDCHF, all M1 candles (floatGeo tiles them edge-to-edge).
if (!/const GRID  = \['EURUSD','USDJPY','GBPUSD','USDCHF'\];/.test(src))
  bad('GRID must be the approved default order: EURUSD·USDJPY·GBPUSD·USDCHF (TL·TR·BL·BR)');
if (!/const initCharts=React\.useRef\(GRID\.map\(\(sym,i\)=>\(\{ id:i\+1, symbol:sym, tf:'M1', type:'candle', inds:\(cfg\.indicators\|\|\[\]\)\.slice\(\) \}\)\)\)\.current;/.test(src))
  bad('login must boot ONE chart per GRID symbol (4 × M1 candle), not a single maximized chart');

// 1) desktop eager reveal — all charts mount on load; mobile stays lazy (active only)
if (!/new Set\(IS_MOBILE \? \(initCharts\[0\] \? \[initCharts\[0\]\.id\] : \[\]\) : initCharts\.map\(c=>c\.id\)\)/.test(src))
  bad('desktop must reveal ALL charts eagerly (revealed = initCharts.map ids); mobile stays lazy');
if (!/const \[hydrated,setHydrated\]=React\.useState\(!IS_MOBILE\)/.test(src)) bad('desktop must hydrate immediately (hydrated = !IS_MOBILE)');
if (!/lazyHold=\{IS_MOBILE && !revealed\.has\(c\.id\)\}/.test(src)) bad('lazyHold must be mobile-only (desktop never lazy-holds)');

// 2) REAL-FIRST paint (2026-07-13): a TF/symbol switch must NOT flash the synth chart before the
//    real one ("old chart then new chart"). Contract:
//    · stale refs reset BEFORE the load — the old TF's last bar must never tick into the new series
//    · the real history gets ~1.2s to arrive; only then may the synth seed paint (never fake-first,
//      never empty for long); a late/failed real still falls back to the seed
if (!/bar\.current=null; candles\.current=\[\];/.test(src))
  bad('the old TF refs must be reset before loading (stale last-bar would mix into the new chart)');
if (!/const seedTimer=setTimeout\(\(\)=>\{ if\(series\.current===s && !havePaint\) applyBars\(synthCandles\(symbol, tf\)\); \},1200\);/.test(src))
  bad('the synth seed must be DEFERRED (~1.2s) and paint only if nothing painted yet');
if (!/fetchRealCandles\(symbol, tf\)\.then\(real=>\{ clearTimeout\(seedTimer\);/.test(src))
  bad('a real history must cancel the pending seed (real-first, no fake flash)');
if (!/if\(series\.current!==s\) return;/.test(src))
  bad('a stale real response (chart recreated) must be dropped');
if (!/if\(real\) applyBars\(real\); else if\(!havePaint\) applyBars\(synthCandles\(symbol, tf\)\);/.test(src))
  bad('real paints when it arrives; a failed real falls back to the seed only if nothing painted');
// container is scrubbed before createChart — no stacked canvases class, ever
if (!/box\.current\.innerHTML='';/.test(src))
  bad('the chart container must be scrubbed before createChart (kills any stacked-canvas leak)');

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
