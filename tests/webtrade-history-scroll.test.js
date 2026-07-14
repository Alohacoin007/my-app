#!/usr/bin/env node
// BUG (2026-07-14, user report) — "과거 기록을 볼 수 있어야 하는데 자꾸 자동으로 앞으로 가":
// the live-tick handler re-applied timeScale.applyOptions({rightOffset:15}) on EVERY tick
// (~2.5/sec). In LightweightCharts that call is not a passive setting — it SCROLLS the view
// to "last bar + 15", so any user browsing history got yanked back to real time within 0.4s.
//
// MT5 autoscroll rule: the right-margin re-pin may fire ONLY while the view sits at the live
// edge (scrollPosition() ≈ rightOffset). Scrolled back into history, the view belongs to the
// user — the tick handler must not touch the time scale.
//
// This test EXECUTES the tick handler's margin block against a stubbed timeScale:
//   at the live edge (scrollPosition 15)  → applyOptions({rightOffset:15}) fires (margin kept)
//   browsing history (scrollPosition -80) → applyOptions is NEVER called (no yank)
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// [1] the old unconditional per-tick re-pin must be GONE (it was the yank)
if (/chart\.current\.timeScale\(\)\.applyOptions\(\{ rightOffset:15 \}\);/.test(src))
  bad('unconditional per-tick applyOptions({rightOffset:15}) still present — every tick yanks history browsers back to real time');

// [2] grab the guarded margin block out of the tick handler and RUN it both ways
const m = src.match(/try\{ const ts=chart\.current\.timeScale\(\);\s*\n?\s*if\(ts\.scrollPosition\(\)>=\d+\) ts\.applyOptions\(\{ rightOffset:15 \}\);[\s\S]{0,400}?\}catch\(e\)\{\}/);
if (!m) { bad('guarded right-margin block not found in the tick handler (expected: const ts=chart.current.timeScale(); if(ts.scrollPosition()>=…) ts.applyOptions({rightOffset:15}))'); }
else {
  const run = (scrollPos) => {
    const calls = [];
    const chart = { current: { timeScale: () => ({ scrollPosition: () => scrollPos, applyOptions: (o) => calls.push(o) }) } };
    new Function('chart', m[0])(chart);
    return calls;
  };
  const atEdge = run(15);       // sitting at real time (rightOffset 15)
  const inHistory = run(-80);   // dragged ~95 bars back into the past
  if (!(atEdge.length === 1 && atEdge[0] && atEdge[0].rightOffset === 15))
    bad('at the live edge the tick must still re-pin rightOffset 15 (margin lock kept) — got ' + JSON.stringify(atEdge));
  if (inHistory.length !== 0)
    bad('browsing history the tick must NOT touch the time scale — got ' + JSON.stringify(inHistory) + ' (this is the auto-forward yank)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} history-scroll problem(s): live ticks steal the chart from users reading the past.`); process.exit(1); }
console.log('🟢 PASS: MT5 autoscroll rule — right-margin re-pin fires only at the live edge; scrolled-back history views are never yanked forward by ticks.');
