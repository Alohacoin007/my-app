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
if (!/syms\.filter\(sym=>!hidden\.has\(sym\) && \(cat==='All'\|\|catOf\(sym\)===cat\)\)/.test(src)) bad('the Symbols table must map the live syms (class-filtered via catOf)');
if (!/<MWTrading cat=\{cat\} syms=\{syms\} onCtx=\{ctx\} \/>/.test(src)) bad('the Trading tab must also use the live syms');
if (/WATCH\.filter\(sym=>!hidden\.has/.test(src)) bad('the Market Watch must NOT still render the hardcoded WATCH');

// 4) memory-only (no localStorage for the symbol list)
if (/localStorage\.[gs]etItem\([^)]*symbol/i.test(src)) bad('the symbol list must be memory-only (no localStorage)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} dynamic-symbol problem(s).`); process.exit(1); }
console.log('🟢 PASS: Market Watch is server-driven — symbolStore loads live symbols (prices) + classes (fx_specs); the list renders dynamically, class via catOf; back-office changes flow through; memory-only.');
