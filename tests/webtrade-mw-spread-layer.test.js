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
if (!/const spr=\(m\.ask!=null&&m\.bid!=null\)\?\(\(m\.ask-m\.bid\)\/pip\(sym\)\)\.toFixed\(1\)/.test(src)) bad('spread must be (ask-bid)/pip per symbol');
if (!/showSpread && <td className="mwspr">\{spr\}<\/td>/.test(src)) bad('Spread cell must render only when toggled on');
// the active toggle shows a checkmark
if (!/it\.act==='spread' && spread/.test(src)) bad('the Spread menu row must show ✓ when active');

// 2) left panel above the toolbox so its tab bar is never covered when the toolbox is pulled up
const leftCss = (src.match(/\.left\{[^}]*\}/) || [''])[0];
const lz = (leftCss.match(/z-index:(\d+)/) || [])[1];
const tz = ((src.match(/\.toolbox\{[^}]*z-index:(\d+)/) || [])[1]);
if (!lz || !tz) bad('could not read .left / .toolbox z-index');
else if (+lz <= +tz) bad(`.left z-index (${lz}) must be ABOVE .toolbox (${tz}) so Market Watch/its tabs stay visible`);
if (!/\.left\{[^}]*position:relative/.test(src)) bad('.left needs position for its z-index to take effect');

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW spread/layer problem(s).`); process.exit(1); }
console.log('🟢 PASS: right-click Spread toggles a live (ask-bid)/pip column; the left panel sits above the toolbox so its tab bar is never covered.');
