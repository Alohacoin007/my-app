// Alpexa — DAILY RECONCILIATION tests (mirrors supabase/sql/daily_reconciliation.sql)
// Invariant: balance == bonus(opening) + Σ(ledger) + Σ(fx settlement pnl). TWO triggers
// write balance — apply_ledger (ledger) and apply_settlement_to_balance (settlements.pnl,
// server='fx' only; fx_close banks FX P&L via settlements, not the ledger). A mismatch =
// a balance written outside BOTH paths (bug/tamper) or a missing row. Read-only: the daily
// script flags drift and never touches a balance.
'use strict';
let pass=true; const ok=(n,c,x)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}${x?'  '+x:''}`); };
const R=(x)=>Math.round(x*100)/100;

// model one account: opening(bonus) + Σledger + Σfxpnl → expected balance
const expectOf=(a)=> R(a.bonus + a.ledger.reduce((s,x)=>s+x,0) + (a.fxpnl||[]).reduce((s,x)=>s+x,0));
function reconcile(accts, tol=0.01){
  return accts
    .map(a=>{ const expected=expectOf(a); return {acct:a.acct, bal:R(a.bal), expected, diff:R(a.bal-expected)}; })
    .filter(r=>Math.abs(r.diff)>tol);
}
const totals=(accts)=>({ tb:R(accts.reduce((s,a)=>s+a.bal,0)), te:R(accts.reduce((s,a)=>s+expectOf(a),0)) });

console.log('\n=== GREEN: clean book — every balance == bonus + Σledger → 0 mismatches ===');
{
  const accts=[
    { acct:'SP-1', bonus:100, ledger:[-60, 34.29], bal:74.29 },   // bet stake + payout (ledger)
    { acct:'SP-2', bonus:100, ledger:[], bal:100 },               // fresh signup
    // FX account with deposits (ledger) AND trading P&L banked via settlements (server='fx').
    // This is the FX-288741 shape that a ledger-only recon WRONGLY flagged.
    { acct:'FX-1', bonus:100, ledger:[3700000], fxpnl:[5000, 2382.87], bal:3707482.87 },
  ];
  ok('per-account mismatches: 0 (FX trading P&L via settlements counted)', reconcile(accts).length===0);
  const {tb,te}=totals(accts);
  ok('global Σbalance == Σexpected ('+tb+')', tb===te);
  ok('the FX-288741 case reconciles clean (was a false positive)', reconcile([accts[2]]).length===0);
}

console.log('\n=== RED→GREEN: a balance written OUTSIDE the ledger is caught ===');
{
  // SP-9 was tampered: balance shows 1000 but bonus+ledger only justify 100
  const accts=[ { acct:'SP-9', bonus:100, ledger:[-60,34.29], bal:1000 } ];
  const m=reconcile(accts);
  ok('drift detected (1 offender)', m.length===1);
  ok('reports exact gap: bal 1000 vs expected 74.29 → +925.71', m[0].expected===74.29 && m[0].diff===925.71);
  const {tb,te}=totals(accts);
  ok('global total also off (raises warning)', Math.abs(tb-te)>0.01);
}

console.log('\n=== catches a MISSING ledger row (deleted after applying) ===');
{
  // balance was correctly 74.29 (bonus 100 −60 +34.29) but the −60 bet row vanished
  const accts=[ { acct:'SP-3', bonus:100, ledger:[34.29], bal:74.29 } ];  // ledger now short one row
  ok('missing −60 row → drift −60 flagged', reconcile(accts)[0].diff===-60);
}

console.log('\n=== tolerance: sub-cent rounding noise is NOT flagged ===');
{
  const accts=[ { acct:'SP-4', bonus:100, ledger:[-0.004], bal:99.996 } ];  // rounds to 100.00 vs 100.00
  ok('0.004 noise within 1-cent tolerance → 0 mismatches', reconcile(accts).length===0);
}

console.log(pass?'\n🟢 daily-reconciliation: PASS':'\n🔴 daily-reconciliation: FAIL');
process.exit(pass?0:1);
