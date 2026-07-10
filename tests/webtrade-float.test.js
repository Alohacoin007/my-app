#!/usr/bin/env node
// REGRESSION (webtrade) — chart windows are INDEPENDENT free-floating MDI windows (not a glued
// tiled grid). floatGeo(i) seeds each window's start box: the first four lay out as a clean 2×2 of
// separate windows, extras cascade down-right so a new chart never lands exactly on another. All
// boxes must stay inside the stage (fx+fw ≤ 1, fy+fh ≤ 1).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const start = src.indexOf('function floatGeo(');
if (start < 0) { console.error('🔴 floatGeo not found'); process.exit(1); }
let i = src.indexOf('{', start), depth = 0, end = -1;
for (; i < src.length; i++) { const ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
let floatGeo;
try { floatGeo = new Function('Math', src.slice(start, end) + '\nreturn floatGeo;')(Math); }
catch (e) { console.error('🔴 could not eval floatGeo — ' + e.message); process.exit(1); }

const g = [0,1,2,3,4,5,6].map(floatGeo);

// in-bounds for every window
g.forEach((b,k)=>{ if(!(b.fx>=0 && b.fy>=0 && b.fw>0 && b.fh>0 && b.fx+b.fw<=1.0001 && b.fy+b.fh<=1.0001))
  bad(`window ${k} out of stage bounds: ${JSON.stringify(b)}`); });

// the first four occupy the four DISTINCT quadrants (unique top-left corners)
const corners = new Set(g.slice(0,4).map(b=>b.fx.toFixed(3)+','+b.fy.toFixed(3)));
if (corners.size !== 4) bad('first four windows must have 4 distinct corners (2×2), got ' + corners.size);
// left column vs right column, top row vs bottom row
if (!(g[0].fx < g[1].fx)) bad('window 0 should be left of window 1');
if (!(g[0].fy < g[2].fy)) bad('window 0 should be above window 2');
if (!(g[3].fx > g[2].fx && g[3].fy > g[1].fy)) bad('window 3 should be bottom-right');

// extras cascade: strictly increasing offset, never identical to a neighbour
if (!(g[4].fx < g[5].fx && g[4].fy < g[5].fy)) bad('cascade must step down-right for each extra window');
if (g[4].fx === g[0].fx && g[4].fy === g[0].fy) bad('a cascaded window must not land exactly on window 0');

// the render must actually float (no tiled prop) and pass initial geometry + onClose per window
if (/tiled maxed=|tiled onClose/.test(src)) bad('charts must NOT be rendered tiled anymore');
if (!/initial=\{floatGeo\(i\)\}/.test(src)) bad('ChartCell must receive initial={floatGeo(i)}');
if (!/className="chartstage"/.test(src)) bad('charts must render into the floating .chartstage');

if (fail) { console.error(`\n🔴 FAIL — ${fail} floating-layout problem(s).`); process.exit(1); }
console.log('🟢 PASS: chart windows float independently — floatGeo gives a 2×2 of distinct in-bounds windows + cascading extras; rendered into .chartstage, not a tiled grid.');
