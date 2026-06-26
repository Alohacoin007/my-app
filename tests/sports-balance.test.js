// Alpexa — sports balance regression test (no app code imported; faithful model
// of the EXACT client/server money flow in sports-live.html + the ledger trigger).
// Proves the bet double-debit bug and that rebasing the delta baseline fixes it.
//
// Run: node tests/sports-balance.test.js
'use strict';

function round2(x){ return Math.round(x*100)/100; }

// ---- mock SERVER (Supabase): accounts.balance + ledger; trg_apply_ledger adds each row to balance ----
function makeServer(opening){
  const s = { balance: opening, ledger: [] };
  s.applyLedger = (kind, amount, ref) => { s.ledger.push({kind, amount, ref}); s.balance = round2(s.balance + amount); };
  // place_bet RPC: server atomically debits the stake via a ledger row, returns new balance
  s.place_bet = (stake, ref) => { s.applyLedger('bet', -stake, ref); return s.balance; };
  return s;
}

// ---- CLIENT (sports-live.html), faithful to the real code paths ----
// FIX=false  -> current-broken behavior (adopt sets `balance` but NOT __sbLastPushed)
// FIX=true   -> rebase the delta baseline on adopt (the pushed fix)
function makeClient(server, FIX){
  let balance = server.balance;        // line 2420 seed
  let lastPushed = balance;            // line 2421 __sbLastPushed baseline
  let n = 0;
  const ledgerPost = (kind, amount) => server.applyLedger(kind, amount, 's'+(++n)); // line 2219/2223
  // syncSportsBal: post ONLY the delta since last sync (lines 2425-2430)
  const syncSportsBal = () => {
    const d = round2(balance - lastPushed);
    if (Math.abs(d) >= 0.005){ lastPushed = balance; ledgerPost('sports_app', d); }
  };
  // periodic syncBalancesFromServer adopt (line 3166) — ALWAYS rebases baseline (this one was correct)
  const adoptFromServer = () => { balance = server.balance; lastPushed = server.balance; };
  // bet placement: place_bet RPC debits, client adopts (line 1978), then updateWallet()->syncSportsBal (1984)
  const placeBet = (stake) => {
    const newBal = server.place_bet(stake, 'betstake-b'+(++n));   // server debits once
    balance = newBal;                       // adopt (line 1978)
    if (FIX) lastPushed = balance;          // <-- THE FIX: rebase baseline in lockstep
    syncSportsBal();                        // updateWallet -> syncSportsBal (phantom delta if baseline stale)
  };
  return { placeBet, adoptFromServer, get balance(){ return balance; } };
}

// ---- scenario: $100 opening, place 3x $10 bets (with the 10s poll adopting between bets, as in reality) ----
function run(FIX){
  const server = makeServer(100);
  const client = makeClient(server, FIX);
  for (let i=0;i<3;i++){ client.placeBet(10); client.adoptFromServer(); }
  return server;
}

function summarize(server){
  return server.ledger.map(r => `${r.kind} ${r.amount}`);
}

let pass = true;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if(!ok) pass = false;
  console.log(`${ok?'  ✅':'  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}

console.log('\n=== RED: current behavior (no baseline rebase) — should REPRODUCE the production bug ===');
const bug = run(false);
console.log('   ledger rows:', summarize(bug));
console.log('   balance    :', bug.balance);
// must match the EXACT production ledger the owner showed (3x bet -10, each followed by sports_app -10) and $40
check('reproduces prod ledger (6 rows, alternating)', summarize(bug),
      ['bet -10','sports_app -10','bet -10','sports_app -10','bet -10','sports_app -10']);
check('reproduces prod balance $40 (should be $70)', bug.balance, 40);

console.log('\n=== GREEN: with the fix (rebase baseline on adopt) — single debit per bet ===');
const fixed = run(true);
console.log('   ledger rows:', summarize(fixed));
console.log('   balance    :', fixed.balance);
check('only 3 legit bet debits, NO phantom sports_app', summarize(fixed), ['bet -10','bet -10','bet -10']);
check('correct balance $70 (100 - 3x$10)', fixed.balance, 70);

// INVARIANT: balance == opening + sum(ledger), and money moves exactly once per bet
const sum = fixed.ledger.reduce((a,r)=>round2(a+r.amount),0);
check('invariant: balance == opening + Σledger', fixed.balance, round2(100 + sum));

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);
