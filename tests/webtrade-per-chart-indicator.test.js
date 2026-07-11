#!/usr/bin/env node
// REGRESSION (webtrade) — indicators must be PER-CHART, not global. They used to live in one App
// state shared by every ChartCell, so adding an MA/EMA/RSI drew the line on ALL 4 charts at once
// ("그린 선이 4개에 다 그려짐"). Now each chart carries its own `inds`; a chart.indicator command
// changes only the ACTIVE chart, and each ChartCell renders its own inds. Menus reflect the active
// chart's set.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// there must be NO global indicators state anymore
if (/const \[indicators,setIndicators\]=React\.useState/.test(src)) bad('the global indicators state must be gone (indicators are per-chart)');
if (/setIndicators\(/.test(src)) bad('no setIndicators calls should remain');

// each chart carries its own inds; menus read the ACTIVE chart's inds
if (!/inds:\(cfg\.indicators\|\|\[\]\)\.slice\(\)/.test(src)) bad('each chart must start with its own inds array');
if (!/const activeInds = activeChart \? \(activeChart\.inds\|\|\[\]\) : \[\]/.test(src)) bad('menus must derive from the active chart inds (activeInds)');

// the reducer edits ONLY the active chart
if (!/setCharts\(cs=>cs\.map\(c=>\{ if\(c\.id!==actRef\.current\) return c;/.test(src)) bad('chart.indicator must edit only the active chart via setCharts');
if (/setIndicators\(list=>/.test(src)) bad('old global toggle reducer must be gone');

// each ChartCell gets its OWN inds (not a shared prop)
if (!/indicators=\{c\.inds\|\|\[\]\}/.test(src)) bad('each ChartCell must receive its own c.inds');
if (/indicators=\{indicators\} chartType=/.test(src)) bad('ChartCell must NOT receive a shared global indicators prop');
// the top menus reflect the active chart
if (!/<MenuBar indicators=\{activeInds\}/.test(src)) bad('MenuBar must show the active chart indicators');
if (!/<Navigator indicators=\{activeInds\}/.test(src)) bad('Navigator must show the active chart indicators');

if (fail) { console.error(`\n🔴 FAIL — ${fail} per-chart-indicator problem(s).`); process.exit(1); }
console.log('🟢 PASS: indicators are per-chart — chart.indicator edits only the active chart, each ChartCell renders its own inds; adding one no longer paints all 4.');
