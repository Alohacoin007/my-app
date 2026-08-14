#!/usr/bin/env node
// REGRESSION (webtrade) — ✕ 에 마우스를 올리면 **박스가 생기면 안 된다** (사장님 2026-08-14).
//
// 이 버그를 두 번 놓친 이유 = ✕ 가 화면에 **두 종류**라서다:
//   ① 차트 탭바 ✕  `.charttabs .ctab .tclose`
//   ② 차트 창 타이틀바 ✕ `.cell-title .wc span.cl`   ← 사장님이 보신 건 이쪽이었다
// ①만 고치고 "됐다"고 말했다 → 실제 브라우저 실측(rgba(255,255,255,.22))으로 잡음. 이제 **둘 다** 핀.
//
// 특이도 함정(핵심): 라이트 테마의
//     .terminal.light .win.active .cell-title .wc span:hover{background:rgba(255,255,255,.22)}
// 는 클래스 6개(+hover)라, `.terminal.light .cell-title .wc span.cl:hover`(클래스 5개)를 **이긴다**.
// 그래서 활성창 전용 .cl 오버라이드가 반드시 따로 있어야 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 해당 셀렉터의 hover 규칙 본문을 뽑아 background 값을 읽는다
function hoverBg(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{}]*\\{([^}]*)\\}');
  const m = src.match(re);
  if (!m) return null;
  const b = m[1].match(/background(?:-color)?\s*:\s*([^;]+)/);
  return b ? b[1].trim() : 'none';
}
const isBox = (bg) => bg && bg !== 'none' && !/^transparent$|^none$|rgba\([^)]*,\s*0\s*\)/.test(bg);

// ── ② 타이틀바 ✕ — 다크 / 라이트 / 라이트+활성창, 셋 다 박스 없음 ──
const titleRules = [
  ['.cell-title .wc span.cl:hover', '다크 테마 타이틀바 ✕'],
  ['.terminal.light .cell-title .wc span.cl:hover', '라이트 테마 타이틀바 ✕'],
  ['.terminal.light .win.active .cell-title .wc span.cl:hover', '라이트 테마 **활성창** 타이틀바 ✕'],
];
for (const [sel, label] of titleRules) {
  const bg = hoverBg(sel);
  if (bg === null) bad(`${label} 의 hover 규칙(${sel})이 없다 — 활성창 규칙(rgba(255,255,255,.22))이 특이도로 이겨서 박스가 다시 뜬다`);
  else if (isBox(bg)) bad(`${label}: hover 배경이 '${bg}' — ✕ 뒤에 박스가 생긴다 (transparent 여야 함)`);
}
// 빨간 박스(#e81123)는 ✕ 에서 완전히 폐지
if (/span\.cl:hover\{[^}]*#e81123/.test(src)) bad('✕ hover 에 빨간 박스(#e81123)가 남아 있다 — 사장님이 폐지 요청');

// ── ① 탭바 ✕ — 박스 없음 + 폭 고정(hover 시 탭이 옆으로 밀리지 않게) ──
const tabBg = hoverBg('.charttabs .ctab .tclose:hover');
if (tabBg === null) bad('탭바 ✕ 의 hover 규칙이 없다');
else if (isBox(tabBg)) bad(`탭바 ✕: hover 배경이 '${tabBg}' — 박스가 생긴다`);
const lightTabBg = hoverBg('.terminal.light .charttabs .ctab .tclose:hover');
if (isBox(lightTabBg)) bad(`라이트 탭바 ✕: hover 배경이 '${lightTabBg}' — 박스가 생긴다`);

const tabBase = src.match(/\.charttabs \.ctab \.tclose\{([^}]*)\}/);
if (!tabBase) bad('탭바 ✕ 기본 규칙을 찾을 수 없다');
else {
  if (!/width:\s*\d+px/.test(tabBase[1])) bad('탭바 ✕ 는 고정 width 가 있어야 한다 (없으면 hover 시 탭이 밀린다)');
  if (/padding:\s*[^;]*\d+px\s+\d+px/.test(tabBase[1])) bad('탭바 ✕ 의 좌우 padding 은 폭을 흔든다 — 고정 width 로 대체할 것');
}

// ── ③ 주문/포지션·알림 행의 ✕ (.xclose) — 라이트에서 hover 시 사라지면 주문을 못 지운다 ──
// 원인 클래스: 라이트 전용 규칙이 없어 다크용 `hover{color:#ffffff}` 가 흰 배경에 그대로 걸렸다
// (Details 탭과 동일 — 다크 색 재사용). 실측: 수정 전 rgb(255,255,255) → 수정 후 rgb(0,0,0).
const xcLight = hoverBg('.terminal.light .xclose:hover');   // 규칙 존재 여부
if (xcLight === null)
  bad('.terminal.light .xclose:hover 규칙이 없다 — 다크용 흰색 hover 가 흰 배경에 걸려 ✕ 가 사라진다');
const bodyOfRule = (sel) => { const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : null; };
const xcHoverColor = (bodyOfRule('.terminal.light .xclose:hover') || '').match(/color\s*:\s*([^;]+)/);
if (!xcHoverColor) bad('.terminal.light .xclose:hover 에 color 가 없다');
else if (!/#000000|#000\b|rgb\(0,\s*0,\s*0\)/.test(xcHoverColor[1]))
  bad(`라이트 .xclose hover 색이 '${xcHoverColor[1].trim()}' — 사장님 지시는 진한 검정(#000000)`);
const xcBase = (bodyOfRule('.terminal.light .xclose') || '').match(/color\s*:\s*([^;]+)/);
if (!xcBase) bad('.terminal.light .xclose 기본 색 규칙이 없다 (다크 실버가 흰 배경에 흐리게 남는다)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} 개의 ✕ hover 문제.`); process.exit(1); }
console.log('🟢 PASS: ✕ hover — 탭바·창 타이틀바는 박스 없이 글리프만(다크/라이트/활성창), 주문행 ✕(.xclose)는 라이트에서 진한 검정으로 보인다.');
