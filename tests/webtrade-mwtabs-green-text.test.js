#!/usr/bin/env node
// REGRESSION (webtrade) — the Market Watch tab bar (Symbols/Details/Trading/Ticks) marked the active
// tab with a coloured TOP-ACCENT LINE (blue in the original/dark theme, green in Legend). The user
// wants no accent line — the colour goes INTO the active tab's TEXT instead, in BOTH themes.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const grab = (sel) => { const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : null; };

// original / dark theme
const dark = grab('.mwtabs .mt.on');
if (!dark) bad('.mwtabs .mt.on rule missing (original theme)');
else {
  if (!/color:#00ff00/i.test(dark)) bad('original active MW tab must have GREEN text (color:#00ff00)');
  if (/border-top:\s*2px solid #3a6ea5/i.test(dark) || /border-top-color:#3a6ea5/i.test(dark)) bad('original active MW tab must NOT show the blue top-accent line');
  if (!/border-top:\s*2px solid transparent/i.test(dark)) bad('original active MW tab top border must be transparent (line removed, layout kept)');
}

// Legend theme
const legend = grab('.terminal.light .mwtabs .mt.on');
if (!legend) bad('.terminal.light .mwtabs .mt.on rule missing (Legend theme)');
else {
  if (!/color:#00FF55/i.test(legend)) bad('Legend active MW tab must have GREEN text (color:#00FF55)');
  if (/border-top-color:#00FF55/i.test(legend)) bad('Legend active MW tab must NOT show the green top-accent line — colour goes in the text now');
  if (!/border-top-color:transparent/i.test(legend)) bad('Legend active MW tab top border must be transparent (line removed)');
}

// toolbox tabs (Trade/Exposure/History…) — same treatment
// toolbox (terminal) tabs — DARK = window blue + underline, LEGEND = muted neon-green + underline
const tbxDark = grab('.tbxtabs .t.on');
if (!tbxDark || !/color:#2f7fe0/i.test(tbxDark) || !/border-bottom:2px solid #2f7fe0/i.test(tbxDark)) bad('dark active toolbox tab must be window-blue text + underline');
const tbxLegend = grab('.terminal.light .tbxtabs .t.on');
if (!tbxLegend || !/color:#00FF55/i.test(tbxLegend) || !/border-bottom:2px solid #00FF55/i.test(tbxLegend)) bad('Legend active toolbox tab must be neon-green text + underline');

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW-tab problem(s).`); process.exit(1); }
console.log('🟢 PASS: active Market Watch + toolbox tabs show GREEN text (no accent line) in both the original and Legend themes.');
