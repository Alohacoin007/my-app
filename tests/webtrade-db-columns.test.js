#!/usr/bin/env node
// REGRESSION / POKA-YOKE (webtrade) — a SELECT that names a column the real table DOESN'T have makes
// PostgREST reject the WHOLE query, so it returns nothing and the UI silently shows empty. That is
// exactly how `positions.select('...,stake,...')` broke position loading in production: the harness
// can't run a live authenticated DB query, so a wrong column name slips past parse/logic/render tests.
// This guard catches the class STATICALLY: every column webtrade selects from `positions` / `accounts`
// must be in the proven real-schema set (derived from fx_open's INSERT + trading.html's live selects).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// Columns PROVEN to exist (fx_open.sql INSERT + trading.html production selects). 'stake' and
// 'created_at' are intentionally ABSENT from positions — selecting them errors the query.
const SCHEMA = {
  positions: new Set(['cust_id','acct_no','server','kind','local_id','symbol','side','size','open_price','pnl','status','ticket','otype','trigger','sl','tp']),
  accounts:  new Set(['id','cust_id','acct_no','balance','server','player_id']),
};

for (const table of Object.keys(SCHEMA)) {
  const re = new RegExp("\\.from\\('" + table + "'\\)\\.select\\('([^']*)'\\)", 'g');
  let m, seen = 0;
  while ((m = re.exec(src)) !== null) {
    seen++;
    const cols = m[1].split(',').map(c => c.trim()).filter(Boolean);
    for (const c of cols) {
      if (c === '*') continue;
      if (!SCHEMA[table].has(c))
        bad(`${table}.select names "${c}" — NOT in the real schema (query would error → UI shows empty). Allowed: ${[...SCHEMA[table]].join(', ')}`);
    }
  }
  if (seen === 0 && table === 'positions') bad('expected a positions SELECT in webtrade.html (loadPos)');
}

// the specific bug that shipped must never come back
if (/\.from\('positions'\)\.select\('[^']*\bstake\b/.test(src)) bad("positions SELECT must NOT include 'stake' (no such column — this was the empty-positions bug)");

// money reads must be SCOPED to the logged-in account (acctFor('fx')), NOT a blind limit(1) that
// grabs a random fx account (that showed a $100 test account instead of the real $1M balance).
if (!/AlpexaSync\.acctFor\('fx'\)/.test(src)) bad("loadAcct/loadPos must resolve the logged-in account via AlpexaSync.acctFor('fx')");
if (!/\.from\('accounts'\)\.select\('acct_no,balance'\)\.eq\('server','fx'\)\.eq\('acct_no',acct\)/.test(src)) bad('loadAcct must filter accounts by the logged-in acct_no (not limit(1) → wrong balance)');
if (!/\.from\('positions'\)\.select\('[^']*'\)\.eq\('server','fx'\)\.eq\('acct_no',acct\)/.test(src)) bad('loadPos must filter positions by the logged-in acct_no');
if (/\.from\('accounts'\)\.select\('acct_no,balance'\)\.eq\('server','fx'\)\.limit\(1\)/.test(src)) bad('accounts must NOT be loaded with a blind server-only limit(1) (grabs a random account)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} DB-column problem(s).`); process.exit(1); }
console.log('🟢 PASS: every positions/accounts SELECT column matches the proven real schema (no phantom columns → no silently-empty queries).');
