// Alpexa — FX spread-on-fill regression test (Phase 2).
// Faithful model of the EXACT server fill math in supabase/sql/fx_open_margin.sql
// (fx_open) + fx_close.sql (fx_close). Proves that until Phase 2 the house earned
// ZERO spread (fills at mid → round-trip costs nothing = markup was cosmetic), and
// that the fix charges the FULL spread once per round trip.
//
// Invariant: a round trip opened and closed at the SAME mid must cost the customer
//   exactly (spr_pts + markup_pts) pips × $/pip/lot × size — no more, no less —
//   and that cost is the house's spread revenue. Non-FX classes are unaffected.
//
// Run: node tests/fx-spread.test.js
'use strict';

function round2(x){ return Math.round(x*100)/100; }

// pip() — MUST mirror supabase/functions/fx-prices/index.ts pip() (the producer of
// spr_pts) AND the two SQL RPCs. If these drift, gold/silver mis-charge silently.
function pip(sym){
  if (sym.endsWith('JPY')) return 0.01;
  if (sym === 'XAUUSD') return 0.01;
  if (sym === 'XAGUSD') return 0.001;
  return 0.0001;
}
function lot(sym){ return sym==='XAUUSD'?100 : sym==='XAGUSD'?5000 : 100000; } // all cases here are cls FX

// half-spread in PRICE units — exact port of the SQL:
//   v_half := greatest(0.1, coalesce(spr,0)+coalesce(mk,0)) * pip / 2
function halfSpread(sym, sprPts, mkPts){
  return Math.max(0.1, (sprPts||0) + (mkPts||0)) * pip(sym) / 2;
}

// SERVER fill model. CHARGE=false = old behavior (fill at mid). CHARGE=true = Phase 2.
function fillOpen(sym, side, mid, sprPts, mkPts, CHARGE){
  if (!CHARGE) return mid;
  const h = halfSpread(sym, sprPts, mkPts);
  return mid + (side==='BUY' ? h : -h);              // BUY→ask, SELL→bid
}
function fillClose(sym, side, mid, sprPts, mkPts, CHARGE){
  if (!CHARGE) return mid;
  const h = halfSpread(sym, sprPts, mkPts);
  return mid + (side==='BUY' ? -h : h);              // BUY closes at bid, SELL at ask
}
// P&L in USD for a USD-quoted FX pair (EURUSD/XAUUSD/XAGUSD) — exact port of fx_close.
function pnlUsdUsdQuote(sym, side, open, close, size){
  const dist = (close - open) * (side==='BUY' ? 1 : -1);
  return round2(dist * lot(sym) * size);
}

// A round trip: open then immediately close at the SAME mid (no market move).
// Realized P&L is therefore purely the spread cost the house captured.
function roundTrip(sym, side, mid, sprPts, mkPts, size, CHARGE){
  const open  = fillOpen(sym, side, mid, sprPts, mkPts, CHARGE);
  const close = fillClose(sym, side, mid, sprPts, mkPts, CHARGE);
  return pnlUsdUsdQuote(sym, side, open, close, size);
}

let pass = true;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if(!ok) pass = false;
  console.log(`${ok?'  ✅':'  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}

console.log('\n=== RED: OLD behavior (fill at mid) — house earns ZERO spread ===');
// EURUSD 1 lot, live spr 1 pip + 10 pip markup, mid 1.10000, no market move.
check('EURUSD round trip costs $0 (markup was cosmetic)',
      roundTrip('EURUSD','BUY', 1.10000, 1, 10, 1.0, false), 0);
check('XAUUSD round trip costs $0 (gold, no charge)',
      roundTrip('XAUUSD','SELL', 2350.00, 20, 10, 1.0, false), 0);

console.log('\n=== GREEN: Phase 2 (charge spread on fill) — round trip pays FULL spread once ===');
// EURUSD: total 11 pips. $/pip/lot = pip*lot = 0.0001*100000 = $10. So 11 pips = -$110.
check('EURUSD BUY 1 lot, 1+10 pip spread → -$110',
      roundTrip('EURUSD','BUY', 1.10000, 1, 10, 1.0, true), -110);
check('EURUSD SELL 1 lot, same spread → -$110 (side-symmetric)',
      roundTrip('EURUSD','SELL', 1.10000, 1, 10, 1.0, true), -110);
// Half a lot pays half the spread.
check('EURUSD BUY 0.5 lot → -$55',
      roundTrip('EURUSD','BUY', 1.10000, 1, 10, 0.5, true), -55);
// GOLD: pip 0.01, 30 pips total, lot 100. $/pip/lot = 0.01*100 = $1 → 30 pips = -$30.
// (If pip were wrongly 0.0001 this would be -$0.30 — the 100x bug this test guards.)
check('XAUUSD SELL 1 lot, 20+10 pip spread → -$30 (pip=0.01, NOT 0.0001)',
      roundTrip('XAUUSD','SELL', 2350.00, 20, 10, 1.0, true), -30);
// SILVER: pip 0.001, lot 5000. 10 pips total → $/pip/lot = 0.001*5000 = $5 → -$50.
check('XAGUSD BUY 1 lot, 6+4 pip spread → -$50 (pip=0.001)',
      roundTrip('XAGUSD','BUY', 30.000, 6, 4, 1.0, true), -50);
// FLOOR: with spr=0 and markup=0 the spread floors at 0.1 pip so bid<ask always.
check('EURUSD floor 0.1 pip when spr+markup=0 → -$1',
      roundTrip('EURUSD','BUY', 1.10000, 0, 0, 1.0, true), -1);

console.log('\n=== INVARIANT: round-trip cost == full spread, house revenue == customer cost ===');
// The customer's loss on a flat round trip IS the house's spread revenue.
const sprPips = 1 + 10;
const customerCost = -roundTrip('EURUSD','BUY', 1.10000, 1, 10, 1.0, true);
const houseRevenue = sprPips * (pip('EURUSD')*lot('EURUSD')) * 1.0;  // pips × $/pip/lot × size
check('house spread revenue == customer round-trip cost', customerCost, houseRevenue);

console.log('\n=== BACKOFFICE DISPLAY UNIT: spread shown in POINTS == charged spread ===');
// The dealing desk stores spread+markup in PIPS (server unit) but DISPLAYS points
// (last price digit). These mirror manager-mobile.html fxPipOf/fxPPP EXACTLY — if
// they drift from the SQL pip above, the shown quote lies about what's charged.
function fxPipOf(sym){ if(sym.endsWith('JPY'))return 0.01; if(sym==='XAUUSD')return 0.01; if(sym==='XAGUSD')return 0.001; return 0.0001; }
function fxPPP(sym,dg){ return fxPipOf(sym)*Math.pow(10,dg); }      // points per pip
function pointOf(dg){ return Math.pow(10,-dg); }
// FLOATING display: the desk shows the LIVE liquidity spread + markup in points, to
// 1 decimal (so market movement is visible) — no integer quantization. Value == the
// live spread converted to points. dg: EURUSD=5, USDJPY=3, XAU=2, XAG=3.
function sprPointsShown(sym,dg,sprPip,mkPip){ return +(Math.max(0.1,(sprPip+mkPip)*fxPPP(sym,dg))).toFixed(1); }

check('EURUSD 1.0 pip raw → 10.0 pt shown', sprPointsShown('EURUSD',5,1.0,0), 10);
check('EURUSD 1.04 pip live (floats) → 10.4 pt shown', sprPointsShown('EURUSD',5,1.04,0), 10.4);
check('EURUSD 1.0 pip + 1.0 pip markup → 20 pt', sprPointsShown('EURUSD',5,1.0,1.0), 20);
check('USDJPY 1.2 pip → 12 pt (dg3, PPP=10)', sprPointsShown('USDJPY',3,1.2,0), 12);
check('XAUUSD 30 pip → 30 pt (dg2, PPP=1)', sprPointsShown('XAUUSD',2,30,0), 30);

// RECONCILIATION: the points the desk SHOWS, converted back to price, must equal the
// price spread the SERVER charges (pips × pip). Same money, two labels.
function reconcile(sym,dg,sprPip,mkPip){
  const shownPts = sprPointsShown(sym,dg,sprPip,mkPip);
  const shownPrice = shownPts * pointOf(dg);                 // desk quote gap in price
  const chargedPrice = Math.max(0.1,(sprPip+mkPip)) * fxPipOf(sym);  // server v_half*2
  return { shownPrice: round2(shownPrice/pointOf(dg)), chargedPrice: round2(chargedPrice/pointOf(dg)) };
}
const rc = reconcile('EURUSD',5,1.0,0);
check('EURUSD shown-gap == charged-gap (in points)', rc.shownPrice, rc.chargedPrice);

// A 1-POINT markup step must store 1/PPP pips so the server charges exactly 1 point more.
function stepPipFor(sym,dg){ return 1/fxPPP(sym,dg); }
check('EURUSD 1pt markup step = 0.1 pip stored', round2(stepPipFor('EURUSD',5)*100)/100, 0.1);
check('XAUUSD 1pt markup step = 1.0 pip stored', stepPipFor('XAUUSD',2), 1);
// stepping +1pt then charging: the extra cost equals exactly 1 point.
const extraPip = stepPipFor('EURUSD',5);                     // pips added by one +1pt click
const extraPointsCharged = Math.round(extraPip * fxPPP('EURUSD',5));
check('one +1pt click charges exactly +1 pt', extraPointsCharged, 1);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);
