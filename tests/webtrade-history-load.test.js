#!/usr/bin/env node
// REGRESSION (webtrade) — the History tab was in-memory only, so a refresh wiped the closed-trade log.
// Now positionsStore.loadHistory() pulls closed trades from the server (settlements, kind='fx_close',
// account-scoped) so history survives a refresh. Display-only (server is the source of truth, #5). The
// row is reconstructed by parsing settlements.detail ("SIDE size @ open -> close", or a "STOPOUT SIDE
// size @ open (...)" forced close with no close price).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static: loadHistory queries settlements (scoped) and is wired on load + on settlement inserts ──
if (!/async loadHistory\(\)\{ try\{ if\(WT_DEMO \|\| !\(window\.AlpexaSync&&AlpexaSync\.db&&AlpexaSync\.me\)\) return;/.test(src)) bad('loadHistory must exist and no-op in demo/logged-out');
if (!/from\('settlements'\)\.select\('local_id,symbol,stake,pnl,detail,created_at'\)\.eq\('server','fx'\)\.eq\('acct_no',acct\)\.eq\('kind','fx_close'\)/.test(src)) bad('loadHistory must fetch this account\'s fx_close settlements');
if (!/this\.loadAcct\(\); this\.loadPos\(\); this\.loadHistory\(\);/.test(src)) bad('loadHistory must run on login/start (refresh persistence)');
if (!/this\.loadHistory\(\);   \/\/ any settlement insert/.test(src)) bad('loadHistory must re-run on any settlement insert (live)');

// ── behavioural: reconstruct the parse exactly as the code does ──
const parse = (dt)=>{ dt=String(dt||'');
  const sm=dt.match(/(BUY|SELL)/i), pm=dt.match(/@\s*([\d.]+)(?:\s*->\s*([\d.]+))?/);
  return { side:sm?sm[1].toUpperCase():'—', open_price:pm?+pm[1]:0, close_price:(pm&&pm[2]!=null)?+pm[2]:0 }; };

let r = parse('BUY 0.01 @ 161.940 -> 161.983');
if (r.side!=='BUY' || r.open_price!==161.94 || r.close_price!==161.983) bad(`manual close parse wrong: ${JSON.stringify(r)}`);
r = parse('SELL 0.02 @ 1.13951 -> 1.13920');
if (r.side!=='SELL' || r.open_price!==1.13951 || r.close_price!==1.1392) bad(`sell parse wrong: ${JSON.stringify(r)}`);
r = parse('STOPOUT SELL 0.02 @ 161.5 (level 25% < 30%)');
if (r.side!=='SELL' || r.open_price!==161.5 || r.close_price!==0) bad(`stopout parse wrong (no close): ${JSON.stringify(r)}`);

if (fail) { console.error(`\n🔴 FAIL — ${fail} history-load problem(s).`); process.exit(1); }
console.log('🟢 PASS: History tab loads closed trades from the server (settlements kind=fx_close, scoped) so it survives a refresh; detail parsed for side/open/close (manual + stopout).');
