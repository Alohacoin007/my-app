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

console.log('\n=== BACKOFFICE DISPLAY: Spr·pt == the on-screen (ask − bid), floating ===');
// The desk shows LIVE quotes bid/ask = mid ± half the (live+markup) spread, and Spr is
// NOT computed separately — it IS the difference between the DISPLAYED bid and ask. So
// the number always equals the gap the eye sees (no 10-vs-11 mismatch), and it floats.
function fxPipOf(sym){ if(sym.endsWith('JPY'))return 0.01; if(sym==='XAUUSD')return 0.01; if(sym==='XAGUSD')return 0.001; return 0.0001; }
function fxPPP(sym,dg){ return fxPipOf(sym)*Math.pow(10,dg); }      // points per pip
function pointOf(dg){ return Math.pow(10,-dg); }
// Faithful port of the manager-mobile dealing-desk row.
function deskRow(sym,dg,mid,livePip,mkPip){
  const point = pointOf(dg);
  const totPip = Math.max(0.1, livePip + mkPip);
  const effPt = Math.max(0.1, totPip * fxPPP(sym,dg));             // live+markup spread in points
  const half = (effPt * point) / 2;
  const bidR = +(mid - half).toFixed(dg);                         // the quotes actually shown
  const askR = +(mid + half).toFixed(dg);
  const spr = Math.max(1, Math.round((askR - bidR) / point));     // Spr = the visible gap
  return { bid: bidR.toFixed(dg), ask: askR.toFixed(dg), spr };
}
// THE INVARIANT the owner asked for: the shown Spr equals the visible last-digit gap.
function visibleGap(row, dg){ return Math.round((+row.ask - +row.bid) / pointOf(dg)); }
[
  ['EURUSD',5,1.14400,1.0,0], ['EURUSD',5,1.143997,1.0,0], ['EURUSD',5,1.14400,1.1,0],
  ['USDJPY',3,156.348,1.2,0], ['XAUUSD',2,2347.95,22,0], ['EURUSD',5,1.14400,1.3,-0.2],
].forEach((a) => {
  const row = deskRow(a[0],a[1],a[2],a[3],a[4]);
  check(`${a[0]} @${a[2]} live${a[3]}+mk${a[4]}: Spr(${row.spr}) == visible ask−bid (${row.bid}/${row.ask})`,
        row.spr, visibleGap(row, a[1]));
});
// And it FLOATS: as the live spread widens, the shown Spr grows with it.
check('EURUSD Spr grows with the live spread (1.0→1.5 pip ⇒ 10→15 pt band)',
      deskRow('EURUSD',5,1.14400,1.5,0).spr > deskRow('EURUSD',5,1.14400,1.0,0).spr, true);

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
