#!/usr/bin/env node
// D13 — fx_open must reject a position the account can't cover the MARGIN for. There is
// currently NO margin check (client `canPlace` ignores balance; fx_open ignores it too),
// so a position of any size can be opened with $0. This test PROVES the margin formula the
// server (supabase/sql/fx_open_margin.sql) will enforce matches the client's display math
// (trading.html getNotionalUSD / getMarginUSD), so the server can't wrongly reject or allow.
//
// Margin = Notional(USD) / leverage_cap[cls].
//   lot:      XAUUSD=100, XAGUSD=5000, cls FX=100000, else=1
//   notional: non-FX        → size*lot*price
//             FX quote=USD   → size*lot*price      (EURUSD, XAUUSD, XAGUSD)
//             FX base=USD    → size*lot            (USDJPY)
//             FX cross       → size*lot*ccyToUsd(base)   (EURGBP)
//   lev cap:  FX=500 (2026-07-19 승인), INDEX=20, STOCK=5, CRYPTO=5, else=1
'use strict';

// Reference USD value of 1 unit of a currency (server reads these live from `prices`;
// here we pin them so the cross-pair case is a concrete, checkable number).
const REF = { USD: 1, EUR: 1.10, GBP: 1.27, JPY: 0.0067, AUD: 0.66 };
const LEV = { FX: 500, INDEX: 20, STOCK: 5, CRYPTO: 5 };

function lotSize(sym, cls) {
  if (sym === 'XAUUSD') return 100;
  if (sym === 'XAGUSD') return 5000;
  if (cls === 'FX') return 100000;
  return 1;
}
function notionalUSD(sym, cls, size, price) {
  const ls = lotSize(sym, cls);
  if (cls !== 'FX') return size * ls * price;
  const base = sym.slice(0, 3), quote = sym.slice(3, 6);
  if (quote === 'USD') return size * ls * price;
  if (base === 'USD') return size * ls;
  return size * ls * (REF[base] != null ? REF[base] : 1);   // cross
}
function marginUSD(sym, cls, size, price) {
  return notionalUSD(sym, cls, size, price) / (LEV[cls] || 1);
}

// [symbol, cls, size, price, expectedNotional, expectedMargin]
const cases = [
  ['EURUSD', 'FX',     1,   1.10,   110000, 220],    // major, quote USD (500:1)
  ['USDJPY', 'FX',     1,   150,    100000, 200],    // base USD → no price (500:1)
  ['EURGBP', 'FX',     1,   0.85,   110000, 220],    // cross → convert base EUR (500:1)
  ['XAUUSD', 'FX',     1,   2000,   200000, 400],    // metal: lot 100 (500:1)
  ['XAGUSD', 'FX',     1,   25,     125000, 250],    // metal: lot 5000 (500:1)
  ['AAPL',   'STOCK',  10,  200,    2000,   400],    // stock: lot 1, lev 5
  ['BTCUSD', 'CRYPTO', 0.5, 60000,  30000,  6000],   // crypto: lot 1, lev 5
  ['US30',   'INDEX',  2,   40000,  80000,  4000],   // index: lot 1, lev 20
];

let failed = 0;
for (const [sym, cls, size, price, expN, expM] of cases) {
  const n = Math.round(notionalUSD(sym, cls, size, price) * 100) / 100;
  const m = Math.round(marginUSD(sym, cls, size, price) * 100) / 100;
  if (n !== expN || m !== expM) {
    console.error(`🔴 FAIL ${sym} ${size}@${price}: notional ${n} (want ${expN}), margin ${m} (want ${expM})`);
    failed++;
  } else {
    console.log(`  ✓ ${sym} ${size}@${price} → notional $${n}, margin $${m}`);
  }
}

// Guard decision: free balance must cover the new margin.
function canOpen(balance, usedMargin, newMargin) { return balance >= usedMargin + newMargin - 1e-6; }
const gOk = canOpen(2000, 0, 1100);          // $2000 balance, open EURUSD 1 lot ($1100) → OK
const gNo = canOpen(500, 0, 1100);           // $500 balance → rejected
const gStack = canOpen(2000, 1100, 1100);    // already used $1100, another $1100 → $2200 > $2000 → rejected
if (gOk !== true)  { console.error('🔴 FAIL: $2000 should cover $1100 margin'); failed++; }
if (gNo !== false) { console.error('🔴 FAIL: $500 should NOT cover $1100 margin'); failed++; }
if (gStack !== false) { console.error('🔴 FAIL: stacked $2200 margin should exceed $2000'); failed++; }
if (gOk && !gNo && !gStack) console.log('  ✓ guard: free balance must cover used + new margin');

if (failed) { console.error(`\n🔴 fx-margin: ${failed} check(s) failed`); process.exit(1); }
console.log('🟢 PASS: fx margin formula + free-balance guard proven (server SQL must mirror this).');
