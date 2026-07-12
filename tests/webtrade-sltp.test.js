#!/usr/bin/env node
// REGRESSION (webtrade) — editable Stop-Loss / Take-Profit on open positions. Double-clicking a S/L
// or T/P cell opens a Modify dialog; it accepts a price OR pips (auto-detected), validates the side,
// and saves via the fx_modify RPC (server writes meta.sl/tp; the fx_sltp cron enforces it). The cells
// render the position's real meta.sl/meta.tp (not hardcoded '—'). If the RPC isn't deployed yet, the
// dialog degrades to a "server deploy pending" note instead of erroring.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) meta is loaded (holds sl/tp) and rendered per-position (not hardcoded)
if (!/\.from\('positions'\)\.select\('[^']*,meta'\)/.test(src)) bad('loadPos must select meta (holds sl/tp)');
if (!/onDoubleClick=\{\(\)=>setModifyP\(p\)\}[^>]*>\{\(p\.meta&&p\.meta\.sl!=null\)\?fmtPx\(p\.symbol,\+p\.meta\.sl\):'—'\}/.test(src)) bad("S/L cell must render p.meta.sl and open Modify on double-click");
if (!/onDoubleClick=\{\(\)=>setModifyP\(p\)\}[^>]*>\{\(p\.meta&&p\.meta\.tp!=null\)\?fmtPx\(p\.symbol,\+p\.meta\.tp\):'—'\}/.test(src)) bad("T/P cell must render p.meta.tp and open Modify on double-click");
if (!/const \[modifyP,setModifyP\]=React\.useState\(null\)/.test(src)) bad('BottomBar needs modifyP state');
if (!/\{modifyP && <ModifyPos p=\{modifyP\} onClose=\{\(\)=>setModifyP\(null\)\}/.test(src)) bad('BottomBar must render the ModifyPos dialog');

// 2) the dialog: pip/price auto-detect + side validation
if (!/function ModifyPos\(\{ p, onClose \}\)\{/.test(src)) bad('ModifyPos component missing');
if (!/const isPip = !String\(val\)\.includes\('\.'\) \|\| x < entry\*0\.5;/.test(src)) bad('Modify must auto-detect price-vs-pips');
if (!/const slBad = slPx!=null && \(isBuy \? slPx>=cur : slPx<=cur\);/.test(src)) bad('SL side validation (BUY: below market, SELL: above)');
if (!/const tpBad = tpPx!=null && \(isBuy \? tpPx<=cur : tpPx>=cur\);/.test(src)) bad('TP side validation (BUY: above market, SELL: below)');

// 3) saves via the fx_modify RPC, degrades gracefully if not deployed
if (!/AlpexaSync\.db\.rpc\('fx_modify',\{ p_local_id:p\.local_id,\s*\n?\s*p_sl:.*p_tp:/.test(src)) bad('Modify must call the fx_modify RPC with p_local_id/p_sl/p_tp');
if (!/PGRST202\|could not find\|does not exist\|schema cache[\s\S]*?server deploy pending/.test(src)) bad('a missing fx_modify RPC must show a safe "server deploy pending" note');
if (!/positionsStore\.loadPos\(\); playSnd\(sndOpen\); onClose\(\);/.test(src)) bad('a successful modify must reload positions + sound + close');

// 4) server SQL exists (fx_modify RPC + fx_sltp enforcement cron, mirroring fx_stopout's close)
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/sql/fx_modify.sql'), 'utf8');
if (!/create or replace function public\.fx_modify\(p_local_id text, p_sl numeric/.test(sql)) bad('fx_modify.sql must define the fx_modify RPC');
if (!/meta = coalesce\(meta,'\{\}'::jsonb\) \|\| jsonb_build_object\('sl', p_sl, 'tp', p_tp\)/.test(sql)) bad('fx_modify must write sl/tp into positions.meta');
if (!/create or replace function public\.fx_sltp/.test(sql)) bad('fx_modify.sql must define the fx_sltp enforcement cron');
if (!/public\.fx_realized_pnl\(r_pos\.symbol/.test(sql)) bad('fx_sltp must use fx_realized_pnl (same helper as fx_stopout)');
if (!/insert into public\.settlements\(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail\)/.test(sql)) bad('fx_sltp must bank via settlements like fx_stopout');
if (!/cron\.schedule\('fx_sltp', '\* \* \* \* \*'/.test(sql)) bad('fx_sltp must be scheduled every minute');

if (fail) { console.error(`\n🔴 FAIL — ${fail} SL/TP problem(s).`); process.exit(1); }
console.log('🟢 PASS: SL/TP editable via double-click → Modify dialog (price/pips + side validation) → fx_modify RPC (meta.sl/tp) → fx_sltp cron enforces; graceful when the RPC is not yet deployed.');
