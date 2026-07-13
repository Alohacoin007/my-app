#!/usr/bin/env node
// REGRESSION (webtrade) — chart axis density + grid toggle:
//   [1] denser Y/X ticks via an 8px axis font (LWC has no tick-count API — density is font/height-driven).
//   [2] X-axis tickMarkFormatter prints "DD Mon HH:MM" (e.g. "12 Jul 23:22"), UTC-aligned.
//   [3] a top-toolbar Grid On/Off button + Ctrl+G toggle the ACTIVE chart's #2A2A2A dotted grid.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── [1] denser ticks via 8px font (both axes) ──
if (!/fontSize:8\b/.test(src)) bad('axis font must be 8px to pack more Y/X ticks');

// ── [2] X-axis date formatter wired into the main chart ──
if (!/tickMarkFormatter:fmtMt5Tick/.test(src)) bad('timeScale must use the MT5 date tickMarkFormatter');
const fmt_src = grab(/const fmtMt5Tick = \(t\)=>\{[\s\S]*?\};/, 'fmtMt5Tick');
if (!fail) {
  const MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtMt5Tick = new Function('MON3', fmt_src + '\nreturn fmtMt5Tick;')(MON3);
  // 2026-07-12 23:22:00 UTC → "12 Jul 23:22"
  const t1 = Date.UTC(2026,6,12,23,22,0)/1000;
  if (fmtMt5Tick(t1) !== '12 Jul 23:22') bad(`formatter must print "12 Jul 23:22", got "${fmtMt5Tick(t1)}"`);
  // 2026-07-13 00:02:00 UTC → "13 Jul 00:02" (zero-padded)
  const t2 = Date.UTC(2026,6,13,0,2,0)/1000;
  if (fmtMt5Tick(t2) !== '13 Jul 00:02') bad(`formatter must zero-pad → "13 Jul 00:02", got "${fmtMt5Tick(t2)}"`);
}

// ── [3] Grid toggle: toolbar button + Ctrl+G, both fire an arg-less chart.grid on the active chart ──
if (!/title="Grid On\/Off \(Ctrl\+G\)" onClick=\{\(\)=>terminalBus\.emit\('chart\.grid'\)\}/.test(src))
  bad('toolbar must have a Grid On/Off button emitting a bare chart.grid');
if (!/else if\(e\.ctrlKey && k==='g'\)\{ e\.preventDefault\(\); terminalBus\.emit\('chart\.grid'\); \}/.test(src))
  bad('Ctrl+G must toggle the grid');
if (!/cmd==='chart\.grid' && \(arg===idx \|\| \(arg==null && activeRef\.current\)\)/.test(src))
  bad('a bare chart.grid must toggle the ACTIVE chart (arg==null && activeRef.current)');
// grid stays a #2A2A2A dotted mask (dark theme)
if (!/dark:  \{ bg:'#000000', text:'#ffffff', grid:'#2a2a2a'/.test(src)) bad('dark grid must stay #2A2A2A');
// vertical (time) grid stays native #2A2A2A dotted; the HORIZONTAL grid is now the fixed 15-point
// createPriceLine grid (native horzLines off) — MT5 checkerboard preserved, horizontals forced to 15 points
if (!/grid:\{ vertLines:\{color:th0\.grid, style:DOT\}, horzLines:\{visible:false\} \}/.test(src)) bad('vertical grid dotted + native horizontals OFF (replaced by the 15-point grid)');
if (!/const gridStep = \(s\)=>/.test(src)) bad('fixed 15-point gridStep helper missing (FX 0.00015 / JPY 0.015 / crypto weighted)');
if (!/gridLines\.current\.push\(cs\.createPriceLine\(\{ price, color:'#2a2a2a', lineWidth:1, lineStyle:GDOT, axisLabelVisible:true/.test(src)) bad('horizontal grid must be #2A2A2A dotted createPriceLine pins with price labels (the 15-point grid)');
if (!/if\(n<2\|\|n>GRID_CAP\)/.test(src)) bad('the 15-point grid must cap its line count (crypto flood guard)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} grid-axis problem(s).`); process.exit(1); }
console.log('🟢 PASS: 8px axis, X-axis "DD Mon HH:MM" formatter, toolbar Grid On/Off + Ctrl+G, and the fixed 15-point horizontal createPriceLine grid (#2A2A2A dotted, capped) replacing native horizontals.');
