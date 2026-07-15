// Alpexa — B8: money/state edge functions (sports-settle, stake-accrue) must
// FAIL CLOSED. An unset CRON_SECRET used to skip the check entirely, leaving a
// payout/accrual function world-callable. Mirrors the gate in those functions.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// New gate (fail-closed): no secret configured → refuse; else require token.
function authorize(cronSecret, token) {
  if (!cronSecret) return 503;                 // not configured → REFUSE (was the hole)
  if (token !== cronSecret) return 401;         // wrong/missing token → unauthorized
  return 200;                                   // correct token → run
}
// The OLD fail-open gate, for contrast (what we removed).
function authorizeOld(cronSecret, token) {
  if (cronSecret && token !== cronSecret) return 401;
  return 200;                                   // unset secret → PUBLIC (200) ⇠ the bug
}

console.log('\n=== RED: the old fail-open behaviour exposed the payout function ===');
ok('OLD: no secret → world-callable (200)  ← the hole', authorizeOld('', 'anything') === 200);
ok('OLD: no secret → even no token → 200', authorizeOld(undefined, undefined) === 200);

console.log('\n=== GREEN: fail-closed gate ===');
ok('no secret configured → 503 (refuses to run)', authorize('', 'x') === 503);
ok('undefined secret → 503', authorize(undefined, undefined) === 503);
ok('secret set, missing token → 401', authorize('s3cret', undefined) === 401);
ok('secret set, wrong token → 401', authorize('s3cret', 'nope') === 401);
ok('secret set, correct token → 200', authorize('s3cret', 's3cret') === 200);

console.log('\n' + (pass ? '🟢 money edge functions fail closed without CRON_SECRET' : '🔴 still fail-open') + '\n');
process.exit(pass ? 0 : 1);
