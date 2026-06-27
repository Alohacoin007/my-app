// Alpexa — a settled bet's DISPLAYED result must reflect the MONEY outcome.
// The server grades a single moneyline push as "won" (!anyLost), but payout == stake
// (no profit) → it's a PUSH/REFUND, and must NOT show "Won" to the customer.
// Mirrors the dispRes rule in sports-live.html (ticket renderer).
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// EXACT copy of the client rule.
function dispRes(b, isOpen) {
  if (isOpen) return 'open';
  if (b.result === 'won' && (+b.payout || 0) <= (+b.stake || 0) + 0.001) return 'refunded';
  return b.result;
}

console.log('\n=== RED: single push was showing "Won" ===');
// Saudi Arabia ML push: stake 20, payout 20 (stake back), server result "won".
ok('single push (payout==stake) → refunded, NOT won', dispRes({ result: 'won', payout: 20, stake: 20 }) === 'refunded');

console.log('\n=== GREEN: money-true outcomes ===');
ok('real win (payout 38 > stake 20) → won', dispRes({ result: 'won', payout: 38, stake: 20 }) === 'won');
ok('parlay won leg + push leg (payout 34 > 20) → won', dispRes({ result: 'won', payout: 34, stake: 20 }) === 'won');
ok('loss (payout 0) → lost', dispRes({ result: 'lost', payout: 0, stake: 20 }) === 'lost');
ok('cashed out → cashed (untouched)', dispRes({ result: 'cashed', payout: 15, stake: 20 }) === 'cashed');
ok('open bet → open (untouched)', dispRes({ result: 'won', payout: 20, stake: 20 }, true) === 'open');
ok('tiny float slack: payout 20.0009 ~ stake 20 → refunded', dispRes({ result: 'won', payout: 20.0009, stake: 20 }) === 'refunded');
ok('payout just over stake (20.5) → won', dispRes({ result: 'won', payout: 20.5, stake: 20 }) === 'won');

console.log('\n' + (pass ? '🟢 settled-bet badge follows the money (push≠win)' : '🔴 display mismatch') + '\n');
process.exit(pass ? 0 : 1);
