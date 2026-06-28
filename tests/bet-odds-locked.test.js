#!/usr/bin/env node
// REGRESSION (#21 — display drift, same class as #20): a PLACED bet's shown odds must be the
// LOCKED placement price, not live. Two faults caused "Yankees ML -103 ↔ -100" wobble:
//   (a) the cash-out recompute loop overwrote the open-bet leg's stored odds: `l.am = cur`
//       (cur = current live/simulated odds), corrupting the locked value, and
//   (b) the ticket rendered `fmtAm(l.am)` (now-live) instead of the locked `l.am0`.
// Invariant: the cash-out math uses live odds via a LOCAL var only (never mutates l.am), and
// the ticket displays the locked am0.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sports-live.html'), 'utf8');

const fails = [];
// (a) the cash-out loop must NOT overwrite the leg's stored odds.
if (/\bl\.am\s*=\s*cur\b/.test(src))
  fails.push("cash-out recompute overwrites the leg's locked odds (`l.am = cur`) → placed ticket wobbles");
// (b) the ticket leg-odds must render from the LOCKED am0.
if (!/class="odd">\$\{fmtAm\(l\.am0/.test(src))
  fails.push("ticket leg odds not rendered from the locked am0 (shows live l.am)");

if (fails.length) {
  console.error('🔴 FAIL: placed-bet odds can drift from the locked price:\n  - ' + fails.join('\n  - '));
  process.exit(1);
}
console.log('🟢 PASS: placed-bet odds are the locked placement price (am0); cash-out uses live odds locally without corrupting l.am.');
