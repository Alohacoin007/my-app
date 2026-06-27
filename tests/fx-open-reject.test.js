#!/usr/bin/env node
// REGRESSION (money) — fx_open is the server margin gate (D13). The client MUST honor its
// rejection: when fx_open returns ok:false for a margin/balance refusal, the order must NOT
// open. The bug: the handler called finalize() regardless of ok, so a server-REFUSED
// position (0.01 BTC, ~$120 margin, on a $100 account) opened anyway → over-leverage and a
// stuck margin-call popup. Same class as the sports bet bypass (#13): the client ignoring a
// server refusal. This asserts trading.html rolls back on a margin rejection before finalize.
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'trading.html'), 'utf8');
const hasGuard = /d\.ok===false\s*&&\s*\/margin\|insufficient\|balance\/i\.test/.test(src);

if (!hasGuard) {
  console.error('🔴 FAIL: trading.html fx_open handler does not roll back on a server margin rejection (D13) — a refused position would still open.');
  process.exit(1);
}
console.log('🟢 PASS: fx_open margin rejection is honored client-side (no over-leverage open).');
