#!/usr/bin/env node
// REGRESSION (webtrade) — the default M1 chart must show its candles on load. A floating window can
// be 0-wide for a few frames after refresh, so the first setData landed off-view and the chart
// looked EMPTY until you switched timeframe ("5분짜리 클릭해야 뜨는데"). A ResizeObserver fits the
// chart the moment the box gets a real width; once fitted, later resizes keep the zoom.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// default charts open at M1
if (!/GRID\.map\(\(s,i\)=>\(\{ id:i\+1, symbol:s, tf:'M1'/.test(src)) bad('default charts must open at the M1 timeframe');

// a ResizeObserver fits the chart when the box first gets a real width
if (!/new ResizeObserver\(doFit\)/.test(src)) bad('a ResizeObserver must drive the initial fit');
if (!/boxRO\.observe\(box\.current\)/.test(src)) bad('the ResizeObserver must observe the chart box');
if (!/const w=box\.current\.clientWidth, h=box\.current\.clientHeight;\s*\n?\s*if\(w<=0\|\|h<=0\) return;/.test(src)) bad('doFit must no-op while the box has no size (0-wide window)');
// once, when candles first load: apply the MT5 slim density (barSpacing 4 + rightOffset 14) and scroll
// to the newest bar — NOT fitContent (which stretches all 400 bars to full width → fat candles).
if (!/if\(candles\.current\.length && !fitted\)\{ const ts=chart\.current\.timeScale\(\);/.test(src)) bad('doFit must set the fixed MT5 view once when candles load');
if (!/ts\.applyOptions\(\{ barSpacing:4, rightOffset:14 \}\); ts\.scrollToRealTime\(\);/.test(src)) bad('doFit must apply slim barSpacing + right margin and scroll to the newest bar (not fitContent)');
if (!/catch\(_\)\{ try\{ ts\.fitContent\(\); \}catch\(e2\)\{\} \}/.test(src)) bad('doFit must fall back to fitContent if scrollToRealTime is unavailable');
// candle load triggers the fit now + next frame + a late retry
if (!/doFit\(\); requestAnimationFrame\(doFit\); setTimeout\(doFit,120\)/.test(src)) bad('after loading candles, fit now + rAF + a late retry (deferred layout)');
// cleaned up on teardown
if (!/boxRO&&boxRO\.disconnect\(\)/.test(src)) bad('the ResizeObserver must be disconnected on cleanup');

if (fail) { console.error(`\n🔴 FAIL — ${fail} chart-init-fit problem(s).`); process.exit(1); }
console.log('🟢 PASS: default M1 chart snaps to the MT5 slim view (barSpacing 4 + rightOffset 14, scroll-to-realtime) the moment its (initially 0-wide) window gets a real size — candles show on load, no need to switch timeframe.');
