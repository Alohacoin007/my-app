#!/usr/bin/env node
// MT5 CHART-FOLLOW TOGGLES (2026-07-14, user request "mt5 스타일로 토글버튼 2개") — evolved from the
// same-day bug "과거 기록을 볼 수 있어야 하는데 자꾸 자동으로 앞으로 가":
// timeScale.applyOptions({rightOffset}) is not a passive setting — it SCROLLS the view to
// "last bar + offset". The tick handler used to fire it unconditionally (~2.5/sec), stealing
// the chart from anyone reading history. The MT5-original semantics the user picked:
//   · Auto Scroll ON (default, like MT5): every tick snaps the view to the live edge —
//     including while browsing history (that IS the button's job; turn it OFF to study the past).
//   · Auto Scroll OFF: the tick path never touches the time scale. The view belongs to the user.
//   · Chart Shift ON (default): 15-bar future gap on the right; OFF: candles flush to the edge.
//
// This test EXECUTES the tick handler's margin block against stubbed chartOpts/timeScale:
//   autoScroll ON  + shift ON  → applyOptions({rightOffset:15}) fires (snap + gap)
//   autoScroll ON  + shift OFF → applyOptions({rightOffset:0})  fires (snap, no gap)
//   autoScroll OFF             → applyOptions NEVER called (history never yanked)
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// [1] no UNGATED per-tick re-pin may exist (that was the yank bug)
if (/chart\.current\.timeScale\(\)\.applyOptions\(\{ rightOffset:15 \}\);/.test(src))
  bad('ungated per-tick applyOptions({rightOffset:15}) present — every tick yanks history browsers regardless of the Auto Scroll toggle');

// [2] the toggles + their plumbing exist
if (!/const chartOpts=\{ autoScroll:true, shift:true \};/.test(src))
  bad('chartOpts global missing (Auto Scroll + Chart Shift must default ON like MT5)');
if (!/const shiftOffset=\(\)=> chartOpts\.shift \? 15 : 0;/.test(src))
  bad('shiftOffset() missing (Chart Shift ON=15-bar gap / OFF=flush right edge)');
if (!/title="Auto Scroll/.test(src) || !/title="Chart Shift/.test(src))
  bad('toolbar must carry the two MT5 toggle buttons (Auto Scroll, Chart Shift)');
if (!/'chart\.opts'/.test(src) || !/cmd==='chart\.opts'/.test(src))
  bad("'chart.opts' bus command missing — toggling must re-apply to every chart instantly");
if (!/scrollToRealTime\(\);\s*\}catch\(e\)\{\} \}/.test(src) && !/if\(chartOpts\.autoScroll\) ts\.scrollToRealTime\(\)/.test(src))
  bad('flipping Auto Scroll ON must jump the chart home immediately (scrollToRealTime in the chart.opts handler)');

// [3] grab the tick handler's gated margin block and RUN it in all three states
const m = src.match(/try\{ const ts=chart\.current\.timeScale\(\);\s*\n?\s*if\(chartOpts\.autoScroll\) ts\.applyOptions\(\{ rightOffset:shiftOffset\(\) \}\);[\s\S]{0,500}?\}catch\(e\)\{\}/);
if (!m) { bad('gated tick block not found (expected: if(chartOpts.autoScroll) ts.applyOptions({rightOffset:shiftOffset()}))'); }
else {
  const run = (autoScroll, shift) => {
    const calls = [];
    const chartOpts = { autoScroll, shift };
    const shiftOffset = () => (chartOpts.shift ? 15 : 0);
    const chart = { current: { timeScale: () => ({ applyOptions: (o) => calls.push(o), scrollPosition: () => 0 }) } };
    new Function('chart', 'chartOpts', 'shiftOffset', m[0])(chart, chartOpts, shiftOffset);
    return calls;
  };
  const onOn = run(true, true), onOff = run(true, false), off = run(false, true);
  if (!(onOn.length === 1 && onOn[0].rightOffset === 15))
    bad('Auto Scroll ON + Shift ON: tick must snap with the 15-bar gap — got ' + JSON.stringify(onOn));
  if (!(onOff.length === 1 && onOff[0].rightOffset === 0))
    bad('Auto Scroll ON + Shift OFF: tick must snap flush (rightOffset 0) — got ' + JSON.stringify(onOff));
  if (off.length !== 0)
    bad('Auto Scroll OFF: the tick path must NEVER touch the time scale — got ' + JSON.stringify(off) + ' (history stolen)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} chart-follow problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 toggles — Auto Scroll ON snaps every tick to the live edge (Shift decides the 15-bar gap); OFF leaves the scrolled-back view untouched; flipping ON jumps home instantly.');
