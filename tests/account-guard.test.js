// Alpexa — multi-account cache bleed: opening a 2nd account in the same browser
// shared localStorage so account A's balance/bets showed under account B. The apps
// now stamp a cacheOwner and wipe stale cache on mismatch. Mirrors that decision.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// The guard decision: should we wipe the cached money/state for this load?
function shouldWipe(cacheOwner, currentCust) {
  return !!(currentCust && cacheOwner && cacheOwner !== currentCust);
}

console.log('\n=== RED: account B sees account A cache ===');
ok('owner A, now B → WIPE (no bleed)', shouldWipe('P-1000', 'P-2000') === true);

console.log('\n=== GREEN: legit cases keep cache ===');
ok('same account → keep', shouldWipe('P-1000', 'P-1000') === false);
ok('first load (no owner stamp) → keep (login/signup just seeded it)', shouldWipe('', 'P-2000') === false);
ok('no logged-in account → keep (nothing to guard)', shouldWipe('P-1000', '') === false);

console.log('\n' + (pass ? '🟢 account guard wipes only on a real account switch' : '🔴 guard wrong') + '\n');
process.exit(pass ? 0 : 1);
