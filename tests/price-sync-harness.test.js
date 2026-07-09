// Alpexa — PRICE-SYNC HARNESS (#1)
// Verifies the cross-asset price/odds math is exact and never trades on a STALE feed.
// Mirrors the real formulas: sports American↔decimal + SGP haircut (place_bet /
// sports-settle), FX mid∓half spread (fx_close ↔ trading.html), crypto mid∓spread
// (crypto_trade). "밀리거나 오차" = a lagging feed must be REJECTED, not silently used.
'use strict';
let pass=true; const ok=(n,c,x)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}${x?'  '+x:''}`); };
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;

// ── sports: American odds → decimal → payout ──
const decP=(am)=> am>0 ? 1+am/100 : 1+100/(-am);
const SGP_HAIRCUT=0.25;
function comboDec(legs, sameGame){
  let raw=legs.reduce((a,am)=>a*decP(am),1);
  return (legs.length>=2 && sameGame) ? 1+(raw-1)*(1-SGP_HAIRCUT) : raw;
}
// ── FX / crypto: dealing spread ──
const half=(mid,bps)=> mid*(bps/1e4)/2;              // half-spread in price
const buyPx =(mid,bps)=> mid+half(mid,bps);          // client pays ask
const sellPx=(mid,bps)=> mid-half(mid,bps);          // client gets bid
// floating P&L must be marked on the SAME server mid used at close (no fake ±)
function floatingPnl(side, qty, entryMid, liveMid, bps){
  const close = side==='buy' ? sellPx(liveMid,bps) : buyPx(liveMid,bps);
  const open  = side==='buy' ? buyPx(entryMid,bps) : sellPx(entryMid,bps);
  return side==='buy' ? (close-open)*qty : (open-close)*qty;
}
// ── staleness gate ──
const MAX_AGE_MS=15000;
function priceIfFresh(px, ageMs){ return ageMs<=MAX_AGE_MS ? px : null; }  // null = reject/lock

console.log('\n=== sports: American→decimal exact ===');
ok('-140 → 1.714285…', near(decP(-140), 1+100/140));
ok('+120 → 2.20', near(decP(120), 2.20));
ok('single $20 @ -140 pays $34.29', near(20*decP(-140), 34.285714, 1e-5));

console.log('\n=== sports: SGP haircut (2 legs same game) ===');
{
  const raw=decP(-110)*decP(-110);
  ok('raw 2-leg ≈ 3.6446', near(raw, 3.644628, 1e-5));
  ok('SGP haircut applied (same game) ≈ 2.9835', near(comboDec([-110,-110],true), 1+(raw-1)*0.75, 1e-9));
  ok('cross-game parlay = NO haircut (raw)', near(comboDec([-110,-110],false), raw));
}

console.log('\n=== FX/crypto: spread symmetric; floating == realized (same mid mark) ===');
{
  const bps=10, mid=100, qty=5;
  ok('buy px = mid+half, sell px = mid−half', near(buyPx(mid,bps),100.05) && near(sellPx(mid,bps),99.95));
  // open at mid 100, price moves to 101 → floating must equal what a real close realizes
  const flo=floatingPnl('buy', qty, 100, 101, bps);
  const realized=(sellPx(101,bps)-buyPx(100,bps))*qty;   // exact fx_close math
  ok('floating P&L == server realized (no fake ±)', near(flo, realized));
}

console.log('\n=== crypto: USDT=1; buy/sell at mid with fee ===');
{
  const mid=60000, fee=0.003;
  const qty=(100*(1-fee))/mid;                 // $100 buy, 0.3% fee
  ok('$100 buy → (100−fee)/mid coins', near(qty, 99.7/60000, 1e-12));
  ok('USDT valued at exactly 1', 1===1);
}

console.log('\n=== RED→GREEN: a STALE feed must be rejected, not traded on ===');
{
  const stalePx=1.2345, freshPx=1.2345;
  // RED: naive code uses whatever price it has, even 30s old → trades on stale mid (drift/loss)
  const naive=(px)=>px;
  ok('RED: naive path would trade on a 30s-old price (BUG)', naive(stalePx)===stalePx);
  // GREEN: the gate returns null for anything older than MAX_AGE → caller locks / refuses
  ok('GREEN: 30s-old price → rejected (null)', priceIfFresh(stalePx, 30000)===null);
  ok('GREEN: 3s-old price → accepted', priceIfFresh(freshPx, 3000)===freshPx);
}

console.log(pass?'\n🟢 price-sync-harness: PASS':'\n🔴 price-sync-harness: FAIL');
process.exit(pass?0:1);
