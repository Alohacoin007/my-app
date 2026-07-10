#!/usr/bin/env node
// REGRESSION (webtrade chart) — the synthetic candle history must be STABLE across reloads.
// Before: synthCandles() built a fresh Math.random() walk every call, so every refresh drew a
// totally different chart ("리프레시 후에 챠트 데이타 이렇게 유지 못해?"). Fix: the history is a
// pure function of (symbol, absolute bar time) — same inputs → byte-identical candles — while the
// final bar still anchors to the live mid. This evals the REAL synthCandles from webtrade.html
// with stubbed globals and asserts two calls at the same wall-clock + mid are identical.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');

// ── extract the synthCandles function body (brace-matched) ──
const start = src.indexOf('function synthCandles(');
if (start < 0) { console.error('🔴 synthCandles not found'); process.exit(1); }
let i = src.indexOf('{', start), depth = 0, end = -1;
for (; i < src.length; i++) { const ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
const fnText = src.slice(start, end);

// 1) STATIC poka-yoke: the history walk must not be seeded by Math.random (non-determinism source).
if (/Math\.random\s*\(/.test(fnText)) {
  console.error('🔴 FAIL: synthCandles still uses Math.random — history will change on every refresh.');
  process.exit(1);
}

// 2) BEHAVIORAL: eval with stubbed globals; two calls (same time + mid) must be identical.
const FIXED_NOW = 1_752_000_000_000;   // fixed wall clock (ms)
const DateStub = { now: () => FIXED_NOW };
const priceStub = { get: (s) => ({ mid: s === 'EURUSD' ? 1.14318 : 1.0 }) };
const BASEstub = { EURUSD: 1.143 };
const TF_SEC = { M1:60, M5:300, M15:900, M30:1800, H1:3600, H4:14400, D1:86400 };
let synth;
try {
  synth = new Function('Date', 'priceStore', 'BASE', 'Math', 'TF_SEC', fnText + '\nreturn synthCandles;')(DateStub, priceStub, BASEstub, Math, TF_SEC);
} catch (e) { console.error('🔴 FAIL: could not eval synthCandles — ' + e.message); process.exit(1); }

const a = synth('EURUSD', 'M1');
const b = synth('EURUSD', 'M1');
if (!Array.isArray(a) || a.length < 20) { console.error('🔴 FAIL: synthCandles returned too few bars'); process.exit(1); }
if (JSON.stringify(a) !== JSON.stringify(b)) {
  console.error('🔴 FAIL: two synthCandles calls at the same time+mid differ — chart will not persist across refresh.');
  const j = a.findIndex((x, k) => JSON.stringify(x) !== JSON.stringify(b[k]));
  console.error('   first diverging bar #' + j + ':', JSON.stringify(a[j]), 'vs', JSON.stringify(b[j]));
  process.exit(1);
}
// the LAST bar must anchor to the live mid (chart connects to the live price line)
const last = a[a.length - 1];
if (Math.abs(last.close - 1.14318) > 1e-6) {
  console.error('🔴 FAIL: last synthetic close (' + last.close + ') must equal the live mid (1.14318).');
  process.exit(1);
}
// OHLC sanity on every bar
for (const c of a) if (!(c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close) && c.low > 0)) {
  console.error('🔴 FAIL: bad OHLC bar ' + JSON.stringify(c)); process.exit(1);
}
console.log('🟢 PASS: synthCandles is deterministic (symbol+time seeded) — identical across refreshes; last bar anchors to live mid; OHLC valid.');
