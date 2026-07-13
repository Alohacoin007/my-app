#!/usr/bin/env node
// REGRESSION (webtrade) — the bottom terminal dock was floored at 188px (drag clamp + default), which
// permanently squeezed the chart area (the 1fr grid row). Slim it to a 150px dock (126px content +
// 24px tab bar) so the 4-split charts expand vertically. The 12-tab toolbox keeps all its function —
// only the default/floor height changed; an intentionally-enlarged saved value (>188) is preserved.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// default content height 126 (dock = 126 + 24 tab bar = 150), with the old-default (188) migration
if (!/const \[bottomh,setBottomh\]=React\.useState\(\(cfg\.bottomh && cfg\.bottomh>188\) \? cfg\.bottomh : 126\);/.test(src))
  bad('bottomh must default to 126 (dock 150), keeping only a saved value >188 (intentional enlargement)');
// drag floor lowered 188 → 126 so the dock can actually reach the slim height
if (!/lastH = Math\.max\(126, Math\.min\(window\.innerHeight - 200, h\)\)/.test(src))
  bad('the resize clamp floor must be 126 (was 188) so the terminal can slim down');
if (/Math\.max\(188,/.test(src)) bad('the old 188 floor must be gone');
// dock row still = bottomh + 24 (docked, not overlaid) → charts absorb the freed pixels
if (!/'--dockh': \(view\.toolbox \? \(bottomh\+24\) : 0\)\+'px'/.test(src))
  bad('dock row must stay bottomh+24 (charts shrink/grow to fit above it)');
// CSS fallbacks aligned (pre-React paint)
if (!/grid-template-rows:23px 33px 1fr var\(--dockh,150px\)/.test(src)) bad('grid --dockh fallback must be 150px');
if (!/\.bottom\{flex:none;height:var\(--bottomh,126px\)/.test(src)) bad('.bottom --bottomh fallback must be 126px');

// the 12-tab toolbox switching socket is untouched (functionality preserved)
if (!/toolbox:true/.test(src)) bad('toolbox must still default on (12 tabs preserved)');

// charts must reflow (resizeAll) when the dock slims / a panel toggles, so they instantly absorb the
// freed vertical space — not stay flat until the next ResizeObserver tick
if (!/requestAnimationFrame\(\(\)=>chartResizer\.resizeAll\(\)\); \}, \[charts\.length, bottomh, view\]\)/.test(src))
  bad('chart reflow effect must depend on bottomh + view (absorb the dock change immediately)');
// resizeOne fits the FULL live canvas height (no hardcode, no parentElement-48 double-subtract)
if (!/resizeOne\(it\)\{ try\{ const w=it\.el\.clientWidth, h=it\.el\.clientHeight; if\(w>0&&h>0\)\{ it\.chart\.resize\(w,h\);/.test(src))
  bad('resizeOne must resize to the full canvas clientHeight (responsive, no fixed px)');
// [3] the wheel/pinch zoom lock + 5px/15 golden ratio remain welded
if (!/handleScale:\{ mouseWheel:false, pinch:false/.test(src)) bad('mouseWheel/pinch zoom lock must remain');
if (!/it\.chart\.timeScale\(\)\.applyOptions\(\{ barSpacing:4, rightOffset:15 \}\);/.test(src)) bad('resizeOne must re-weld barSpacing 4 + rightOffset 15');

// [3] the spread stays the per-row pip formula (Forex ÷pip → 1.0/pip; no ×100000 inflation)
if (!/catOf\(sym\)==='Crypto'\|\|catOf\(sym\)==='Stocks'\?_diff:_diff\/pip\(sym\)/.test(src)) bad('spread must remain per-row (Forex ÷pip, crypto/stock raw)');
if (/ptScale/.test(src)) bad('the ×100000 ptScale inflation must remain removed');

if (fail) { console.error(`\n🔴 FAIL — ${fail} dock-height problem(s).`); process.exit(1); }
console.log('🟢 PASS: bottom dock slimmed to 150px (126 content + 24 tabs), floor lowered 188→126, charts expand vertically; 12-tab toolbox + pip-spread intact.');
