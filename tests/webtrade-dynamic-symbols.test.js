#!/usr/bin/env node
// REGRESSION (webtrade) — the Market Watch symbol list is SERVER-DRIVEN, not hardcoded. symbolStore
// fetches the LIVE symbol set from the prices table + each symbol's class from fx_specs.cls, and the
// Market Watch renders that dynamic list (grouped/filtered by class via catOf, which inherits the
// server class). Back-office add/hide/disable of a symbol flows through automatically (it changes what
// prices/fx_specs return). Memory-only. The hardcoded SYMBOLS remain only as the boot/offline default.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) symbolStore fetches the live symbols (prices) + classes (fx_specs)
if (!/const symbolStore = \{/.test(src)) bad('symbolStore (server-driven symbol list) missing');
if (!/AlpexaSync\.db\.from\('prices'\)\.select\('symbol'\)/.test(src)) bad('symbolStore must fetch the live symbol set from prices');
if (!/AlpexaSync\.db\.from\('fx_specs'\)\.select\('symbol,cls'\)/.test(src)) bad('symbolStore must fetch each symbol class from fx_specs');
if (!/SERVER_CLS\[x\.symbol\]=String\(x\.cls\)\.toUpperCase\(\)/.test(src)) bad('server class must be captured into SERVER_CLS');
if (!/symbolStore\.load\(\)/.test(src)) bad('App must call symbolStore.load() on mount');

// 2) catOf inherits the SERVER class (lockstep) before falling back to inference
if (!/const catOf = \(s\)=> SYM_CAT\[s\] \|\| CLS_MAP\[SERVER_CLS\[s\]\] \|\|/.test(src)) bad('catOf must inherit the server class (fx_specs) before pattern inference');

// 3) Market Watch renders the LIVE list (syms state), not the hardcoded WATCH
if (!/const \[syms,setSyms\]=React\.useState\(symbolStore\.list\);/.test(src)) bad('MarketWatch must hold the live symbol list in state');
if (!/React\.useEffect\(\(\)=> symbolStore\.subscribe\(l=>setSyms\(\[\.\.\.l\]\)\), \[\]\)/.test(src)) bad('MarketWatch must subscribe to symbolStore');
if (!/const pool=syms\.filter\(s=>!hidden\.has\(s\)\);/.test(src)) bad('the full live pool must be held from the syms state');
if (!/pool\.filter\(s=> \(cat==='All'\|\|catOf\(s\)===cat\)/.test(src)) bad('class filter must run over the live pool via catOf');
if (!/\{visible\.map\(sym=>\{/.test(src)) bad('the Symbols table must render the (Top-20 / filtered) visible list');
if (!/<MWTrading cat=\{cat\} syms=\{visible\} onCtx=\{ctx\} \/>/.test(src)) bad('the Trading tab must render the visible list');
if (/WATCH\.filter\(sym=>!hidden\.has/.test(src)) bad('the Market Watch must NOT still render the hardcoded WATCH');

// 4) Top 20 default + background pool + search ingestion + throttle scoped to visible rows
if (!/const TOP20 = \[/.test(src)) bad('TOP20 default set missing');
if ((src.match(/'BTCUSD','ETHUSD'/g) || []).length < 1 || !/const TOP20 = \[[\s\S]*?'BTCUSD'[\s\S]*?\];/.test(src)) bad('TOP20 must include the popular symbols (BTCUSD, etc.)');
if (!/const visible = \(q \|\| cat!=='All'\)/.test(src)) bad('visible must be Top 20 by default, or the pool filtered on search/class');
if (!/pool\.filter\(s=>TOP20\.indexOf\(s\)>=0\)\.sort/.test(src)) bad('default view must be the Top 20 (in order) from the live pool');
if (!/!q \|\| s\.toLowerCase\(\)\.includes\(q\) \|\| catOf\(s\)\.toLowerCase\(\)\.includes\(q\)/.test(src)) bad('search must match symbol OR class over the full pool');
if (!/const \[search,setSearch\]=React\.useState\(''\)/.test(src)) bad('Market Watch needs a search box');
if (!/visRef\.current\.forEach\(s=>\{/.test(src)) bad('the tick throttle must compute ONLY the visible rows (not the whole pool)');
if (!/visRef\.current=visible;/.test(src)) bad('visRef must track the visible list for the throttle');

// 5) memory-only (no localStorage for the symbol list)
if (/localStorage\.[gs]etItem\([^)]*symbol/i.test(src)) bad('the symbol list must be memory-only (no localStorage)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} dynamic-symbol problem(s).`); process.exit(1); }
console.log('🟢 PASS: Market Watch is server-driven — symbolStore loads live symbols (prices) + classes (fx_specs); the list renders dynamically, class via catOf; back-office changes flow through; memory-only.');
