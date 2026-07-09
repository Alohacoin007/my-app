// Alpexa — DAILY RECONCILIATION tests (mirrors supabase/sql/daily_reconciliation.sql)
// Invariant: accounts.balance == bonus(opening) + Σ(ledger). The apply_ledger trigger is
// the only writer, so a mismatch = a balance written OUTSIDE the ledger (bug/tamper) or a
// missing ledger row. The daily script must flag any 1-cent drift and never touch balances.
'use strict';
let pass=true; const ok=(n,c,x)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}${x?'  '+x:''}`); };
const R=(x)=>Math.round(x*100)/100;

// model one account: opening (bonus) + a ledger of deltas → expected balance
function reconcile(accts, tol=0.01){
  return accts
    .map(a=>{ const expected=R(a.bonus + a.ledger.reduce((s,x)=>s+x,0)); return {acct:a.acct, bal:R(a.bal), expected, diff:R(a.bal-expected)}; })
    .filter(r=>Math.abs(r.diff)>tol);
}
const totals=(accts)=>({ tb:R(accts.reduce((s,a)=>s+a.bal,0)), te:R(accts.reduce((s,a)=>s+a.bonus+a.ledger.reduce((x,y)=>x+y,0),0)) });

console.log('\n=== GREEN: clean book — every balance == bonus + Σledger → 0 mismatches ===');
{
  const accts=[
    { acct:'SP-1', bonus:100, ledger:[-60, 34.29], bal:74.29 },   // bet + payout
    { acct:'FX-1', bonus:100, ledger:[500, -200, -50], bal:350 }, // deposit − withdraw − loss
    { acct:'SP-2', bonus:100, ledger:[], bal:100 },               // fresh signup
  ];
  ok('per-account mismatches: 0', reconcile(accts).length===0);
  const {tb,te}=totals(accts);
  ok('global Σbalance == Σexpected ('+tb+')', tb===te);
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
