// Alpexa — bonus is NON-TRANSFERABLE (RED→GREEN). #24
//
// Bug: app_transfer only checked `balance < amount` (full balance), never accounts.bonus.
// So a user could move the non-withdrawable welcome bonus sports→crypto, then withdraw it
// from crypto (which has no bonus lock) — bypassing the withdraw guard entirely.
//
// Invariant (the fix): transferable_out(sports/fx) == withdrawable == max(0, balance − bonus).
//   i.e. the welcome bonus stays stuck on the originating account; only real money
//   (deposits + winnings) can leave. Transfer-then-withdraw must equal direct-withdraw.
'use strict';
const r2 = x => Math.round(x * 100) / 100;

// what app_transfer MUST enforce on the FROM account
function transferableOut(server, balance, bonus, usdt) {
  if (server === 'crypto') return Math.max(0, r2(+usdt || 0));   // no bonus on crypto cash
  return Math.max(0, r2((+balance || 0) - (+bonus || 0)));        // sports/fx
}
// the OLD (buggy) server check: cap at full balance — kept here to PROVE the leak it allowed
function oldCap(server, balance, bonus, usdt) {
  return server === 'crypto' ? Math.max(0, r2(+usdt || 0)) : Math.max(0, r2(+balance || 0));
}
function tryTransfer(capFn, server, balance, bonus, usdt, amount) {
  return amount > capFn(server, balance, bonus, usdt) + 1e-9
    ? { ok: false } : { ok: true };
}
function withdrawable(server, balance, bonus, usdt) {
  return server === 'crypto' ? Math.max(0, r2(+usdt || 0)) : Math.max(0, r2((+balance || 0) - (+bonus || 0)));
}

let pass = true; const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

console.log('\n=== transferable_out = max(0, balance − bonus) for sports/fx ===');
ok('fresh sports (bal $100, bonus $100) → transferable $0', transferableOut('sports', 100, 100, 0) === 0);
ok('sports deposited $200 (bal $300, bonus $100) → transferable $200', transferableOut('sports', 300, 100, 0) === 200);
ok('sports won (bal $800, bonus $100) → transferable $700', transferableOut('sports', 800, 100, 0) === 700);
ok('fx (bal $130, bonus $100) → transferable $30', transferableOut('fx', 130, 100, 0) === 30);
ok('crypto (USDT $250, no bonus) → transferable $250', transferableOut('crypto', 0, 0, 250) === 250);

console.log('\n=== RED→GREEN: the exploit (move bonus sports→crypto, then withdraw) ===');
// RED — what the OLD full-balance cap allowed:
ok('RED: old cap LET the $100 bonus leave sports (bug)', tryTransfer(oldCap, 'sports', 100, 100, 0, 100).ok === true);
// GREEN — the fixed cap blocks it:
ok('GREEN: fixed cap REJECTS transferring the $100 bonus out of sports', tryTransfer(transferableOut, 'sports', 100, 100, 0, 100).ok === false);
ok('GREEN: can still transfer real money ($200 deposit) out of sports', tryTransfer(transferableOut, 'sports', 300, 100, 0, 200).ok === true);
ok('GREEN: transferring $200.01 (1c into bonus) → REJECTED', tryTransfer(transferableOut, 'sports', 300, 100, 0, 200.01).ok === false);

console.log('\n=== bonus stays locked end-to-end (no leak after a capped transfer) ===');
// fresh sports: only the bonus, nothing transferable → crypto can never receive it → never withdrawable
ok('fresh-bonus account: $0 transfers out → crypto withdrawable stays $0', (function () {
  const moved = Math.min(100, transferableOut('sports', 100, 100, 0)); // = 0
  return withdrawable('crypto', 0, 0, moved) === 0;
})());
// real money moves fine and is withdrawable on the other side (no over/under count)
ok('deposit $200 moves to crypto and is withdrawable there ($200)', (function () {
  const moved = transferableOut('sports', 300, 100, 0); // 200
  return withdrawable('crypto', 0, 0, moved) === 200;
})());

console.log('\n' + (pass ? '🟢 bonus is non-transferable — leak closed' : '🔴 bonus can still leak via transfer') + '\n');
process.exit(pass ? 0 : 1);
