#!/usr/bin/env node
// REGRESSION (money) — fx_open (server) is the ONLY creator of an FX position. The client
// must NEVER open one on its own: not on a margin refusal, not on no-spec / stale price, not
// on a network/offline error. Earlier the handler fell back to a CLIENT fill whenever fx_open
// didn't return ok — finalize(fillPx) for market orders, addLive(tg.fillPx) for triggered
// pending orders — which bypassed the server margin gate (over-leverage; un-priced symbols
// like the "0.01 BTC on $100" open). One-way (#5/F): server refuses → trade is rejected, no
// client-side open. This asserts no client-open fallback remains.
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'trading.html'), 'utf8');

const fallbacks = [
  [/finalize\([^)]*fillPx/, 'market order finalize(fillPx) fallback'],
  [/addLive\([^)]*fillPx/, 'pending order addLive(fillPx) fallback'],
  [/:\s*tg\.fillPx/, 'ternary fallback to client fill'],
];
const hits = fallbacks.filter(([re]) => re.test(src));
if (hits.length) {
  console.error('🔴 FAIL: trading.html still opens an FX position client-side (fx_open bypass): ' + hits.map(([, n]) => n).join(', '));
  process.exit(1);
}
// Positive: the success path must gate on a server ok before creating the position.
if (!/d&&d\.ok&&d\.open!=null/.test(src)) {
  console.error('🔴 FAIL: fx_open success guard (d.ok && d.open != null) not found — position creation must be gated on a server ok.');
  process.exit(1);
}
console.log('🟢 PASS: fx_open is the only FX-position creator — no client-side open fallback (margin / no-price / stale / offline all reject).');
