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
// Legend hides the crosshair dotted lines entirely (MT5 has none); dark keeps them
if (!/vertLine:\{color:th0\.cross, style:DOT, visible: themeBus\.theme!=='light', labelVisible: themeBus\.theme!=='light'\}/.test(src)) bad('Legend must hide the crosshair LINE and its axis LABEL at creation (free mouse)');
if (!/vertLine:\{color:th\.cross, visible: t!=='light', labelVisible: t!=='light'\}/.test(src)) bad('theme flip must hide/show the crosshair line + axis label per theme');
if (CD.light.upBody !== 'rgba(0,0,0,0)' || CD.light.upLine !== '#00FF55') bad('Legend up candle must be HOLLOW (transparent body + neon-green #00FF55 outline)');
if (CD.light.downBody !== '#FF453A' || CD.light.downLine !== '#FF453A') bad('Legend down candle must be #FF453A');

// (3) Legend CSS root vars = Robinhood palette
if (!/\.terminal\.light\{ --bg:#0E1015; --panel:#000000; --panel2:#000000; --line:#1D212A;[^}]*--up:#00FF55; --down:#FF453A;[^}]*background:#0E1015/.test(src))
  bad('.terminal.light root vars must be the Robinhood palette (#0E1015 master, #000000 boxes, #1D212A line, up #00FF55, down #FF453A)');
if (!/\.terminal\.light \.mwt \.au\{color:#00FF55 !important\}\.terminal\.light \.mwt \.ad\{color:#FF453A !important\}/.test(src)) bad('Market Watch up/down must be Robinhood green/red in Legend');
// Market Watch body text uses the toolbox-tab tone (#a2aab6, normal weight) — size untouched
if (!/\.terminal\.light \.mwt td\{border:none;border-bottom:1px solid #1D212A;color:#a2aab6;font-weight:normal\}/.test(src)) bad('Market Watch cells must use the #a2aab6 tab tone (normal weight)');
if (!/\.terminal\.light \.mwt td\.sym\{color:#a2aab6;font-weight:normal\}/.test(src)) bad('Market Watch symbols must use the #a2aab6 tab tone');
if (/\.terminal\.light[^\n]*background:#ffffff/.test(src)) bad('no WHITE background surfaces may remain in the Legend theme (it is jet-black)');
// the chart right-click menu (ctxmenu) must be dark in Legend, not the MT5 light-grey #f0f0f0
if (!/\.terminal\.light \.ctxmenu\{background:#000000;border:1px solid #1D212A/.test(src)) bad('chart right-click menu must be Legend dark (#000000 + #1D212A), not white');
if (!/\.terminal\.light \.ctxmenu \.ci \.ck\{color:#00FF55\}/.test(src)) bad('right-click menu active checkmark should be green');
// the Market Watch tick chart follows the theme (was hardcoded white)
if (!/const th=CHART_THEME\[themeBus\.theme\]\|\|CHART_THEME\.dark, legend=themeBus\.theme==='light'/.test(src)) bad('TickChart must follow CHART_THEME (was hardcoded #ffffff)');
if (!/const ask=mk\(legend\?'#FF453A':'#d13438'\), bid=mk\(legend\?'#00FF55':'#2f6ec0'\)/.test(src)) bad('TickChart ask/bid must be Legend red/green');
if (/\.mwtick\{[^}]*background:#ffffff/.test(src)) bad('the tick-chart container must not be white');
// the Trading tab panels are flat black cards (no blue/red 3D gradients) with side-coloured prices
if (!/\.terminal\.light \.mwtp \.sd\{background:#000000 !important;border:1px solid #1D212A\}/.test(src)) bad('Trading-tab buttons must be flat black cards (no gradient fill)');
if (!/\.terminal\.light \.mwtp \.sd\.sell \.pr\{color:#FF453A\}/.test(src)) bad('Trading SELL price must be red');
if (!/\.terminal\.light \.mwtp \.sd\.buy \.pr\{color:#00FF55\}/.test(src)) bad('Trading BUY price must be green');
// New Order modal in Legend: green BUY button (was blue), muted hairlines, green focus
if (!/\.terminal\.light \.om-btns \.om-buy\{background:#00c853 !important\}/.test(src)) bad('New Order BUY button must be green in Legend (was blue #007aff)');
if (!/\.terminal\.light \.om-btns \.om-sell\{background:#FF453A !important\}/.test(src)) bad('New Order SELL button must be Legend red');
if (!/\.terminal\.light \.omodal\{background:#0E1015;border:1px solid #1D212A\}/.test(src)) bad('New Order modal must use the Legend dark palette');

// (3b) COMPONENT SKIN RECONSTRUCTION (not just recolor):
// one-click panel → flat matte-black card, no 3D fill, monochrome neon numbers
// one-click panel: calm SOLID matte-black + faint #242831 hairline (transparent-only hurt the eyes)
if (!/\.terminal\.light \.obox\{background:#000000 !important;border:1px solid #242831 !important;box-shadow:none/.test(src)) bad('Legend one-click panel must be solid #000000 + faint 1px #242831 hairline');
if (!/\.terminal\.light \.oc-blue,\.terminal\.light \.oc-red\{background:transparent !important;border:none !important\}/.test(src)) bad('oc-blue/oc-red halves must have no fill/border');
if (!/\.terminal\.light \.oc-lbl\{color:#8A94A6/.test(src)) bad('SELL/BUY labels must be muted silver #8A94A6 (no neon)');
if (!/\.terminal\.light \.oc-vol b\{color:#8A94A6/.test(src)) bad('qty arrows must be muted silver #8A94A6');
// toned-down one-click: price number is clean monochrome white (no loud green/red)
if (!/\.terminal\.light \.oc-price \.bf \.sm,\.terminal\.light \.oc-price \.bf \.bg,\.terminal\.light \.oc-price \.bf \.fr\{color:#ffffff/.test(src)) bad('one-click price number must be monochrome white (toned down)');
if (!/\.terminal\.light \.oc-price \.bf \.bg\{font-family:"Segoe UI",Arial,sans-serif !important;font-weight:500/.test(src)) bad('big quote must be thin-line weight 500 (non-Arial-Black)');
// window header melts, no gray 3D frame; active window = brighter GREY hairline (never green)
if (!/\.terminal\.light \.cell-title\{background:#000000;color:#ffffff;border:none;border-bottom:1px solid #1D212A\}/.test(src)) bad('chart header must melt into #000000 with a bottom hairline');
if (!/\.terminal\.light \.win\.active\{border-color:#2f3542/.test(src)) bad('active window must be a brighter GREY hairline, not green/glow');
if (!/\.terminal\.light \.tbtn:hover[^}]*color:#ffffff !important/.test(src)) bad('toolbar hover must be white');
// selected timeframe/tool button = green TEXT only (no fill, no green border)
if (!/\.terminal\.light \.tf b\.on,\.terminal\.light \.tibtn\.on,\.terminal\.light \.tbtn\.algo\.on\{background:transparent !important;border:1px solid transparent !important;color:#00FF55/.test(src)) bad('selected timeframe/tool button must be green TEXT only (no fill)');

// CRITICAL green-restraint: NO green BORDERS anywhere in Legend (eye-strain). Green is text-only,
// and only on live ticks / profit / P&L / the up-candle line — never a border/background.
// forbid green in EVERY border form except the active-tab TOP accent (border-top-*), which the
// user explicitly wants kept as the one deliberate "selected" point.
const greenBorders = (src.match(/border(?!-top)[a-z-]*:\s*[^;{}]*#00FF55/gi) || []);
if (greenBorders.length) bad('green border(s) remain (only the active-tab top accent may be green): ' + greenBorders.join(' | '));
if (!/\.terminal\.light \.tbxtabs \.t\.on\{[^}]*border-top-color:#00FF55\}/.test(src)) bad('the active tab must KEEP its green top accent (user likes it)');
if (!/\.terminal\.light \.charttabs \.ctab\.on\{background:#000000;color:#00FF55\}/.test(src)) bad('active chart tab TEXT must be green');
if (!/\.terminal\.light \.win\.active \.cell-title\{background:#000000;color:#00FF55/.test(src)) bad('active window title TEXT must be green');
// the up-candle LINE (chart) is the one place a green stroke is allowed
if (!/upLine:'#00FF55'/.test(src)) bad('the Legend up-candle line must stay neon green');
// current-price line muted to grey in Legend (was a loud red), default in dark
if (!/priceLineColor: themeBus\.theme==='light' \? '#5a6472' : ''/.test(src)) bad('Legend current-price line must be muted grey #5a6472 (dark keeps default)');
if (!/priceLineColor: t==='light' \? '#5a6472' : ''/.test(src)) bad('theme flip must re-mute the current-price line');
// bottom table: vertical grid gone, horizontal only
if (!/\.terminal\.light table\.pos td\{border:none;border-bottom:1px solid #1D212A/.test(src)) bad('Legend positions table must drop vertical borders (border-bottom only)');
// toolbar hover = border only (no fill)
if (!/\.terminal\.light \.tbtn:hover[^}]*background:transparent !important;border:1px solid #1D212A/.test(src)) bad('Legend toolbar hover must be border-only (transparent bg)');
// Balance bar bold pure-white text
if (!/\.terminal\.light \.acctline\{background:#0E1015;color:#a2aab6;border-top:1px solid #1D212A;border-bottom:1px solid #1D212A;font-weight:normal\}/.test(src)) bad('Legend Balance bar must be #a2aab6 (original size, normal weight)');
if (!/\.terminal\.light \.acctline \.k\{color:#a2aab6[^}]*\}\.terminal\.light \.acctline b\{color:#a2aab6/.test(src)) bad('Legend Balance bar labels + numbers must be the #a2aab6 tab tone');

// the DEFAULT dark one-click panel keeps its 3D royal-blue / red fills (outside .terminal.light)
if (!/\.oc-blue\{background:#3a63e0 !important/.test(src)) bad('dark one-click panel must keep the royal-blue fill');
if (!/\.oc-red\{background:#f5342a !important/.test(src)) bad('dark one-click panel must keep the red fill');

// (4) UI label renamed to Legend (no "Light / Dark" left)
if (/Color Theme — Light \/ Dark/.test(src)) bad('the menu label must be renamed away from "Light / Dark"');
if (!/\{l:'Color Theme — Legend \/ Dark', cmd:'theme\.toggle'/.test(src)) bad('View menu must read "Color Theme — Legend / Dark"');

// (5) integrity: the order-popup pipette accel timer + spread box + 7-arg slippage are still present
if (!/p_requested_price/.test(src) || !/p_max_slippage/.test(src)) bad('order pipette/7-arg slippage binding must remain intact');

if (fail) { console.error(`\n🔴 FAIL — ${fail} legend-theme problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 dark candle theme untouched; Legend = Robinhood jet-black (#0E1015/#000000/#1D212A, up #00FF55 / down #FF453A); label renamed to Legend.');
