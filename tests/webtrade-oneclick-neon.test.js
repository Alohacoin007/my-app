#!/usr/bin/env node
// REGRESSION (webtrade) — the chart's one-click SELL/BUY panel wears a fixed-side NEON skin in the
// default DARK theme (the old skin flipped BOTH halves by tick, which read as washed-out). Now SELL is
// a fixed red-neon (dark-red gradient + #ff3b30 border + #ff453a text) and BUY is a fixed blue-neon
// (dark-blue gradient + #007aff border + #3095ff text). The glow ignites on hover, and on the LIVE
// tick — SELL on a down-tick, BUY on an up-tick — via a semantic `oc-glow` class, NOT by swapping the
// side colour. The centre lot box is dark (#121418 + #3c4049 silver rails). Legend stays muted.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── DARK theme: fixed-side neon fills (SELL red / BUY blue) ──
if (!/\.oc-sell\{background:linear-gradient\(to bottom,#2a0a0a 0%,#150303 100%\) !important;border:1px solid #ff3b30 !important;color:#ff453a !important\}/.test(src))
  bad('SELL must be the red-neon skin (carbon-black gradient + #ff3b30 border + #ff453a text)');
if (!/\.oc-buy\{background:linear-gradient\(to bottom,#0a1735 0%,#030815 100%\) !important;border:1px solid #007aff !important;color:#3095ff !important\}/.test(src))
  bad('BUY must be the blue-neon skin (carbon-black gradient + #007aff border + #3095ff text)');

// ── glow ignites on hover + the semantic tick class (not a colour swap) ──
if (!/\.oc-sell:hover,\.oc-sell\.oc-glow\{box-shadow:0 0 8px rgba\(255,59,48,\.6\)\}/.test(src))
  bad('SELL glow (red) must fire on hover and on oc-glow (down-tick)');
if (!/\.oc-buy:hover,\.oc-buy\.oc-glow\{box-shadow:0 0 8px rgba\(0,122,255,\.6\)\}/.test(src))
  bad('BUY glow (blue) must fire on hover and on oc-glow (up-tick)');

// ── JSX: side colour is FIXED; tick only drives the glow (SELL↓ / BUY↑) ──
if (!/const sellCls = 'oc-sell'\+\(bidDir==='down' \? ' oc-glow' : ''\);/.test(src))
  bad('SELL must be a fixed oc-sell; down-tick only adds oc-glow');
if (!/const buyCls  = 'oc-buy' \+\(askDir==='up'   \? ' oc-glow' : ''\);/.test(src))
  bad('BUY must be a fixed oc-buy; up-tick only adds oc-glow');
// the tick-flip colour classes must be gone
if (/oc-red|oc-blue/.test(src)) bad('the old tick-flip oc-red/oc-blue classes must be fully removed');

// ── centre lot box: dark card + silver #3c4049 rails ──
if (!/\.oc-vol\{[^}]*background:#121418;[^}]*border-left:1px solid #3c4049;border-right:1px solid #3c4049\}/.test(src))
  bad('lot box must be dark #121418 with silver #3c4049 side rails');
if (!/\.oc-vol input\{[^}]*background:#121418;color:#ffffff/.test(src))
  bad('lot box input must be dark (#121418) with white text');

// ── Legend (light) stays muted — no neon fill/border/glow on the halves ──
if (!/\.terminal\.light \.oc-sell,\.terminal\.light \.oc-buy\{background:transparent !important;border:none !important;color:#8A94A6 !important;box-shadow:none !important\}/.test(src))
  bad('Legend must neutralise oc-sell/oc-buy to muted silver (no fill/border/glow)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} one-click neon-skin problem(s).`); process.exit(1); }
console.log('🟢 PASS: one-click panel — DARK = fixed red-neon SELL / blue-neon BUY with hover+tick glow (oc-glow), dark silver-railed lot box; Legend stays muted.');
