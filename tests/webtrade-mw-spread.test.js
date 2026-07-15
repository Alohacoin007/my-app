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
if (!/const spr=_diff==null\?'—':sprText\(sym,_diff\);/.test(src)) bad('MW row must format via the ONE sprText helper (Forex ÷pip · stock raw · crypto adaptive decimals)');
// ONE formatter for every spread readout: MW table + MW popup tiles + one-click tag + the definition
if (((src.match(/sprText\(sym|sprText\(symbol/g) || []).length) < 3) bad('all three spread readouts (MW table, popup tiles, one-click tag) must share sprText — found fewer call sites');
if (/let spread|var spreadVal|\*ptScale|ptScale\(/.test(src)) bad('no shared spread variable / no ×100000 point inflation may remain');
if (!/showSpread && <td className="mwspr">\{open\?spr:'—'\}<\/td>/.test(src)) bad('closed session must dash-mask');

// ── behavioural: run the exact pipeline (fmtPx → parseFloat → sprText) ──
const catOf = (s)=> ({EURUSD:'Forex',AUDUSD:'Forex',USDJPY:'Forex',AAPL:'Stocks',
  BTCUSD:'Crypto',SOLUSD:'Crypto',XRPUSD:'Crypto',DOGEUSD:'Crypto'}[s]||'Forex');
const digits_src  = grab(/const digits= \(s\)=>[^\n]*/, 'digits');
const pip_src     = grab(/const pip   = \(s\)=>[^\n]*/, 'pip');
const fmtPx_src   = grab(/const fmtPx = \(s,v\)=>[^\n]*/, 'fmtPx');
const sprText_src = grab(/const sprText = \(s,d\)=>[^\n]*/, 'sprText');
if (!fail) {
  const { digits, pip, fmtPx, sprText } = new Function('catOf',
    digits_src + '\n' + pip_src + '\n' + fmtPx_src + '\n' + sprText_src + '\nreturn {digits,pip,fmtPx,sprText};')(catOf);
  const spread = (sym, ask, bid)=>{ const askT=fmtPx(sym,ask), bidT=fmtPx(sym,bid);
    const d=Math.abs(parseFloat(askT)-parseFloat(bidT));
    return sprText(sym, d); };
  // the four originally-reported symptoms stay fixed:
  if (spread('EURUSD', 1.13951, 1.13941) !== '1.0') bad(`EURUSD must read 1.0, got ${spread('EURUSD',1.13951,1.13941)}`);
  if (spread('USDJPY', 161.983, 161.964) !== '1.9') bad(`USDJPY 161.983−161.964 must read 1.9 (not 2.0), got ${spread('USDJPY',161.983,161.964)}`);
  if (spread('AUDUSD', 0.65832, 0.65820) !== '1.2') bad(`AUDUSD must be its OWN 1.2 (not EURUSD's 1.0), got ${spread('AUDUSD',0.65832,0.65820)}`);
  if (spread('BTCUSD', 64000.10, 64000.00) !== '0.1') bad(`BTCUSD 0.10 gap must read 0.1 (not the 10.0 tin can), got ${spread('BTCUSD',64000.10,64000.00)}`);
  // liveness: widen the quote → the number moves
  if (spread('EURUSD', 1.13951, 1.13941) === spread('EURUSD', 1.13962, 1.13941)) bad('spread must move as the quote widens (not frozen/copied)');
  // ── 2026-07-14 사장님 report: crypto Spread frozen/0.0 — the display side of it is the digits bug:
  // 2dp quoting rounded XRP/DOGE bid==ask on screen, so the column showed a LYING 0.0 while
  // fx_close charges the 10bps house floor. MT5-style per-price-scale digits make it visible.
  if (digits('BTCUSD') !== 2 || digits('SOLUSD') !== 3 || digits('XRPUSD') !== 4 || digits('DOGEUSD') !== 5 || digits('AAPL') !== 2)
    bad(`crypto digits must be per-price-scale (BTC 2 · SOL 3 · XRP 4 · DOGE 5; stocks stay 2) — got ${digits('BTCUSD')}/${digits('SOLUSD')}/${digits('XRPUSD')}/${digits('DOGEUSD')}/${digits('AAPL')}`);
  // XRP at mid 1.07 with the 10bps floor: bid 1.06947 / ask 1.07054 → shown 1.0695/1.0705 → 0.001, NOT 0.0
  const xrp = spread('XRPUSD', 1.07054, 1.06947);
  if (!(parseFloat(xrp) > 0)) bad(`XRPUSD 10bps spread must be visible (expected ~0.001), got ${xrp} — screen lies "no spread" while the server charges it`);
  // DOGE at mid 0.07: bid 0.069965 / ask 0.070035 → shown 0.06997/0.07004 → 0.0001, NOT 0.0
  const doge = spread('DOGEUSD', 0.070035, 0.069965);
  if (!(parseFloat(doge) > 0)) bad(`DOGEUSD 10bps spread must be visible (expected ~0.0001), got ${doge}`);
  // BTC keeps its friendly 1-decimal raw-gap look (62.6 style)
  if (spread('BTCUSD', 62654.41, 62591.78) !== '62.6') bad(`BTCUSD house-floor gap must still read 62.6, got ${spread('BTCUSD',62654.41,62591.78)}`);
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW-spread problem(s).`); process.exit(1); }
console.log('🟢 PASS: per-row spread from each row’s displayed bid/ask — EURUSD 1.0, USDJPY 1.9, AUDUSD 1.2 (own value), BTC 0.1; live, no shared var, closed → —.');
