#!/usr/bin/env node
// REGRESSION (webtrade) — MT5 chart window controls (minimize / maximize / restore / close). The
// grid-aware transitions live in ONE pure reducer wtWinReduce({maxId,minIds}) so the rules can't
// drift. This evals the REAL reducer from webtrade.html and drives every transition, and statically
// asserts the three controls + the minimized dock are actually wired into the render.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── extract wtWinReduce (brace-matched) and eval it ──
const start = src.indexOf('function wtWinReduce(');
if (start < 0) { console.error('🔴 wtWinReduce not found'); process.exit(1); }
let i = src.indexOf('{', start), depth = 0, end = -1;
for (; i < src.length; i++) { const ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
let reduce;
try { reduce = new Function(src.slice(start, end) + '\nreturn wtWinReduce;')(); }
catch (e) { console.error('🔴 could not eval wtWinReduce — ' + e.message); process.exit(1); }

const S = (maxId, ...mins) => ({ maxId, minIds: new Set(mins) });
const eq = (st, maxId, mins, why) => {
  const got = [...st.minIds].sort((a,b)=>a-b);
  if (st.maxId !== maxId || JSON.stringify(got) !== JSON.stringify(mins.sort((a,b)=>a-b)))
    bad(`${why}: got {max:${st.maxId}, min:[${got}]}, want {max:${maxId}, min:[${mins}]}`);
};

// minimize docks; maximize toggles full-workspace; both keep the sets consistent
eq(reduce(S(null), 'min', 1), null, [1], 'min(1)');
eq(reduce(S(null, 1), 'max', 2), 2, [1], 'max(2) with 1 docked');
eq(reduce(S(2, 1), 'activate', 3), 3, [1], 'activate(3) in max mode switches the maximized chart');
eq(reduce(S(3, 1), 'max', 3), null, [1], 'max(3) again restores to tiled');
eq(reduce(S(null, 1), 'activate', 1), null, [], 'activate(1) un-docks a minimized chart');
eq(reduce(S(2), 'min', 2), null, [2], 'min on the maximized chart drops max + docks it');
eq(reduce(S(2, 1), 'close', 2), null, [1], 'close the maximized chart clears max');
eq(reduce(S(null, 1, 2), 'close', 1), null, [2], 'close un-docks the closed chart');
eq(reduce(S(null), 'activate', 5), null, [], 'activate with no max stays tiled');
eq(reduce(S(4), 'max', 7), 7, [], 'max switches directly from one maximized chart to another');

// immutability — the reducer must never mutate its input
const before = S(2, 1); const snapMax = before.maxId, snapMin = [...before.minIds].join(',');
reduce(before, 'max', 9);
if (before.maxId !== snapMax || [...before.minIds].join(',') !== snapMin) bad('wtWinReduce mutated its input state');

// ── static: the three controls + dock are wired into the tiled render ──
if (!/onMin&&onMin\(\)|onMin\(\)/.test(src) || !/onMax\(\)/.test(src)) bad('tiled title bar must call onMin() and onMax()');
if (!/maxed\?'❐':'▢'/.test(src)) bad('maximize button must toggle glyph (▢ ⇄ ❐) on maxed');
if (!/className="mindock"/.test(src)) bad('minimized-chart dock (.mindock) not rendered');
if (!/onMin=\{\(\)=>minChart\(c\.id\)\} onMax=\{\(\)=>maxChart\(c\.id\)\}/.test(src)) bad('ChartCell must receive onMin/onMax handlers');

if (fail) { console.error(`\n🔴 FAIL — ${fail} window-control problem(s).`); process.exit(1); }
console.log('🟢 PASS: wtWinReduce drives min/max/restore/close correctly (immutably); the 3 controls + minimized dock are wired into the render.');
