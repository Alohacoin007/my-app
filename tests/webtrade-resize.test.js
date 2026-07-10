#!/usr/bin/env node
// REGRESSION (webtrade) — resizable chart tiles. Dragging a gutter moves size between the two
// adjacent tracks only; the TOTAL never changes (grid stays the same size, no track collapses).
// The math lives in pure helpers wtResizeTracks / wtCumPct so it can be proven without a browser.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

function grab(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) { console.error('🔴 ' + name + ' not found'); process.exit(1); }
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) { const ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
  return src.slice(start, end);
}
let resize, cum;
try { resize = new Function(grab('wtResizeTracks') + '\nreturn wtResizeTracks;')(); cum = new Function(grab('wtCumPct') + '\nreturn wtCumPct;')(); }
catch (e) { console.error('🔴 could not eval helpers — ' + e.message); process.exit(1); }

const sum = (a) => a.reduce((x, y) => x + y, 0);
const MIN = 0.22;

// widen the left of a 2-col grid → total preserved, boundary moves right
let r = resize([1, 1], 1, 0.3, MIN);
if (Math.abs(sum(r) - 2) > 1e-9) bad('total width changed on resize (must be conserved): ' + r);
if (Math.abs(r[0] - 1.3) > 1e-9 || Math.abs(r[1] - 0.7) > 1e-9) bad('expected [1.3,0.7], got ' + r);

// clamp: cannot shrink a neighbour below MINFR
r = resize([1, 1], 1, 5, MIN);           // huge push right
if (Math.abs(sum(r) - 2) > 1e-9) bad('clamp changed total: ' + r);
if (Math.abs(r[1] - MIN) > 1e-9) bad('right track must clamp at MINFR (' + MIN + '), got ' + r[1]);
r = resize([1, 1], 1, -5, MIN);          // huge push left
if (Math.abs(r[0] - MIN) > 1e-9) bad('left track must clamp at MINFR, got ' + r[0]);

// 3 tracks: only the two around gutter k change, the rest untouched
r = resize([1, 1, 1], 2, 0.4, MIN);
if (Math.abs(r[0] - 1) > 1e-9) bad('track outside the gutter must not change: ' + r);
if (Math.abs(sum(r) - 3) > 1e-9) bad('3-track total not conserved: ' + r);

// immutability
const orig = [1, 1]; resize(orig, 1, 0.5, MIN);
if (orig[0] !== 1 || orig[1] !== 1) bad('wtResizeTracks mutated its input');

// cumulative % for absolute splitter placement
if (Math.abs(cum([1, 1], 1) - 50) > 1e-9) bad('cumPct([1,1],1) should be 50%, got ' + cum([1, 1], 1));
if (Math.abs(cum([3, 1], 1) - 75) > 1e-9) bad('cumPct([3,1],1) should be 75%, got ' + cum([3, 1], 1));
if (Math.abs(cum([1, 1, 1], 2) - (200 / 3)) > 1e-6) bad('cumPct([1,1,1],2) should be 66.67%, got ' + cum([1, 1, 1], 2));

// static: splitters are actually rendered + wired to the drag handler
if (!/className="gsplit v"/.test(src) || !/className="gsplit h"/.test(src)) bad('vertical/horizontal splitters not rendered');
if (!/onMouseDown=\{startSplit\('col',k\)\}/.test(src) || !/onMouseDown=\{startSplit\('row',k\)\}/.test(src)) bad('splitters not wired to startSplit');
if (!/chartResizer\.resizeAll\(\)/.test(src)) bad('charts must re-fit (chartResizer.resizeAll) during/after resize');

if (fail) { console.error(`\n🔴 FAIL — ${fail} resize problem(s).`); process.exit(1); }
console.log('🟢 PASS: wtResizeTracks conserves total + clamps at MINFR (immutably); wtCumPct places gutters; splitters wired + charts re-fit.');
