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
if (!/if\(candles\.current\.length && !fitted\)\{ chart\.current\.timeScale\(\)\.fitContent\(\); fitted=true; \}/.test(src)) bad('doFit must fitContent once, only when candles are loaded (then keep zoom)');
// candle load triggers the fit now + next frame + a late retry
if (!/doFit\(\); requestAnimationFrame\(doFit\); setTimeout\(doFit,120\)/.test(src)) bad('after loading candles, fit now + rAF + a late retry (deferred layout)');
// cleaned up on teardown
if (!/boxRO&&boxRO\.disconnect\(\)/.test(src)) bad('the ResizeObserver must be disconnected on cleanup');

if (fail) { console.error(`\n🔴 FAIL — ${fail} chart-init-fit problem(s).`); process.exit(1); }
console.log('🟢 PASS: default M1 chart fits the moment its (initially 0-wide) window gets a real size — candles show on load, no need to switch timeframe.');
