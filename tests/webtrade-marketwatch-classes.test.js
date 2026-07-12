#!/usr/bin/env node
// REGRESSION (webtrade) — Market Watch carries Forex + Stocks + Crypto, and its right-click menu
// filters by asset class (Forex / Stocks / Crypto / All). Symbols are classified once (SYM_CAT) and
// WATCH is the union; the list filters on the selected class; pip/digits adapt per class.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// eval the symbol classification block
const m = src.match(/const SYMBOLS = \{[\s\S]*?const WATCH = \[[^\]]*\];/);
if (!m) { console.error('🔴 SYMBOLS/SYM_CAT/WATCH block not found'); process.exit(1); }
let env;
try { env = new Function(m[0] + '\nreturn { SYMBOLS, SYM_CAT, WATCH };')(); }
catch (e) { console.error('🔴 could not eval symbols — ' + e.message); process.exit(1); }
const { SYMBOLS, SYM_CAT, WATCH } = env;

// all three classes exist and WATCH is their union
for (const c of ['Forex', 'Stocks', 'Crypto']) if (!(SYMBOLS[c] && SYMBOLS[c].length)) bad(`SYMBOLS.${c} must be non-empty`);
if (WATCH.length !== SYMBOLS.Forex.length + SYMBOLS.Stocks.length + SYMBOLS.Crypto.length) bad('WATCH must be the union of all classes');
if (SYM_CAT.EURUSD !== 'Forex') bad('EURUSD must classify as Forex');
if (SYM_CAT.AAPL !== 'Stocks') bad('AAPL must classify as Stocks');
if (SYM_CAT.BTCUSD !== 'Crypto') bad('BTCUSD must classify as Crypto');
if (WATCH.indexOf('AAPL') < 0 || WATCH.indexOf('BTCUSD') < 0) bad('stocks + crypto must be in the watch list');

// every symbol needs a BASE seed (so the demo simulator can price it)
const baseBlock = (src.match(/const BASE = \{[\s\S]*?\};/) || [''])[0];
for (const s of ['AAPL', 'BTCUSD', 'ETHUSD', 'TSLA']) if (!new RegExp('\\b' + s + ':').test(baseBlock)) bad(`BASE missing a seed price for ${s}`);

// the Market Watch list filters by the selected class
if (!/WATCH\.filter\(sym=>!hidden\.has\(sym\) && \(cat==='All'\|\|SYM_CAT\[sym\]===cat\)\)/.test(src)) bad('MW list must filter by the selected class (cat)');
// the right-click menu offers the class filters + All
for (const c of ['Forex', 'Stocks', 'Crypto']) if (!new RegExp(`\\{l:'${c}', act:'cat', arg:'${c}'\\}`).test(src)) bad(`right-click menu missing the ${c} filter`);
if (!/\{l:'All Symbols', act:'cat', arg:'All'\}/.test(src)) bad('right-click menu must have an "All Symbols" entry');
if (!/if\(it\.act==='cat'\) onCat&&onCat\(it\.arg\)/.test(src)) bad('choosing a class must call onCat');

// pip/digits adapt to stocks/crypto (2 digits, 0.01 pip) instead of FX 5/0.0001
if (!/catOf\(s\)==='Stocks'\|\|catOf\(s\)==='Crypto'\) \? 0\.01/.test(src)) bad('pip must be 0.01 for stocks/crypto (via catOf, so off-watch symbols work too)');
if (!/catOf\(s\)==='Stocks'\|\|catOf\(s\)==='Crypto'\) \? 2/.test(src)) bad('digits must be 2 for stocks/crypto (via catOf)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} market-watch-class problem(s).`); process.exit(1); }
console.log('🟢 PASS: Market Watch has Forex+Stocks+Crypto (classified via SYM_CAT, priced from BASE); right-click filters by class (Forex/Stocks/Crypto/All); pip/digits adapt.');
