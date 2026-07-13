#!/usr/bin/env node
// REGRESSION (webtrade) — floating chart windows must FILL the stage to the bottom rail, gap-free. The
// geometry is seeded once at mount; when the stage grows (dock slims 212→150px, or the browser
// resizes) the window must re-dock. The old ratio-scale (sx=nw/lastW) preserved the quad's built-in
// margins → a persistent black gap under the axis. Now each window re-derives its pixel box DIRECTLY
// from its FRACTION of the CURRENT stage, and the default 2×2 quad is edge-to-edge (bottom row reaches
// y=1.0), so the four charts fill the whole stage with zero black hole.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static: the ratio weighting is GONE; a fraction ref drives a direct recompute ──
if (/const sx=nw\/last\.w, sy=nh\/last\.h/.test(src)) bad('the old ratio-scale (sx/sy weighting) must be deleted');
if (!/const frac=React\.useRef\(null\);/.test(src)) bad('a frac ref (window fraction of the stage) must exist');
if (!/const onStage=\(\)=>\{ const W=par\.clientWidth, H=par\.clientHeight, fr=frac\.current; if\(W<=0\|\|H<=0\|\|!fr\) return;/.test(src))
  bad('stage handler must read the live stage size + this window fraction');
if (!/geo\.current=\{ x:Math\.round\(fr\.fx\*W\), y:Math\.round\(fr\.fy\*H\),\s*\n\s*w:Math\.max\(WIN_MINW,Math\.round\(fr\.fw\*W\)\), h:Math\.max\(WIN_MINH,Math\.round\(fr\.fh\*H\)\) \};/.test(src))
  bad('window box must be re-derived directly from fraction × current stage (no ratio weighting)');
if (!/applyGeo\(\); resizeChart\(\);   \/\/ dock the frame/.test(src)) bad('after re-docking, re-fit the chart to the frame');
// the default quad fills edge-to-edge (bottom row reaches y=1.0)
if (!/const quad=\[\{fx:0,fy:0,fw:\.5,fh:\.5\},\{fx:\.5,fy:0,fw:\.5,fh:\.5\},\s*\n\s*\{fx:0,fy:\.5,fw:\.5,fh:\.5\},\{fx:\.5,fy:\.5,fw:\.5,fh:\.5\}\];/.test(src))
  bad('the 2×2 quad must fill edge-to-edge (bottom row fy:.5+fh:.5 → y=1.0, no bottom gap)');
// drag-end syncs the fraction so a user move survives a later resize
if (!/frac\.current=\{ fx:g\.x\/W, fy:g\.y\/H, fw:g\.w\/W, fh:g\.h\/H \};/.test(src)) bad('drag-end must sync frac from the new box');

// ── behavioural: fraction recompute fills to the bottom on ANY stage height ──
const recompute = (fr, W, H) => ({ x:Math.round(fr.fx*W), y:Math.round(fr.fy*H),
  w:Math.max(220,Math.round(fr.fw*W)), h:Math.max(150,Math.round(fr.fh*H)) });
const botLeft = { fx:0, fy:.5, fw:.5, fh:.5 };   // quad[2] — the bottom-left window
for (const H of [500, 600, 820]) {
  const g = recompute(botLeft, 900, H);
  const bottom = g.y + g.h;
  if (Math.abs(bottom - H) > 1) bad(`bottom-row window must reach the stage bottom (${bottom} vs stage ${H})`);
}
// grow the stage → the window grows with it (not stuck flat)
if (!(recompute(botLeft,900,600).h > recompute(botLeft,900,500).h)) bad('a taller stage must yield a taller window');

if (fail) { console.error(`\n🔴 FAIL — ${fail} stage-fill problem(s).`); process.exit(1); }
console.log('🟢 PASS: windows re-derive their box from fraction × live stage (no ratio weighting); the edge-to-edge quad fills to the bottom rail on every stage height — no black-hole gap.');
