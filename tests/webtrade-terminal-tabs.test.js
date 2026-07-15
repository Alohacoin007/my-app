#!/usr/bin/env node
// REGRESSION (webtrade) — the terminal tabs that had no data binding are now activated with REAL
// data: Journal = a live in-memory event log (terminal/login/order/close/SL-TP/errors), Exposure =
// per-symbol notional + % of equity, Mailbox = the account's non-trade settlements (deposits/bonuses/
// adjustments) with click-to-expand. News/Calendar have NO platform feed → honest "not connected"
// state (no fake data). Trade + History are untouched. Tab switch swaps only the content (no reflow).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) Journal — a real event-log store, instrumented at the real event points, rendered live
if (!/const journalStore = \{/.test(src)) bad('journalStore (real event log) missing');
if (!/journalStore\.log\('Order filled/.test(src)) bad('order fills must be journaled');
if (!/journalStore\.log\('Order rejected/.test(src)) bad('order rejections must be journaled');
if (!/journalStore\.log\('Position closed/.test(src)) bad('closes must be journaled');
if (!/journalStore\.log\('SL\/TP modified/.test(src)) bad('SL/TP edits must be journaled');
if (!/journalStore\.log\('Alpexa WebTrade terminal started/.test(src)) bad('terminal start must be journaled');
if (!/React\.useEffect\(\(\)=> journalStore\.subscribe\(e=>setRows\(\[\.\.\.e\]\)\), \[\]\)/.test(src)) bad('JournalTab must render the live journal (not hardcoded rows)');

// 2) Exposure — real notional (per-asset contract size) + % of equity + totals
if (!/function ExposureTab\(\{ pos, mids, equity, leverage \}\)/.test(src)) bad('ExposureTab must receive equity + leverage');
if (!/const notl=\(s\)=> gross\(s\)\*contractSize\(s\)\*baseUsdRate\(s\);/.test(src)) bad('Exposure notional must use GROSS lots × per-asset contract size × USD rate (not a flat 100000)');
if (!/const marg=\(s\)=> requiredMargin\(s, gross\(s\), leverage\);/.test(src)) bad('Exposure must compute GROSS MARGIN (both legs, matches the bottom bar)');
if (!/\(mg\/eq\*100\)\.toFixed\(2\)\+' %'/.test(src)) bad('% of Equity must be MARGIN/equity (capital utilization), not notional/equity');
if (!/<ExposureTab pos=\{pos\} mids=\{mids\} equity=\{equity\} leverage=\{leverage\} \/>/.test(src)) bad('ExposureTab must be passed equity + leverage');

// 3) Mailbox — real: account non-trade settlements, scoped, click-to-expand
if (!/function MailboxTab\(\)\{/.test(src)) bad('MailboxTab missing');
if (!/\.from\('settlements'\)\.select\('kind,symbol,pnl,detail,created_at'\)\.eq\('acct_no',acct\)/.test(src)) bad('Mailbox must read the logged-in account settlements');
if (!/x\.kind!=='fx_close' && x\.kind!=='fx_open'/.test(src)) bad('Mailbox must exclude trade opens/closes (notices only)');
if (!/tab==='Mailbox' \? <MailboxTab \/>/.test(src)) bad('Mailbox tab must render MailboxTab');

// 4) News / Calendar — honest "feed not connected" (NO fake data)
if (!/News:\['📰','News feed not connected'\]/.test(src)) bad('News must show an honest feed-not-connected state (no mock)');
if (!/Calendar:\['📅','Economic calendar not connected'\]/.test(src)) bad('Calendar must show an honest feed-not-connected state (no mock)');

// 5) Trade + History cores untouched (still routed to the real table)
if (!/tab==='Trade' && pos\.map\(p=>\{/.test(src)) bad('Trade table core must remain');
if (!/tab==='History' && histShown\.slice\(histV\.start,histV\.end\)\.map\(h=>\(/.test(src)) bad('History table core must remain');

if (fail) { console.error(`\n🔴 FAIL — ${fail} terminal-tab problem(s).`); process.exit(1); }
console.log('🟢 PASS: Journal (live log) + Exposure (notional/%) + Mailbox (real settlements) activated; News/Calendar honest feed-pending; Trade/History cores intact.');
