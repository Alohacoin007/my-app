#!/usr/bin/env node
// REGRESSION (webtrade) — two Market Watch behaviours:
//  1) right-click menu offers the Forex / Stocks / Crypto (+ All) class filter.
//  2) drag a symbol row from the Market Watch and drop it on a chart window → that window's chart
//     switches to the dropped symbol (MT5 drag-to-chart).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) class filter present in the right-click menu
for (const c of ['Forex', 'Stocks', 'Crypto']) if (!new RegExp(`\\{l:'${c}', act:'cat', arg:'${c}'\\}`).test(src)) bad(`right-click menu missing ${c}`);

// 2) drag from Market Watch → drop on chart
if (!/draggable=\{true\} onDragStart=\{\(e\)=>\{ e\.dataTransfer\.setData\('text\/mwsymbol', sym\)/.test(src)) bad('Market Watch rows must be draggable and carry the symbol (text/mwsymbol)');
if (!/onDrop=\{\(e\)=>\{[^}]*e\.dataTransfer\.getData\('text\/mwsymbol'\); if\(s && WATCH\.indexOf\(s\)>=0\)\{[^}]*onSymbol&&onSymbol\(idx, s\)/.test(src)) bad('a chart window must accept a dropped MW symbol and switch to it (onSymbol)');
if (!/onDragOver=\{\(e\)=>\{ if\(\(e\.dataTransfer\.types\|\|\[\]\)\.indexOf\('text\/mwsymbol'\)>=0\)\{ e\.preventDefault/.test(src)) bad('chart window must accept the drag (preventDefault on dragover for mwsymbol)');
if (!/const changeSymbol=React\.useCallback\(\(id,sym\)=>\{ setCharts\(cs=>cs\.map\(c=> c\.id===id \? \{\.\.\.c, symbol:sym\} : c\)\)/.test(src)) bad('App must change the chart symbol on drop (changeSymbol)');
if (!/onSymbol=\{changeSymbol\}/.test(src)) bad('ChartCell must receive changeSymbol as onSymbol');
if (!/\.win\.dropok\{box-shadow:inset 0 0 0 2px/.test(src)) bad('a drop-target highlight (.win.dropok) should show where the symbol will land');

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW-drag problem(s).`); process.exit(1); }
console.log('🟢 PASS: right-click class filter (Forex/Stocks/Crypto) present; dragging a MW symbol onto a chart window switches that chart to the dropped symbol.');
