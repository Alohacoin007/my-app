#!/usr/bin/env node
// REGRESSION (webtrade) — two Market Watch fixes:
//  1) right-click → "Spread" toggles a live Spread column (ask-bid in pips) for every symbol.
//  2) pulling the Toolbox up must NOT cover the Market Watch tab bar — the left panel now sits
//     above the toolbox (z-index) so the toolbox overlays only the charts.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) Spread column toggle wired through the right-click menu
if (!/\{l:'Spread', act:'spread'\}/.test(src)) bad('right-click menu missing a "Spread" toggle');
if (!/else if\(it\.act==='spread'\) onSpread&&onSpread\(\)/.test(src)) bad('Spread menu item must call onSpread');
if (!/const \[showSpread,setShowSpread\]=React\.useState\(false\)/.test(src)) bad('Market Watch needs a showSpread state');
if (!/onSpread=\{\(\)=>setShowSpread\(v=>!v\)\}/.test(src)) bad('the menu must toggle showSpread');
if (!/showSpread && <th>\{t\('Spread'\)\}<\/th>/.test(src)) bad('Spread header must render only when toggled on');
if (!/const _diff=\(m\.ask!=null&&m\.bid!=null\)\?Math\.abs\(parseFloat\(askT\)-parseFloat\(bidT\)\):null;/.test(src)) bad('spread must be a per-row diff of the displayed ask/bid (no shared var)');
if (!/const spr=_diff==null\?'—':\(catOf\(sym\)==='Crypto'\|\|catOf\(sym\)==='Stocks'\?_diff:_diff\/pip\(sym\)\)\.toFixed\(1\);/.test(src)) bad('Forex → ÷pip (1.0/pip), crypto/stock → raw price gap');
if (!/showSpread && <td className="mwspr">\{open\?spr:'—'\}<\/td>/.test(src)) bad('Spread cell must render only when toggled on (— when the session is closed)');
// the active toggle shows a checkmark
if (!/it\.act==='spread' && spread/.test(src)) bad('the Spread menu row must show ✓ when active');

// 2) DOCKED toolbox (MT5): the dock grid row equals the toolbox height so the content above it
//    (left panel + charts) SHRINKS to fit — no floating overlay, everything stays visible.
if (!/'--dockh': \(view\.toolbox \? \(bottomh\+24\) : 0\)\+'px'/.test(src)) bad('dock row must equal the toolbox height (bottomh+24) so content shrinks, docked not overlaid');
if (!/lastH = Math\.max\(126, Math\.min\(window\.innerHeight - 200, h\)\)/.test(src)) bad('toolbox resize floor lowered to 126 (dock 150 → taller charts), still clamped to innerHeight-200');
if (/chartsEl\.style\.height=active\+'px'/.test(src)) bad('the old overlay-era .charts height clamp must be gone (grid docks the toolbox now)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW spread / dock problem(s).`); process.exit(1); }
console.log('🟢 PASS: right-click Spread toggles a live (ask-bid)/pip column; the toolbox is DOCKED (dock row = toolbox height) so panels shrink above it, MT5-style.');
