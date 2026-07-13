#!/usr/bin/env node
// REGRESSION (webtrade) — the one-click lot stepper (▼ 0.01 ▲) supports PRESS-AND-HOLD auto-repeat that
// accelerates (interval 320ms → 25ms), not just single clicks. Uses functional setVol (no stale
// closure during the repeat) and cleans the timer on release + unmount.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static: hold wiring on both arrows (mouse + touch), functional bump, accelerating interval ──
if (!/const bump=\(sign\)=> setVol\(v=> Math\.max\(0\.01,\(\+v\|\|0\.01\)\+sign\*0\.01\)\.toFixed\(2\)\);/.test(src)) bad('bump must functionally step ±0.01 (no stale closure)');
if (!/const hold=\(sign\)=>\{ bump\(sign\); let d=320;/.test(src)) bad('hold must fire once then start the repeat at 320ms');
if (!/d=Math\.max\(25, d\*0\.75\); holdRef\.current=setTimeout\(run, d\);/.test(src)) bad('repeat interval must accelerate toward 25ms');
if (!/const release=\(\)=>\{ if\(holdRef\.current\)\{ clearTimeout\(holdRef\.current\); holdRef\.current=null; \} \};/.test(src)) bad('release must clear the repeat timer');
if (!/React\.useEffect\(\(\)=> release, \[\]\);/.test(src)) bad('the repeat timer must be cleared on unmount');
if (!/onMouseDown=\{\(e\)=>\{e\.stopPropagation\(\);hold\(-1\);\}\} onMouseUp=\{release\} onMouseLeave=\{release\} onTouchStart=\{\(e\)=>\{e\.preventDefault\(\);hold\(-1\);\}\} onTouchEnd=\{release\}/.test(src)) bad('▼ must hold-repeat down (mouse + touch)');
if (!/onMouseDown=\{\(e\)=>\{e\.stopPropagation\(\);hold\(1\);\}\}[^>]*onTouchStart=\{\(e\)=>\{e\.preventDefault\(\);hold\(1\);\}\}/.test(src)) bad('▲ must hold-repeat up (mouse + touch)');
if (/onClick=\{dec\}|onClick=\{inc\}/.test(src)) bad('the old click-only dec/inc handlers must be gone');

// ── behavioural: step math + acceleration ──
const bump = (v, sign)=> Math.max(0.01,(+v||0.01)+sign*0.01).toFixed(2);
if (bump('0.01', 1) !== '0.02') bad('▲ from 0.01 → 0.02');
if (bump('0.01', -1) !== '0.01') bad('▼ floors at 0.01 (no negative/zero lots)');
if (bump('0.10', 1) !== '0.11') bad('▲ from 0.10 → 0.11 (no float dust)');
// interval accelerates and floors at 25ms
let d = 320, n = 0; while (d > 25) { d = Math.max(25, d*0.75); n++; }
if (d !== 25) bad('interval must reach the 25ms floor');
if (n > 12) bad('acceleration should reach top speed within a dozen ticks');

if (fail) { console.error(`\n🔴 FAIL — ${fail} lot-hold problem(s).`); process.exit(1); }
console.log('🟢 PASS: lot stepper press-and-hold auto-repeats and accelerates (320→25ms), functional ±0.01 floored at 0.01, timer cleaned on release/unmount.');
