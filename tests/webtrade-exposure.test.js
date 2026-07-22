#!/usr/bin/env node
// REGRESSION (webtrade) — the Exposure tab must show a symbol whenever there is an OPEN position, even
// a fully-hedged one (buy 0.01 + sell 0.01 → net 0). It aggregates long/short lots per symbol: Net =
// long−short (0 → "Flat (hedged)"), while Notional/Margin are GROSS (both legs) so they match the
// bottom bar's locked margin. Before, it filtered on |net|>0, so a hedged book rendered EMPTY.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static: aggregate long/short, keep any-position symbols, gross notional/margin ──
if (!/const agg=\{\}; pos\.forEach\(p=>\{ const s=p\.symbol, lots=lotsOf\(p\);/.test(src)) bad('must aggregate long/short lots per symbol');
if (!/const rows=Object\.keys\(agg\)\.filter\(s=>\(agg\[s\]\.long\+agg\[s\]\.short\)>1e-9\);/.test(src)) bad('rows must include any symbol with an open position (hedged included)');
if (!/const gross=\(s\)=> agg\[s\]\.long\+agg\[s\]\.short;/.test(src)) bad('gross = long+short lots');
if (!/const marg=\(s\)=> usedMarginOf\(s, gross\(s\)\);/.test(src)) bad('margin must be GROSS (both legs) at HOUSE CAP — 서버 v_used 락스텝, matching the bottom bar');
if (!/flat\?'Flat \(hedged\)':\(v>0\?'Long':'Short'\)/.test(src)) bad('net 0 must read "Flat (hedged)"');
if (/No net exposure/.test(src)) bad('the misleading "No net exposure" empty text must be gone');

// ── behavioural: a hedged book renders (not empty), net 0, gross 2× ──
const agg={};
const pos=[{symbol:'GBPUSD',side:'buy',size:0.01},{symbol:'GBPUSD',side:'sell',size:0.01}];
const lotsOf=(p)=>+p.size, sideUp=(s)=>String(s).toUpperCase();
pos.forEach(p=>{ const s=p.symbol, lots=lotsOf(p); const a=agg[s]||(agg[s]={long:0,short:0});
  if(sideUp(p.side)==='SELL') a.short+=lots; else a.long+=lots; });
const rows=Object.keys(agg).filter(s=>(agg[s].long+agg[s].short)>1e-9);
if (rows.length!==1) bad(`hedged GBPUSD must still render a row, got ${rows.length}`);
const net=agg.GBPUSD.long-agg.GBPUSD.short, gross=agg.GBPUSD.long+agg.GBPUSD.short;
if (Math.abs(net)>1e-9) bad(`net must be 0 (fully hedged), got ${net}`);
if (Math.abs(gross-0.02)>1e-9) bad(`gross must be 0.02 (both legs), got ${gross}`);

if (fail) { console.error(`\n🔴 FAIL — ${fail} exposure problem(s).`); process.exit(1); }
console.log('🟢 PASS: Exposure shows any open position — a hedged book renders Net 0.00 "Flat (hedged)" with GROSS notional/margin (matches the bottom bar).');
