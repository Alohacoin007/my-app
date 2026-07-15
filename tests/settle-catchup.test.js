#!/usr/bin/env node
// Alpexa — settlement catch-up window guard (#33).
//   node tests/settle-catchup.test.js
//
// sports-settle reads game results from ESPN to settle open bets. ESPN's DEFAULT scoreboard
// returns ONLY the current day — so a game that finished but wasn't settled the same day
// (settle downtime / a late finish) falls off the feed and its still-open bet can NEVER settle:
// orphaned forever. (The daily audit's C1 "묵은 미정산" caught two such soccer bets — that's how
// this class was found.) The fix is a multi-day catch-up window: scoreboard?dates=<from>-<to>.
//
// This locks it: if anyone regresses sports-settle to a today-only scoreboard fetch, the gate
// fails. (Pure source assertion — no ESPN/network needed.)
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'sports-settle', 'index.ts'), 'utf8');

let failed = false;
function ok(c, m){ if(!c){ console.log('  🔴 '+m); failed = true; } else { console.log('  ✅ '+m); } }

// 1) The ESPN scoreboard fetch MUST carry a ?dates= catch-up window.
ok(/\/scoreboard\?dates=/.test(SRC),
  'sports-settle fetches a dates range (scoreboard?dates=…) — catch-up for late-settled games');

// 2) There must be NO bare today-only scoreboard URL (…/scoreboard` or "…/scoreboard").
//    A `/scoreboard` immediately followed by a string terminator = no query = today-only.
ok(!/\/scoreboard[`"']/.test(SRC),
  'no today-only /scoreboard URL (would orphan a bet whose game finished >1 day ago)');

console.log('\n' + (failed
  ? '🔴 settle-catchup: FAIL — settlement can orphan late-finishing games (regressed to today-only)'
  : '🟢 settle-catchup: settlement uses a multi-day catch-up window') + '\n');
process.exit(failed ? 1 : 0);
