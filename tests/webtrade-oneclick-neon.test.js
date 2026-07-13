#!/usr/bin/env node
// REGRESSION (webtrade) — the chart's one-click SELL/BUY panel wears a fixed-side NEON skin, now FORCED
// in BOTH themes (the Legend matte-black muting was removed on request). SELL is a fixed red-neon
// (dark-carbon gradient + #ff3b30 border + #ff453a text) and BUY a fixed blue-neon (dark-carbon
// gradient + #007aff border + #3095ff text). The glow ignites on hover, and on the LIVE tick — SELL on
// a down-tick, BUY on an up-tick — via a semantic `oc-glow` class, NOT by swapping the side colour. The
// centre lot box is dark (#121418 !important + #3c4049 silver rails, white bold input) — never white.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── slim diet: the panel is compressed ~20% (190×64 → 155×50) with hard corners, neon intact ──
if (!/\.obox\{[^}]*width:155px;height:50px;/.test(src)) bad('panel must be slimmed to 155×50 (20% diet)');
if (!/\.oc-top\{height:16px;/.test(src)) bad('top layer must slim to 16px');
if (!/\.oc-vol\{width:47px;/.test(src)) bad('lot box must slim to 47px wide');
if (!/\.oc-price \.bf \.bg\{font-size:14px;font-weight:bold;/.test(src)) bad('big price number must be 14px bold (slim panel)');
if (!/\.obox \*\{border-radius:0 !important/.test(src)) bad('hard corners (radius 0) must be preserved');

// ── DARK theme: fixed-side neon fills (SELL red / BUY blue), deep carbon-black gradient ──
if (!/\.oc-sell\{background:linear-gradient\(to bottom,#2a0a0a 0%,#150303 100%\) !important;border:1px solid #ff3b30 !important;color:#ff453a !important\}/.test(src))
  bad('SELL must be the red-neon skin (carbon-black #2a0a0a→#150303 + #ff3b30 border + #ff453a text)');
if (!/\.oc-buy\{background:linear-gradient\(to bottom,#0a1735 0%,#030815 100%\) !important;border:1px solid #007aff !important;color:#3095ff !important\}/.test(src))
  bad('BUY must be the blue-neon skin (carbon-black #0a1735→#030815 + #007aff border + #3095ff text)');

// ── glow ignites on hover + the semantic tick class (10px / 0.7, !important) ──
if (!/\.oc-sell:hover,\.oc-sell\.oc-glow\{box-shadow:0 0 10px rgba\(255,59,48,\.7\) !important\}/.test(src))
  bad('SELL glow (red 10px/.7) must fire on hover and on oc-glow (down-tick)');
if (!/\.oc-buy:hover,\.oc-buy\.oc-glow\{box-shadow:0 0 10px rgba\(0,122,255,\.7\) !important\}/.test(src))
  bad('BUY glow (blue 10px/.7) must fire on hover and on oc-glow (up-tick)');

// ── JSX: side colour is FIXED; tick only drives the glow (SELL↓ / BUY↑) ──
if (!/const sellCls = 'oc-sell'\+\(bidDir==='down' \? ' oc-glow' : ''\);/.test(src))
  bad('SELL must be a fixed oc-sell; down-tick only adds oc-glow');
if (!/const buyCls  = 'oc-buy' \+\(askDir==='up'   \? ' oc-glow' : ''\);/.test(src))
  bad('BUY must be a fixed oc-buy; up-tick only adds oc-glow');
// the tick-flip colour classes must be gone
if (/oc-red|oc-blue/.test(src)) bad('the old tick-flip oc-red/oc-blue classes must be fully removed');

// ── centre lot box: dark card + silver #3c4049 rails, white bold input — !important locked, NO white ──
if (!/\.oc-vol\{[^}]*background:#121418 !important;[^}]*border-left:1px solid #3c4049 !important;border-right:1px solid #3c4049 !important\}/.test(src))
  bad('lot box must be dark #121418 !important with silver #3c4049 !important side rails');
if (!/\.oc-vol input\{[^}]*background:#121418 !important;color:#ffffff !important;font-weight:bold/.test(src))
  bad('lot box input must be dark (#121418 !important) with white bold text — never white bg');

// ── neon is FORCED in both themes: the Legend matte-black muting override must be GONE ──
if (/\.terminal\.light \.oc-sell|\.terminal\.light \.oc-buy|\.terminal\.light \.obox\{background:#000000/.test(src))
  bad('Legend must NOT mute the panel any more — the neon skin is forced in both themes');

if (fail) { console.error(`\n🔴 FAIL — ${fail} one-click neon-skin problem(s).`); process.exit(1); }
console.log('🟢 PASS: one-click panel — fixed red-neon SELL / blue-neon BUY (carbon fills, 10px/.7 glow) in BOTH themes, dark #121418 silver-railed lot box (no white); Legend muting removed.');
