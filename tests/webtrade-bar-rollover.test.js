#!/usr/bin/env node
// REGRESSION (webtrade) — the live last candle must ROLL OVER into a new bar when real time crosses a
// bar bucket (M1=60s, M5=300s …). Before, onTick always mutated the seed's last bar (time:b.time), so
// after refresh the M1 last candle froze in the past (switching to M5 re-seeded and "looked live").
// Now onTick opens a fresh bar at the current bucket (open = prior close) when nowBucket > b.time.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static: the tick computes the current bucket and branches new-bar vs grow ──
if (!/const step=TF_SEC\[tf\]\|\|60, nowB=Math\.floor\(Date\.now\(\)\/1000\/step\)\*step;/.test(src)) bad('onTick must compute the current bar bucket from tf');
if (!/nowB>b\.time/.test(src)) bad('onTick must detect crossing into a new bucket');
if (!/\{ time:nowB, open:b\.close, high:Math\.max\(b\.close,close\), low:Math\.min\(b\.close,close\), close \}/.test(src)) bad('a new bucket must OPEN a fresh bar at the prior close');
if (!/\{ time:b\.time, open:b\.open, high:Math\.max\(b\.high,close\), low:Math\.min\(b\.low,close\), close \}/.test(src)) bad('the same bucket must GROW the current bar');

// ── behavioural: reproduce the exact branch ──
const TF_SEC={M1:60,M5:300,M15:900};
const tick=(b, tf, nowSec, close)=>{ const step=TF_SEC[tf]||60, nowB=Math.floor(nowSec/step)*step;
  return nowB>b.time
    ? { time:nowB, open:b.close, high:Math.max(b.close,close), low:Math.min(b.close,close), close }
    : { time:b.time, open:b.open, high:Math.max(b.high,close), low:Math.min(b.low,close), close }; };

const seed={ time:1000*60, open:1.10, high:1.11, low:1.09, close:1.105 };   // M1 bar at minute 1000
// same minute → grow (time unchanged, high/low track)
let u=tick(seed,'M1', 1000*60+30, 1.12);
if (u.time!==seed.time || u.high!==1.12 || u.open!==1.10) bad(`same-bucket tick must grow the bar, got ${JSON.stringify(u)}`);
// next minute → NEW bar at minute 1001, opening at the prior close 1.105
u=tick(seed,'M1', 1001*60+5, 1.108);
if (u.time!==1001*60) bad(`new-bucket tick must advance time to ${1001*60}, got ${u.time}`);
if (u.open!==1.105) bad(`new bar must open at the prior close 1.105, got ${u.open}`);
// M5: still same 5-min bucket a few minutes later → grow (why M5 "looked live")
u=tick({time:1000*300,open:1,high:1,low:1,close:1},'M5', 1000*300+200, 1.02);
if (u.time!==1000*300) bad('M5 within the 5-min bucket must keep growing the same bar');

if (fail) { console.error(`\n🔴 FAIL — ${fail} bar-rollover problem(s).`); process.exit(1); }
console.log('🟢 PASS: live candle rolls over into a new bar each bucket (M1 no longer freezes); same-bucket ticks grow the current bar.');
