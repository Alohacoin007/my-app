#!/usr/bin/env node
// FEATURE (webtrade) — 차트를 열거나 닫으면 남은 창이 스테이지를 꽉 채워야 한다.
// 사장님 2026-08-14: "가운데 검은 공간 없게 만들고 싶어" → 선택된 방식 = 열/닫을 때 자동 채움(타일).
//
// 계약
//  P1. tileGeo(n,i) 는 임의의 n 에 대해 빈틈 없는 격자를 만든다 (합집합 면적 == 1, 겹침 0).
//  P2. 열린 차트 수가 바뀌면 window.tile 이 **차트별 기하 맵**과 함께 방출된다.
//  P3. 첫 마운트는 건너뛴다 — 저장된 워크스페이스 배치를 부팅마다 밀어버리면 안 된다.
//  P4. 타일 적용 시 frac 도 갱신된다 (안 하면 다음 스테이지 리사이즈에 옛 배치로 되돌아간다).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── P1: behavioural — lift tileGeo out of the page and prove it tiles gap-free ──
const m = src.match(/function tileGeo\(n,i\)\{[\s\S]*?\n\}/);
if (!m) { console.error('🔴 tileGeo(n,i) not found'); process.exit(1); }
const tileGeo = new Function(m[0] + '\nreturn tileGeo;')();

for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  const boxes = Array.from({ length: n }, (_, i) => tileGeo(n, i));
  // every box inside the unit square
  for (const b of boxes) {
    if (b.fx < -1e-9 || b.fy < -1e-9 || b.fx + b.fw > 1 + 1e-9 || b.fy + b.fh > 1 + 1e-9)
      bad(`n=${n}: box escapes the stage ${JSON.stringify(b)}`);
  }
  // total area == 1 → no black hole anywhere
  const area = boxes.reduce((s, b) => s + b.fw * b.fh, 0);
  if (Math.abs(area - 1) > 1e-9) bad(`n=${n}: tiles must cover the WHOLE stage (area ${area.toFixed(4)} ≠ 1) — black gap`);
  // no overlaps (pairwise)
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.min(a.fx + a.fw, b.fx + b.fw) - Math.max(a.fx, b.fx);
    const oy = Math.min(a.fy + a.fh, b.fy + b.fh) - Math.max(a.fy, b.fy);
    if (ox > 1e-9 && oy > 1e-9) bad(`n=${n}: windows ${i}/${j} overlap`);
  }
  // some window must touch each rail
  if (!boxes.some(b => Math.abs(b.fy + b.fh - 1) < 1e-9)) bad(`n=${n}: nothing reaches the BOTTOM rail`);
  if (!boxes.some(b => Math.abs(b.fx + b.fw - 1) < 1e-9)) bad(`n=${n}: nothing reaches the RIGHT rail`);
}

// ── P2/P3: the auto-tile effect fires on count change, and skips the first mount ──
if (!/const map=\{\}; cs\.forEach\(\(c,i\)=>\{ map\[c\.id\]=tileGeo\(cs\.length,i\); \}\);\s*\n\s*terminalBus\.emit\('window\.tile', map\);/.test(src))
  bad('opening/closing a chart must emit window.tile with a per-chart geometry map');
if (!/\}, \[charts\.length\]\);/.test(src)) bad('the auto-tile effect must watch charts.length (not every charts change)');
if (!/if\(!tiledOnce\.current\)\{ tiledOnce\.current=true; return; \}/.test(src))
  bad('the auto-tile effect must SKIP the first mount (a saved workspace layout must survive boot)');

// ── P4: applying a tile must sync the fraction, else a later stage resize undoes it ──
if (!/const f=\(arg&&arg\[idx\]\)\|\|initial\|\|/.test(src)) bad('the tile handler must prefer the geometry sent for THIS chart');
if (!/frac\.current=\{ fx:f\.fx, fy:f\.fy, fw:f\.fw, fh:f\.fh \};   \/\/ ★ 분수도 갱신/.test(src))
  bad('the tile handler must sync frac.current (otherwise the next stage resize reverts the tiling)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} auto-tile problem(s).`); process.exit(1); }
console.log('🟢 PASS: tileGeo covers the whole stage gap-free & overlap-free for n=1..9; opening/closing a chart re-tiles via a per-chart geometry map (frac synced), and a saved boot layout is left alone.');
