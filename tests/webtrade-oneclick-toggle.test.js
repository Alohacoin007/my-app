#!/usr/bin/env node
// REGRESSION (webtrade) — the one-click order panel is toggleable PER chart window via the chart
// right-click menu ("One-Click Trading", checkmark shows state). Each ChartCell keeps its own
// showOC state, so hiding it on one window doesn't affect the others.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// per-window state + conditional render
if (!/const \[showOC,setShowOC\]=React\.useState\(true\)/.test(src)) bad('each ChartCell needs its own showOC state (per-window)');
if (!/\{showOC && <OrderBox symbol=\{symbol\} \/>\}/.test(src)) bad('the one-click OrderBox must render only when showOC is on');
// wired into the right-click menu as a checkmark toggle
if (!/oneClick=\{showOC\} onOneClick=\{\(\)=>setShowOC\(v=>!v\)\}/.test(src)) bad('ChartMenu must receive the one-click state + toggle');
if (!/\{l:'One-Click Trading', ic:'order', ck:oneClick, keep:1, run:\(\)=>onOneClick&&onOneClick\(\)\}/.test(src)) bad('right-click menu must have a "One-Click Trading" checkmark toggle that stays open');
if (!/function ChartMenu\(\{ x, y, idx, symbol, chartType, tf, indicators, oneClick, onOneClick, onClose \}\)/.test(src)) bad('ChartMenu must accept oneClick/onOneClick');

if (fail) { console.error(`\n🔴 FAIL — ${fail} one-click-toggle problem(s).`); process.exit(1); }
console.log('🟢 PASS: the one-click panel is a per-window right-click toggle (One-Click Trading, checkmarked); each chart keeps its own state.');
