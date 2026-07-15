#!/usr/bin/env node
// FEATURE / REGRESSION (webtrade) — MT5 one-click DIRECTION SKIN (2026-07-13 v2, user request).
// The WHOLE panel (SELL + BUY boxes together) follows the LAST tick direction, exactly like the
// MT5 one-click widget: up-tick → both boxes BLUE, down-tick → both boxes RED, and the colour
// STAYS until the direction flips (sticky — not a 160ms flash; that v1 was replaced).
// Rules:
//  [1] pure DOM via a ref on the .obox container + classList (no re-render, no new listener —
//      rides the ONE existing priceStore subscription and the existing prevBid compare)
//  [2] direction = the BID tick (bid/ask move together); flat tick → no class churn
//  [3] paint is idempotent per direction (guard: same direction twice = no classList work)
//  [4] the v1 digit-colour flash (blue/red DIGITS + 160ms timer) must be GONE — one mechanism.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: whole-panel CSS + sticky paint helper + single mechanism ──
if (!/\.obox\.tick-up\{[^}]*!important[^}]*\}/.test(src))
  bad('tick-up must repaint the .obox SHELL blue (one-shell design — children are transparent)');
if (!/\.obox\.tick-down\{[^}]*!important[^}]*\}/.test(src))
  bad('tick-down must repaint the .obox SHELL red (one-shell design — children are transparent)');
if (/\.oc-price\.tick-up \.bf|\.oc-price\.tick-down \.bf/.test(src))
  bad('the v1 digit-colour flash CSS must be gone (whole-panel skin replaced it)');
const paint_src = grab(/const paint=\(el,dir\)=>\{[\s\S]*?\};/, 'paint helper');
if (paint_src && /setTimeout|_ft/.test(paint_src)) bad('paint must be STICKY — no removal timer (MT5 keeps the colour until the flip)');
if (paint_src && !/el\._dir===dir/.test(paint_src)) bad('paint must be idempotent per direction (skip when unchanged — no classList churn per tick)');
if (!/paint\(oboxEl\.current,\s*q\.bid>p\?'tick-up':'tick-down'\)/.test(src))
  bad('direction must come from the existing BID compare and paint the obox container');
if (/const flash=\(el,dir\)|flash\(sellPx|flash\(buyPx/.test(src))
  bad('the v1 flash helper/callsites must be fully removed — one mechanism, not two');

// ── behavioural: run the real helper — sticky, idempotent, flips cleanly ──
if (!fail) {
  const el = { cls: new Set(), ops: 0 };
  el.classList = { add: (c) => { el.cls.add(c); el.ops++; }, remove: (...cs) => cs.forEach((c) => { if (el.cls.delete(c)) el.ops++; }) };
  const paint = new Function(paint_src + '\nreturn paint;')();
  paint(el, 'tick-up');
  if (!el.cls.has('tick-up')) bad('first up-tick must paint the panel blue');
  const opsAfterFirst = el.ops;
  paint(el, 'tick-up'); paint(el, 'tick-up');
  if (el.ops !== opsAfterFirst) bad('same-direction ticks must be a no-op (sticky, no churn)');
  paint(el, 'tick-down');
  if (!el.cls.has('tick-down') || el.cls.has('tick-up')) bad('a down-tick must swap blue → red in one move');
  paint(el, null && 'x');   // guard: falsy el/dir must not throw
  if (el.cls.size !== 1) bad('the panel must always wear exactly ONE direction class after painting');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} direction-skin problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 one-click direction skin — whole panel blue on up / red on down, sticky until the flip, idempotent per tick, v1 digit flash fully replaced.');
