#!/usr/bin/env node
// REGRESSION (webtrade) — window header skin. Default DARK = native-MT5 "Metallic Silver Dark": a
// 3-stop steel gradient with an embossed top hairline (#434956) and a shadow bottom hairline
// (#111317), radius 0, silver-white text (#e1e4ed) with a printed text-shadow. The ACTIVE window's
// header top line switches to a 2px neon (dark = royal blue #1b46e6, Legend = green #00ff55);
// inactive stays a calm 1px hairline. Legend keeps its muted-black header (no metallic).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (sel) => { const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : null; };

const GRAD = /background:linear-gradient\(to bottom,#2d3139 0%,#20232a 50%,#181a20 100%\)/;
for (const [sel, label] of [['.cell-title', 'chart window header'], ['.mwhead', 'Market Watch header']]) {
  const css = grab(sel);
  if (!css) { bad(`${sel} not found`); continue; }
  if (!GRAD.test(css)) bad(`${label}: metallic silver-dark gradient missing`);
  if (!/border-top:1px solid #434956/.test(css)) bad(`${label}: embossed top hairline (#434956) missing`);
  if (!/border-bottom:1px solid #111317/.test(css)) bad(`${label}: shadow bottom hairline (#111317) missing`);
  if (!/border-radius:0/.test(css)) bad(`${label}: must be radius 0 (hard corners)`);
  if (!/color:#e1e4ed/.test(css)) bad(`${label}: silver-white text (#e1e4ed) missing`);
  if (!/text-shadow:0 1px 1px rgba\(0,0,0,\.8\)/.test(css)) bad(`${label}: printed text-shadow missing`);
}

// min/close controls — silver + dark-silver hover box
const wc = grab('.cell-title .wc span');
if (!wc || !/color:#cdd4e0/.test(wc)) bad('window controls must be silver (#cdd4e0)');
const wch = grab('.cell-title .wc span:hover');
if (!wch || !/background:#3a3f4d/.test(wch)) bad('control hover must be a dark-silver box (#3a3f4d)');

// ACTIVE window header top line — dark = royal-blue neon, Legend = green neon; inactive = calm
if (!/\.win\.active \.cell-title\{border-top:1px solid #1b46e6\}/.test(src)) bad('active header (dark) must be a 1px royal-blue neon top line (thin)');
if (!/\.terminal\.light \.win\.active \.cell-title\{[^}]*border-top:1px solid #00a2ff/.test(src)) bad('active header (Legend) must be a 1px neon-blue top line (thin)');
// Legend stays muted (no metallic gradient on its headers)
const legendHdr = grab('.terminal.light .cell-title');
if (!legendHdr || GRAD.test(legendHdr)) bad('Legend header must stay muted black (no metallic gradient)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} header-skin problem(s).`); process.exit(1); }
console.log('🟢 PASS: metallic silver-dark window headers (gradient + emboss/shadow hairlines + printed text); active = 1px neon top line (dark blue / Legend green); Legend header stays muted.');
