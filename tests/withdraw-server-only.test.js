// Alpexa — sports withdrawal must debit SERVER-SIDE (RED proof of skippable hold).
// Old client flow: pushRequest(req) THEN `balance-=v` (a client ledger delta).
// A modified client can create the withdrawal request but SKIP the debit → the
// back office later pays out while the user's balance was never reduced.
// withdraw_hold RPC creates the request AND debits in ONE atomic server tx.
'use strict';

// ---- mock server: accounts.balance + requests + ledger(idempotent ref) ----
function server(){
  const s={ balance:100, requests:[], ledger:[] };
  s.applyLedger=(amount,ref)=>{ if(s.ledger.some(l=>l.ref===ref))return; s.ledger.push({amount,ref}); s.balance=Math.round((s.balance+amount)*100)/100; };
  // server RPC: atomic check + request + debit
  s.withdraw_hold=(id,amount)=>{
    if(s.balance < amount) return {ok:false,error:'insufficient'};
    s.requests.push({id,amount,status:'pending'});
    s.applyLedger(-amount, 'wdhold-'+id);
    return {ok:true};
  };
  // back office pays out an approved/pending withdrawal request
  s.payout=(id)=>{ const r=s.requests.find(x=>x.id===id); return r?r.amount:0; };
  return s;
}

let pass=true; const ok=(n,c)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };

console.log('\n=== RED: malicious client creates the request but SKIPS the debit ===');
{
  const s=server();
  // attacker: push a pending withdraw request directly, do NOT debit
  s.requests.push({id:'w1',amount:50,status:'pending'});
  // (client "forgot" balance-=50)
  const paid=s.payout('w1');
  console.log('   balance =', s.balance, ' paid out =', paid);
  ok('EXPLOIT: $50 withdrawable while balance stayed $100 (free money)', s.balance===100 && paid===50);
}

console.log('\n=== GREEN: withdraw via withdraw_hold RPC (atomic server debit) ===');
{
  const s=server();
  const res=s.withdraw_hold('w1',50);
  const paid=s.payout('w1');
  console.log('   rpc =', JSON.stringify(res), ' balance =', s.balance, ' paid out =', paid);
  ok('request and debit are atomic — balance dropped to $50', res.ok && s.balance===50);
  ok('payout $50 matches the $50 debited (house not down)', paid===50 && s.balance===50);
  // idempotent: a retried RPC can't double-debit
  s.withdraw_hold('w1',50);  // duplicate ref → no-op
  ok('idempotent: retry does not double-debit (still $50)', s.balance===50);
}

console.log('\n=== GREEN: server rejects a withdraw that exceeds balance ===');
{
  const s=server();
  const res=s.withdraw_hold('w2',150);
  ok('over-balance withdraw refused server-side', res.ok===false && s.balance===100);
}

console.log('\n' + (pass?'🟢 RED reproduces skippable hold; GREEN = atomic server debit closes it':'🔴 model wrong')+'\n');
process.exit(pass?0:1);
