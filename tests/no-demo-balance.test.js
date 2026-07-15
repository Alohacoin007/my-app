#!/usr/bin/env node
// REGRESSION (#5 demo data) — the crypto Send screen must read holdings from the REAL
// `balances` (crypto_holdings), never hardcoded demo amounts. SEND_ASSETS shipped with
// fake balances (USDT 894.41, BTC $21,903.33, ETH $2,290.07) that showed in the "send
// from" list for accounts that held none of them. This asserts SEND_ASSETS carries no
// non-zero hardcoded balance (it's metadata only; amounts come from `balances`).
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'crypto-live.html'), 'utf8');
const m = src.match(/const SEND_ASSETS\s*=\s*\{[\s\S]*?\n\};/);
if (!m) { console.error('🔴 FAIL: SEND_ASSETS block not found in crypto-live.html'); process.exit(1); }

const nums = m[0].match(/balance(?:Usd)?:\s*([0-9]*\.?[0-9]+)/g) || [];
const nonzero = nums.filter((s) => parseFloat(s.split(':')[1]) > 0);
if (nonzero.length) {
  console.error('🔴 FAIL: SEND_ASSETS has hardcoded demo balance(s): ' + nonzero.join(', ') + ' — Send must read real holdings (balances).');
  process.exit(1);
}
console.log('🟢 PASS: SEND_ASSETS has no hardcoded demo balance — Send reads real holdings.');
