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
if (!/if\(ent\.kind==='t'\|\|ent\.kind==='f'\) showHandles\(\)/.test(src)) bad('selecting a trend/fib line must show the 3 handles (selectDrawing)');
if (!/previewLine\.current/.test(src) || !/onMoveDraw/.test(src)) bad('must show a live rubber-band preview while dragging');
if (!/function DrawMenu\(/.test(src)) bad('right-click Delete popup (DrawMenu) missing');
// right-click must beat Lightweight Charts (which swallows contextmenu) via a CAPTURE-phase listener
if (!/addEventListener\('contextmenu', onCtxNative, true\)/.test(src)) bad('right-click must use a capture-phase native listener (LWC swallows contextmenu)');
if (!/hit=hitDrawing\(e\.clientX-r\.left/.test(src)) bad('right-click must hit-test the drawing at the cursor');
if (!/if\(hit\)\{ selectDrawing\(hit\); setDelMenu/.test(src)) bad('right-click ON a drawing must select it + open the Delete popup');
// fib is ONE grouped object (base diagonal + levels) so it selects/deletes as a unit
if (!/const ent=\{kind:'f',ls,levels,pts,w0:1\}/.test(src)) bad('fib must be a grouped object {kind:f, ls, levels, pts}');
if (!/else if\(ent\.kind==='f'\)\{ try\{ chart\.current\.removeSeries\(ent\.ls\)/.test(src)) bad('deleting a fib must remove its base line + all levels');
// handles are DRAGGABLE — grab a point to move an endpoint (0/2) or translate the line (1)
if (!/const hDrag=React\.useRef/.test(src) || !/onHandleDown/.test(src)) bad('handles must be draggable (onHandleDown/hDrag)');
if (!/\.dov\.pt\{[^}]*pointer-events:auto/.test(src)) bad('handles must be interactive (pointer-events:auto)');
if (!/ent\.pts=np; try\{ ent\.ls\.setData\(np\)/.test(src)) bad('dragging a handle must re-write the line endpoints');

// a drawing tool / crosshair must apply ONLY to the ACTIVE window — not all 4 charts at once
if (!/if\(!t\|\|t==='arrow'\|\|t==='cross'\|\|!c\|\|!s\|\|!activeRef\.current\) return;/.test(src)) bad('drawing must be gated to the active window (activeRef)');
if (!/const armed = isActive && tool && tool!=='arrow'/.test(src)) bad('the drawlayer must only ARM on the active window (isActive)');
if (!/const cross = isActive && tool==='cross'/.test(src)) bad('crosshair mode must only apply on the active window');
if (!/\}, \[tool, isActive\]\);/.test(src)) bad('the tool effect must re-run on isActive change so arming follows the selected window');
if (!/e\.button!==0 \|\| !activeRef\.current\) return;/.test(src)) bad('crosshair measure must be gated to the active window');
// the line must be THIN and must NOT thicken on select (white handles are the only select marker)
if (/applyOptions\(\{lineWidth:[^}]*\+2/.test(src)) bad('selecting must NOT thicken the line (no lineWidth+2)');
if (!/const ent=\{kind:'t',ls,pts,w0:1\}/.test(src)) bad('trend line must be thin (w0:1 / lineWidth 1)');
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
