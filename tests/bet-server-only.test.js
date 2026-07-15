#!/usr/bin/env node
// REGRESSION (money) — a sports bet position must exist on the server ONLY if place_bet
// debited its stake (ledger betstake-<id>). The client used to push the position DIRECTLY
// (insertBetRow / syncOwnBets), racing the place_bet RPC. When the client won that race,
// place_bet's idempotency guard ("position already exists → return duplicate") SKIPPED the
// debit — leaving a position with NO ledger entry. We saw this live: SP-895264 had an open
// $25 bet with balance still $100, bet_debits 0, this_bet_debited 0.
//
// The invariant: NO client-side path creates a sports position. This test fails (RED) if any
// `from('positions').insert/upsert` is present in sports-live.html, and passes (GREEN) once
// the only creator is the server place_bet RPC.
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'sports-live.html'), 'utf8');
const clientInsert = /from\(\s*['"]positions['"]\s*\)\s*\.\s*(insert|upsert)/g;

const hits = src.match(clientInsert) || [];
if (hits.length) {
  console.error(`🔴 FAIL: sports-live.html creates a position client-side (${hits.length} site(s)): ${hits.join(', ')}`);
  console.error('   This bypasses place_bet (the only path that debits the stake) → bets with no debit (#5).');
  process.exit(1);
}
console.log('🟢 PASS: no client-side sports position insert — bets are created only by place_bet (server, atomic debit).');
