#!/usr/bin/env node
// REGRESSION (webtrade) — MONEY. Required margin used the FX contract size (100,000) for EVERY asset
// class, so a 0.01-lot CRYPTO/STOCK position locked ~100,000× too much margin (0.01 BTC → $640,000;
// two 0.01 positions → Free Margin blown negative). The fix: contract size is per-asset
// (FX=100,000, crypto/stocks=1), mirroring the server fx_notional_usd. Margin/P&L both key off it.
//   Margin = volume × contractSize(symbol) × priceUSD / leverage.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.01 : tol);

// ── extract the real math and exercise it with a stub feed ──
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };
const contractSize_src   = grab(/const contractSize = \(symbol\)=>[^\n]*/, 'contractSize');
const levCap_src         = grab(/const LEV_CAP = \(symbol\)=>[^\n]*/, 'LEV_CAP');
const baseUsdRate_src    = grab(/function baseUsdRate\(symbol\)\{[\s\S]*?\n\}/, 'baseUsdRate');
const requiredMargin_src = grab(/function requiredMargin\(symbol, volume, leverage\)\{[\s\S]*?\n\}/, 'requiredMargin');

if (!fail) {
  const SYM_CAT = { EURUSD:'Forex', USDJPY:'Forex', BTCUSD:'Crypto', SOLUSD:'Crypto', AAPL:'Stocks' };
  const priceStore = { mids:{ EURUSD:{mid:1.14}, USDJPY:{mid:162}, BTCUSD:{mid:64000}, SOLUSD:{mid:148}, AAPL:{mid:315} }, get(s){ return this.mids[s]; } };
  const rm = new Function('SYM_CAT','priceStore',
    'const CONTRACT=100000;\n' + contractSize_src + '\n' + levCap_src + '\n' + baseUsdRate_src + '\n' + requiredMargin_src + '\nreturn requiredMargin;'
  )(SYM_CAT, priceStore);

  // FX: cap 100 = chosen 100 → unchanged (tens of dollars for 0.01 lot)
  if (!near(rm('EURUSD', 0.01, 100), 11.4))  bad(`FX EURUSD 0.01 @100x margin should be ~$11.40, got ${rm('EURUSD',0.01,100)}`);
  if (!near(rm('USDJPY', 0.01, 100), 10.0))  bad(`FX USDJPY 0.01 @100x margin should be ~$10.00 (USD base), got ${rm('USDJPY',0.01,100)}`);
  // Crypto/stock: contract size 1 AND leverage clamped to the house cap 5× (server lockstep)
  if (!near(rm('BTCUSD', 0.01, 100), 128.0, 0.5)) bad(`CRYPTO BTCUSD 0.01 (chosen 100x → capped 5x) margin should be ~$128, got ${rm('BTCUSD',0.01,100)}`);
  if (rm('BTCUSD', 0.01, 100) > 5000)        bad(`CRYPTO margin blew up (contract size not per-asset): ${rm('BTCUSD',0.01,100)}`);
  if (!near(rm('AAPL', 0.01, 100), 0.63, 0.02)) bad(`STOCK AAPL 0.01 (capped 5x) margin should be ~$0.63, got ${rm('AAPL',0.01,100)}`);
  // leverage cap is a CLAMP, not a floor: choosing 5x explicitly gives the same crypto margin as 100x
  if (!near(rm('BTCUSD', 0.01, 5), rm('BTCUSD', 0.01, 100), 1e-6)) bad('crypto leverage must clamp to 5× (100x and 5x must match)');
  // the reported disaster is gone: two 0.01 crypto positions are hundreds, not $120k
  const two = rm('BTCUSD', 0.01, 100) + rm('SOLUSD', 0.01, 100);
  if (two > 5000) bad(`two 0.01-lot crypto positions lock $${two.toFixed(2)} (blow-up regression)`);
}

// ── the Equity / Free Margin / Margin Level chain must be wired per spec ──
if (!/const equity  = balance \+ floating;/.test(src)) bad('Equity = Balance + floating');
if (!/const usedMargin = pos\.reduce\(\(s,p\)=> s \+ requiredMargin\(p\.symbol, lotsOf\(p\), leverage\), 0\);/.test(src)) bad('used margin = Σ requiredMargin(open positions)');
if (!/const freeMargin = equity - usedMargin;/.test(src)) bad('Free Margin = Equity − used margin');
if (!/const level=marginUsed>0\?\(equity\/marginUsed\*100\):0;/.test(src)) bad('Margin Level = Equity/Margin × 100');
// contract size must NOT hardcode 100000 in the P&L paths any more
if (/const contract=100000;/.test(src)) bad('BottomBar P&L still hardcodes contract=100000 (crypto/stock P&L blows up)');
if (!/lotsOf\(p\)\*contractSize\(p\.symbol\)/.test(src)) bad('floating P&L must use contractSize(symbol) (per-asset, no scale), not a flat 100000');

// ── Free-Margin order gate + Margin Call / Stop-Out (30%) ──
// one-click panel: locked when no free margin; refuses with the error sound
if (!/const tradable = open && eng\.freeMargin>0;/.test(src)) bad('one-click panel must lock BUY/SELL when free margin ≤ 0');
if (!/if\(eng\.freeMargin<=0 \|\| need>eng\.freeMargin\+1e-9\)\{ playSnd\(sndError\); alert\('Margin Call/.test(src)) bad('one-click send must refuse over-margin orders with a Margin Call popup + error sound');
if (!/\(tradable\?'':' oc-closed'\)/.test(src)) bad('one-click panel must dim/disable when not tradable');
// New Order popup: Margin Call popup on submit + banner
if (!/if\(!canAfford\)\{ playSnd\(sndError\); alert\('Margin Call/.test(src)) bad('New Order submit must refuse with a Margin Call popup + error sound (was a silent return)');
if (!/\{open && !canAfford && <div className="om-closed">⚠ Margin Call/.test(src)) bad('New Order popup must show a Margin Call banner when free margin is insufficient');
// bottom bar: margin-call band at <100%, stop-out at the server 30% threshold
if (!/marginUsed>0&&level<100&&level>=30 &&/.test(src)) bad('bottom bar must warn Margin Call between 30% and 100%');
if (!/marginUsed>0&&level<30 && <b style=\{\{color:'#ff5252',marginLeft:6\}\}>⛔ Stop Out &lt;30%/.test(src)) bad('bottom bar Stop-Out warning must fire at <30% (server fx_stopout threshold), not <50%');

if (fail) { console.error(`\n🔴 FAIL — ${fail} margin-math problem(s).`); process.exit(1); }
console.log('🟢 PASS: per-asset contract size (FX 100k / crypto·stock 1) → 0.01-lot margin is a few dollars, not $640k; Equity/Free/Level chain intact.');
