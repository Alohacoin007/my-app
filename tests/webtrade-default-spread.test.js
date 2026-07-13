#!/usr/bin/env node
// REGRESSION / SPEC (webtrade) — cold-start spread seed must come from the per-symbol master table
// (DEFAULT_SPREAD), never a hardcoded constant. Full fallback chain (2026-07 interbank spec §3):
//   1. live feed spr_pts (MT5 INTEGER POINTS)     ← always wins when present
//   2. this symbol's OWN last-known spread         ← transient dropout
//   3. DEFAULT_SPREAD[sym] or its asset-class row  ← cold start ONLY (no prior tick exists)
// A bare numeric seed (`: 10`) flat-lines whatever it touches and hides a dead feed — the same
// family as the flat-10 bomb (see diagnose SPREAD-flat-fallback). The table itself is data, the
// PIPELINE carries no literal.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: master table + accessor exist; pipeline carries no hardcoded seed ──
const table_src = grab(/const DEFAULT_SPREAD = \{[\s\S]*?\};/, 'DEFAULT_SPREAD master table');
const seed_src  = grab(/const seedSpread\s*=[^\n]*/, 'seedSpread accessor');
if (/prev\.spr\s*:\s*\d/.test(src)) bad('_apply cold seed is still a hardcoded number — must be seedSpread(sym)');
if (/this\.mids\[sym\]\.spr\s*:\s*\d/.test(src)) bad('_simulate cold seed is still a hardcoded number — must be seedSpread(sym)');
const applyLine = grab(/const spr=\(p\.spr_pts[^\n]*/, '_apply spread chain');
if (applyLine && !/seedSpread\(sym\)/.test(applyLine)) bad('_apply chain must end in seedSpread(sym)');
const simLine = grab(/const sp=\(this\.mids\[sym\][^\n]*/, '_simulate spread chain');
if (simLine && !/seedSpread\(sym\)/.test(simLine)) bad('_simulate chain must end in seedSpread(sym)');
if (seed_src && /\|\|\s*\d|\?\s*\d+(\.\d+)?\s*:\s*\d/.test(seed_src.replace(/DEFAULT_SPREAD\[[^\]]*\]/g, 'T')))
  bad('seedSpread must read ONLY the table (no bare numeric fallback in the accessor)');

// ── behavioural: run the real table + accessor + _apply chain ──
if (!fail) {
  const catOf = (s)=> ({EURUSD:'Forex',USDJPY:'Forex',BTCUSD:'Crypto',AAPL:'Stocks'}[s] || 'Forex');
  const { DEFAULT_SPREAD, seedSpread } = new Function('catOf',
    table_src + '\n' + seed_src + '\nreturn {DEFAULT_SPREAD, seedSpread};')(catOf);
  // per-symbol rows are real values, not one shared constant
  if (seedSpread('EURUSD') !== 1.0) bad(`EURUSD cold seed must be its own 1.0, got ${seedSpread('EURUSD')}`);
  if (seedSpread('USDJPY') !== 1.9) bad(`USDJPY cold seed must be its own 1.9, got ${seedSpread('USDJPY')}`);
  // unknown symbols take their asset-class row FROM THE SAME TABLE
  for (const cls of ['Forex','Crypto','Stocks'])
    if (!(DEFAULT_SPREAD[cls] > 0)) bad(`DEFAULT_SPREAD must carry an asset-class row for ${cls}`);
  if (seedSpread('BTCUSD') !== DEFAULT_SPREAD['Crypto']) bad('unknown crypto must take the Crypto class row');
  if (seedSpread('AAPL')   !== DEFAULT_SPREAD['Stocks']) bad('unknown stock must take the Stocks class row');
  for (const [k, v] of Object.entries(DEFAULT_SPREAD))
    if (!(typeof v === 'number' && isFinite(v) && v > 0)) bad(`DEFAULT_SPREAD.${k} must be a finite positive number, got ${v}`);
  // priority chain: feed wins → last-known → seed (evaluate the REAL _apply line)
  const chain = new Function('p', 'prev', 'seedSpread', 'sym', applyLine + '\nreturn spr;');
  if (chain({spr_pts: 3},  {spr: 7}, seedSpread, 'EURUSD') !== 3) bad('live spr_pts must always win');
  if (chain({},            {spr: 7}, seedSpread, 'EURUSD') !== 7) bad('dropout must keep the symbol\'s OWN last-known spread');
  if (chain({},            null,     seedSpread, 'EURUSD') !== 1.0) bad('cold start must read the per-symbol table row (EURUSD 1.0)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} default-spread problem(s).`); process.exit(1); }
console.log('🟢 PASS: cold-start seed = DEFAULT_SPREAD master table (per-symbol → asset-class), pipeline carries no literal; feed → last-known → seed priority proven.');
