#!/usr/bin/env node
// REGRESSION (webtrade chart) — CANDLE ORIENTATION must never invert. A report claimed candles render
// upside-down vs MT5 (a down bar showing as an up bar). This proves the OHLC pipeline is CORRECT end
// to end so a real inversion would be caught: high = max(open,close), low = min(open,close); the feed
// maps Polygon o/h/l/c → open/high/low/close (not swapped); colours are up=green / down=red (LWC
// convention: upColor when close≥open). NOTE: for logged-out users / crypto the chart is SYNTHETIC
// (a random-but-correctly-shaped walk) — it cannot match MT5's real shapes because it isn't real data,
// which is NOT the same as being inverted.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── 1) behavioural: synthCandles OHLC invariants hold for EVERY bar (no swap) ──
const start = src.indexOf('function synthCandles(');
let i = src.indexOf('{', start), d = 0, end = -1;
for (; i < src.length; i++) { const ch = src[i]; if (ch === '{') d++; else if (ch === '}') { d--; if (d === 0) { end = i + 1; break; } } }
const fn = src.slice(start, end);
const TF_SEC = { M1:60, M5:300, M15:900, M30:1800, H1:3600, H4:14400, D1:86400 };
const synth = new Function('Date', 'priceStore', 'BASE', 'Math', 'TF_SEC', fn + '\nreturn synthCandles;')(
  { now: () => 1_752_000_000_000 }, { get: () => ({ mid: 161.69 }) }, { USDJPY: 161.69 }, Math, TF_SEC);
const bars = synth('USDJPY', 'M1');
let up = 0, down = 0;
for (const b of bars) {
  if (b.high < Math.max(b.open, b.close) - 1e-9) bad(`bar ${b.time}: high ${b.high} < max(open,close) — HIGH/LOW inverted`);
  if (b.low  > Math.min(b.open, b.close) + 1e-9) bad(`bar ${b.time}: low ${b.low} > min(open,close) — HIGH/LOW inverted`);
  if (b.low <= 0) bad(`bar ${b.time}: non-positive low`);
  if (b.close > b.open) up++; else if (b.close < b.open) down++;
}
if (up < 20 || down < 20) bad(`expected a mix of up & down bars, got up=${up} down=${down}`);
if (Math.abs(bars[bars.length - 1].close - 161.69) > 1e-6) bad('last bar close must anchor to the live mid');

// ── 2) feed mapping: Polygon o/h/l/c → open/high/low/close (NOT swapped) ──
const fr = (src.match(/async function fetchRealCandles\(symbol, tf\)\{[\s\S]*?\n\}/) || [''])[0];
if (!/open:\+c\.o\|\|\+c\.open/.test(fr))   bad('fetchRealCandles must map o → open');
if (!/high:\+c\.h\|\|\+c\.high/.test(fr))   bad('fetchRealCandles must map h → high');
if (!/low:\+c\.l\|\|\+c\.low/.test(fr))     bad('fetchRealCandles must map l → low');
if (!/close:\+c\.c\|\|\+c\.close/.test(fr)) bad('fetchRealCandles must map c → close');

// ── 3) live tick keeps orientation within the SAME bucket: open fixed, high=max, low=min, close=mid ──
// (the new-bucket branch opens a fresh bar at the prior close — see webtrade-bar-rollover.test.js)
if (!/\{ time:b\.time, open:b\.open, high:Math\.max\(b\.high,close\), low:Math\.min\(b\.low,close\), close \};/.test(src))
  bad('onTick same-bucket branch must preserve open + extend high=max / low=min with the live close');

// ── 4) candle colours: up=green body-outline / down=red (LWC upColor = close≥open) ──
if (!/upColor:ct\.upBody, downColor:ct\.downBody, wickUpColor:ct\.upLine, wickDownColor:ct\.downLine/.test(src))
  bad('candle colours must map upColor→upBody / downColor→downBody (not swapped)');
if (!/dark:\s*\{ upBody:'rgba\(0,0,0,0\)', downBody:'#ff2b2b', upLine:'#00ff00', downLine:'#ff2b2b' \}/.test(src))
  bad('dark theme must be up=hollow green / down=filled red (unchanged)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} candle-orientation problem(s).`); process.exit(1); }
console.log(`🟢 PASS: candles are correctly oriented (up=${up} down=${down}, 0 OHLC violations); feed o/h/l/c→open/high/low/close; colours up=green/down=red — no inversion.`);
