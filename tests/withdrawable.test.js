// Alpexa — withdrawable-amount rule + auto-reject (RED→GREEN).
// Rule (sports/fx, balance-backed): withdrawable = max(0, balance − welcomeBonus).
// The welcome bonus (house money) can never be withdrawn; deposits + winnings can.
// A withdrawal request is AUTO-REJECTED server-side if amount > withdrawable.
'use strict';
const round2 = x => Math.round(x*100)/100;

function withdrawable(balance, bonus){ return Math.max(0, round2((+balance||0) - (+bonus||0))); }
// server guard: returns {ok} — mirrors what withdraw_hold / the FX guard must enforce
function tryWithdraw(balance, bonus, amount){
  const w = withdrawable(balance, bonus);
  if (amount > w + 1e-9) return { ok:false, error:'exceeds withdrawable', withdrawable:w };
  return { ok:true };
}

let pass=true; const ok=(n,c)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };

console.log('\n=== withdrawable = max(0, balance − bonus) ===');
ok('only bonus ($100 bal, $100 bonus) → withdrawable $0', withdrawable(100,100)===0);
ok('deposited $200 (bal $300, bonus $100) → withdrawable $200', withdrawable(300,100)===200);
ok('won (bal $800, bonus $100) → withdrawable $700 (deposit+winnings)', withdrawable(800,100)===700);
ok('lost into bonus (bal $50, bonus $100) → withdrawable $0 (never negative)', withdrawable(50,100)===0);
ok('crypto (bonus $0, bal $13 spendable) → withdrawable $13', withdrawable(13,0)===13);

console.log('\n=== auto-reject: amount > withdrawable is refused ===');
ok('RED→GREEN: withdraw $300 from $300 bal/$100 bonus (incl. bonus) → REJECTED', tryWithdraw(300,100,300).ok===false);
ok('withdraw $200 (= deposit) from same → ALLOWED', tryWithdraw(300,100,200).ok===true);
ok('withdraw $50 when only bonus ($100 bal) → REJECTED', tryWithdraw(100,100,50).ok===false);
ok('withdraw exactly the withdrawable ($700 of $800/$100) → ALLOWED', tryWithdraw(800,100,700).ok===true);
ok('withdraw $700.01 (1c over) → REJECTED', tryWithdraw(800,100,700.01).ok===false);

console.log('\n=== the abuse this blocks ===');
ok('signup, deposit \$0, get \$100 bonus, try to cash out \$100 → BLOCKED', tryWithdraw(100,100,100).ok===false);

console.log('\n' + (pass?'🟢 withdrawable rule + auto-reject proven':'🔴 rule wrong')+'\n');
process.exit(pass?0:1);
