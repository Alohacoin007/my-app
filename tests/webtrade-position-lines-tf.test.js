#!/usr/bin/env node
// REGRESSION (webtrade) — the position order-lines (green/red dotted at open_price) vanished when
// the timeframe changed. Changing tf recreates the chart + series, but the position-line effect
// only depended on [symbol], so it never redrew on the new series. It must re-run whenever the
// chart is recreated (symbol / tf / lazyHold / hydrated).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// the position-line effect must depend on tf (and the rest of the chart lifecycle), not just symbol
if (!/return positionsStore\.subscribe\(draw\);\s*\n?\s*\}, \[symbol, tf, lazyHold, hydrated\]\);/.test(src))
  bad('the position-line effect must re-run on tf change (deps [symbol, tf, lazyHold, hydrated]) so lines redraw on the new series');
if (/return positionsStore\.subscribe\(draw\);\s*\n?\s*\}, \[symbol\]\);/.test(src))
  bad('position-line effect still depends only on [symbol] — lines vanish on tf change');

if (fail) { console.error(`\n🔴 FAIL — ${fail} position-line/tf problem(s).`); process.exit(1); }
console.log('🟢 PASS: position order-lines redraw on the new series after a timeframe change (no longer vanish).');
