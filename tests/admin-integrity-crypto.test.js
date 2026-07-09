// Alpexa — admin integrity check must SHOW crypto in the total balance but must
// NOT false-flag an admin ALPXS bonus as tampering (which would block withdrawals).
// Crypto lives in crypto_holdings (RLS-locked, admin-granted, market-priced), so
// the CASH tamper-monitor adds it to BOTH actual & explained: it appears in the
// displayed total, but the GAP still polices only FX+Sports cash.
// Mirrors manager-mobile.html acctIntegrity().
'use strict';
let pass=true; const ok=(n,c)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };
const FLAG_GAP=50000;

// cash side: opening (welcome bonus) + deposits − withdrawals + trade P&L.
// cryptoLive = live crypto_holdings value (null if not loaded); cryptoMirror =
// accounts.balance(crypto), the server mirror of the SAME holdings. Count crypto ONCE.
function integrity(cash, cryptoLive, cryptoMirror){
  const actualCash = cash.fxBal + cash.sportsBal;          // FX+Sports ONLY (crypto excluded here)
  const opening = cash.opening, dep=cash.dep, wd=cash.wd, pnl=cash.pnl;
  const crypto = (cryptoLive!=null)?cryptoLive:(cryptoMirror||0);   // never both
  const explained = opening+dep-wd+pnl+crypto;
  const actual = actualCash+crypto;
  const gap = actual-explained;
  return {actual, explained, gap, crypto, flagged: gap>FLAG_GAP};
}
// The BUG we shipped: summed accounts.balance (which INCLUDES the crypto mirror) AND
// added cryptoLive on top → crypto counted twice.
function integrityDoubleCount(cash, cryptoLive, cryptoMirror){
  const actualCash = cash.fxBal + cash.sportsBal + (cryptoMirror||0);   // mirror included here…
  const explained = cash.opening+cash.dep-cash.wd+cash.pnl+(cryptoLive||0);
  const actual = actualCash + (cryptoLive||0);                          // …and live added again
  return {actual, explained, gap:actual-explained, flagged:(actual-explained)>FLAG_GAP};
}
// OLD buggy monitor: crypto not counted at all (only accounts.balance)
function integrityOld(cash){
  const actual=cash.fxBal+cash.sportsBal;
  const explained=cash.opening+cash.dep-cash.wd+cash.pnl;
  return {actual, explained, gap:actual-explained, flagged:(actual-explained)>FLAG_GAP};
}
// NAIVE wrong fix: crypto only in actual (not explained) → false flag
function integrityNaive(cash, cryptoVal){
  const actual=cash.fxBal+cash.sportsBal+(cryptoVal||0);
  const explained=cash.opening+cash.dep-cash.wd+cash.pnl;   // forgot to add the bonus/crypto here
  return {actual, explained, gap:actual-explained, flagged:(actual-explained)>FLAG_GAP};
}

// John Fush: $100 FX + $100 Sports (both = welcome bonus opening), no deposits,
// + 50000 ALPXS admin bonus ≈ $91,087.81 crypto net worth.
const john = { fxBal:100, sportsBal:100, opening:200, dep:0, wd:0, pnl:0 };
const johnCrypto = 91087.81;

console.log('\n=== RED-1: old monitor hides the ALPXS bonus (total stuck at $200) ===');
{
  const ig=integrityOld(john);
  ok('old actual = $200, ALPXS invisible', ig.actual===200);
  ok('old not flagged (fine) but bonus not shown', ig.flagged===false);
}

console.log('\n=== RED-2: naive fix (crypto only in actual) FALSE-FLAGS the bonus → blocks withdrawals ===');
{
  const ig=integrityNaive(john, johnCrypto);
  ok('naive actual shows $91,287.81', Math.abs(ig.actual-(200+johnCrypto))<0.01);
  ok('naive gap = +$91,087.81 → 🚩 flagged (WRONG — it was a gift)', ig.flagged===true);
}

console.log('\n=== GREEN: John (unsynced, mirror $0) → live holdings shows in total, gap clean ===');
{
  const ig=integrity(john, johnCrypto, 0);   // cryptoLive loaded, mirror $0
  ok('actual total now includes ALPXS ($91,287.81)', Math.abs(ig.actual-(200+johnCrypto))<0.01);
  ok('gap = $0 (crypto self-explained)', Math.abs(ig.gap)<0.01);
  ok('NOT flagged → John\'s withdrawals are not blocked', ig.flagged===false);
}

console.log('\n=== RED-3: Debrah — mirror AND live both counted → 2× balance ($18M) + false 🚩 ===');
{
  // 5,000,010.989 ALPXS ≈ $9,101,557.79 in crypto_holdings; sync_crypto_balance mirrored
  // ~$9,100,120.10 into accounts.balance(crypto). Both counted = double.
  const debrah={ fxBal:100, sportsBal:80, opening:200, dep:0, wd:0, pnl:-20 };
  const live=9101557.79, mirror=9100120.10;
  const ig=integrityDoubleCount(debrah, live, mirror);
  ok('bug shows ~$18.2M (crypto counted twice)', ig.actual>18000000);
  ok('bug gap ~$9.1M → FALSE 🚩 (blocks withdrawals)', ig.flagged===true);
}

console.log('\n=== GREEN: Debrah — crypto counted ONCE (prefer live) → real total, gap clean ===');
{
  const debrah={ fxBal:100, sportsBal:80, opening:200, dep:0, wd:0, pnl:-20 };
  const live=9101557.79, mirror=9100120.10;
  const ig=integrity(debrah, live, mirror);
  ok('actual = FX+Sports+crypto ONCE ($9,101,737.79)', Math.abs(ig.actual-(180+live))<0.01);
  ok('gap ≈ $0 (not doubled)', Math.abs(ig.gap)<0.01);
  ok('NOT flagged → withdrawals not blocked', ig.flagged===false);
}

console.log('\n=== collapsed customer (live not loaded) → falls back to mirror, still once ===');
{
  const debrah={ fxBal:100, sportsBal:80, opening:200, dep:0, wd:0, pnl:-20 };
  const mirror=9100120.10;
  const ig=integrity(debrah, null, mirror);   // cryptoLive null → use mirror
  ok('uses mirror once (no live)', Math.abs(ig.actual-(180+mirror))<0.01);
  ok('gap clean from mirror too', Math.abs(ig.gap)<0.01);
}

console.log('\n=== still guards CASH: a real localStorage self-credit still flags ===');
{
  const tamper={ fxBal:70100, sportsBal:0, opening:100, dep:0, wd:0, pnl:0 };
  const ig=integrity(tamper, 0, 0);
  ok('cash $70k unexplained → gap $70k → 🚩 still flagged', ig.flagged===true);
}

console.log('\n=== cash gap detection is unchanged by crypto (both sides cancel) ===');
{
  const tamperPlusCrypto={ fxBal:70100, sportsBal:0, opening:100, dep:0, wd:0, pnl:0 };
  const withC=integrity(tamperPlusCrypto, johnCrypto, 0);
  const noC=integrity(tamperPlusCrypto, 0, 0);
  ok('adding crypto does not change the cash gap', Math.abs(withC.gap-noC.gap)<0.01);
  ok('still flagged with crypto present', withC.flagged===true);
}

console.log(pass?'\n🟢 admin-integrity-crypto: PASS':'\n🔴 admin-integrity-crypto: FAIL');
process.exit(pass?0:1);
