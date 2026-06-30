#!/usr/bin/env node
// Alpexa — CHART RENDER GUARD (visual-bug class, run in the static gate).
//   node tests/chart-scale.test.js
//
// The wallet chart's vertical scale shipped two render bugs the static gate couldn't see
// (they only showed up rendered in a browser):
//   VIS-chart-collapse — min==max (cash wallet, no movement) divided by ~0 → the line
//                        collapsed onto the bottom/top edge instead of sitting centered.
//   VIS-chart-amplify  — a negligible change ($35 on $3.49M = −0.00%) got normalized to fill
//                        the WHOLE height → a dramatic corner-to-corner line that even flipped
//                        direction on live-tick jitter ("왔다갔다 지맘대로").
//
// We can't render React here, but the BUG lives in pure math (chartYScale). So we extract the
// SHIPPED function from crypto-live.html and assert its invariants — deterministic, no browser,
// always runs. If someone reintroduces edge-collapse or full-height amplification, this fails.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'crypto-live.html'), 'utf8');
const m = SRC.match(/function chartYScale\(series, baseline, H, padY\)\s*\{[\s\S]*?\n\}/);
if (!m) { console.log('  🔴 could not find chartYScale() in crypto-live.html'); process.exit(1); }
// eslint-disable-next-line no-eval
const chartYScale = eval('(' + m[0] + ')');

const H = 220, padY = 22;                 // same constants Chart uses
const top = padY, bottom = H - padY;      // usable band
const usable = bottom - top;
let failed = false;
function ok(c, msg){ if(!c){ console.log('  🔴 '+msg); failed = true; } else { console.log('  ✅ '+msg); } }

// helper: y-range that a series occupies (px)
function span(series, baseline){
  const y = chartYScale(series, baseline, H, padY);
  const ys = series.concat([baseline]).map(y);
  return { lo: Math.min(...ys), hi: Math.max(...ys), ys };
}
function allFinite(arr){ return arr.every((v) => Number.isFinite(v)); }

// 1) FLAT wallet (cash, no movement): every point ≈ equal → line must sit CENTERED, never
//    collapsed to an edge. (VIS-chart-collapse)
{
  const flat = new Array(20).fill(3489800.00);
  const { lo, hi, ys } = span(flat, 3489800.00);
  const mid = (top + bottom) / 2;
  ok(allFinite(ys), 'flat: all y finite (no divide-by-zero NaN)');
  ok(lo >= top + usable * 0.3 && hi <= top + usable * 0.7,
     'flat: line sits in the middle band [30%,70%], not collapsed to an edge  (got y≈' + Math.round(lo) + ')');
}

// 2) NEGLIGIBLE change ($35 on $3.49M = −0.00%): must render as a NEAR-FLAT line, not amplified
//    to fill the height. (VIS-chart-amplify)
{
  const tiny = [3489800.00, 3489812.00, 3489835.00, 3489819.00];
  const { lo, hi } = span(tiny, tiny[0]);
  const occupied = (hi - lo) / usable;
  ok(occupied < 0.30,
     'tiny −0.00% move occupies <30% of height (no full-height amplification)  (got ' + Math.round(occupied*100) + '%)');
}

// 3) REAL big move (a deposit: $103 → $3.7M) SHOULD use most of the height (sanity — the floor
//    must not flatten genuine movement).
{
  const big = [103.59, 1850000, 3700103.59];
  const { lo, hi } = span(big, 103.59);
  const occupied = (hi - lo) / usable;
  ok(occupied > 0.6, 'real big move uses >60% of height (floor does not flatten true movement)  (got ' + Math.round(occupied*100) + '%)');
}

// 4) Never produces non-finite coordinates for degenerate inputs.
{
  ok(allFinite([chartYScale([0], 0, H, padY)(0)]), 'all-zero series → finite y (no NaN)');
}

console.log('\n' + (failed
  ? '🔴 chart-scale: FAIL — a chart render bug class (collapse/amplify) is back'
  : '🟢 chart-scale: flat→centered, tiny→near-flat, real→uses height; no NaN') + '\n');
process.exit(failed ? 1 : 0);
