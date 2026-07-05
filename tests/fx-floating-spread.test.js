// Alpexa — FX-app floating P&L must equal what the server realizes at close.
// Bug (2026-07-05): the floating close price used a bid/ask split with the COSMETIC
// sim spread (BUY→mid, SELL→mid+m.spread) for ALL classes. But the server fx_close.sql
// closes NON-FX (crypto/stock/index) at MID (v_half=0 when cls<>'FX') and FX at
// mid∓half where half=greatest(0.1,spr_pts+markup_pts)*pip/2. So a crypto SELL showed a
// permanent phantom "slippage" loss that never materialises at close.
//
// INVARIANT: floating close price == fx_close.sql v_close (same mid, same half, same side).
//   → crypto/stock/index: mid on BOTH sides (no phantom spread).
//   → FX: mid − half (BUY) / mid + half (SELL), using the REAL feed spread.
//
// Run: node tests/fx-floating-spread.test.js
'use strict';

// ── SERVER: exact port of fx_close.sql v_close (the money-authoritative close). ──
function serverPip(sym){ return /JPY$/.test(sym)?0.01 : sym==='XAUUSD'?0.01 : sym==='XAGUSD'?0.001 : 0.0001; }
function serverClosePx(cls, sym, side, mid, spr_pts, markup_pts){
  let half = 0;
  if (cls === 'FX') half = Math.max(0.1, (spr_pts||0) + (markup_pts||0)) * serverPip(sym) / 2;
  return mid + (side === 'BUY' ? -half : half);   // v_close
}

// ── CLIENT: exact port of trading.html fxClosePx() (what floating now uses). ──
function clientPip(sym){ return /JPY$/.test(sym)?0.01 : sym==='XAUUSD'?0.01 : sym==='XAGUSD'?0.001 : 0.0001; }
function clientClosePx(m, side, feed, marks){
  let mid = m.last, half = 0;
  if (m.cls === 'FX'){
    const spr = +(((feed||{})[m.sym]||{}).spr) || 0;
    const mk  = +((marks||{})[m.sym]) || 0;
    half = Math.max(0.1, spr + mk) * clientPip(m.sym) / 2;
  }
  return mid + (side === 'BUY' ? -half : half);
}

// ── OLD (buggy) client close price: bid/ask split with the sim spread, all classes. ──
function oldClosePx(m, side){ return side === 'BUY' ? m.last : m.last + m.spread; }

let pass = true;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}
const approx = (a, b) => Math.abs(a - b) < 1e-9;

// ── RED: the old formula invented a spread cost the server never charges on crypto. ──
console.log('\n=== RED — old client formula: phantom slippage on crypto SELL ===');
const btc = { sym:'BTCUSD', cls:'CRYPTO', last:108000, spread:4.5 };
check('OLD crypto SELL close ≠ server mid (phantom −$4.5/unit)',
  approx(oldClosePx(btc,'SELL'), serverClosePx('CRYPTO','BTCUSD','SELL',108000,0,0)), false);

// ── GREEN: client fxClosePx == server fx_close v_close, class by class. ──
console.log('\n=== GREEN — crypto/stock/index close at MID on BOTH sides (no phantom) ===');
[['BTCUSD','CRYPTO',108000],['AAPL','STOCK',218.74],['SPX','INDEX',5400]].forEach(([sym,cls,mid])=>{
  const m={sym,cls,last:mid,spread:5};
  ['BUY','SELL'].forEach(side=>{
    check(`${cls} ${sym} ${side}: client==server==mid`,
      approx(clientClosePx(m,side,{},{}), serverClosePx(cls,sym,side,mid,999,999)) &&
      approx(clientClosePx(m,side,{},{}), mid), true);
  });
});

console.log('\n=== GREEN — FX closes at mid∓half using the REAL feed spread (== server) ===');
// EURUSD: spr_pts=8, markup_pts=2 → half = max(0.1,10)*0.0001/2 = 0.0005
const eur = { sym:'EURUSD', cls:'FX', last:1.08412, spread:0.00008 };
const feed = { EURUSD:{ spr:8 } }, marks = { EURUSD:2 };
['BUY','SELL'].forEach(side=>{
  check(`FX EURUSD ${side}: client == server v_close`,
    approx(clientClosePx(eur,side,feed,marks), serverClosePx('FX','EURUSD',side,1.08412,8,2)), true);
});
check('FX EURUSD half-spread = 0.0005 (BUY closes 0.0005 below mid)',
  approx(clientClosePx(eur,'BUY',feed,marks), 1.08412 - 0.0005), true);

console.log('\n=== GREEN — JPY pip (0.01) mirrored, so USDJPY half matches server ===');
// USDJPY spr_pts=1.2, markup=0 → half = max(0.1,1.2)*0.01/2 = 0.006
const jpy = { sym:'USDJPY', cls:'FX', last:156.342, spread:0.012 };
['BUY','SELL'].forEach(side=>{
  check(`FX USDJPY ${side}: client == server v_close`,
    approx(clientClosePx(jpy,side,{USDJPY:{spr:1.2}},{}), serverClosePx('FX','USDJPY',side,156.342,1.2,0)), true);
});

console.log('\n=== GREEN — a freshly opened crypto position floats at ~0 (opened at mid) ===');
// open at server mid; getPnlUSD dist=(close−open)*side. close==mid==open → 0.
const openMid = 108000;
const freshPnlDist = (clientClosePx(btc,'SELL',{},{}) - openMid) * -1;
check('crypto SELL fresh floating distance == 0 (no instant loss)', approx(freshPnlDist, 0), true);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);
