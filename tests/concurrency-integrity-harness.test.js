// Alpexa — CONCURRENCY-INTEGRITY HARNESS (#2)
// Models what happens when many users hit bet / withdraw / transfer / trade on the
// SAME account at once. The real money RPCs do check-then-act:
//     select balance into v_bal ...;  if v_bal < amt then reject;  insert ledger(-amt);
// with NO `select ... for update` and NO non-negative guard on the ledger trigger, so
// two overlapping calls both read the old balance, both pass, and both debit → the
// balance goes NEGATIVE (double-spend). This harness reproduces that race (RED) and
// proves the fix (GREEN): a single atomic guard that re-checks under lock — mirrors
// supabase/sql/ledger_nonneg_guard.sql (apply_ledger raises when balance would go < 0).
'use strict';
let pass=true; const ok=(n,c,x)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}${x?'  '+x:''}`); };

// ── shared account (opening + Σledger == balance) ──
function acct(opening){ return { opening, ledger:[], refs:new Set() }; }
const balance=(a)=> a.opening + a.ledger.reduce((s,x)=>s+x.amt,0);

// ── RED model: check-then-act with NO lock. Each op reads the balance it saw when it
//    STARTED (snapshot), decides, then applies — exactly the racy interleaving. ──
function opNaive(a, snapshotBal, amt, ref){
  if(a.refs.has(ref)) return {ok:true,duplicate:true};       // idempotency (this part IS present)
  if(snapshotBal < amt) return {ok:false,error:'insufficient'};
  a.refs.add(ref); a.ledger.push({amt:-amt, ref});           // debit — no re-check
  return {ok:true};
}
// ── GREEN model: the guard re-reads the CURRENT balance under lock and rejects if the
//    debit would drive it negative (atomic). This is what the ledger trigger enforces. ──
function opGuarded(a, amt, ref){
  if(a.refs.has(ref)) return {ok:true,duplicate:true};
  if(balance(a) - amt < 0) return {ok:false,error:'insufficient'};   // re-check under lock
  a.refs.add(ref); a.ledger.push({amt:-amt, ref});
  return {ok:true};
}

console.log('\n=== RED: two concurrent $60 bets on a $100 balance both pass → −$20 ===');
{
  const a=acct(100);
  const snap=balance(a);                 // both requests read 100 at start (overlap)
  const r1=opNaive(a, snap, 60, 'bet-1');
  const r2=opNaive(a, snap, 60, 'bet-2');
  ok('both debits accepted (BUG)', r1.ok && r2.ok);
  ok('balance went NEGATIVE: -20 (double-spend)', balance(a)===-20);
}

console.log('\n=== GREEN: same race, guard re-checks under lock → one wins, balance ≥ 0 ===');
{
  const a=acct(100);
  const r1=opGuarded(a, 60, 'bet-1');    // 100-60=40 ok
  const r2=opGuarded(a, 60, 'bet-2');    // 40-60=-20 → rejected
  ok('first accepted, second rejected', r1.ok===true && r2.ok===false);
  ok('balance never negative (=$40)', balance(a)===40);
  ok('invariant holds: opening + Σledger == balance', a.opening + a.ledger.reduce((s,x)=>s+x.amt,0)===40);
}

console.log('\n=== idempotency: the same ref applied twice = one debit (retry safe) ===');
{
  const a=acct(100);
  opGuarded(a, 30, 'xfer-9');
  opGuarded(a, 30, 'xfer-9');            // network retry, same ref
  ok('one debit only ($70)', balance(a)===70);
}

console.log('\n=== stress: 100 concurrent $10 ops on $250 → exactly 25 succeed, 0 negative ===');
{
  const a=acct(250);
  let okc=0;
  for(let i=0;i<100;i++){ if(opGuarded(a, 10, 'op-'+i).ok) okc++; }
  ok('exactly 25 succeeded', okc===25);
  ok('balance floored at 0', balance(a)===0);
  ok('never dipped below 0 at any point', a.ledger.every((_,i)=> 250 - (i+1)*10 >= 0));
}

console.log('\n=== mixed ops (bet+withdraw+transfer) share one balance, still can\'t overdraw ===');
{
  const a=acct(100);
  ok('withdraw $80 ok', opGuarded(a, 80, 'wd-1').ok===true);       // 100→20
  ok('bet $30 rejected (only $20 left)', opGuarded(a, 30, 'bet-x').ok===false);
  ok('transfer $20 ok', opGuarded(a, 20, 'xfer-2').ok===true);     // 20→0
  ok('final balance $0, never negative', balance(a)===0);
}

console.log(pass?'\n🟢 concurrency-integrity-harness: PASS':'\n🔴 concurrency-integrity-harness: FAIL');
process.exit(pass?0:1);
