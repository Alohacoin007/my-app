// Alpexa — admin "Crypto" balance must reflect the REAL crypto net worth
// (crypto_holdings coins × price + crypto_stakes USD), NOT the stale
// accounts.balance (which is $0 for crypto — coins live in crypto_holdings).
// Bug class this guards: display≠truth (#5/#20) — showing a balance derived
// from the wrong source. A 50000-ALPXS grant landed in holdings but the old
// row read accounts.balance and showed $0. Mirrors manager-mobile.html
// cryptoPriceOf() / cryptoUsdVal().
'use strict';
let pass=true; const ok=(n,c)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };

// LIVE_FEED = server `prices` mid map (what real trades/stakes use)
const LIVE_FEED = { BTC:{mid:60000}, ETH:{mid:3000}, SOL:{mid:150} };
const ALPXS_PX = 1.81;  // formula value (injected for a deterministic test)

function cryptoPriceOf(asset){
  if(asset==='USDT'||asset==='USDC'||asset==='USD'||asset==='DAI'||asset==='BUSD') return 1;
  if(asset==='ALPXS') return ALPXS_PX;
  return (LIVE_FEED[asset]&&+LIVE_FEED[asset].mid)||0;
}
// CRYPTO_BY_CUST[cid] = {holdings:[{asset,qty}], stakes:[{asset,usd}]}; undefined = not loaded
function cryptoUsdVal(cb){
  if(cb===undefined) return null;
  let v=0;
  (cb.holdings||[]).forEach(x=>{ v+=(+x.qty||0)*cryptoPriceOf(x.asset); });
  (cb.stakes||[]).forEach(x=>{ v+=(+x.usd||0); });
  return v;
}
// OLD (buggy) row: read accounts.balance for crypto — always ~$0
const oldRow = (acct)=> (+acct.balance||0);

console.log('\n=== RED: old row read accounts.balance → grant invisible ($0) ===');
{
  const acct={balance:0};                                  // crypto accounts.balance is a dead field
  const cb={holdings:[{asset:'ALPXS',qty:50000}], stakes:[{asset:'ALPXS',usd:100}]};
  ok('old row shows $0 despite 50000 ALPXS in wallet (BUG)', oldRow(acct)===0);
}

console.log('\n=== GREEN: new row values holdings + stakes from real sources ===');
{
  const cb={holdings:[{asset:'ALPXS',qty:50000}], stakes:[{asset:'ALPXS',usd:100}]};
  const v=cryptoUsdVal(cb);
  ok('50000 ALPXS × $1.81 + $100 stake = $90,600', v===50000*1.81+100);
  ok('grant is now visible (not $0)', v>0);
}

console.log('\n=== mixed wallet: USDT cash + coins + stake all summed ===');
{
  const cb={holdings:[{asset:'USDT',qty:200},{asset:'BTC',qty:0.5},{asset:'ALPXS',qty:1000}],
            stakes:[{asset:'USDT',usd:300}]};
  const v=cryptoUsdVal(cb);
  ok('200 USDT + 0.5 BTC×60000 + 1000 ALPXS×1.81 + 300 stake', v===200+0.5*60000+1000*1.81+300);
}

console.log('\n=== not-loaded → null so caller falls back (no false $0) ===');
{
  ok('undefined holdings → null (fall back to bv)', cryptoUsdVal(undefined)===null);
  ok('empty wallet → $0 (loaded, genuinely zero)', cryptoUsdVal({holdings:[],stakes:[]})===0);
}

console.log('\n=== unknown coin (no feed) values at 0 — never fabricates a price ===');
{
  const cb={holdings:[{asset:'DOGE',qty:999999}], stakes:[]};
  ok('coin with no server price → $0 (no guess)', cryptoUsdVal(cb)===0);
}

console.log(pass?'\n🟢 admin-crypto-networth: PASS':'\n🔴 admin-crypto-networth: FAIL');
process.exit(pass?0:1);
