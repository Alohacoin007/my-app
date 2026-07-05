// Alpexa — withdraw guard lower-bound regression test.
// Models supabase/sql/withdraw_guard.sql guard_withdraw_request(): a withdraw
// request is rejected unless 0 < amount <= withdrawable. Zero/negative/missing
// amounts are rejected up front; NaN/Infinity fail the upper bound (in Postgres
// they compare greater than any finite withdrawable).
//
// Run: node tests/withdraw-lowerbound.test.js
'use strict';

// Faithful port of the trigger's amount checks (type='withdraw').
// `pending` = sum of already-pending withdrawals for this account (default 0).
function guard(amount, withdrawable, pending) {
  pending = pending || 0;
  // LOWER bound (null / <=0). null models SQL NULL.
  if (amount === null || amount === undefined || amount <= 0) {
    return { ok: false, error: 'Withdrawal amount must be greater than zero.' };
  }
  // UPPER bound includes pending. NaN/Infinity: mirror Postgres where they compare
  // greater than any finite withdrawable → rejected. Treat non-finite as over.
  if (!Number.isFinite(amount) || amount + pending > withdrawable + 0.001) {
    return { ok: false, error: 'Amount exceeds your withdrawable balance' };
  }
  return { ok: true };
}

let pass = true;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}

const W = 500; // withdrawable

console.log('\n=== LOWER bound: zero / negative / missing rejected ===');
check('amount 0 → rejected',        guard(0, W).ok, false);
check('amount -100 → rejected',     guard(-100, W).ok, false);
check('amount null → rejected',     guard(null, W).ok, false);

console.log('\n=== Non-finite rejected (NaN/Infinity fail upper bound like Postgres) ===');
check('amount NaN → rejected',      guard(NaN, W).ok, false);
check('amount Infinity → rejected', guard(Infinity, W).ok, false);

console.log('\n=== Valid range accepted; over-withdrawable rejected ===');
check('amount 0.01 → allowed',      guard(0.01, W).ok, true);
check('amount == withdrawable → allowed', guard(500, W).ok, true);
check('amount > withdrawable → rejected', guard(500.02, W).ok, false);

console.log('\n=== Pending-stack: new request + already-pending must fit withdrawable ===');
check('300 with 0 pending → allowed',       guard(300, W, 0).ok, true);
check('300 with 250 pending → rejected (>500)', guard(300, W, 250).ok, false);
check('300 with 200 pending → allowed (==500)', guard(300, W, 200).ok, true);
check('1 with 500 pending → rejected (fully committed)', guard(1, W, 500).ok, false);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);
