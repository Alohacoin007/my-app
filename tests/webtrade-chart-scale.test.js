#!/usr/bin/env node
// REGRESSION (webtrade) — the main chart engine is tuned to MT5-original proportions:
//   [1] slim candles: default barSpacing 4 (was the LWC default 6 → 1.5× denser) + minBarSpacing 0.8.
//   [2] right margin: rightOffset 14 (was 6) so the newest live candle breathes off the price axis.
//   [3] slim axes: layout fontSize 10 (was 11) + trimmed price scaleMargins (0.08) → more candle canvas.
// The boot view sets the same slim density (barSpacing 4 + rightOffset 14 + scrollToRealTime), NOT
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
if (!/barSpacing:4/.test(blk)) bad('main chart must default to barSpacing 4 (1.5× denser than LWC default 6)');
if (!/minBarSpacing:0\.8/.test(blk)) bad('main chart must set minBarSpacing 0.8 (allow dense zoom-out)');

// [2] wide right margin for future-trend space
if (!/rightOffset:14/.test(blk)) bad('main chart must set rightOffset 14 (wide right margin, was 6)');

// [3] slim axis font + trimmed vertical padding → bigger canvas
if (!/fontSize:10\b/.test(blk)) bad('axis label font must be slimmed to 10px (was 11)');
if (!/rightPriceScale:\{ borderColor:th0\.border, scaleMargins:\{top:0\.08, bottom:0\.08\}/.test(blk)) bad('right price scale must trim its vertical margins to 0.08 (more candle canvas)');

// old fat defaults must be gone from the main block
if (/fontSize:11\b/.test(blk)) bad('old fontSize:11 must be gone from the main chart');
if (/rightOffset:6\b/.test(blk)) bad('old rightOffset:6 must be gone from the main chart');

// grid stays the MT5 dotted checkerboard mask on both axes
if (!/grid:\{ vertLines:\{color:th0\.grid, style:DOT\}, horzLines:\{color:th0\.grid, style:DOT\} \}/.test(blk)) bad('grid must stay the MT5 dotted checkerboard on both axes');

if (fail) { console.error(`\n🔴 FAIL — ${fail} chart-scale problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 chart scale — slim candles (barSpacing 4 / minBarSpacing 0.8), wide right margin (rightOffset 14), 10px axis font + trimmed price margins (bigger canvas), dotted grid intact.');
