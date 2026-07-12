#!/usr/bin/env node
// REGRESSION (webtrade) — the Market Watch Spread column must be a LIVE (Ask−Bid) reading in MT5 points,
// not a frozen DB dummy, and CLOSED symbols must show a clean '—'. Two bugs are guarded:
//   [1] spread = (ask−bid) × ptScale (5-digit FX ×100000, 3-digit JPY ×1000, 2-digit stock/crypto ×100),
//       recomputed every 300ms tick — never a static value.
//   [2] a CLOSED symbol shows '—'. The SPACEX.STK "10.0 잔상" came from marketOpen() classifying a
//       dynamic symbol as Forex (SYM_CAT default) instead of a stock; marketOpen now uses catOf, so a
//       dynamic stock gates as a stock (weekend → '—').
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static wiring: live formula + closed-mask ──
if (!/const spr=\(m\.ask!=null&&m\.bid!=null\)\?\(\(m\.ask-m\.bid\)\*ptScale\(sym\)\)\.toFixed\(1\):'—';/.test(src))
  bad('spread must be live (ask−bid)×ptScale(sym), or — when no quote');
if (!/showSpread && <td className="mwspr">\{open\?spr:'—'\}<\/td>/.test(src))
  bad('Spread cell must dash-mask a closed session (open?spr:—)');
if (!/function marketOpen\(symbol, at\)\{\s*\n\s*const cat=catOf\(symbol\);/.test(src))
  bad('marketOpen must classify via catOf (so dynamic stocks gate correctly), not SYM_CAT default Forex');

// ── behavioural: ptScale gives MT5 points per class ──
const pts_src = grab(/const ptScale = \(s\)=>[^\n]*/, 'ptScale');
if (!fail) {
  const catOf = (s)=> ({EURUSD:'Forex',USDJPY:'Forex',AAPL:'Stocks',SPACEX:'Stocks',BTCUSD:'Crypto'}[s]||'Forex');
  const ptScale = new Function('catOf', pts_src + '\nreturn ptScale;')(catOf);
  if (ptScale('EURUSD') !== 100000) bad(`5-digit FX must be ×100000, got ${ptScale('EURUSD')}`);
  if (ptScale('USDJPY') !== 1000)   bad(`3-digit JPY must be ×1000, got ${ptScale('USDJPY')}`);
  if (ptScale('AAPL')   !== 100)    bad(`2-digit stock must be ×100, got ${ptScale('AAPL')}`);
  if (ptScale('BTCUSD') !== 100)    bad(`2-digit crypto must be ×100, got ${ptScale('BTCUSD')}`);
  // live reading: a 1.2-pip EURUSD spread → 12.0 MT5 points, and it MOVES with the quote
  const spread = (ask,bid,sym)=> ((ask-bid)*ptScale(sym)).toFixed(1);
  if (spread(1.14312, 1.14300, 'EURUSD') !== '12.0') bad(`EURUSD 1.2-pip spread must read 12.0 points, got ${spread(1.14312,1.14300,'EURUSD')}`);
  if (spread(1.14318, 1.14300, 'EURUSD') === spread(1.14312, 1.14300, 'EURUSD')) bad('spread must move as the quote widens (not frozen)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW-spread problem(s).`); process.exit(1); }
console.log('🟢 PASS: Market Watch Spread = live (ask−bid)×MT5-points, recomputed per tick; closed symbols (incl. dynamic stocks like SPACEX) dash-mask to —.');
