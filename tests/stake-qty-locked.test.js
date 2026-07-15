#!/usr/bin/env node
// REGRESSION (#21 — locked-truth, master-audit find): staking is USD-denominated
// (`stake_crypto(p_usd: ...)`), so there is NO fixed coin quantity. The staked holding row
// derived a coin count `qty: usd / meta.price` (live price) → it wobbled with the market
// ("100 ALPXS held" → "67 held") even though the stake is a fixed USD principal.
// Invariant: a USD-denominated staked row must NOT show a coin count derived from the live
// price — it shows the USD value (the truth).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'crypto-live.html'), 'utf8');

if (/qty:\s*usd\s*\/\s*\(meta\.price\s*\|\|\s*1\)[^]{0,40}isStakedRow:\s*true/.test(src)) {
  console.error("🔴 FAIL: staked holding row shows a live-price-derived coin count (qty: usd / meta.price) — wobbles. A USD stake has no fixed coin qty; show USD.");
  process.exit(1);
}
console.log('🟢 PASS: staked holding row does not derive a wobbling coin count from the live price (USD stake → USD value).');
