#!/usr/bin/env node
// REGRESSION (webtrade) — WebTrader is a SERVER-INDEPENDENT demo terminal: orders fill on the
// CLIENT demo ledger only and NOTHING may reach Supabase / the admin backoffice. Earlier a
// lingering session (AlpexaSync.me truthy) routed orders to fx_open; when that failed the order
// silently vanished (no demo fill), so "테스트인데 주문이 안 떠". WT_DEMO closes that: every
// server path (start-load, fx_open, fx_close) must be gated by `!WT_DEMO` so a demo terminal
// never talks to the server. This asserts the switch exists and gates all three call sites.
'use strict';
const fs = require('fs');
const path = require('path');
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) the switch exists and is ON (this terminal is demo today)
if (!/const\s+WT_DEMO\s*=\s*true\b/.test(wt)) bad('WT_DEMO switch missing or not enabled (const WT_DEMO = true)');

// 2) EVERY server gate `window.AlpexaSync&&AlpexaSync.db&&AlpexaSync.me` must be WT_DEMO-aware:
//    action gates use `!WT_DEMO && …` (fx_open, fx_close, start-subscribe); load fns use
//    `WT_DEMO || !(…)` early-return (loadAcct, loadPos). Either way "WT_DEMO" sits just before it.
const GATE = 'window.AlpexaSync&&AlpexaSync.db&&AlpexaSync.me';
let idx = -1, total = 0, unguarded = 0;
while ((idx = wt.indexOf(GATE, idx + 1)) !== -1) {
  total++;
  if (!/WT_DEMO/.test(wt.slice(Math.max(0, idx - 24), idx))) unguarded++;
}
if (total < 5) bad(`expected ≥5 server gates (loadAcct, loadPos, start, fx_open, fx_close), found ${total}`);
if (unguarded > 0) bad(`${unguarded} UN-guarded server gate(s) — every fx_open/fx_close/load must be WT_DEMO-aware`);

// 3) the demo fill path is still the caller's not_logged_in fallback (unchanged; #5 intact).
if (!/r\.reason==='not_logged_in'\)\{\s*positionsStore\.addDemo/.test(wt))
  bad('demo fill must remain gated to the not_logged_in fallback (client display only)');

// 4) addDemo/removeDemo never write to Supabase or localStorage (display-only, no admin trace).
const demoFn = wt.slice(wt.indexOf('addDemo({'), wt.indexOf('removeDemo(') + 200);
if (/AlpexaSync|localStorage|\.rpc\(|\.from\(/.test(demoFn)) bad('addDemo/removeDemo must NOT touch server or localStorage (no admin trace)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} WebTrader demo-isolation problem(s).`); process.exit(1); }
console.log('🟢 PASS: WebTrader is server-independent — WT_DEMO gates every server path; orders fill on the client demo ledger only (nothing reaches the admin backoffice).');
