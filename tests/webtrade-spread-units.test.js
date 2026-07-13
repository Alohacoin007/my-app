#!/usr/bin/env node
// REGRESSION / LOCKSTEP (webtrade) — prices.spr_pts is ONE column carrying THREE unit regimes,
// set by the writer Edge per asset class (verified against the live DB 2026-07-13):
//   fx-prices    → FX in PIPS   ((ask−bid)/pip; its "reported in points" comment is WRONG)
//   crypto-prices→ real exchange spread in BPS (Binance bookTicker)
//   stock-prices → always 0     (the house floor below IS the stock spread)
// webtrade must therefore convert to a price half-gap EXACTLY like fx_close.sql v_half /
// trading.html fxHalfSpread (floating == server realized):
//   FX     : greatest(0.1, spr + markup) * pip / 2
//   non-FX : mid * greatest(FLOOR_BPS[class], spr) / 10000 / 2   (CRYPTO 10 · STOCK 8)
// Reading ONE unit for every class (spr × tickSize) was the 2026-07-13 bug: FX 10× too tight,
// ETH/stocks bid==ask (0.0), DOGE a 28%-wide 0.06/0.08 quote.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: per-class converter exists; the uniform ×tickSize conversion is GONE ──
const floor_src = grab(/const SPREAD_FLOOR_BPS = \{[^\n]*/, 'SPREAD_FLOOR_BPS lockstep table');
const half_src  = grab(/const halfPx = [\s\S]*?;\n/, 'halfPx converter');
const pip_src   = grab(/const pip   = \(s\)=>[^\n]*/, 'pip');
if (/spr\s*\*\s*tickSize\(/.test(src)) bad('uniform spr×tickSize conversion must be gone (units differ per class at the source)');
if (/sp\s*\*\s*ts\s*\/\s*2/.test(src)) bad('_simulate uniform sp×ts/2 conversion must be gone');
if (!/this\._set\(sym, mid, halfPx\(sym, mid, spr/.test(src)) bad('_apply must derive the half-gap via halfPx');
const simBody = grab(/_simulate\(\)\{[\s\S]*?\n  \},/, '_simulate');
if (simBody && !/halfPx\(sym/.test(simBody)) bad('_simulate must derive the half-gap via halfPx');
if (floor_src && !/Crypto\s*:\s*10\b/.test(floor_src)) bad('Crypto floor must be 10 bps (ALPEXA_SPREAD_BPS lockstep)');
if (floor_src && !/Stocks\s*:\s*8\b/.test(floor_src)) bad('Stocks floor must be 8 bps (ALPEXA_SPREAD_BPS lockstep)');

// ── behavioural: halfPx == fx_close.sql v_half for every class ──
if (!fail) {
  const catOf = (s)=> ({EURUSD:'Forex',USDJPY:'Forex',ETHUSD:'Crypto',DOGEUSD:'Crypto',BTCUSD:'Crypto',AAPL:'Stocks'}[s]);
  const { halfPx } = new Function('catOf',
    pip_src + '\n' + floor_src + '\n' + half_src + '\nreturn {halfPx};')(catOf);
  // independent re-statement of fx_close.sql v_half (same shape as tests/fx-floating-spread.test.js)
  const serverPip  = (s)=> s.includes('JPY') ? 0.01 : 0.0001;
  const serverHalf = (cls, sym, mid, spr, mk)=> cls==='FX'
    ? Math.max(0.1, (spr||0) + (mk||0)) * serverPip(sym) / 2
    : mid * Math.max(cls==='CRYPTO'?10:8, spr||0) / 10000 / 2;
  const CASES = [   // [sym, serverCls, mid, spr(feed units), mk] — incl. the LIVE values from the 2026-07-13 audit
    ['EURUSD','FX',      1.138565, 1,    0], ['EURUSD','FX', 1.138565, 0,   0], ['EURUSD','FX', 1.138565, 1, 2],
    ['USDJPY','FX',      162.4655, 2,    0],
    ['ETHUSD','CRYPTO',  1757.595, 0.06, 0], ['ETHUSD','CRYPTO', 1757.595, 30, 0],
    ['DOGEUSD','CRYPTO', 0.071155, 1.41, 0], ['BTCUSD','CRYPTO', 61966.875, 0, 0],
    ['AAPL','STOCK',     316.33,   0,    0],
  ];
  for (const [sym, cls, mid, spr, mk] of CASES) {
    const c = halfPx(sym, mid, spr, mk), s = serverHalf(cls, sym, mid, spr, mk);
    if (Math.abs(c - s) > 1e-12) bad(`${sym} halfPx ${c} != fx_close v_half ${s} (spr=${spr}, mk=${mk}) — floating would drift from realized`);
  }
  // the three reported symptoms, fixed:
  const gap = (sym, mid, spr)=> 2 * halfPx(sym, mid, spr, 0);
  if (Math.abs(gap('EURUSD', 1.138565, 1) / 0.0001 - 1.0) > 1e-9) bad('EURUSD spr=1 pip must DISPLAY 1.0 pip (was 0.1 — 10× too tight)');
  if (gap('AAPL', 316.33, 0) <= 0) bad('stocks must never quote zero spread (house floor 8 bps)');
  if (gap('DOGEUSD', 0.071155, 1.41) >= 0.005) bad('DOGE 1.41 bps must be a sub-cent gap (was a 28%-wide 0.06/0.08 quote)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} spread-unit problem(s).`); process.exit(1); }
console.log('🟢 PASS: per-class spr_pts units (FX pips · crypto bps · stock floor) convert exactly like fx_close.sql v_half — floating == realized, no uniform ×tickSize.');
