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
// Market Watch = MT5 light (2026-08-13): up=파랑 #1330f0, down=빨강 #d51111
if (!/\.terminal\.light \.mwt \.au\{color:#1c9e2e !important\}\.terminal\.light \.mwt \.ad\{color:#d51111 !important\}/.test(src)) bad('Market Watch up/down must be MT5 blue/red');
// Market Watch body text = MT5 검은 글자, Tahoma 보통 굵기
if (!/\.terminal\.light \.mwt td\{border:none;border-bottom:1px solid #ececef;color:#000000;font-weight:400\}/.test(src)) bad('Market Watch cells must be MT5 dark text on light (#1c1c1e, weight 400)');
if (!/\.terminal\.light \.mwt td\.sym\{color:#000000;font-weight:400\}/.test(src)) bad('Market Watch symbols must be MT5 dark text (#1c1c1e)');
// 차트 표면(캔들 영역)은 흰색 금지 — 시세창은 MT5 라이트라 흰색 허용, 차트만 다크 유지
if (/\.terminal\.light \.(charts|chartstage|win|cell-title|mwtick)\b[^\n]*background:#ffffff/.test(src)) bad('chart surfaces must stay dark (no white) — only the Market Watch is MT5 light');
// the chart right-click menu (ctxmenu) must be dark in Legend, not the MT5 light-grey #f0f0f0
if (!/\.terminal\.light \.ctxmenu\{background:#000000;border:1px solid #1D212A/.test(src)) bad('chart right-click menu must be Legend dark (#000000 + #1D212A), not white');
if (!/\.terminal\.light \.ctxmenu \.ci \.ck\{color:#00FF55\}/.test(src)) bad('right-click menu active checkmark should be green');
// the Market Watch tick chart follows the theme (was hardcoded white)
if (!/const th=CHART_THEME\[themeBus\.theme\]\|\|CHART_THEME\.dark, legend=themeBus\.theme==='light'/.test(src)) bad('TickChart must follow CHART_THEME (was hardcoded #ffffff)');
if (!/const ask=mk\(legend\?'#FF453A':'#d13438'\), bid=mk\(legend\?'#00FF55':'#2f6ec0'\)/.test(src)) bad('TickChart ask/bid must be Legend red/green');
if (/\.mwtick\{[^}]*background:#ffffff/.test(src)) bad('the tick-chart container must not be white');
// Trading 탭 = MT5 라이트 카드 (SELL 빨강 / BUY 파랑)
if (!/\.terminal\.light \.mwtp \.sd\{background:#f6f7f9 !important;border:1px solid #d3d5da\}/.test(src)) bad('Trading-tab buttons must be MT5 light cards (#f6f7f9)');
if (!/\.terminal\.light \.mwtp \.sd\.sell \.pr\{color:#d51111\}/.test(src)) bad('Trading SELL price must be red (#d51111)');
if (!/\.terminal\.light \.mwtp \.sd\.buy \.pr\{color:#1330f0\}/.test(src)) bad('Trading BUY price must be blue (MT5, #1330f0)');
// New Order modal in Legend: green BUY button (was blue), muted hairlines, green focus
if (!/\.terminal\.light \.om-btns \.om-buy\{background:#00c853 !important\}/.test(src)) bad('New Order BUY button must be green in Legend (was blue #007aff)');
if (!/\.terminal\.light \.om-btns \.om-sell\{background:#FF453A !important\}/.test(src)) bad('New Order SELL button must be Legend red');
if (!/\.terminal\.light \.omodal\{background:#0E1015;border:1px solid #1D212A\}/.test(src)) bad('New Order modal must use the Legend dark palette');

// (3b) ONE-CLICK PANEL: the neon skin is now FORCED in BOTH themes (Legend muting removed on request).
// Legend must NOT re-mute the panel to matte-black/silver — no .terminal.light override on the halves.
if (/\.terminal\.light \.oc-sell|\.terminal\.light \.oc-buy/.test(src)) bad('Legend must NOT mute oc-sell/oc-buy — neon is forced in both themes');
if (/\.terminal\.light \.obox\{background:#000000/.test(src)) bad('Legend must NOT paint the one-click panel matte-black any more (neon forced)');
if (/\.terminal\.light \.oc-lbl\{color:#8A94A6/.test(src)) bad('Legend must NOT mute the SELL/BUY labels to silver (neon forced)');
// window header melts, no gray 3D frame; active window = brighter GREY hairline (never green)
// MT5 차트창 헤더 (2026-08-13): 비활성 = 회색 그라데이션 + 어두운 글자, 활성 = 파랑 + 흰 글자
if (!/\.terminal\.light \.cell-title\{background:linear-gradient\(#eaeaec,#d6d6da\);color:#1a1a1a/.test(src)) bad('MT5 chart header (inactive) must be gray gradient + dark text');
if (!/\.terminal\.light \.win\.active \.cell-title\{background:linear-gradient\(#4d92d9,#2f74c0\);color:#ffffff/.test(src)) bad('MT5 active chart header must be blue gradient + white text');
if (!/\.terminal\.light \.win\.active\{border-color:#2f3542/.test(src)) bad('active window must be a brighter GREY hairline, not green/glow');
// MT5 light toolbar (2026-08-13 사장님 "MT5처럼"): hover = light-blue box, dark-blue text
if (!/\.terminal\.light \.tbtn:hover[^}]*color:#0d2c4d !important/.test(src)) bad('toolbar hover text must be MT5 dark-blue #0d2c4d');
// selected timeframe/tool button = MT5 light-blue pressed box (no more green-text-only)
if (!/\.terminal\.light \.tf b\.on,\.terminal\.light \.tibtn\.on\{background:#cfe1f7 !important;border:1px solid !important;border-color:#8fb0d6 #e6eef7 #e6eef7 #8fb0d6 !important;color:#0d2c4d/.test(src)) bad('selected button must be MT5 pressed bevel (dark top/left, light right/bottom — no dark right/bottom edge)');

// CRITICAL green-restraint: NO green BORDERS anywhere in Legend (eye-strain). Green is text-only,
// and only on live ticks / profit / P&L / the up-candle line — never a border/background.
// forbid green in EVERY border form except the active-tab ACCENT (border-top-* / border-bottom = the
// deliberate active-tab underline), which the user explicitly wants as the one green "selected" point.
const greenBorders = (src.match(/border(?!-top|-bottom)[a-z-]*:\s*[^;{}]*#00FF55/gi) || []);
if (greenBorders.length) bad('green border(s) remain (only the active-tab top/bottom accent may be green): ' + greenBorders.join(' | '));
if (!/\.terminal\.light \.tbxtabs \.t\.on\{[^}]*color:#0d47a1[^}]*border-bottom:2px solid #0d47a1\}/.test(src)) bad('MT5 active toolbox tab: white bg + navy text + navy underline');
if (!/\.terminal\.light \.charttabs \.ctab\.on\{background:#000000;color:#00FF55\}/.test(src)) bad('active chart tab TEXT must be green');
// (active chart header text color asserted above — MT5 white on blue)
// the up-candle LINE (chart) is the one place a green stroke is allowed
if (!/upLine:'#00FF55'/.test(src)) bad('the Legend up-candle line must stay neon green');
// current-price line muted to grey in Legend (was a loud red), default in dark
if (!/priceLineColor: themeBus\.theme==='light' \? '#5a6472' : ''/.test(src)) bad('Legend current-price line must be muted grey #5a6472 (dark keeps default)');
if (!/priceLineColor: t==='light' \? '#5a6472' : ''/.test(src)) bad('theme flip must re-mute the current-price line');
// bottom table: vertical grid gone, horizontal only
if (!/\.terminal\.light table\.pos td\{border:none;border-bottom:1px solid #ececef/.test(src)) bad('MT5 positions table must drop vertical borders (border-bottom only)');
// toolbar hover = MT5 light-blue box (was dark border-only)
if (!/\.terminal\.light \.tbtn:hover[^}]*background:#dbe7f6 !important;border:1px solid #9db8dd/.test(src)) bad('MT5 toolbar hover must be light-blue box (#dbe7f6 bg + #9db8dd border)');
// Balance bar — MT5 light gray strip, dark text
if (!/\.terminal\.light \.acctline\{background:linear-gradient\(#eef0f3,#e2e4e8\);color:#1a1a1a;border-top:1px solid #d4d6da;border-bottom:1px solid #d4d6da;font-weight:normal\}/.test(src)) bad('MT5 Balance bar must be light-gray strip + dark #1a1a1a text');
if (!/\.terminal\.light \.acctline \.k\{color:#555[^}]*\}\.terminal\.light \.acctline b\{color:#1a1a1a/.test(src)) bad('MT5 Balance bar labels dim #555, numbers dark #1a1a1a');

// the one-click panel is the ONE-SHELL card in both themes (2026-07-13 B안 — see
// webtrade-oneclick-neon.test.js): a single bordered .obox, direction skin on the shell,
// and NO per-side neon card skins (they were retired with the five-box look).
if (/\.oc-sell\{background:linear-gradient|\.oc-buy\{background:linear-gradient/.test(src)) bad('per-side neon card skins must stay retired (one-shell design)');
if (!/\.obox\{[^}]*border:1px solid #3c4049;box-shadow/.test(src)) bad('the .obox one-shell card must exist (forced in both themes)');

// (4) UI label renamed to Legend (no "Light / Dark" left)
// 2026-07-23 버전 스위처: 테마 토글 폐지 → View 메뉴는 Legend 1(여기·체크)/Legend 2(터미널 이동).
if (/cmd:'theme\.toggle'/.test(src)) bad('theme.toggle must be gone — the dark/legend toggle was replaced by the Legend 1/2 version switcher');
if (!/\{l:'Legend 1 — Classic', cmd:'ver\.set', arg:'legend1', ver:'legend1'/.test(src)) bad("View menu must offer 'Legend 1 — Classic' (checked via ver:'legend1')");
if (!/\{l:'Legend 2 — Terminal', cmd:'ver\.set', arg:'legend2'/.test(src)) bad("View menu must offer 'Legend 2 — Terminal'");
if (!/cmd==='ver\.set'/.test(src) || !/alpexa\.fx\.version/.test(src) || !/location\.href='terminal\.html'/.test(src)) bad('ver.set must persist alpexa.fx.version and navigate to terminal.html for legend2');

// (5) integrity: the order-popup pipette accel timer + spread box + 7-arg slippage are still present
if (!/p_requested_price/.test(src) || !/p_max_slippage/.test(src)) bad('order pipette/7-arg slippage binding must remain intact');

if (fail) { console.error(`\n🔴 FAIL — ${fail} legend-theme problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 dark candle theme untouched; Legend = Robinhood jet-black (#0E1015/#000000/#1D212A, up #00FF55 / down #FF453A); label renamed to Legend.');
