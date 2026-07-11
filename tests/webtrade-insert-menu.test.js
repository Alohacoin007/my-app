#!/usr/bin/env node
// REGRESSION (webtrade) — the MT5 "Insert" menu must actually work (it was all disabled). Its
// entries arm the real drawing tools we have: Lines → trend/hline/vline, Fibonacci → fib, Text →
// text; Indicators → a live submenu of the applied indicators (+ Remove All). Channels/Shapes stay
// disabled placeholders (no such tool built) — honest, not faked. Submenus fly out on hover.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// grab the Insert menu definition
const ins = (src.match(/Insert:\[[\s\S]*?\],\n/) || [])[0] || '';
if (!ins) { console.error('🔴 Insert menu def not found'); process.exit(1); }

// Lines submenu → the three real line tools
if (!/\{l:'Lines', children:\[/.test(ins)) bad('Insert → Lines must be a submenu');
if (!/\{l:'Trend Line', tool:'trend'\}/.test(ins)) bad('Lines → Trend Line must arm the trend tool');
if (!/\{l:'Horizontal Line', tool:'hline'\}/.test(ins)) bad('Lines → Horizontal Line must arm hline');
if (!/\{l:'Vertical Line', tool:'vline'\}/.test(ins)) bad('Lines → Vertical Line must arm vline');
// Fibonacci → fib tool; Text → text tool; Indicators → dynamic submenu
if (!/\{l:'Fibonacci', children:\[ \{l:'Fibonacci Retracement', tool:'fib'\}/.test(ins)) bad('Insert → Fibonacci → Retracement must arm the fib tool');
if (!/\{l:'Text', tool:'text'\}/.test(ins)) bad('Insert → Text must arm the text tool');
if (!/\{l:'Indicators', indicators:1\}/.test(ins)) bad('Insert → Indicators must open the (dynamic) indicators submenu');
// unbuilt tools are honest disabled placeholders (not faked)
if (!/\{l:'Channels', dis:1\}/.test(ins)) bad('Channels has no tool yet → must be a disabled placeholder');
if (!/\{l:'Shapes', dis:1\}/.test(ins)) bad('Shapes has no tool yet → must be a disabled placeholder');

// MenuBar must actually render fly-out submenus and route their clicks
if (!/const kids = it\.indicators \? indChildren\(\) : it\.children/.test(src)) bad('MenuBar Row must resolve submenu children (incl. dynamic indicators)');
if (!/className="mdrop sub"/.test(src)) bad('MenuBar must render a fly-out submenu (.mdrop.sub)');
if (!/if\(ch\.tool\) terminalBus\.emit\('chart\.tool', ch\.tool\)/.test(src)) bad('a submenu tool item must arm the tool via chart.tool');
if (!/if\(ch\.ind\)\{ terminalBus\.emit\('chart\.indicator', ch\.ind\); return; \}/.test(src)) bad('a submenu indicator item must toggle via chart.indicator (menu stays open)');
if (!/indChildren=\(\)=> Object\.keys\(INDICATORS\)/.test(src)) bad('the Indicators submenu must be built from INDICATORS');

if (fail) { console.error(`\n🔴 FAIL — ${fail} Insert-menu problem(s).`); process.exit(1); }
console.log('🟢 PASS: Insert menu is live — Lines/Fibonacci/Text arm real tools, Indicators is a dynamic submenu; Channels/Shapes are honest disabled placeholders.');
