#!/usr/bin/env node
// REGRESSION (webtrade) — the Market Watch Spread column must be a LIVE (Ask−Bid) reading in PIPS, and
// a 1-pip Forex gap MUST read 1.0 (not 10.0). A prior turn wrongly multiplied by the 5-digit point
// scale (×100000), inflating every FX spread 10×. The correct, MT5-standard display is (ask−bid)/pip:
//   EURUSD 0.00010 gap → 1.0 pip   ·   USDJPY 0.010 gap → 1.0 pip   ·   crypto ÷0.01 → ~0.1.
// Closed symbols (incl. dynamic stocks like SPACEX, gated via catOf) show a clean '—'.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static wiring: PIP formula (÷pip, never ×100000) + closed-mask + catOf session gate ──
if (!/const spr=\(m\.ask!=null&&m\.bid!=null\)\?\(\(m\.ask-m\.bid\)\/pip\(sym\)\)\.toFixed\(1\):'—';/.test(src))
  bad('spread must be live (ask−bid)/pip(sym) — pips, or — when no quote');
if (/\*ptScale|ptScale\(/.test(src)) bad('the ×100000 point multiplier (ptScale) must be fully removed (it 10×-inflated FX)');
if (!/showSpread && <td className="mwspr">\{open\?spr:'—'\}<\/td>/.test(src))
  bad('Spread cell must dash-mask a closed session (open?spr:—)');
if (!/function marketOpen\(symbol, at\)\{\s*\n\s*const cat=catOf\(symbol\);/.test(src))
  bad('marketOpen must classify via catOf so dynamic stocks (SPACEX) gate correctly');

// ── behavioural: (ask−bid)/pip gives PIPS — a 1-pip gap is 1.0, never 10.0 ──
const pip_src = grab(/const pip   = \(s\)=>[^\n]*/, 'pip');
if (!fail) {
  const catOf = (s)=> ({EURUSD:'Forex',USDJPY:'Forex',AAPL:'Stocks',BTCUSD:'Crypto'}[s]||'Forex');
  const pip = new Function('catOf', pip_src + '\nreturn pip;')(catOf);
  const spread = (ask,bid,sym)=> ((ask-bid)/pip(sym)).toFixed(1);
  if (spread(1.13951, 1.13941, 'EURUSD') !== '1.0') bad(`EURUSD 1-pip gap must read 1.0, got ${spread(1.13951,1.13941,'EURUSD')} (10× inflation regression)`);
  if (spread(162.063, 162.053, 'USDJPY') !== '1.0') bad(`USDJPY 1-pip gap must read 1.0, got ${spread(162.063,162.053,'USDJPY')}`);
  if (spread(1.13962, 1.13941, 'EURUSD') !== '2.1') bad(`EURUSD 2.1-pip gap must read 2.1, got ${spread(1.13962,1.13941,'EURUSD')}`);
  if (spread(64000.02, 64000.01, 'BTCUSD') !== '1.0') bad(`crypto gap must scale by its 0.01 pip, got ${spread(64000.02,64000.01,'BTCUSD')}`);
  // and it MOVES with the quote (not frozen)
  if (spread(1.13951, 1.13941, 'EURUSD') === spread(1.13962, 1.13941, 'EURUSD')) bad('spread must move as the quote widens (not frozen)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW-spread problem(s).`); process.exit(1); }
console.log('🟢 PASS: Market Watch Spread = live (ask−bid)/pip in PIPS — a 1-pip FX/JPY gap reads 1.0 (no 10× inflation); closed symbols (incl. dynamic stocks) dash-mask to —.');
