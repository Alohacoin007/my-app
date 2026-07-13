#!/usr/bin/env node
// REGRESSION / LOCKSTEP (trading.html) — DISPLAY == EXECUTION == WEBTRADE (2026-07-13).
// The FX app used to DISPLAY quotes as `sim last + a hardcoded table spread` (with a random
// "breathing" animation) while CHARGING fxHalfSpread(live spr_pts + markup) at open/close —
// the customer saw a spread the desk never dealt, and a different price than webtrade.
// New rule, one truth:
//   fxQuoteMid(m) = the REAL feed mid (same anchor fx_close uses)
//   fxBidPx(m) = mid − fxHalfSpread   ·   fxAskPx(m) = mid + fxHalfSpread
//   every displayed quote / entry / close preview / spread badge reads THESE — nothing
//   reads `last + spread` any more. fxClosePx identities guarantee display==realized,
//   and the same (mid, spr, markup) inputs make trading.html == webtrade to the tick.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'trading.html'), 'utf8');
const wtSrc = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (s, re, label) => { const m = s.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: helpers exist, are exported, and the sim-spread display path is DEAD ──
const mid_src  = grab(src, /function fxQuoteMid\(m\)\{[^\n]*/, 'fxQuoteMid');
const bid_src  = grab(src, /function fxBidPx\(m\)\{[^\n]*/, 'fxBidPx');
const ask_src  = grab(src, /function fxAskPx\(m\)\{[^\n]*/, 'fxAskPx');
if (bid_src && !/fxHalfSpread\(m,mid\)/.test(bid_src)) bad('fxBidPx must charge fxHalfSpread (the fx_close half)');
if (ask_src && !/fxHalfSpread\(m,mid\)/.test(ask_src)) bad('fxAskPx must charge fxHalfSpread (the fx_close half)');
if (!/fxBidPx,fxAskPx|fxAskPx,fxBidPx/.test(src.match(/window\.ALPEXA_MARKET=\{[^\n]*/)?.[0] || ''))
  bad('fxBidPx/fxAskPx must be exported on ALPEXA_MARKET (components live in another scope)');
if (/\.last\s*\+\s*[A-Za-z.]*spread/.test(src))
  bad('a displayed quote still reads `last + spread` (sim spread) — every quote must go through fxAskPx/fxBidPx');
if (/\(s\.spread\*Math\.pow\(10,s\.digits\)\)\.toFixed\(0\)/.test(src))
  bad('a spread badge still shows the sim s.spread — badges must show the LIVE dealt spread (fxAskPx−fxBidPx)');

// ── behavioural: identities + cross-app parity with webtrade ──
if (!fail) {
  const pip_src  = grab(src, /function fxPip\([\s\S]*?\n\}/, 'fxPip');
  const bps_src  = grab(src, /var ALPEXA_SPREAD_BPS=\{[^\n]*/, 'ALPEXA_SPREAD_BPS');
  const half_src = grab(src, /function fxHalfSpread\(m,mid\)\{[\s\S]*?\n\}/, 'fxHalfSpread');
  const close_src= grab(src, /function fxClosePx\(m,side\)\{[\s\S]*?\n\}/, 'fxClosePx');
  const env = { __alpexaFXFeed: { EURUSD: { spr: 0.6 }, BTCUSD: { spr: 1.5 } }, __alpexaFXMarks: { EURUSD: 0.8 } };
  const lib = new Function('window',
    pip_src + '\n' + bps_src + '\n' + half_src + '\n' + close_src + '\n' + mid_src + '\n' + bid_src + '\n' + ask_src +
    '\nreturn {fxHalfSpread,fxClosePx,fxQuoteMid,fxBidPx,fxAskPx};')(env);
  const eq = (a, b) => Math.abs(a - b) < 1e-12;
  const fx = { cls: 'FX', sym: 'EURUSD', real: true, bid: 1.13850, last: 1.20000 };   // sim last far away on purpose
  // [1] quotes anchor to the REAL mid, never the sim drift
  if (!eq(lib.fxQuoteMid(fx), 1.13850)) bad('quote mid must be the real feed mid, not the sim last');
  // [2] the dealt spread: max(0.1, 0.6+0.8)=1.4 pips
  if (!eq(lib.fxAskPx(fx) - lib.fxBidPx(fx), 1.4e-4)) bad(`FX displayed gap must be the DEALT 1.4 pips, got ${(lib.fxAskPx(fx)-lib.fxBidPx(fx))/1e-4}`);
  // [3] display == realized: a BUY closes at the displayed bid, a SELL at the displayed ask
  if (!eq(lib.fxClosePx(fx, 'BUY'), lib.fxBidPx(fx))) bad('displayed BID must equal the fx_close BUY exit');
  if (!eq(lib.fxClosePx(fx, 'SELL'), lib.fxAskPx(fx))) bad('displayed ASK must equal the fx_close SELL exit');
  // [4] crypto floor path
  const cr = { cls: 'CRYPTO', sym: 'BTCUSD', real: true, bid: 62000, last: 0 };
  if (!eq(lib.fxAskPx(cr) - lib.fxBidPx(cr), 62000 * 10 / 10000)) bad('crypto displayed gap must be the 10 bps house floor');
  // [5] no feed yet → quotes fall back around the sim last (still symmetric)
  const off = { cls: 'FX', sym: 'EURUSD', real: false, bid: 0, last: 1.10000 };
  if (!eq(lib.fxQuoteMid(off), 1.1)) bad('feedless symbol must quote around last (fallback)');
  // [6] CROSS-APP PARITY: webtrade's halfPx on the same inputs gives the same half
  const wt_pip   = grab(wtSrc, /const pip   = \(s\)=>[^\n]*/, 'webtrade pip');
  const wt_floor = grab(wtSrc, /const SPREAD_FLOOR_BPS = \{[^\n]*/, 'webtrade floor');
  const wt_half  = grab(wtSrc, /const halfPx = [\s\S]*?;\n/, 'webtrade halfPx');
  const catOf = (s) => ({ EURUSD: 'Forex', BTCUSD: 'Crypto' }[s]);
  const { halfPx } = new Function('catOf', wt_pip + '\n' + wt_floor + '\n' + wt_half + '\nreturn {halfPx};')(catOf);
  if (!eq(2 * halfPx('EURUSD', 1.13850, 0.6, 0.8), lib.fxAskPx(fx) - lib.fxBidPx(fx)))
    bad('trading.html and webtrade must deal the SAME FX spread for the same (mid, spr, markup)');
  if (!eq(2 * halfPx('BTCUSD', 62000, 1.5, 0), lib.fxAskPx(cr) - lib.fxBidPx(cr)))
    bad('trading.html and webtrade must deal the SAME crypto spread for the same inputs');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} display-lockstep problem(s).`); process.exit(1); }
console.log('🟢 PASS: FX-app quotes = mid ∓ fxHalfSpread — display == fx_close realized == webtrade, sim last/table spread retired from every quote and badge.');
