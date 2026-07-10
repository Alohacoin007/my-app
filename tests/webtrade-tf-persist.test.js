#!/usr/bin/env node
// REGRESSION (webtrade) — drawn objects (trend/fib/hlines) must SURVIVE a timeframe switch, like
// MT5: draw on M30, switch to H1 → the line is still there. The bug was that the chart effect
// listed `tf` in its deps, so changing tf tore down and rebuilt the whole chart (c.remove()),
// wiping every drawing. Fix: the chart is recreated on SYMBOL only; a separate tf effect reloads
// candles into the SAME chart/series (setData, no removeSeries/remove) so drawings persist.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) the main chart effect must NOT depend on tf (that dep is what caused the teardown)
if (!/\}, \[symbol, lazyHold, hydrated\]\);/.test(src)) bad('main chart effect must depend on [symbol, lazyHold, hydrated] — NOT tf');
if (/\}, \[symbol, tf, lazyHold, hydrated\]\);/.test(src)) bad('main chart effect still lists tf → tf change rebuilds the chart and wipes drawings');

// 2) a dedicated tf effect must exist and reload candles WITHOUT recreating the chart/series
const m = src.match(/TIMEFRAME change[\s\S]*?\}, \[tf\]\);/);
if (!m) { bad('no dedicated tf effect (reload candles on [tf]) found'); }
else {
  const block = m[0];
  if (!/loadCandles\(symbol, tf\)/.test(block)) bad('tf effect must loadCandles(symbol, tf)');
  if (!/s\.setData\(asSeriesData\(data,typeRef\.current\)\)/.test(block)) bad('tf effect must setData into the existing series');
  if (/removeSeries\(|c\.remove\(\)/.test(block)) bad('tf effect must NOT remove the series/chart (that would wipe drawings)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} tf-persistence problem(s).`); process.exit(1); }
console.log('🟢 PASS: timeframe change reloads candles into the same chart/series (no teardown) — drawn trend/fib/hlines survive the switch, like MT5.');
