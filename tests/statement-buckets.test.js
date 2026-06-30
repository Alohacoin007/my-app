#!/usr/bin/env node
// Alpexa — statement bucket mapping guard.
//   node tests/statement-buckets.test.js
//
// The web statement (statement.html) groups ledger `kind`s into summary cards
// (Deposits / Winnings / Bets staked / Withdrawals / Other). Two properties must hold or
// a real user sees a mislabelled / missing line:
//
//   1. RECONCILIATION — every kind lands in EXACTLY one bucket, so the buckets always sum
//      to the same total as the raw rows (the card total can never drift from Net change).
//      This is the structural safety: even an unknown future kind falls into "Other" and
//      the numbers still add up — it can never corrupt a total.
//   2. KNOWN KINDS — the kinds that actually exist in the ledger (bet, bet_won, transfer,
//      deposit) plus the documented future ones (withdraw*, bonus, crypto) map to the
//      RIGHT card. (Regression: `deposit` once leaked into "Other" → shown as Other, not a
//      Deposit. Caught on live data; this locks it.)
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'statement.html'), 'utf8');
// Pull the bucketize() function straight out of the page and evaluate it, so the test
// exercises the SHIPPED logic (not a copy that could drift).
const m = SRC.match(/function bucketize\(by_kind\)\{[\s\S]*?return b;\s*\}/);
if (!m) { console.log('  🔴 could not find bucketize() in statement.html'); process.exit(1); }
// eslint-disable-next-line no-eval
const bucketize = eval('(' + m[0] + ')');

let failed = false;
function ok(cond, msg){ if(!cond){ console.log('  🔴 '+msg); failed = true; } else { console.log('  ✅ '+msg); } }
function near(a, b){ return Math.abs(a - b) < 0.005; }

// 1) Reconciliation: a mix incl. an UNKNOWN kind still sums correctly across buckets.
const mix = [
  { kind:'bet',          total:-110241.00 },
  { kind:'bet_won',      total:195.33 },
  { kind:'transfer',     total:10344.00 },
  { kind:'deposit',      total:8202000.00 },
  { kind:'withdraw',     total:-500.00 },
  { kind:'withdraw_hold',total:-25.00 },
  { kind:'bonus',        total:100.00 },
  { kind:'crypto',       total:50.00 },
  { kind:'fx',           total:12.34 },
  { kind:'totally_new',  total:7.77 },   // unknown → must land in Other, not vanish
];
const b = bucketize(mix);
const sumIn = mix.reduce((a, k) => a + k.total, 0);
const sumBuckets = b.deposits + b.withdrawals + b.bets + b.winnings + b.other;
ok(near(sumIn, sumBuckets),
  'buckets reconcile to raw total ('+sumBuckets.toFixed(2)+' == '+sumIn.toFixed(2)+') — no kind lost or double-counted');

// 2) Known kinds map to the right bucket.
ok(near(bucketize([{kind:'deposit',total:1000}]).deposits, 1000), 'deposit → Deposits (the live-data regression)');
ok(near(bucketize([{kind:'transfer',total:50}]).deposits, 50),    'transfer → Deposits');
ok(near(bucketize([{kind:'bonus',total:100}]).deposits, 100),     'bonus → Deposits');
ok(near(bucketize([{kind:'crypto',total:50}]).deposits, 50),      'crypto → Deposits');
ok(near(bucketize([{kind:'bet',total:-220}]).bets, -220),         'bet → Bets staked');
ok(near(bucketize([{kind:'bet_won',total:286}]).winnings, 286),   'bet_won → Winnings');
ok(near(bucketize([{kind:'withdraw',total:-50}]).withdrawals, -50),         'withdraw → Withdrawals');
ok(near(bucketize([{kind:'withdraw_hold',total:-10}]).withdrawals, -10),    'withdraw_hold → Withdrawals');
ok(near(bucketize([{kind:'fx',total:9}]).other, 9),               'unknown/fx → Other (safe fallback)');

console.log('\n' + (failed
  ? '🔴 statement-buckets: FAIL'
  : '🟢 statement-buckets: every ledger kind maps to exactly one card; totals reconcile') + '\n');
process.exit(failed ? 1 : 0);
