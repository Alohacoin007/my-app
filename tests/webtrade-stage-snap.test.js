#!/usr/bin/env node
// REGRESSION (webtrade) — a RESTORED workspace must still fill the stage to the bottom/right rail.
//
// 결함 (2026-08-14): 차트 탭바 높이를 24px→20px로 줄이자 스테이지가 4px 커졌다. 창 위치는
// localStorage에 **픽셀**로 저장되는데, 복원 코드는 그 옛 픽셀을 **새** 스테이지 높이로 나눠
// 분수를 만든다 → 바닥에 붙어 있던 창의 fy+fh 가 1.0 이 아니라 0.99 가 되어 **검은 띠**가
// 영구히 남는다 (stage-fill 테스트는 '새' 창만 검증해서 이 경로를 놓쳤다).
//
// 계약: 복원 시 원래 가장자리에 붙어 있던(= 현재 스테이지 끝에서 SNAP px 이내) 창은 정확히
// 가장자리에 다시 붙인다. 가운데 떠 있는 창은 건드리지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── static pin: the restore path must snap flush edges back to the rail ──
if (!/const SNAP=10;\s*\/\/ 저장된 픽셀 박스가 옛 스테이지 끝에 붙어 있었다면/.test(src))
  bad('savedGeo restore must define the edge-SNAP contract (with the why-comment)');
if (!/if\(gx\+gw >= W-SNAP\) gw = W-gx;/.test(src)) bad('restore must snap a right-flush window back to the right rail');
if (!/if\(gy\+gh >= H-SNAP\) gh = H-gy;/.test(src)) bad('restore must snap a bottom-flush window back to the bottom rail');

// ── behavioural: model the restore exactly as the app does it ──
const WIN_MINW = 220, WIN_MINH = 150, SNAP = 10;
const restore = (saved, W, H) => {
  let gx = Math.max(0, Math.min(saved.x, W - 60)), gy = Math.max(0, Math.min(saved.y, H - 24));
  let gw = Math.max(WIN_MINW, saved.w), gh = Math.max(WIN_MINH, saved.h);
  if (gx + gw >= W - SNAP) gw = W - gx;
  if (gy + gh >= H - SNAP) gh = H - gy;
  return { x: gx, y: gy, w: gw, h: gh };
};

// the exact production case: workspace saved on a 900×500 stage (chart tabs were 24px),
// reopened after the tab bar slimmed to 20px → the stage is now 504 tall.
const OLD_H = 500, NEW_H = 504, W = 900;
for (const [name, saved] of [
  ['bottom-left', { x: 0,   y: OLD_H / 2, w: W / 2, h: OLD_H / 2 }],
  ['bottom-right',{ x: W/2, y: OLD_H / 2, w: W / 2, h: OLD_H / 2 }],
]) {
  const g = restore(saved, W, NEW_H);
  if (g.y + g.h !== NEW_H) bad(`${name}: restored window must reach the stage bottom (${g.y + g.h} vs ${NEW_H}) — black band`);
  if (g.x + g.w !== (saved.x === 0 ? W / 2 : W)) bad(`${name}: horizontal box must be preserved/snapped correctly`);
}
// a right-flush window snaps back to the right rail when the stage widens
const wide = restore({ x: 450, y: 0, w: 450, h: 250 }, 906, NEW_H);
if (wide.x + wide.w !== 906) bad(`right-flush window must reach the right rail (${wide.x + wide.w} vs 906)`);

// a genuinely FLOATING window (nowhere near an edge) must NOT be stretched
const mid = restore({ x: 100, y: 50, w: 300, h: 200 }, W, NEW_H);
if (mid.w !== 300 || mid.h !== 200) bad(`a mid-stage floating window must keep its size (got ${mid.w}×${mid.h})`);

if (fail) { console.error(`\n🔴 FAIL — ${fail} stage-snap problem(s).`); process.exit(1); }
console.log('🟢 PASS: a restored workspace re-docks flush windows to the bottom/right rail (no black band after a chrome-height change); mid-stage floating windows keep their size.');
