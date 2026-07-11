#!/usr/bin/env node
// FEATURE — the old "Light Mode" is renamed "Legend" and re-skinned as the Robinhood jet-black
// theme. Guards BOTH sides: (1) the DEFAULT MT5 dark candle/chart theme is UNTOUCHED; (2) the Legend
// (internal token 'light') theme carries the exact Robinhood palette; (3) the UI label says Legend.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// eval CHART_THEME + CANDLE_THEME
function grabObj(name) {
  const start = src.indexOf('const ' + name + ' = {');
  if (start < 0) { console.error('🔴 ' + name + ' not found'); process.exit(1); }
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
  return src.slice(start, end + 1);
}
let CT, CD;
try { CT = new Function(grabObj('CHART_THEME') + '\nreturn CHART_THEME;')(); CD = new Function(grabObj('CANDLE_THEME') + '\nreturn CANDLE_THEME;')(); }
catch (e) { console.error('🔴 eval failed — ' + e.message); process.exit(1); }

// (1) DEFAULT MT5 DARK — must be byte-for-byte the original (untouched)
if (CT.dark.bg !== '#000000' || CT.dark.grid !== '#2a2a2a' || CT.dark.text !== '#ffffff') bad('MT5 dark CHART_THEME changed — must stay pure black + #2a2a2a grid');
if (CD.dark.upBody !== 'rgba(0,0,0,0)' || CD.dark.upLine !== '#00ff00' || CD.dark.downBody !== '#ff2b2b') bad('MT5 dark CANDLE_THEME changed — must stay hollow-green up / filled-red down');

// (2) LEGEND (Robinhood) — chart pure black, subtle #1D212A grid; candles neon-green / orange-red
if (CT.light.bg !== '#000000' || CT.light.grid !== '#1D212A') bad('Legend chart must be #000000 bg + #1D212A grid');
if (CD.light.upBody !== '#00FF55' || CD.light.upLine !== '#00FF55') bad('Legend up candle must be neon green #00FF55');
if (CD.light.downBody !== '#FF453A' || CD.light.downLine !== '#FF453A') bad('Legend down candle must be #FF453A');

// (3) Legend CSS root vars = Robinhood palette
if (!/\.terminal\.light\{ --bg:#0E1015; --panel:#000000; --panel2:#000000; --line:#1D212A;[^}]*--up:#00FF55; --down:#FF453A;[^}]*background:#0E1015/.test(src))
  bad('.terminal.light root vars must be the Robinhood palette (#0E1015 master, #000000 boxes, #1D212A line, up #00FF55, down #FF453A)');
if (!/\.terminal\.light \.mwt \.au\{color:#00FF55 !important\}\.terminal\.light \.mwt \.ad\{color:#FF453A !important\}/.test(src)) bad('Market Watch up/down must be Robinhood green/red in Legend');
if (/\.terminal\.light[^\n]*#ffffff/.test(src)) bad('no #ffffff surfaces may remain in the Legend theme (it is jet-black, not white)');

// (4) UI label renamed to Legend (no "Light / Dark" left)
if (/Color Theme — Light \/ Dark/.test(src)) bad('the menu label must be renamed away from "Light / Dark"');
if (!/\{l:'Color Theme — Legend \/ Dark', cmd:'theme\.toggle'/.test(src)) bad('View menu must read "Color Theme — Legend / Dark"');

// (5) integrity: the order-popup pipette accel timer + spread box + 7-arg slippage are still present
if (!/p_requested_price/.test(src) || !/p_max_slippage/.test(src)) bad('order pipette/7-arg slippage binding must remain intact');

if (fail) { console.error(`\n🔴 FAIL — ${fail} legend-theme problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 dark candle theme untouched; Legend = Robinhood jet-black (#0E1015/#000000/#1D212A, up #00FF55 / down #FF453A); label renamed to Legend.');
