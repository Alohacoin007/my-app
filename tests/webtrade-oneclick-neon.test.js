#!/usr/bin/env node
// REGRESSION (webtrade) — one-click ONE-SHELL design (2026-07-13 B안+스프레드, user-approved mockup).
// The panel must read as ONE connected MT5 unit, not five floating boxes:
//   · ONE outer border on .obox (rounded 7px, neutral carbon before the first tick)
//   · children (labels / volume / prices) carry NO own borders or background skins —
//     seams are translucent white 1px dividers only
//   · the volume cell is a slightly sunken translucent layer (rgba black), input transparent
//   · a live SPREAD pill hangs bottom-centre (same per-row displayed-price formula as the MW)
//   · the DIRECTION skin paints the .obox SHELL itself (blue up / red down — see
//     webtrade-tick-flash.test.js for the sticky paint mechanics)
// The old fixed per-side neon skins (red SELL / blue BUY cards) were replaced by this design.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── ONE shell: rounded single border + neutral default fill on .obox ──
if (!/\.obox\{[^}]*border:1px solid #3c4049;border-radius:7px;[^}]*\}/.test(src))
  bad('.obox must be the ONE shell — single #3c4049 border, 7px radius');
if (!/\.obox\{[^}]*background:linear-gradient\(to bottom,#15171c 0%,#0b0d11 100%\)[^}]*\}/.test(src))
  bad('.obox must carry the neutral carbon fill (children stay transparent)');

// ── the five-box look is GONE: no per-side skins, no per-child borders ──
if (/\.oc-sell\{background:linear-gradient|\.oc-buy\{background:linear-gradient/.test(src))
  bad('per-side neon card skins must be gone (the shell owns the background now)');
if (/\.oc-sell\.oc-glow|\.oc-buy\.oc-glow/.test(src))
  bad('the old per-side glow rules must be gone');

// ── seams = translucent dividers only ──
if (!/\.oc-top\{[^}]*border-bottom:1px solid rgba\(255,255,255,\.18\)[^}]*\}/.test(src))
  bad('top/bottom rows must meet at a translucent divider');
if (!/\.oc-price:first-child\{border-right:1px solid rgba\(255,255,255,\.18\)\}/.test(src))
  bad('SELL/BUY prices must be split by a translucent centre divider');

// ── volume cell: sunken translucent layer, transparent input, translucent rails ──
if (!/\.oc-vol\{[^}]*background:rgba\(0,0,0,\.35\) !important[^}]*border-left:1px solid rgba\(255,255,255,\.18\) !important;border-right:1px solid rgba\(255,255,255,\.18\) !important\}/.test(src))
  bad('volume cell must be the sunken translucent layer with translucent rails');
if (!/\.oc-vol input\{[^}]*background:transparent !important;color:#ffffff !important;font-weight:bold/.test(src))
  bad('volume input must be transparent with white bold text');

// ── spread tag: RECTANGLE centred BETWEEN the two prices (2026-07-13 user request) ──
if (/border-radius:9px/.test(src))
  bad('the old rounded-pill radius exception must be gone (rectangle — .obox * zeroes radii)');
if (!/\.obox \.oc-spr\{[^}]*left:50%;[^}]*transform:translate\(-50%,-50%\)[^}]*\}/.test(src))
  bad('spread tag must sit dead-centre on the seam between the two prices');
if (!/\.obox \.oc-spr\{[^}]*top:42px;[^}]*\}/.test(src))
  bad('spread tag must be vertically centred in the price row (top 42px of the 64px box)');
if (!/className="oc-spr"/.test(src)) bad('the spread tag element must render inside .obox');
if (!/parseFloat\(fmtPx\(symbol,m\.ask\)\)-parseFloat\(fmtPx\(symbol,m\.bid\)\)/.test(src))
  bad('spread tag must derive from the DISPLAYED bid/ask exactly like the MW row');

// ── direction skin paints the SHELL (not the children) ──
if (!/\.obox\.tick-up\{background:linear-gradient\(to bottom,#0d47c8 0%,#082d85 100%\) !important;border-color:#3095ff !important\}/.test(src))
  bad('tick-up must repaint the .obox shell blue');
if (!/\.obox\.tick-down\{background:linear-gradient\(to bottom,#c62828 0%,#7f1616 100%\) !important;border-color:#ff6b60 !important\}/.test(src))
  bad('tick-down must repaint the .obox shell red');

if (fail) { console.error(`\n🔴 FAIL — ${fail} one-shell design problem(s).`); process.exit(1); }
console.log('🟢 PASS: one-click ONE-SHELL — single rounded border, translucent seams, sunken volume, live spread pill, direction skin on the shell; five-box look fully retired.');
