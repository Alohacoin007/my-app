// Alpexa — settlements money-printing regression (마스터감사 CRITICAL, 2026-07-05).
// Models the combined effect of trg_settlement_balance (apply_settlement_to_balance)
// + the settlements INSERT policy in supabase/sql/rls_money_lockdown.sql.
//
// INVARIANT: FX P&L is banked ONLY by the fx_close RPC (server). A client-authored
// fx settlement is UNREPRESENTABLE — the INSERT policy refuses it, so the balance
// trigger never sees it.
//
// RED  — pre-lockdown: settlements INSERT open to any authenticated client, and the
//        trigger banks pnl for ANY server='fx' row → a client mints balance.
// GREEN— post-lockdown: the policy refuses client fx inserts; only the RPC (which
//        bypasses RLS) can insert fx rows and bank P&L. Non-fx history unaffected.
//
// Run: node tests/settlements-rls.test.js
'use strict';

// The balance trigger, verbatim in behaviour: an fx row with pnl moves balance.
function triggerBanksPnl(row) {
  return row.server === 'fx' && !!row.acct_no && row.pnl != null;
}

// INSERT policy with_check from rls_money_lockdown.sql.
// ctx: 'client-anon' | 'client-auth' | 'admin' | 'rpc' (fx_close, SECURITY DEFINER → bypasses RLS)
function insertAllowed(ctx, row) {
  if (ctx === 'rpc') return true;               // SECURITY DEFINER / BYPASSRLS
  if (ctx === 'client-anon') return false;      // settlements_ins is TO authenticated
  const isAdmin = ctx === 'admin';
  return isAdmin || (row.server || '') !== 'fx'; // with check: is_admin() OR server<>'fx'
}

// End-to-end: does this attempted insert end up minting balance?
function mints(ctx, row) {
  return insertAllowed(ctx, row) && triggerBanksPnl(row);
}

let pass = true;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}

const ATTACK = { server: 'fx', acct_no: 'FX-VICTIM', pnl: 1000000 };

console.log('\n=== RED — the OPEN pre-lockdown policy let a client mint balance ===');
// Pre-lockdown behaviour: authenticated client insert was allowed for ANY row.
function insertAllowed_OLD(ctx) { return ctx !== 'client-anon'; }
check('OLD: authed client inserts fx pnl=$1M → trigger banks it (MINT)',
  insertAllowed_OLD('client-auth') && triggerBanksPnl(ATTACK), true);

console.log('\n=== GREEN — lockdown makes a client-authored fx settlement unrepresentable ===');
check('authed client fx pnl=$1M → refused (no mint)',   mints('client-auth', ATTACK), false);
check('anon client fx pnl=$1M → refused (no mint)',     mints('client-anon', ATTACK), false);

console.log('\n=== GREEN — the legitimate FX path still banks P&L ===');
check('fx_close RPC inserts fx pnl → banks it',
  mints('rpc', { server: 'fx', acct_no: 'FX-OWNER', pnl: 42.5 }), true);

console.log('\n=== GREEN — non-fx client history still writes (unaffected) ===');
check('client crypto_fee settlement → allowed',
  insertAllowed('client-auth', { server: 'crypto', kind: 'crypto_fee', stake: 3, pnl: 0 }), true);
check('client sports cashout settlement → allowed',
  insertAllowed('client-auth', { server: 'sports', kind: 'bet_cashout', pnl: 12 }), true);
check('...and a sports/crypto row never banks fx balance anyway',
  triggerBanksPnl({ server: 'crypto', pnl: 500, acct_no: 'X' }), false);

console.log('\n=== GREEN — admin (back office) may still write fx (corrections) ===');
check('admin fx insert → allowed', insertAllowed('admin', ATTACK), true);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);
