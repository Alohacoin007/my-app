#!/usr/bin/env node
// REGRESSION (webtrade) — MONEY / DATA BINDING. The bottom Trade table appeared to copy the LAST
// position's entry price + current price + profit onto every row (spread between rows died to 0).
// Root guard: each position must mark against ITS OWN stored entry (open_price) and ITS OWN symbol's
// live quote, per side (BUY closes at BID, SELL at ASK). There is now ONE P&L helper (positionPnL)
// used by both the engine's `floating` and the table's `plOf`, so the two can never diverge.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol);

// ── extract the real helpers and exercise them ──
const grab = (re, l) => { const m = src.match(re); if (!m) bad(l + ' missing'); return m ? m[0] : ''; };
const lotsOf_src       = grab(/const lotsOf = \(p\)=>[^\n]*/, 'lotsOf');
const sideUp_src       = grab(/const sideUp = \(s\)=>[^\n]*/, 'sideUp');
const contractSize_src = grab(/const contractSize = \(symbol\)=>[^\n]*/, 'contractSize');
const closePx_src      = grab(/const closePx = \(p, q\)=>[^\n]*/, 'closePx');
const positionPnL_src  = grab(/function positionPnL\(p, q\)\{[\s\S]*?\n\}/, 'positionPnL');

if (!fail) {
  const SYM_CAT = { EURUSD:'Forex', BTCUSD:'Crypto' };
  const scope = new Function('SYM_CAT',
    'const CONTRACT=100000;\n' + lotsOf_src + '\n' + sideUp_src + '\n' + contractSize_src + '\n' +
    closePx_src + '\n' + positionPnL_src + '\nreturn { positionPnL, closePx };')(SYM_CAT);
  const { positionPnL, closePx } = scope;

  // [1] three BUYs, same symbol, DIFFERENT entries → three DIFFERENT P&Ls (no copy)
  const q = { bid: 1.1430, ask: 1.1432 };
  const p1 = { symbol:'EURUSD', side:'buy', size:0.01, open_price:1.1400 };
  const p2 = { symbol:'EURUSD', side:'buy', size:0.01, open_price:1.1410 };
  const p3 = { symbol:'EURUSD', side:'buy', size:0.01, open_price:1.1420 };
  const [a, b, c] = [positionPnL(p1, q), positionPnL(p2, q), positionPnL(p3, q)];
  if (!near(a, 3.0)) bad(`p1 P&L should be +3.00 (own entry 1.1400), got ${a}`);
  if (!near(b, 2.0)) bad(`p2 P&L should be +2.00 (own entry 1.1410), got ${b}`);
  if (!near(c, 1.0)) bad(`p3 P&L should be +1.00 (own entry 1.1420), got ${c}`);
  if (a === b || b === c) bad('positions with different entries produced identical P&L → still copying');

  // [2] side convention: BUY marks against BID, SELL against ASK
  const buy  = { symbol:'EURUSD', side:'buy',  size:0.01, open_price:1.1420 };
  const sell = { symbol:'EURUSD', side:'sell', size:0.01, open_price:1.1420 };
  if (closePx(buy, q)  !== q.bid) bad('BUY current price must be the BID');
  if (closePx(sell, q) !== q.ask) bad('SELL current price must be the ASK');
  if (!near(positionPnL(sell, q), (1.1420 - 1.1432) * 0.01 * 100000)) bad('SELL P&L must use ASK');
  // a BUY marked against BID is unaffected by ASK moves (proves it reads the right side)
  if (positionPnL(buy, { bid:1.1430, ask:1.1432 }) !== positionPnL(buy, { bid:1.1430, ask:9.9 })) bad('BUY P&L must ignore ASK (uses BID)');

  // [3] crypto: own entry, per-side, TRUE contract size 1 (production — no visibility scale)
  const btc1 = { symbol:'BTCUSD', side:'buy', size:0.01, open_price:63806.82 };
  const btc2 = { symbol:'BTCUSD', side:'buy', size:0.01, open_price:63700.00 };
  const bq = { bid:63801.29, ask:63801.40 };
  if (!near(positionPnL(btc1, bq), (63801.29 - 63806.82) * 0.01, 1e-6)) bad('BTC p1 P&L must be the TRUE per-side value (contract size 1, BID) — no scale');
  if (positionPnL(btc1, bq) === positionPnL(btc2, bq)) bad('two BTC positions with different entries must have different P&L');
}

// ── ONE source of truth: both P&L call sites route through positionPnL ──
if (!/const floating = pos\.reduce\(\(s,p\)=> s \+ positionPnL\(p, priceStore\.get\(p\.symbol\)\), 0\);/.test(src)) bad('engine floating must use positionPnL');
if (!/const plOf=\(p\)=> positionPnL\(p, mids\[p\.symbol\]\);/.test(src)) bad('BottomBar plOf must use positionPnL (no duplicate formula)');
// the table's current-price column marks per-side, the entry column stays the stored open_price
if (!/<td>\{fmtPx\(p\.symbol,closePx\(p,m\)\)\}<\/td>/.test(src)) bad('current-price column must show the per-side close price (closePx)');
if (!/<td>\{fmtPx\(p\.symbol,\+p\.open_price\)\}<\/td>/.test(src)) bad('entry column must show the position\'s OWN stored open_price');
// no leftover mid-based P&L formula in the trade paths
if (/\(m\.mid-\(\+p\.open_price\|\|m\.mid\)\)/.test(src)) bad('a mid-based P&L formula remains (should be per-side via positionPnL)');
// correct per-asset suffix in the table (btcusd.cr, not btcusd.fx)
if (!/\{p\.symbol\.toLowerCase\(\)\}\{sfx\(p\.symbol\)\.toLowerCase\(\)\}/.test(src)) bad('position row must use the per-asset suffix sfx(), not a hardcoded .fx');

// ── Profit is a CLEAN 2 decimals everywhere (no messy decimal expansion) ──
if (/const pnl=\(n\)=>/.test(src)) bad('the decimal-expanding pnl() formatter must be removed (Profit = 2 decimals uniformly)');
if (!/<td className=\{pl>=0\?'up':'down'\}>\{num\(pl\)\}<\/td>/.test(src)) bad('per-row Profit must use num() (2 decimals)');
if (!/\{t\('Profit'\)\}:<\/span> <b className=\{floating>=0\?'up':'down'\}>\{num\(floating\)\}/.test(src)) bad('account Profit total must use num() (2 decimals)');

// ── production: NO P&L scale — both margin and P&L use the true contractSize ──
if (/pnlContract|CRYPTO_PNL_SCALE/.test(src)) bad('the demo P&L visibility scale must be removed in production');
if (!/return \(\+volume\|\|0\)\*contractSize\(symbol\)\*baseUsdRate\(symbol\)\/lev;/.test(src)) bad('requiredMargin must use the true contractSize');
if (!/lotsOf\(p\)\*contractSize\(p\.symbol\)/.test(src)) bad('positionPnL must use the true contractSize (no scale)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} position-binding problem(s).`); process.exit(1); }
console.log('🟢 PASS: each position marks against its OWN entry + OWN symbol quote, per side (BUY→BID, SELL→ASK); one shared positionPnL helper; no copied prices/P&L.');
