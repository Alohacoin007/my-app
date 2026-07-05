// Alpexa — FX-app floating P&L must equal what the server realizes at close, and
// every instrument must carry a dealing spread (MT5 convention — the house earns it).
//
// History: (1) floating used the cosmetic sim spread bid/ask → phantom loss on crypto;
// (2) then it marked crypto at mid (no spread). Neither is standard: a real broker
// charges a spread on EVERY instrument and the floating must equal the realized close.
//
// INVARIANT (must match fx_close.sql v_close AND trading.html fxClosePx):
//   mid   = the REAL feed mid (not the drifting sim price)
//   half  = FX: greatest(0.1, spr_pts+markup_pts)*pip/2   (feed pips)
//           non-FX: mid * SPREAD_BPS[cls]/10000/2          (% of price)
//   close = BUY: mid−half,  SELL: mid+half
//   open (fx_open) = mid  →  a fresh position floats at −half (the spread), always a loss.
//
// Run: node tests/fx-floating-spread.test.js
'use strict';

// House spread for non-FX (bps of price). MUST equal fx_close.sql AND trading.html.
const SPREAD_BPS = { CRYPTO: 10, STOCK: 8, INDEX: 6 };

// ── SERVER: exact port of fx_close.sql v_half / v_close. ──
function serverPip(sym){ return /JPY$/.test(sym)?0.01 : sym==='XAUUSD'?0.01 : sym==='XAGUSD'?0.001 : 0.0001; }
function serverHalf(cls, sym, mid, spr_pts, markup_pts){
  if (cls === 'FX') return Math.max(0.1, (spr_pts||0) + (markup_pts||0)) * serverPip(sym) / 2;
  return mid * ((SPREAD_BPS[cls]||0) / 10000) / 2;
}
function serverClosePx(cls, sym, side, mid, spr_pts, markup_pts){
  const half = serverHalf(cls, sym, mid, spr_pts, markup_pts);
  return mid + (side === 'BUY' ? -half : half);
}

// ── CLIENT: exact port of trading.html fxHalfSpread()/fxClosePx(). ──
function clientPip(sym){ return /JPY$/.test(sym)?0.01 : sym==='XAUUSD'?0.01 : sym==='XAGUSD'?0.001 : 0.0001; }
function clientHalf(m, mid, feed, marks){
  if (m.cls === 'FX'){
    const spr = +(((feed||{})[m.sym]||{}).spr) || 0;
    const mk  = +((marks||{})[m.sym]) || 0;
    return Math.max(0.1, spr + mk) * clientPip(m.sym) / 2;
  }
  return mid * ((SPREAD_BPS[m.cls]||0) / 10000) / 2;
}
function clientClosePx(m, side, feed, marks){
  const mid = (m.real && m.bid > 0) ? m.bid : m.last;   // REAL feed mid, not sim drift
  const half = clientHalf(m, mid, feed, marks);
  return mid + (side === 'BUY' ? -half : half);
}
// getPnlUSD distance (sign) for a fresh position opened at the server mid.
function freshPnlDist(m, side, openMid, feed, marks){
  return (clientClosePx(m, side, feed, marks) - openMid) * (side === 'BUY' ? 1 : -1);
}

let pass = true;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}
const approx = (a, b) => Math.abs(a - b) < 1e-9;

console.log('\n=== GREEN — client fxClosePx == server v_close, every class ===');
// crypto (bps), stock (bps), index (bps), FX (pip). real mid via m.bid.
const cases = [
  { m:{sym:'BTCUSD',cls:'CRYPTO',real:true,bid:108000,last:107500}, spr:0,  mk:0 },
  { m:{sym:'AAPL',  cls:'STOCK', real:true,bid:218.74, last:219.9}, spr:0,  mk:0 },
  { m:{sym:'SPX',   cls:'INDEX', real:true,bid:5400,   last:5390 }, spr:0,  mk:0 },
  { m:{sym:'EURUSD',cls:'FX',    real:true,bid:1.08412,last:1.09 }, spr:8,  mk:2 },
  { m:{sym:'USDJPY',cls:'FX',    real:true,bid:156.342,last:157 }, spr:1.2, mk:0 },
];
cases.forEach(({m,spr,mk})=>{
  const feed={ [m.sym]:{spr} }, marks={ [m.sym]:mk };
  ['BUY','SELL'].forEach(side=>{
    check(`${m.cls} ${m.sym} ${side}: client==server`,
      approx(clientClosePx(m,side,feed,marks), serverClosePx(m.cls,m.sym,side,m.bid,spr,mk)), true);
  });
});

console.log('\n=== GREEN — floating marks the REAL mid (m.bid), NOT the drifting sim (m.last) ===');
// m.last is $500 below m.bid; the P&L must ignore it (no phantom profit/loss from drift).
const btc = { sym:'BTCUSD', cls:'CRYPTO', real:true, bid:108000, last:107500 };
check('crypto close uses m.bid not m.last',
  approx(clientClosePx(btc,'BUY',{},{}), 108000 - serverHalf('CRYPTO','BTCUSD',108000,0,0)), true);

console.log('\n=== GREEN — every fresh position opens at a LOSS = the spread (never a plus) ===');
// open at server mid; fresh floating distance = −half < 0 for ALL classes/sides.
[['BTCUSD','CRYPTO',108000],['AAPL','STOCK',218.74],['SPX','INDEX',5400],['EURUSD','FX',1.08412]].forEach(([sym,cls,mid])=>{
  const m={sym,cls,real:true,bid:mid,last:mid};
  const feed={[sym]:{spr:cls==='FX'?8:0}}, marks={[sym]:cls==='FX'?2:0};
  ['BUY','SELL'].forEach(side=>{
    const dist = freshPnlDist(m,side,mid,feed,marks);
    check(`${cls} ${sym} ${side} fresh floating < 0 (spread loss, not plus)`, dist < 0, true);
  });
});

console.log('\n=== GREEN — crypto spread is meaningful (0.05% one-way), not ~0 ===');
// BTC one-way = SPREAD_BPS/2 = 5 bps = 0.05% of price.
check('BTC half == 0.05% of mid', approx(serverHalf('CRYPTO','BTCUSD',108000,0,0), 108000*0.0005), true);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);
