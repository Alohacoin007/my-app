#!/usr/bin/env node
// REGRESSION (webtrade) — the main chart engine is tuned to MT5-original proportions:
//   [1] slim candles: default barSpacing 5 (slim, sharp candles) + minBarSpacing 0.8.
//   [2] right margin: rightOffset 15 so the newest live candle breathes off the price axis.
//   [3] slim axes: layout fontSize 8 (was 11) + trimmed price scaleMargins (0.08) → more candle canvas.
// The boot view sets the same slim density (barSpacing 5 + rightOffset 15 + scrollToRealTime), NOT
// fitContent (which stretched all 400 seed bars to full width and fattened the candles).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// isolate the MAIN chart createChart options block (the first one — the FX mini chart is separate)
const blk = (src.match(/const c=LightweightCharts\.createChart\(box\.current, \{[\s\S]*?\n    \}\);/) || [])[0] || '';
if (!blk) bad('main createChart options block not found');

// [1] slim, denser candles
if (!/barSpacing:5/.test(blk)) bad('main chart must default to barSpacing 5 (slim, sharp, dense candles)');
if (!/minBarSpacing:0\.8/.test(blk)) bad('main chart must set minBarSpacing 0.8 (allow dense zoom-out)');

// [2] wide right margin for future-trend space
if (!/rightOffset:15/.test(blk)) bad('main chart must set rightOffset 15 (wide right margin)');

// [3] slim axis font + trimmed vertical padding + no tick nubs → bigger canvas, thinner time axis
if (!/fontSize:8\b/.test(blk)) bad('axis label font must be slimmed to 8px (denser ticks)');
if (!/rightPriceScale:\{ borderColor:th0\.border, ticksVisible:false, scaleMargins:\{top:0\.05, bottom:0\.05\}/.test(blk)) bad('right price scale must expand the canvas (scaleMargins 0.05) with no tick nubs');
// the bottom TIME axis is slimmed: font-driven ~20px (LWC 4.2 has no pixel height) + no tick marks
if (!/timeScale:\{ borderColor:th0\.border, timeVisible:true, secondsVisible:false, ticksVisible:false,/.test(blk)) bad('time axis must drop its tick nubs (ticksVisible:false) to slim the bottom bar');

// old fat defaults must be gone from the main block
if (/fontSize:11\b/.test(blk)) bad('old fontSize:11 must be gone from the main chart');
if (/rightOffset:6\b/.test(blk)) bad('old rightOffset:6 must be gone from the main chart');

// grid stays the MT5 dotted checkerboard mask on both axes
if (!/grid:\{ vertLines:\{color:th0\.grid, style:DOT\}, horzLines:\{color:th0\.grid, style:DOT\} \}/.test(blk)) bad('grid must stay the MT5 dotted checkerboard on both axes');

// ── INVARIANT LOCK: no wheel/pinch/time-axis-drag zoom can ever change the 5px candle width ──
if (!/handleScale:\{ mouseWheel:false, pinch:false, axisPressedMouseMove:\{time:false, price:true\} \}/.test(blk))
  bad('bar-spacing lock: handleScale must disable wheel + pinch + time-axis-drag zoom (price drag stays)');
// every resize re-pins the density + the Chart-Shift gap (splitter/window-resize can never roll back to fat)
if (!/try\{ ts\.applyOptions\(\{ barSpacing:5, rightOffset:shiftOffset\(\) \}\); \}catch\(_\)\{\}/.test(src))
  bad('every doFit/resize must re-pin barSpacing 5 + rightOffset shiftOffset() (no rollback)');
// the live-tick re-pin is gated by the MT5 Auto Scroll toggle (2026-07-14: applyOptions(rightOffset)
// SCROLLS, so the ungated form yanked history browsers forward on every tick; the toggle semantics
// belong to tests/webtrade-history-scroll.test.js which executes the block in all three states)
if (!/if\(chartOpts\.autoScroll\) ts\.applyOptions\(\{ rightOffset:shiftOffset\(\) \}\);/.test(src))
  bad('tick handler must re-pin the right margin only under the Auto Scroll toggle (chartOpts-gated)');
// the shared resizer (splitter / window-resize) refits the FULL live parent height AND re-welds the lock
if (!/resizeOne\(it\)\{ try\{ const w=it\.el\.clientWidth, h=it\.el\.clientHeight; if\(w>0&&h>0\)\{ it\.chart\.resize\(w,h\);/.test(src))
  bad('chartResizer must resize to the live parent clientWidth/clientHeight (responsive, no fixed px)');
if (!/it\.chart\.timeScale\(\)\.applyOptions\(\{ barSpacing:5, rightOffset:shiftOffset\(\) \}\);[^\n]*\}[^\n]*\},/.test(src))
  bad('chartResizer must re-weld barSpacing 5 + the Chart-Shift gap after every resize (no rollback on splitter/window resize)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} chart-scale problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 chart scale — slim candles (barSpacing 5 / minBarSpacing 0.8), wide right margin (rightOffset 15), 8px axis font + trimmed price margins (bigger canvas), dotted grid intact.');
