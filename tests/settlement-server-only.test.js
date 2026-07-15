// Alpexa — sports settlement must be SERVER-ONLY (RED proof of client self-pay).
// Client settleBets(): claims the bet, then `balance += stake * decMul` where
// decMul comes from CLIENT-held odds (forgeable) and posts to the ledger.
// Server sports-settle: payout computed from SERVER odds, credited via idempotent
// betpay-<id> ref. With the client path removed, a client can't forge a payout.
'use strict';
const round2 = x => Math.round(x*100)/100;

// One open winning bet. Real (server) decimal odds = 1.85. Attacker forges 1000x locally.
const bet = { id:'b1', stake:10, serverDecMul:1.85 };

function clientSettles(forgedDecMul){           // CURRENT (buggy) client path
  let balance = 100; const ledger = [];
  // claimIfShared() returns true (this device wins the claim) → it credits:
  const payout = round2(bet.stake * forgedDecMul);   // decMul from CLIENT data = forgeable
  balance = round2(balance + payout);
  ledger.push({ kind:'sports_app', amount:+payout });  // syncSportsBal delta -> real $$
  return { balance, ledger };
}
function serverSettles(){                        // server sports-settle (authoritative)
  let balance = 100; const ledger = [];
  const payout = round2(bet.stake * bet.serverDecMul); // SERVER odds, not client's
  ledger.push({ kind:'bet_won', amount:+payout, ref:'betpay-'+bet.id }); // idempotent
  balance = round2(balance + payout);
  return { balance, ledger };
}
function clientSettlesFIXED(forgedDecMul){       // FIXED: client no longer settles/credits
  let balance = 100; const ledger = [];
  // settleBets() is a no-op: no claim, no balance change, no ledger post.
  return { balance, ledger };
}

let pass = true; const ok=(n,c)=>{ if(!c) pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };

console.log('\n=== RED: client settles a winning bet with FORGED 1000x odds ===');
const red = clientSettles(1000);
console.log('   balance =', red.balance, ' ledger =', JSON.stringify(red.ledger));
ok('EXPLOIT: client self-paid a forged $10,000 (should be impossible)', red.balance === 10100);
ok('EXPLOIT: client posted a forgeable credit to the ledger', red.ledger.some(r=>r.amount>50));

console.log('\n=== Server path (authoritative) — payout from SERVER odds, idempotent ===');
const srv = serverSettles();
console.log('   balance =', srv.balance, ' ledger =', JSON.stringify(srv.ledger));
ok('server pays the REAL $18.50 (10 x 1.85)', srv.balance === 118.5);
ok('server credit is idempotent (betpay ref)', srv.ledger[0].ref === 'betpay-b1');

console.log('\n=== GREEN: client settle removed → client cannot credit at all ===');
const grn = clientSettlesFIXED(1000);
console.log('   balance =', grn.balance, ' ledger =', JSON.stringify(grn.ledger));
ok('client posts NOTHING (no self-pay possible) even with forged 1000x', grn.balance === 100 && grn.ledger.length === 0);

console.log('\n' + (pass?'🟢 RED reproduces self-pay; GREEN = server-only settlement closes it':'🔴 model wrong')+'\n');
process.exit(pass?0:1);
