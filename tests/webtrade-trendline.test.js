#!/usr/bin/env node
// REGRESSION (webtrade) — trend-line tool UX: neon-red line, WHITE 3-point handles when selected,
// click-to-select (hit-test), right-click Delete popup. The click hit-test is pure (distSeg =
// distance from the click to the line segment) so it's unit-tested; the rest is asserted wired.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── pure hit-test: distance from a point to the segment (drives click-to-select within 8px) ──
const start = src.indexOf('function distSeg(');
if (start < 0) { console.error('🔴 distSeg not found'); process.exit(1); }
let i = src.indexOf('{', start), depth = 0, end = -1;
for (; i < src.length; i++) { const ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
let distSeg;
try { distSeg = new Function('Math', src.slice(start, end) + '\nreturn distSeg;')(Math); }
catch (e) { console.error('🔴 could not eval distSeg — ' + e.message); process.exit(1); }

const near = (a, b, w) => Math.abs(a - b) < 1e-6 || bad(w + `: got ${a}, want ${b}`);
near(distSeg(5, 0, 0, 0, 10, 0), 0, 'click ON the horizontal segment → distance 0 (selects)');
near(distSeg(5, 3, 0, 0, 10, 0), 3, 'click 3px above the segment → distance 3');
near(distSeg(-5, 0, 0, 0, 10, 0), 5, 'click past the start endpoint → clamps to endpoint (5)');
near(distSeg(15, 0, 0, 0, 10, 0), 5, 'click past the end endpoint → clamps to endpoint (5)');
near(distSeg(0, 0, 0, 0, 0, 0), 0, 'degenerate segment (a point) → distance to that point');
// a real selection scenario: click within the 8px threshold selects, beyond it does not
if (!(distSeg(4, 6, 0, 0, 8, 0) < 8)) bad('a click 6px off a diagonal-ish line should be within the 8px select band');
if (!(distSeg(4, 40, 0, 0, 8, 0) >= 8)) bad('a click 40px off the line must NOT select');

// ── static: the described UX is wired ──
if (!/const NEON='#ff1a1a'/.test(src)) bad('trend line must be neon red (#ff1a1a)');
if (!/\.dov\.pt\{[^}]*background:#ffffff/.test(src)) bad('trend handles must be WHITE (.dov.pt background #ffffff)');
if (!/for\(let i=0;i<3;i\+\+\)/.test(src) || !/showHandles/.test(src)) bad('must create 3 handles (showHandles)');
if (!/if\(best\.kind==='t'\) showHandles\(\)/.test(src)) bad('selecting a trend line must show the 3 handles');
if (!/previewLine\.current/.test(src) || !/onMoveDraw/.test(src)) bad('must show a live rubber-band preview while dragging');
if (!/function DrawMenu\(/.test(src)) bad('right-click Delete popup (DrawMenu) missing');
if (!/if\(selDraw\.current\) setDelMenu/.test(src)) bad('right-click on a selected line must open the Delete popup');
// keyboard Delete and the popup must both go through the ONE deleteSelected path
if (!/e\.key==='Delete'\|\|e\.key==='Backspace'\)\{ e\.preventDefault\(\); deleteSelected\(\)/.test(src)) bad('keyboard Delete must call deleteSelected()');
if (!/onDelete=\{\(\)=>deleteSelected\(\)\}/.test(src)) bad('Delete popup must call deleteSelected()');
if (!/positionHandles\(\);   \/\/ keep the selected trend/.test(src)) bad('handles must stay pinned on pan/zoom (positionHandles in posOverlays)');

// ── the fix: after placing an object the tool must auto-revert to cursor, else click-select (and
//    thus the handles + right-click Delete) never work — this was the "점이 안보여 / 우클릭 안돼" bug.
if ((src.match(/terminalBus\.emit\('chart\.tool', null\)/g) || []).length < 2)
  bad('placing an object must auto-revert to cursor (chart.tool null) on both the click-tools and the drag-tools');

// ── Fibonacci: a white start-anchor point on mousedown + live level lines that follow the cursor ──
if (!/startPt\.current=d/.test(src)) bad('a WHITE start-anchor point must appear when a trend/fib drag begins');
if (!/previewFib\.current/.test(src)) bad('fib must show live preview level lines while dragging');
if (!/d\.tool==='fib'/.test(src) || !/applyOptions\(\{price:lo\+\(hi-lo\)\*FIB_LV\[i\]\}\)/.test(src)) bad('fib preview levels must follow the cursor (applyOptions on drag)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} trend-line problem(s).`); process.exit(1); }
console.log('🟢 PASS: distSeg selects within 8px; neon line + white handles on select; tool auto-reverts to cursor after draw; fib shows a start point + live-following levels; right-click Delete shares deleteSelected.');
