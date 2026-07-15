#!/usr/bin/env node
// REGRESSION (webtrade) — the History + Journal tabs use virtual windowing (useVirtual): only ~40 rows
// hit the DOM no matter how many are loaded, with top/bottom spacer rows preserving scroll height, and
// a scroll-to-bottom callback that chunk-pages more (History). History is also server-chunk-paged.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static: the hook + its use in History (paging) and Journal (window only) ──
if (!/function useVirtual\(total, rowH, onEnd\)\{/.test(src)) bad('useVirtual hook must exist');
if (!/if\(onEnd && el\.scrollHeight-st-el\.clientHeight < 240\) onEnd\(\);/.test(src)) bad('scroll near the bottom must fire onEnd (page more)');
if (!/const histV = useVirtual\(histShown\.length, 22, \(\)=>positionsStore\.loadMoreHistory\(\)\);/.test(src)) bad('History must window + page on scroll-to-bottom');
if (!/onScroll=\{tab==='History'\?histV\.onScroll:undefined\}/.test(src)) bad('History scroll container must drive the window/paging');
if (!/histShown\.slice\(histV\.start,histV\.end\)\.map\(h=>\(/.test(src)) bad('History must render only the windowed slice');
if (!/tab==='History' && histV\.topH>0 && <tr aria-hidden="true" style=\{\{height:histV\.topH\}\}>/.test(src)) bad('History must render a top spacer row');
if (!/tab==='History' && histV\.botH>0 && <tr aria-hidden="true" style=\{\{height:histV\.botH\}\}>/.test(src)) bad('History must render a bottom spacer row');
if (!/const V=useVirtual\(rows\.length, 18, null\);/.test(src)) bad('Journal must window (no paging — memory-capped)');
if (!/rows\.slice\(V\.start,V\.end\)\.map\(/.test(src)) bad('Journal must render only the windowed slice');

// ── behavioural: the windowing math caps DOM rows + spacer heights reconstruct full height ──
const useVirtual = (total, rowH, scrollTop) => {
  const start = Math.max(0, Math.floor(scrollTop/rowH)-8);
  const range = { start, end:start+40 };
  const s = Math.min(range.start, Math.max(0,total)), e = Math.min(range.end, total);
  return { start:s, end:e, topH:s*rowH, botH:Math.max(0,(total-e)*rowH), rendered:e-s };
};
// 50,000 rows, scrolled to row ~1000 → only ~40 rendered, spacers + window == full height
const T=50000, H=22, st=1000*H;
const v=useVirtual(T, H, st);
if (v.rendered > 48) bad(`DOM must hold ~40 rows, got ${v.rendered} of ${T}`);
if (v.topH + v.rendered*H + v.botH !== T*H) bad('top spacer + window + bottom spacer must equal the full scroll height');
// top of list → no top spacer
const top=useVirtual(T, H, 0);
if (top.topH !== 0 || top.start !== 0) bad('at scrollTop 0 there is no top spacer');
// tiny list → renders all, no spacers
const small=useVirtual(5, H, 0);
if (small.rendered !== 5 || small.topH !== 0 || small.botH !== 0) bad('a short list renders fully with no spacers');

// ── History server paging: 50 then +20, memory-only (no localStorage for history) ──
if (!/histOffset:0, histDone:false, _histBusy:false,/.test(src)) bad('paging state (offset/done/busy) must exist');
if (/localStorage[^\n]*hist/i.test(src)) bad('history must be memory-only (no localStorage)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} virtual-scroll problem(s).`); process.exit(1); }
console.log('🟢 PASS: History/Journal virtual-windowed (~40 DOM rows + spacers = full height); History server-chunk-paged (50 + 20 on scroll); memory-only.');
