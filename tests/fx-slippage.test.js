#!/usr/bin/env node
// REGRESSION (money) — fx_open SLIPPAGE guard + fx_close row lock + frontend exception binding.
// Proves (RED→GREEN):
//  1) the slippage decision (JS port of the server guard) rejects ONLY adverse-beyond-tolerance
//     fills and always accepts favorable / within-tolerance ones.
//  2) fx_open_slippage.sql actually carries the guard and drops the ambiguous old overloads.
//  3) fx_close.sql locks the row (FOR UPDATE) before computing/banking P&L.
//  4) webtrade.html passes requested price + max slippage AND no longer lands a demo fill on a
//     REAL server rejection (slippage/margin) — the error sound path, not a phantom position.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── 1) slippage decision, exact port of fx_open_slippage.sql ──
// reject when: BUY  and fill > requested + max ;  SELL and fill < requested - max
function rejects(side, fill, requested, max) {
  if (requested == null || max == null || max < 0) return false;   // feature off
  if (side === 'BUY') return fill > requested + max;
  if (side === 'SELL') return fill < requested - max;
  return false;
}
const T = 0.0015; // 15 pip on a 5-digit pair
const cases = [
  // [side, fill, requested, expectReject, why]
  ['BUY', 1.1400, 1.1400, false, 'exact'],
  ['BUY', 1.1414, 1.1400, false, 'adverse but within 15p'],
  ['BUY', 1.1416, 1.1400, true,  'adverse beyond 15p → REJECT'],
  ['BUY', 1.1300, 1.1400, false, 'favorable (cheaper) → always fill'],
  ['SELL', 1.1400, 1.1400, false, 'exact'],
  ['SELL', 1.1386, 1.1400, false, 'adverse but within 15p'],
  ['SELL', 1.1384, 1.1400, true,  'adverse beyond 15p → REJECT'],
  ['SELL', 1.1500, 1.1400, false, 'favorable (higher) → always fill'],
];
for (const [side, fill, req, expect, why] of cases) {
  const got = rejects(side, fill, req, T);
  if (got !== expect) bad(`slippage ${side} fill=${fill} req=${req}: expected reject=${expect} (${why}), got ${got}`);
}
// feature-off (no params) never rejects
if (rejects('BUY', 9.9, 1.14, null)) bad('slippage guard must be OFF when max is null (backward compat)');

// ── 2) server SQL: fx_open guard + de-ambiguation ──
const sqlOpen = fs.readFileSync(path.join(ROOT, 'supabase/sql/fx_open_slippage.sql'), 'utf8');
if (!/p_requested_price/.test(sqlOpen) || !/p_max_slippage/.test(sqlOpen)) bad('fx_open_slippage.sql missing slippage params');
if (!/v_open\s*>\s*p_requested_price\s*\+\s*p_max_slippage/.test(sqlOpen)) bad('fx_open_slippage.sql missing BUY adverse check');
if (!/v_open\s*<\s*p_requested_price\s*-\s*p_max_slippage/.test(sqlOpen)) bad('fx_open_slippage.sql missing SELL adverse check');
if (!/'code','SLIPPAGE'/.test(sqlOpen)) bad('fx_open_slippage.sql should return code SLIPPAGE');
if (!/drop function if exists public\.fx_open\(text, text, text, numeric\)/.test(sqlOpen)) bad('must DROP the 4-arg fx_open (avoid PostgREST ambiguity)');
if (!/drop function if exists public\.fx_open\(text, text, text, numeric, numeric\)/.test(sqlOpen)) bad('must DROP the 5-arg fx_open');

// ── 3) fx_close row lock ──
const sqlClose = fs.readFileSync(path.join(ROOT, 'supabase/sql/fx_close.sql'), 'utf8');
if (!/for update of p/.test(sqlClose)) bad('fx_close.sql missing FOR UPDATE row lock (double-close race)');
if (!/status = 'open'/.test(sqlClose) || !/if not found then/.test(sqlClose)) bad('fx_close.sql must keep the atomic-claim backstop');

// ── 4) webtrade.html frontend binding ──
const wt = fs.readFileSync(path.join(ROOT, 'webtrade.html'), 'utf8');
if (!/p_requested_price\s*:/.test(wt) || !/p_max_slippage\s*:/.test(wt)) bad('webtrade.html placeOrder must send p_requested_price + p_max_slippage');
if (!/requestedPrice\s*:\s*price/.test(wt)) bad('webtrade.html send() must pass the displayed quote as requestedPrice');
// PRODUCTION: no client demo fill at all — a server rejection fires sndError, a logged-out user is
// prompted to log in. addDemo is never called (the client never fabricates a fill / money).
if (/positionsStore\.addDemo\(/.test(wt))
  bad('webtrade.html must NOT land a client demo fill in production (addDemo call removed)');
if (!/reason==='not_logged_in'\)\{ playSnd\(sndError\); alert\(t\('Please log in to trade'\)/.test(wt))
  bad('webtrade.html logged-out order must prompt login (no demo fill)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} slippage/lock/binding problem(s).`); process.exit(1); }
console.log('🟢 PASS: slippage guard rejects only adverse-beyond-tolerance fills; fx_close row-locked; fx_open de-ambiguated; frontend binds requested-price + no phantom demo fill on server reject.');
