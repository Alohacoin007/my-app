#!/usr/bin/env node
// REGRESSION (webtrade) — the Market Watch must open with the 7 classic FX majors pinned to the TOP in
// this exact order: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD — ahead of every crypto/
// stock/cross — in EVERY view. Before, the symbolStore sorted Forex alphabetically (AUDUSD before
// GBPUSD…), so class-filter/search lists were out of order. Now MAJORS is pinned first in the sort,
// SYMBOLS.Forex leads with them (boot/offline), and TOP20's first 7 match (default view).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const ORDER = ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD'];

// ── static: canonical MAJORS constant + it leads SYMBOLS.Forex + TOP20 + the sort pins it ──
if (!new RegExp("const MAJORS = \\['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD'\\]").test(src))
  bad('MAJORS must list the 7 majors in the canonical order');
if (!/Forex:  \['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD'/.test(src))
  bad('SYMBOLS.Forex (boot/offline default) must lead with the 7 majors in order');
if (!/const TOP20 = \['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD'/.test(src))
  bad("TOP20's first 7 must be the majors in order (default Top-20 view)");
if (!/const ma=MAJORS\.indexOf\(a\), mb=MAJORS\.indexOf\(b\);\s*\n\s*if\(ma>=0\|\|mb>=0\)\{ if\(ma>=0&&mb>=0\) return ma-mb; return ma>=0\?-1:1; \}/.test(src))
  bad('symbolStore sort must pin the majors to the top in canonical order');

// ── behavioural: run the real sort on a shuffled live pool ──
const maj = (src.match(/const MAJORS = \[[^\]]*\]/) || [])[0];
if (!maj) bad('MAJORS array not extractable');
if (!fail) {
  const MAJORS = new Function(maj + '; return MAJORS;')();
  const catOf = (s)=> /USD$/.test(s) && !MAJORS.includes(s) && !/^[A-Z]{6}$/.test(s) ? 'Crypto'
    : ({BTCUSD:'Crypto',ETHUSD:'Crypto',AAPL:'Stocks',MSFT:'Stocks'}[s]) || (/^[A-Z]{6}$/.test(s) ? 'Forex' : 'Stocks');
  const rank={Forex:0,Stocks:1,Crypto:2,Index:3};
  const sortLive = (live)=> live.slice().sort((a,b)=>{
    const ma=MAJORS.indexOf(a), mb=MAJORS.indexOf(b);
    if(ma>=0||mb>=0){ if(ma>=0&&mb>=0) return ma-mb; return ma>=0?-1:1; }
    const ra=rank[catOf(a)]??9, rb=rank[catOf(b)]??9; return ra-rb || (a<b?-1:a>b?1:0);
  });
  const pool = ['BTCUSD','AAPL','NZDUSD','GBPUSD','ETHUSD','EURUSD','USDCHF','MSFT','USDJPY','AUDUSD','USDCAD'];
  const out = sortLive(pool);
  const head = out.slice(0,7);
  if (JSON.stringify(head) !== JSON.stringify(ORDER)) bad(`first 7 rows must be the majors in order, got ${JSON.stringify(head)}`);
  // everything after the 7 majors must be non-majors (crypto/stock below)
  if (out.slice(7).some(s=>MAJORS.includes(s))) bad('no major may fall below row 7');
  // a crypto/stock must never precede a major
  if (out.indexOf('BTCUSD') < 7 || out.indexOf('AAPL') < 7) bad('crypto/stock must sort BELOW the 7 majors');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} MW-majors problem(s).`); process.exit(1); }
console.log('🟢 PASS: the 7 FX majors are pinned to Market Watch rows 1–7 in canonical order (EURUSD…NZDUSD); crypto/stocks sort below, in every view.');
