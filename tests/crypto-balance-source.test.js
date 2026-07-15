#!/usr/bin/env node
// REGRESSION (#20 — display drift): the crypto Account page ("Portfolio overview") showed
// ACCOUNTS · Sport $0 while the server switcher in the SAME screen showed Alpexa Sports
// $254.00 — one balance, two sources. The switcher reads window.__srvBal (single memory
// source, ~line 1561). The Account breakdown (effBalances) + portfolio total (baseTotal)
// read serverBalances.{fx,sports} (a separate prop that drifts when a pull updates only
// __srvBal). Root cause: a half-finished #5 migration left two sources for one balance.
//
// Invariant: the Account page's cross-app (FX / Sports) balances must come from the SAME
// single source the switcher uses (window.__srvBal-merged) — so they can never disagree.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'crypto-live.html'), 'utf8');

// Locate the Account-page balance region: effBalances {...} through baseTotal's memo end.
const i = src.indexOf('const effBalances');
const j = src.indexOf('}, [balances, staked, serverBalances]);', i);
if (i < 0 || j < 0) { console.error('🔴 FAIL: could not locate the Account effBalances/baseTotal region'); process.exit(1); }
const region = src.slice(i, j);

const fails = [];
// Drift sources: reading the per-account balance straight off the serverBalances prop.
if (/sports:\s*serverBalances\.sports/.test(region))
  fails.push("effBalances.sports = serverBalances.sports  (drift source — switcher uses __srvBal)");
if (/fx:\s*effBal\('fx',\s*serverBalances\.fx/.test(region))
  fails.push("effBalances.fx = serverBalances.fx  (drift source)");
if (/t \+= \(serverBalances\.sports/.test(region))
  fails.push("baseTotal adds serverBalances.sports directly  (headline total drifts)");
// Must unify on the switcher's single source: serverBalances overlaid with window.__srvBal.
if (!/Object\.assign\(\{\},\s*serverBalances,[\s\S]{0,140}__srvBal/.test(src))
  fails.push("no single-source merge (serverBalances overlaid with window.__srvBal) feeding the Account balances");

if (fails.length) {
  console.error('🔴 FAIL: crypto Account FX/Sports balances can drift from the server switcher:\n  - ' + fails.join('\n  - '));
  process.exit(1);
}
console.log('🟢 PASS: crypto Account FX/Sports balances come from the single source (window.__srvBal) — no drift with the switcher.');
