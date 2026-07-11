#!/usr/bin/env node
// REGRESSION — the MT5 "History" toolbox tab was a static placeholder ("No history in the selected
// period") that never recorded anything. It must now log CLOSED deals (like MT5): closing a position
// appends a history row (symbol/ticket/close-time/type/volume/open+close price/profit), newest first,
// and the History tab renders them with a Profit total. Demo history is IN-MEMORY only (never
// localStorage — demo P/L must not become a cached money "truth", CLAUDE.md #5).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) store carries an in-memory history log + a recordClose that pushes newest-first
if (!/\bhistory:\[\],/.test(src)) bad('positionsStore must have an in-memory history:[] log');
if (!/recordClose\(p, closePrice, profit\)\{/.test(src)) bad('positionsStore.recordClose(p, closePrice, profit) missing');
if (!/this\.history=\[\{[\s\S]*?\}\]\.concat\(this\.history\);/.test(src)) bad('recordClose must prepend (newest-first) the closed deal');
if (!/close_price:\+closePrice\|\|0/.test(src) || !/profit:\+profit\|\|0/.test(src)) bad('recordClose must capture close_price and profit');
// must NOT persist demo history to localStorage
if (/localStorage\.[gs]etItem\([^)]*hist/i.test(src)) bad('history must NOT touch localStorage (demo P/L is not a cached truth)');

// 2) closing a position records the deal — both demo and real paths
if (!/positionsStore\.recordClose\(p, m\.mid, plOf\(p\)\);\s*\/\/ log the closed deal/.test(src)) bad('demo close must recordClose before removeDemo');
if (!/positionsStore\.recordClose\(p, m\.mid, pl\);\s*\/\/ realized/.test(src)) bad('real close must recordClose after a successful fx_close');

// 3) BottomBar subscribes to history and renders the rows (no longer a hard-coded placeholder)
if (!/setHist\(\[\.\.\.s\.history\]\)/.test(src)) bad('BottomBar must subscribe to positionsStore.history');
if (!/tab==='History' && !hist\.length && <tr><td className="empty"/.test(src)) bad('empty placeholder must only show when there is NO history');
if (!/tab==='History' && hist\.map\(h=>\(/.test(src)) bad('History tab must map over the recorded deals');
if (!/tab==='History' && hist\.length>0 && <tfoot>/.test(src)) bad('History tab must show a Profit total footer');

if (fail) { console.error(`\n🔴 FAIL — ${fail} History-tab problem(s).`); process.exit(1); }
console.log('🟢 PASS: MT5 History tab logs closed deals (in-memory, newest-first) with a Profit total; empty state only when no history.');
