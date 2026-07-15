#!/usr/bin/env node
// REGRESSION (webtrade) — MT5 Cursor vs Crosshair must behave DIFFERENTLY:
//   Cursor (arrow) → drag pans the chart (handleScroll on), magnet crosshair, selects objects.
//   Crosshair (cross) → drag is a RULER: shows bars / pips / price delta; panning is disabled so the
//   drag measures instead of scrolls; free (non-magnet) crosshair. Before, both just panned (the only
//   difference was the magnet mode) — that's the "왜 크로스헤어가 커서랑 같냐" bug.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) the tool effect must toggle panning: cross disables pressedMouseMove, cursor keeps scroll on
if (!/handleScroll: cross \? \{ mouseWheel:true, pressedMouseMove:false[^}]*\} : true/.test(src))
  bad('Crosshair must disable drag-pan (pressedMouseMove:false) while Cursor keeps handleScroll:true');
if (!/crosshair:\{ mode: cross\?0:1,/.test(src)) bad('Crosshair=free(0), everything else=magnet(1)');
if (!/box\.current\.style\.cursor = cross \? 'crosshair' : ''/.test(src)) bad('Crosshair tool should show a crosshair cursor');

// 1b) the Crosshair tool must FORCE the dotted vert/horz lines on (up+down), even in Legend where the
// hover crosshair is otherwise off; Cursor reverts to the per-theme default (dark=on, Legend=off).
if (!/const showX = cross \|\| themeBus\.theme!=='light';/.test(src)) bad('Crosshair tool must force the dotted lines on regardless of theme');
if (!/vertLine:\{color:thc, style:DOT, visible:showX, labelVisible:showX\}/.test(src)) bad('vertical dotted crosshair line must follow showX');
if (!/horzLine:\{color:thc, style:DOT, visible:showX, labelVisible:showX\}/.test(src)) bad('horizontal dotted crosshair line must follow showX');

// 2) the measure ruler: only in cross mode, computes bars (logical delta) + pips (pip()) + price delta
if (!/toolRef\.current!=='cross' \|\| e\.button!==0/.test(src)) bad('measure drag must only start with the Crosshair tool + left button');
if (!/coordinateToLogical/.test(src)) bad('bar count must come from timeScale().coordinateToLogical');
if (!/Math\.abs\(Math\.round\(lg1-md\.lg0\)\)/.test(src)) bad('bars = |round(logical1 - logical0)|');
if (!/dp\/pip\(symbol\)/.test(src)) bad('pips = price delta / pip(symbol)');
if (!/' bars   '\+Math\.abs\(pips\)\.toFixed\(1\)\+' pips   '/.test(src)) bad('ruler label must read "N bars   P pips   Δprice"');

// 3) the ruler is rendered (SVG line + label) and cleaned up (no leak on release / rebuild)
if (!/className="measure"|class="measure"|'measure'/.test(src)) bad('measure ruler overlay (.measure) not created');
if (!/hideMeasure\(\)/.test(src)) bad('ruler must be cleared (hideMeasure) on mouseup + chart teardown');
if (!/removeEventListener\('mousedown', onMeasureDown\)/.test(src)) bad('measure mousedown listener must be removed on teardown');

if (fail) { console.error(`\n🔴 FAIL — ${fail} crosshair-tool problem(s).`); process.exit(1); }
console.log('🟢 PASS: Crosshair tool measures (bars/pips/price, pan disabled) while Cursor pans — the two tools now differ, MT5-style.');
