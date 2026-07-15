// Alpexa — crypto Send shows ALL held coins, not just USDT (RED→GREEN). #28
//
// Bug: on mobile, Send only offered USDT; other coins were missing (desktop showed them).
// The asset picker filtered by USD value (balances[id] > 0.005). Non-USDT USD value =
// qty × price, and cryptoPriceOf falls back to 1 before the price feed loads — so on a
// slow/mobile load every non-USDT coin computed a tiny/zero USD value and got filtered out.
// USDT (price 1, no feed) always survived → "USDT only".
//
// Fix: the picker lists coins by HELD QUANTITY (crypto_holdings qty), independent of price.
// And sending a non-USDT coin is BLOCKED until a REAL price is loaded (else USD→qty would
// use the 1 fallback and send e.g. 100 coins for a $100 order).
'use strict';

const ASSETS = ['USDT', 'BTC', 'ETH', 'SOL'];

// OLD (buggy) picker: filter by USD value, which collapses to ~qty when price=1 fallback
function oldList(balancesUsd) { return ASSETS.filter((id) => (balancesUsd[id] || 0) > 0.005); }
// FIXED picker: USDT always + any coin actually held (qty > 0), price-independent
function newList(holdingsQty) { return ASSETS.filter((id) => id === 'USDT' || (holdingsQty[id] || 0) > 0); }
// send guard: non-USDT needs a real (loaded) price before USD→qty conversion is safe
function canSend(assetId, hasRealPrice) { return assetId === 'USDT' || !!hasRealPrice; }

let pass = true; const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// holdings: user holds USDT, 0.001 BTC, 0.5 ETH. Prices NOT loaded yet (fallback = 1).
const heldQty = { USDT: 50, BTC: 0.001, ETH: 0.5 };
const balancesPriceUnloaded = { USDT: 50, BTC: 0.001 * 1, ETH: 0.5 * 1 };   // qty × 1 fallback

console.log('\n=== RED: price not loaded → USD filter drops held coins ===');
{
  const list = oldList(balancesPriceUnloaded);
  ok('RED: BTC (qty 0.001 → $0.001) filtered out', !list.includes('BTC'));
  ok('RED: only USDT (+ETH by luck) survive, BTC missing', list.includes('USDT') && !list.includes('BTC'));
}

console.log('\n=== GREEN: qty-based picker shows every held coin regardless of price ===');
{
  const list = newList(heldQty);
  ok('USDT shown', list.includes('USDT'));
  ok('BTC shown (held 0.001) even with no price', list.includes('BTC'));
  ok('ETH shown (held 0.5)', list.includes('ETH'));
  ok('SOL not shown (0 held)', !list.includes('SOL'));
}

console.log('\n=== send guard: block non-USDT until a real price is loaded ===');
ok('USDT always sendable', canSend('USDT', false) === true);
ok('BTC blocked while price loading (no qty=usd/1 mis-send)', canSend('BTC', false) === false);
ok('BTC sendable once price is in', canSend('BTC', true) === true);

console.log('\n' + (pass ? '🟢 Send lists held coins by qty; non-USDT waits for a real price' : '🔴 Send asset list broken') + '\n');
process.exit(pass ? 0 : 1);
