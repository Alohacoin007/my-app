#!/usr/bin/env node
// FEATURE / REGRESSION (webtrade) — MT5-style one-click tick flash. On each tick the SELL/BUY
// price DIGITS flash blue (up) / red (down) for ~160ms, then revert to white. Rules:
//  [1] pure DOM via refs + classList (no extra re-render, no parallel subscription — the flash
//      rides the ONE existing priceStore subscription and the existing prevBid/prevAsk compare)
//  [2] SAME-DIRECTION consecutive ticks must re-flash: remove → forced reflow (offsetWidth
//      read) → add. classList.add alone is a no-op while the class is still on (the Google-
//      prompt bug: rapid ticks would freeze the blink).
//  [3] timer defence: clearTimeout of the pending removal before re-arming (no timer pileup).
//  [4] flat tick (no change) → no classes touched.
// The old STICKY oc-glow direction state (bidDir/askDir) is REPLACED by this flash — one
// mechanism, not two. Hover glow + fixed neon skins stay (webtrade-oneclick-neon.test.js).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: CSS flash colours + helper shape + single-mechanism rule ──
if (!/\.oc-price\.tick-up \.bf \.sm,\.oc-price\.tick-up \.bf \.bg,\.oc-price\.tick-up \.bf \.fr\{color:#3095ff !important\}/.test(src))
  bad('tick-up must flash the price digits BLUE (#3095ff, the BUY neon text)');
if (!/\.oc-price\.tick-down \.bf \.sm,\.oc-price\.tick-down \.bf \.bg,\.oc-price\.tick-down \.bf \.fr\{color:#ff453a !important\}/.test(src))
  bad('tick-down must flash the price digits RED (#ff453a, the SELL neon text)');
const flash_src = grab(/const flash=\(el,dir\)=>\{[\s\S]*?\};/, 'flash helper');
if (flash_src && !/clearTimeout\(el\._ft\)/.test(flash_src)) bad('flash must clear the pending removal timer (no pileup)');
if (flash_src && !/void el\.offsetWidth/.test(flash_src)) bad('flash must force a reflow so same-direction ticks re-blink');
if (flash_src && !/160/.test(flash_src)) bad('flash must auto-remove after ~160ms');
if (!/flash\(sellPx\.current,\s*'tick-up'\)/.test(src) || !/flash\(sellPx\.current,\s*'tick-down'\)/.test(src))
  bad('SELL side must flash from the existing bid compare (up→blue, down→red)');
if (!/flash\(buyPx\.current,\s*'tick-up'\)/.test(src) || !/flash\(buyPx\.current,\s*'tick-down'\)/.test(src))
  bad('BUY side must flash from the existing ask compare (up→blue, down→red)');
if (/setBidDir|setAskDir|bidDir==='down'|askDir==='up'/.test(src))
  bad('the old sticky-glow direction STATE must be gone — one mechanism (flash), not two');

// ── behavioural: run the real helper with a fake element + fake timers ──
if (!fail) {
  let timers = [], nextId = 1, cleared = [];
  const setTimeout_ = (fn, ms) => { const id = nextId++; timers.push({ id, fn, ms }); return id; };
  const clearTimeout_ = (id) => { cleared.push(id); timers = timers.filter(t => t.id !== id); };
  const mkEl = () => { const log = []; return { log, reflows: 0, cls: new Set(),
    classList: { add(c) { this._o.cls.add(c); this._o.log.push('+' + c); }, remove(...cs) { cs.forEach(c => { if (this._o.cls.delete(c)) this._o.log.push('-' + c); }); } },
    get offsetWidth() { this.reflows++; return 100; } }; };
  const el = mkEl(); el.classList._o = el;
  const flash = new Function('setTimeout', 'clearTimeout', flash_src + '\nreturn flash;')(setTimeout_, clearTimeout_);
  flash(el, 'tick-up');
  if (!el.cls.has('tick-up')) bad('first up-tick must add tick-up');
  if (el.reflows !== 1) bad('flash must read offsetWidth exactly once per call (forced reflow)');
  if (timers.length !== 1 || timers[0].ms !== 160) bad('flash must arm ONE 160ms removal timer');
  flash(el, 'tick-up');   // same direction, before the timer fired
  if (cleared.length !== 1) bad('re-flash must clearTimeout the pending removal');
  if (el.log.filter(x => x === '+tick-up').length !== 2) bad('same-direction tick must RE-add the class (re-blink)');
  flash(el, 'tick-down');
  if (!el.cls.has('tick-down') || el.cls.has('tick-up')) bad('direction change must swap tick-up → tick-down');
  timers[timers.length - 1].fn();
  if (el.cls.size !== 0) bad('the removal timer must clear the flash back to white');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} tick-flash problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 tick flash — digits blink blue/red 160ms via refs on the one subscription; same-direction re-blink (reflow), timer-safe, sticky glow state fully replaced.');
