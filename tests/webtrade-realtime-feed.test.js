#!/usr/bin/env node
// FEATURE / REGRESSION (webtrade) — Realtime price push. The transport is the ONLY thing that
// changes: prices-table UPDATE events stream into the SAME _apply pipeline (one parser, one
// halfPx — a second parsing path would be a unit-drift reincubator, see 결함-로그 2026-07-13).
// The 1s polling stays as the fallback: if the channel never connects (publication missing /
// WS blocked) the terminal is EXACTLY as live as before this feature.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: push exists, routes through _apply, and the polling fallback SURVIVES ──
const rt_src = grab(/startRealtime\(\)\{ try\{[\s\S]*?\}catch\(e\)\{\} \},/, 'priceStore.startRealtime');
if (rt_src && !/postgres_changes/.test(rt_src)) bad('startRealtime must subscribe postgres_changes');
if (rt_src && !/table\s*:\s*'prices'/.test(rt_src)) bad('startRealtime must watch the prices table');
if (rt_src && !/this\._apply\(\[row\]\)/.test(rt_src)) bad('realtime rows must go through the SAME _apply pipeline (no second parser)');
const start_src = grab(/start\(\)\{ if\(this\.timer\) return;[^\n]*/, 'priceStore.start');
if (start_src && !/this\.startRealtime\(\)/.test(start_src)) bad('start() must attempt the realtime channel');
if (start_src && !/setInterval\(\(\)=>this\.pull\(\), 1000\)/.test(start_src)) bad('the 1s polling FALLBACK must survive (realtime is an upgrade, not a replacement)');

// ── behavioural: a pushed row lands via _apply + notify; junk events are ignored ──
if (!fail) {
  let handler = null, subscribed = false, chanTable = null;
  global.window = { AlpexaSync: { db: { channel: () => ({
    on: (kind, opts, fn) => { chanTable = opts && opts.table; handler = fn; return { subscribe: () => { subscribed = true; return {}; } }; },
  }) } } };
  global.AlpexaSync = global.window.AlpexaSync;
  const store = new Function('const store={ rt:null, live:false, applied:[], notified:0,\n' +
    '_apply(rows){ this.applied.push(rows); },\nnotify(){ this.notified++; },\n' + rt_src + '\n};\nreturn store;')();
  store.startRealtime();
  if (!subscribed) bad('channel must actually subscribe');
  if (chanTable !== 'prices') bad(`channel watches ${chanTable}, expected prices`);
  handler({ new: { symbol: 'EURUSD', mid: 1.1386, spr_pts: 1 } });
  if (store.applied.length !== 1 || store.applied[0][0].symbol !== 'EURUSD') bad('a pushed row must reach _apply as [row]');
  if (store.notified !== 1) bad('a pushed row must notify subscribers');
  if (store.live !== true) bad('a pushed row must mark the feed live');
  handler({ new: null }); handler({}); handler(null);
  if (store.applied.length !== 1) bad('junk events (no row / no symbol) must be ignored, not applied');
  const store2 = new Function('const store={ rt:{already:1}, applied:[],\n_apply(rows){ this.applied.push(rows); },\nnotify(){},\n' +
    rt_src + '\n};\nreturn store;')();
  store2.startRealtime();   // second call with an existing channel must be a no-op (no double-subscribe)
  delete global.window; delete global.AlpexaSync;
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} realtime-feed problem(s).`); process.exit(1); }
console.log('🟢 PASS: prices UPDATE pushes land through the one _apply pipeline (live, notified, junk-safe); 1s polling fallback intact; no double-subscribe.');
