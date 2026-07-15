#!/usr/bin/env node
// FEATURE / REGRESSION (trading.html) — Realtime price push (2026-07-13, webtrade pattern spread).
// The FX app polled `prices` every 1.5s, so its quotes lagged webtrade (Realtime ms) by up to
// ~3s of market movement — "the two apps show different prices". Now a prices UPDATE event
// merges straight into window.__alpexaFXFeed (the exact shape fxApplyFeed writes) and the
// existing 1s anchor loop snaps the engine to it. Rules:
//   [1] single-row MERGE — one symbol's push must not wipe the other symbols' quotes
//   [2] junk events ignored   [3] the 1.5s poll fallback SURVIVES (push is an upgrade)
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'trading.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static ──
const h = grab(/\.on\('postgres_changes',\{event:'\*',schema:'public',table:'prices'\},function\(m\)\{[\s\S]*?\}\)/, 'prices realtime handler');
if (h && !/f\[row\.symbol\]=\{mid:\+row\.mid\|\|0,spr:\+row\.spr_pts\|\|0,ts:Date\.now\(\)\}/.test(h))
  bad('a pushed row must land in the SAME shape fxApplyFeed writes (mid/spr/ts)');
if (!/setInterval\(function\(\)\{ if\(!document\.hidden\) pullFeed\(\); \},1500\);/.test(src))
  bad('the 1.5s poll fallback must survive (push is an upgrade, not a replacement)');
if (!/channel\('prices-live'\)/.test(src)) bad('the app must subscribe the prices-live channel');

// ── behavioural: merge + junk safety on the REAL handler ──
if (!fail) {
  const fnBody = h.replace(/^\.on\('postgres_changes',\{[^}]*\},/, '').replace(/\)$/, '');
  const win = { __alpexaFXFeed: { EURUSD: { mid: 1.1384, spr: 1, ts: 1 } } };
  const handler = new Function('window', 'return ' + fnBody + ';')(win);
  handler.call(null, { new: { symbol: 'BTCUSD', mid: 62000, spr_pts: 1.5 } });
  if (!win.__alpexaFXFeed.BTCUSD || win.__alpexaFXFeed.BTCUSD.mid !== 62000) bad('a pushed row must land in __alpexaFXFeed');
  if (!win.__alpexaFXFeed.EURUSD || win.__alpexaFXFeed.EURUSD.mid !== 1.1384) bad('a single-row push must MERGE (not wipe the other symbols)');
  handler.call(null, { new: null }); handler.call(null, {}); handler.call(null, { new: { mid: 5 } });
  if (Object.keys(win.__alpexaFXFeed).length !== 2) bad('junk events (no row / no symbol) must be ignored');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} trading-realtime problem(s).`); process.exit(1); }
console.log('🟢 PASS: trading.html gets prices via Realtime push — single-row merge into __alpexaFXFeed, junk-safe, 1.5s poll fallback intact.');
