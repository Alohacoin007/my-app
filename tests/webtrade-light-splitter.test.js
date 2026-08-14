#!/usr/bin/env node
// REGRESSION (webtrade) — 라이트 테마에서 왼쪽 패널과 차트 사이에 **검은 세로 막대**가 보이던 버그.
// (사장님 2026-08-14 스샷 3회 — 나는 ✕ hover 라고 두 번 오진했다. 실제 원인은 hover 와 무관.)
//
// 원인: `.splitter{background:transparent}` (6px 드래그 손잡이). 라이트 테마는 가운데 **1px 헤어라인**
//       (`::before`)만 밝게 칠하고 **6px 몸통은 안 칠했다** → 뒤의 루트 배경 `.terminal{background:#0e1015}`
//       (라이트에서도 어둡다)이 그대로 비쳐 검은 막대가 됐다.
//
// 계약: 라이트 테마에서 **투명한 크롬 스트립은 없어야 한다** — 어두운 루트 위에 얹히는 라이트 UI 조각은
//       자기 배경을 직접 칠해야 한다. 여기서는 `.splitter` 몸통.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 규칙 본문에서 background 값을 뽑는다 (::before 등 의사요소 규칙은 제외)
function bodyOf(sel) {
  const re = new RegExp('(?:^|[},\\n])\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = src.match(re);
  return m ? m[1] : null;
}
function bgOf(sel) {
  const b = bodyOf(sel);
  if (b === null) return null;
  const m = b.match(/background(?:-color)?\s*:\s*([^;]+)/);
  return m ? m[1].trim() : 'none';
}
// #rgb / #rrggbb 를 밝기로
function lightness(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return r + g + b;   // 0(검정) ~ 765(흰색)
}

// ── 루트가 실제로 어둡다는 전제부터 확인 (밝아졌다면 이 핀의 근거가 바뀐 것) ──
const rootBg = bgOf('.terminal');
if (rootBg && lightness(rootBg) !== null && lightness(rootBg) > 400)
  bad('.terminal 루트 배경이 밝아졌다 — 이 핀의 전제(어두운 루트 위 라이트 크롬)를 다시 검토할 것');

// ── P1/P2: 라이트 테마 스플리터 몸통은 칠해져 있고, 밝아야 한다 ──
const spLight = bgOf('.terminal.light .splitter');
if (spLight === null || spLight === 'none')
  bad('.terminal.light .splitter 에 background 가 없다 — 투명 몸통으로 어두운 루트(#0e1015)가 비쳐 **검은 세로 막대**가 된다');
else if (/transparent|rgba\([^)]*,\s*0\s*\)/.test(spLight))
  bad(`.terminal.light .splitter 배경이 '${spLight}' — 투명이면 검은 막대가 다시 나타난다`);
else {
  const L = lightness(spLight);
  if (L !== null && L < 450) bad(`.terminal.light .splitter 배경 '${spLight}' 이 어둡다(밝기 ${L}/765) — 라이트 크롬과 이어지지 않는다`);
}

// ── P3: 헤어라인만 칠하고 몸통을 빼먹는 실수의 재발 방지 ──
if (/\.terminal\.light \.splitter::before\{/.test(src) && spLight === null)
  bad('헤어라인(::before)만 라이트로 칠하고 몸통은 안 칠했다 — 이번 버그와 똑같은 실수');

// ── 다크 테마는 손대지 않았는지 (스플리터 몸통은 투명이어도 정상: 뒤가 어두운 게 맞다) ──
if (!/\.splitter\{[^}]*background:transparent/.test(src))
  bad('기본(.splitter) 규칙의 transparent 배경이 사라졌다 — 다크 테마 의도가 바뀌었는지 확인 필요');

if (fail) { console.error(`\n🔴 FAIL — ${fail} 건.`); process.exit(1); }
console.log('🟢 PASS: 라이트 테마 스플리터 몸통이 밝게 칠해져 어두운 루트가 비치지 않는다 (검은 세로 막대 없음); 다크 테마 동작 유지.');
