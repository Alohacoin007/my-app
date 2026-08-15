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
// Market Watch = MT5 light: up=네온 남색 #1330f0, down=네온 주황(빨강 쪽) #ff4d00 (2026-08-14 사장님 실관찰)
if (!/\.terminal\.light \.mwt \.au\{color:#1c9e2e !important\}\.terminal\.light \.mwt \.ad\{color:#ff4d00 !important\}/.test(src)) bad('Market Watch arrows must be green up / neon red-orange down');
if (!/\.terminal\.light \.mwt td\.tick-down\{color:#ff4d00 !important\}/.test(src)) bad('MT5 falling tick must be neon red-orange #ff4d00 (not pure red)');
if (!/\.terminal\.light \.mwt td\.tick-up\{color:#1330f0 !important\}/.test(src)) bad('MT5 rising tick must be neon indigo-blue #1330f0');
// Market Watch body text = MT5 검은 글자, Tahoma 보통 굵기
if (!/\.terminal\.light \.mwt td\{border:none;border-bottom:1px solid #d9dbdf;border-right:1px solid #d9dbdf;color:#000000;font-weight:400\}/.test(src)) bad('Market Watch cells must be MT5 black text + Excel-style grid (가로+세로 #d9dbdf)');
if (!/\.terminal\.light \.mwt td\.sym\{color:#000000;font-weight:400\}/.test(src)) bad('Market Watch symbols must be MT5 dark text (#1c1c1e)');
// 차트 표면(캔들 영역)은 흰색 금지 — 시세창은 MT5 라이트라 흰색 허용, 차트만 다크 유지.
// ⚠️ .mwtick(Market Watch → Ticks 탭)은 2026-08-14 사장님 "화이트 버젼으로" 지시로 **제외** —
//    MT5 실물도 Ticks 탭은 흰 배경이다. 메인 차트(charts/chartstage/win)는 그대로 제트블랙.
if (/\.terminal\.light \.(charts|chartstage|win|cell-title)\b[^\n]*background:#ffffff/.test(src)) bad('chart surfaces must stay dark (no white) — only the Market Watch is MT5 light');
// 우클릭 메뉴 = **MT5 화이트** (2026-08-15 사장님 승인으로 계약 뒤집힘). 예전 계약은 "Legend 다크"
// 였지만, 터미널이 MT5 화이트로 통일되면서 검은 메뉴만 튀었다. 이제 다크 오버라이드가 **없어야**
// 기본값(#f0f0f0)이 두 테마에 모두 적용된다 — 메뉴바 드롭다운(.mdrop)과 같은 팔레트.
if (/\.terminal\.light \.ctxmenu\{background:#000000/.test(src)) bad('right-click menu is dark again in light theme — the MT5 white base must apply (no dark override)');
if (!/\.ctxmenu\{[^}]*background:#f0f0f0/.test(src)) bad('the .ctxmenu base must stay MT5 light-grey (#f0f0f0)');
if (!/\.terminal\.light \.mdrop\{background:#f0f0f0/.test(src)) bad('menu-bar dropdowns must share the same MT5 white as the right-click menu');
// Market Watch → Ticks 탭 = **흰 배경** (2026-08-14 사장님 "화이트 버젼으로"). 이전 계약(테마를 따라
// 제트블랙)에서 뒤집혔다. 메인 차트는 여전히 CHART_THEME 을 따르므로 여기서만 라이트 팔레트.
if (!/const th= legend \? \{ bg:'#ffffff'/.test(src)) bad('TickChart must use the WHITE palette in light theme (MT5 Ticks tab is white)');
if (!/const ask=mk\('#d13438'\), bid=mk\(legend\?'#1a9e3f':'#2f6ec0'\)/.test(src)) bad('TickChart ask=red / bid=green(#1a9e3f on white, #2f6ec0 on dark)');
if (/bid=mk\(legend\?'#00FF55'/.test(src)) bad('neon green (#00FF55) is invisible on the white Ticks background');
if (!/\.terminal\.light \.mwtick\{background:#ffffff\}/.test(src)) bad('the light-theme tick-chart container must be white');
// Trading 탭 = MT5 라이트 카드 (SELL 빨강 / BUY 파랑)
if (!/\.terminal\.light \.mwtp \.sd\{background:#f6f7f9 !important;border:1px solid #d3d5da\}/.test(src)) bad('Trading-tab buttons must be MT5 light cards (#f6f7f9)');
if (!/\.terminal\.light \.mwtp \.sd\.sell \.pr\{color:#ff4d00\}/.test(src)) bad('Trading SELL price must match the Market Watch falling colour (#ff4d00)');
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
if (!/\.terminal\.light \.cell-title\{background:#e2e2e5;color:#1a1a1a/.test(src)) bad('MT5 chart header (inactive) must be FLAT gray + dark text (그라데이션 금지 — 사장님)');
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
if (!/\.terminal\.light \.tbxtabs \.t\.on\{[^}]*color:#000000[^}]*border-bottom:2px solid transparent\}/.test(src)) bad('MT5 active toolbox tab: white raised + black text, no colour underline');
if (!/\.terminal\.light \.charttabs \.ctab\.on\{background:#ffffff;color:#000000\}/.test(src)) bad('MT5 active chart tab must be white raised + black text (no colour accent)');
// (active chart header text color asserted above — MT5 white on blue)
// the up-candle LINE (chart) is the one place a green stroke is allowed
if (!/upLine:'#00FF55'/.test(src)) bad('the Legend up-candle line must stay neon green');
// current-price line muted to grey in Legend (was a loud red), default in dark
if (!/priceLineColor: themeBus\.theme==='light' \? '#5a6472' : ''/.test(src)) bad('Legend current-price line must be muted grey #5a6472 (dark keeps default)');
if (!/priceLineColor: t==='light' \? '#5a6472' : ''/.test(src)) bad('theme flip must re-mute the current-price line');
// bottom table: vertical grid gone, horizontal only
if (!/\.terminal\.light table\.pos td\{border:none;border-bottom:1px solid #d9dbdf/.test(src)) bad('MT5 positions table rows must carry the Excel-style grid line (#d9dbdf)');
if (!/\.terminal\.light table\.pos tbody td\{border-right:1px solid #d9dbdf\}/.test(src)) bad('MT5 positions table must keep per-column vertical dividers (same grid colour as Market Watch)');
// toolbar hover = MT5 light-blue box (was dark border-only)
if (!/\.terminal\.light \.tbtn:hover[^}]*background:#dbe7f6 !important;border:1px solid #9db8dd/.test(src)) bad('MT5 toolbar hover must be light-blue box (#dbe7f6 bg + #9db8dd border)');
// Balance bar — MT5 light gray strip, dark text
if (!/\.terminal\.light \.acctline\{background:#d6d8dc;color:#1a1a1a;border-top:1px solid #c4c6cb;border-bottom:1px solid #c4c6cb;font-weight:700\}/.test(src)) bad('MT5 Balance bar must be a FLAT deeper-gray strip + BLACK BOLD text');
if (!/\.terminal\.light \.acctline \.k\{color:#1a1a1a;font-weight:700\}\.terminal\.light \.acctline b\{color:#1a1a1a;font-weight:700\}/.test(src)) bad('MT5 Balance bar labels + numbers all black bold #1a1a1a');

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

// ── MT5 라이트 크롬은 PLAT(평면)이다 (2026-08-14 사장님 "밑부분이 더 진하게 보이지...이렇게 하지 말라고").
// 회색 그라데이션은 아랫단이 어두워져 '입체 띠'로 읽힌다 → 라이트 테마에서 금지.
// 유일한 예외: MT5 정품 파랑 타이틀 바 2개 (Market Watch 캡션 · 활성 차트창 헤더).
{
  const ALLOW = ['.terminal.light .mwhead{', '.terminal.light .win.active .cell-title{'];
  const rules = src.match(/\.terminal\.light [^{}\n]*\{[^}]*linear-gradient\([^)]*\)[^}]*\}/g) || [];
  for (const r of rules) {
    if (ALLOW.some(a => r.startsWith(a))) continue;
    bad('light-theme chrome must be FLAT (no gradient): ' + r.slice(0, 70));
  }
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} legend-theme problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 dark candle theme untouched; Legend = Robinhood jet-black (#0E1015/#000000/#1D212A, up #00FF55 / down #FF453A); label renamed to Legend.');
