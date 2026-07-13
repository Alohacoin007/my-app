#!/usr/bin/env node
// REGRESSION (webtrade) — floating chart windows are positioned from FRACTIONAL geometry computed ONCE
// at mount (useLayoutEffect [] deps). When the workspace/stage later grew — the dock slimmed 212→150px,
// or the browser resized — the window kept its old pixel height and the stage's black background showed
// below it (the "black hole" gap). A ResizeObserver on the stage now SCALES each window's geometry
// proportionally (sx=nw/lastW, sy=nh/lastH) and re-fits its chart, so windows always fill gap-free.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static: a stage ResizeObserver scales the window geometry + re-fits the chart ──
if (!/let ro=null; try\{ ro=new ResizeObserver\(onStage\); ro\.observe\(par\); \}catch\(e\)\{\}/.test(src))
  bad('a ResizeObserver must watch the stage (parent) to reflow floating windows');
if (!/const sx=nw\/last\.w, sy=nh\/last\.h, g=geo\.current;/.test(src))
  bad('window geometry must scale by the stage size ratio (sx, sy)');
if (!/geo\.current=\{ x:g\.x\*sx, y:g\.y\*sy, w:Math\.max\(WIN_MINW,g\.w\*sx\), h:Math\.max\(WIN_MINH,g\.h\*sy\) \};/.test(src))
  bad('window x/y/w/h must be scaled proportionally (fills the stage, floored at WIN_MIN)');
if (!/applyGeo\(\); resizeChart\(\);   \/\/ grow the window/.test(src))
  bad('after scaling, the window must re-apply geometry and re-fit its chart');

// ── behavioural: a window that filled a 500px stage still fills a 600px stage (no bottom gap) ──
const scale = (g, last, nw, nh) => {
  const sx=nw/last.w, sy=nh/last.h;
  return { x:g.x*sx, y:g.y*sy, w:Math.max(220,g.w*sx), h:Math.max(150,g.h*sy) };
};
// bottom-left quad window: y=250 (50%), h=246 (~49.2%) of a 500px stage → bottom at 496 (≈ stage 500)
const before = { x:3, y:250, w:394, h:246 };
const grown = scale(before, {w:800,h:500}, 800, 600);   // dock slimmed → stage 500→600 tall
const bottomBefore = before.y + before.h;               // 496 of 500 → fills
const bottomAfter  = grown.y + grown.h;                  // must be ~596 of 600 → still fills
if (Math.abs(bottomAfter - 596) > 1) bad(`window must still reach the stage bottom after growth (bottom ${bottomAfter.toFixed(1)} of 600)`);
if (bottomAfter <= bottomBefore) bad('a taller stage must make the window taller (it stayed short → black gap)');
// and it is proportional, not a fixed add
if (Math.abs(grown.h - before.h*(600/500)) > 0.01) bad('height must scale by the stage ratio (proportional fill)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} stage-fill problem(s).`); process.exit(1); }
console.log('🟢 PASS: floating windows scale with the stage — dock-slim/resize grows each window proportionally so charts fill to the bottom edge (no black-hole gap).');
