#!/usr/bin/env node
// REGRESSION (fx-prices Edge, 2026-07-14) — deep chart history died of an API-semantics misread:
// Polygon's `limit` counts BASE aggregates SCANNED (minutes for intraday), NOT output bars.
// With limit=5000 an H4 request scanned 5000 minutes (≈7 days) and returned 34 bars, and the
// pagination's `results.length < 5000 → break` compared OUTPUT bars against that BASE cap, so
// the walk stopped on page one. W1 n=1560 also 400'd: `from` = now − 120y = negative epoch.
// Live-measured RED (before fix): H4 → 34 bars · H1 → 128 · M5 → 1522 · W1 n=1560 → polygon 400.
// Contract pinned here:
//   [1] limit=50000 (Polygon max base-scan per call); the old limit=5000 must not return
//   [2] the ONLY data-driven stop is an EMPTY page (start of history) — never a count compare
//   [3] `from` is clamped to 2000-01-01 (FLOOR_MS) so long-window W1/D1 can never go negative
//   [4] pages are sized from BASE units (minutes per bar), capped at 8
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'fx-prices', 'index.ts'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// [1] base-scan limit maxed
if (!/sort=desc&limit=50000/.test(src)) bad('aggs request must use limit=50000 (Polygon max BASE-aggregate scan)');
if (/sort=desc&limit=5000&/.test(src)) bad('the old limit=5000 request (≈7 days of minutes per page) must be gone from the aggs URL');

// [2] no output-count break — empty page is the only data stop
if (/results\.length < 5000/.test(src)) bad('`results.length < 5000 → break` compares OUTPUT bars to the BASE cap — kills the walk on page one');
if (!/if \(!results\.length\) break;/.test(src)) bad('empty page must remain the only data-driven stop');

// [3] from-clamp
if (!/const FLOOR_MS = 946684800000;/.test(src)) bad('FLOOR_MS (2000-01-01) missing');
if (!/Math\.max\(FLOOR_MS, Date\.now\(\) - n \* mult/.test(src)) bad('`earliest` must clamp to FLOOR_MS (W1 n=1560 went to a NEGATIVE epoch → polygon 400)');

// [4] page budget from BASE units — extract and execute the two lines
const bu = src.match(/const baseUnits = ([^\n]+);/);
const mp = src.match(/const maxPages = ([^\n]+);/);
if (!bu || !mp) bad('baseUnits/maxPages sizing lines missing');
else {
  const calc = new Function('span', 'n', 'mult',
    'const baseUnits = ' + bu[1] + '; const maxPages = ' + mp[1] + '; return {baseUnits, maxPages};');
  const h4 = calc('hour', 15000, 4);    // 3.6M base minutes → capped at 8 pages
  const m1 = calc('minute', 5000, 1);   // 5000 base → 1 page
  const d1 = calc('day', 3900, 1);      // day span: 1 base per bar → 1 page
  const m30 = calc('minute', 10000, 30); // 300k base → 6 pages
  if (h4.maxPages !== 8) bad(`H4 n=15000 must budget the full 8 pages, got ${h4.maxPages}`);
  if (m1.maxPages !== 1) bad(`M1 n=5000 must budget 1 page, got ${m1.maxPages}`);
  if (d1.maxPages !== 1) bad(`D1 n=3900 (day base) must budget 1 page, got ${d1.maxPages}`);
  if (m30.maxPages !== 6) bad(`M30 n=10000 must budget 6 pages, got ${m30.maxPages}`);
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} deep-history problem(s): intraday charts silently fall back to synthetic.`); process.exit(1); }
console.log('🟢 PASS: fx-prices candles — 50k base-scan pages, empty-page stop, 2000-01-01 from-clamp, base-unit page budget (H4 8p · M30 6p · M1/D1 1p).');
