#!/usr/bin/env node
// REGRESSION (webtrade) — the Market Watch Spread must be a PER-ROW, live reading computed from THIS
// row's own DISPLAYED (rounded) Bid/Ask — never a shared variable, never copied from row 1, never a
// stale point-inflated dummy. Convention:
//   Forex (incl. JPY) → pips  = |askShown − bidShown| / pip   (EURUSD 0.00010→1.0, USDJPY 0.019→1.9)
//   Crypto / Stocks   → raw price gap = |askShown − bidShown|  (BTC 0.10→0.1, not the 10.0 tin can)
// Each row uses its own symbol's quote, so AUDUSD ≠ EURUSD. Closed symbols dash-mask to '—'.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: per-row diff of the DISPLAYED bid/ask, no shared var, correct per-class scale ──
if (!/const bidT=fmtPx\(sym,m\.bid\), askT=fmtPx\(sym,m\.ask\);/.test(src)) bad('row must derive the displayed bid/ask strings once');
if (!/const _diff=\(m\.ask!=null&&m\.bid!=null\)\?Math\.abs\(parseFloat\(askT\)-parseFloat\(bidT\)\):null;/.test(src)) bad('spread must be a per-row |askShown − bidShown|');
if (!/const spr=_diff==null\?'—':\(catOf\(sym\)==='Crypto'\|\|catOf\(sym\)==='Stocks'\?_diff:_diff\/pip\(sym\)\)\.toFixed\(1\);/.test(src)) bad('Forex → ÷pip, crypto/stock → raw gap');
if (/let spread|var spreadVal|\*ptScale|ptScale\(/.test(src)) bad('no shared spread variable / no ×100000 point inflation may remain');
if (!/showSpread && <td className="mwspr">\{open\?spr:'—'\}<\/td>/.test(src)) bad('closed session must dash-mask');

// ── behavioural: run the exact pipeline (fmtPx → parseFloat → per-class scale) ──
const catOf = (s)=> ({EURUSD:'Forex',AUDUSD:'Forex',USDJPY:'Forex',AAPL:'Stocks',BTCUSD:'Crypto'}[s]||'Forex');
const digits_src = grab(/const digits= \(s\)=>[^\n]*/, 'digits');
const pip_src    = grab(/const pip   = \(s\)=>[^\n]*/, 'pip');
const fmtPx_src  = grab(/const fmtPx = \(s,v\)=>[^\n]*/, 'fmtPx');
if (!fail) {
  const { digits, pip, fmtPx } = new Function('catOf',
    digits_src + '\n' + pip_src + '\n' + fmtPx_src + '\nreturn {digits,pip,fmtPx};')(catOf);
  const spread = (sym, ask, bid)=>{ const askT=fmtPx(sym,ask), bidT=fmtPx(sym,bid);
    const d=Math.abs(parseFloat(askT)-parseFloat(bidT));
    return (catOf(sym)==='Crypto'||catOf(sym)==='Stocks'?d:d/pip(sym)).toFixed(1); };
  // the four reported symptoms, fixed:
  if (spread('EURUSD', 1.13951, 1.13941) !== '1.0') bad(`EURUSD must read 1.0, got ${spread('EURUSD',1.13951,1.13941)}`);
  if (spread('USDJPY', 161.983, 161.964) !== '1.9') bad(`USDJPY 161.983−161.964 must read 1.9 (not 2.0), got ${spread('USDJPY',161.983,161.964)}`);
  if (spread('AUDUSD', 0.65832, 0.65820) !== '1.2') bad(`AUDUSD must be its OWN 1.2 (not EURUSD's 1.0), got ${spread('AUDUSD',0.65832,0.65820)}`);
  if (spread('BTCUSD', 64000.10, 64000.00) !== '0.1') bad(`BTCUSD 0.10 gap must read 0.1 (not the 10.0 tin can), got ${spread('BTCUSD',64000.10,64000.00)}`);
  // liveness: widen the quote → the number moves
  if (spread('EURUSD', 1.13951, 1.13941) === spread('EURUSD', 1.13962, 1.13941)) bad('spread must move as the quote widens (not frozen/copied)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW-spread problem(s).`); process.exit(1); }
console.log('🟢 PASS: per-row spread from each row’s displayed bid/ask — EURUSD 1.0, USDJPY 1.9, AUDUSD 1.2 (own value), BTC 0.1; live, no shared var, closed → —.');
