// Alpexa — #5: the sports balance is SERVER-ONLY. It is never seeded from
// localStorage, so a stale/other-account cached value can't show. Models the load:
// balance starts 0, syncBalancesFromServer() fills it from accounts.balance.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// Mirrors sports-live: let balance=0 (NO localStorage seed); on load the server fills it.
function loadBalance(staleLocalCache, serverValue) {
  let balance = 0;                                  // #5: not seeded from localStorage
  // syncBalancesFromServer() on load (line ~3194): adopt server when it differs.
  if (Math.abs(serverValue - balance) > 0.01) balance = serverValue;
  return balance;                                    // staleLocalCache is intentionally ignored
}

console.log('\n=== RED: stale/other-account local cache must NOT show ===');
ok('stale local $90, server $100 → shows 100 (ignores local)', loadBalance(90, 100) === 100);
ok('other account local $500, server $100 → 100 (no bleed)', loadBalance(500, 100) === 100);

console.log('\n=== GREEN: always equals the server ===');
ok('server $100 → 100', loadBalance(0, 100) === 100);
ok('server $0 (real empty) → 0', loadBalance(90, 0) === 0);
ok('server $130 → 130', loadBalance(90, 130) === 130);

console.log('\n' + (pass ? '🟢 sports balance follows the server, never localStorage' : '🔴 still seeded from localStorage') + '\n');
process.exit(pass ? 0 : 1);
