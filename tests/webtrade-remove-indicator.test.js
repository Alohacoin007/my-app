#!/usr/bin/env node
// REGRESSION (webtrade) — right-click chart menu must offer removing indicators (they can get in
// the way). A "Remove Indicator" submenu lists ONLY the active indicators (quick one-click remove)
// plus "Remove All"; it's disabled when none are on. Removal routes through the SAME chart.indicator
// command the toggle uses (id → toggle off; '__clear__' → clear all), which the App reducer handles.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// the menu item exists, is built from the ACTIVE indicators, and disables when there are none
if (!/\{l:'Remove Indicator'/.test(src)) bad('right-click menu missing a "Remove Indicator" item');
if (!/dis: activeInds\.length===0/.test(src)) bad('"Remove Indicator" must be disabled when no indicators are active');
if (!/children: activeInds\.length \? activeInds\.map\(id=>/.test(src)) bad('submenu must list the ACTIVE indicators only');
// each active entry removes via chart.indicator(id); a "Remove All" clears via __clear__
if (!/run:\(\)=>terminalBus\.emit\('chart\.indicator',id\)/.test(src)) bad('an active-indicator row must emit chart.indicator(id) to remove it');
if (!/emit\('chart\.indicator','__clear__'\)/.test(src)) bad('"Remove All Indicators" must emit chart.indicator(__clear__)');
// activeInds is derived from the passed indicators
if (!/const activeInds=\[\.\.\.act\]/.test(src)) bad('activeInds must be the set of currently-applied indicators');

// the App reducer must handle both removal paths — PER-CHART (active chart's inds only)
if (!/inds: arg==='__clear__' \? \[\]/.test(src)) bad('reducer must clear the active chart indicators on __clear__');
if (!/list\.indexOf\(arg\)>=0 \? list\.filter\(x=>x!==arg\)/.test(src)) bad('reducer must toggle a single indicator off when already applied');
if (!/if\(c\.id!==actRef\.current\) return c;/.test(src)) bad('indicator changes must target only the ACTIVE chart (per-chart)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} remove-indicator problem(s).`); process.exit(1); }
console.log('🟢 PASS: right-click "Remove Indicator" lists active indicators (+ Remove All), routed through chart.indicator; reducer removes one or clears all.');
