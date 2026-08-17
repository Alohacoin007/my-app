#!/usr/bin/env node
// FEATURE (webtrade 라이트=MT5) — 2026-08-14 사장님 지시 4건을 계약으로 고정.
//   ① 타임프레임 버튼 = MT5 파랑(#1668b8), hover·선택에서도 파랑 유지
//   ② Market Watch → Details = MT5 화이트 (파란 제목·검은 라벨·회색 값 열)
//   ③ Market Watch → Ticks = 흰 배경 (메인 차트의 제트블랙과 별개)
//   ④ 합계 손익 셀 = 'P/L' 라벨 없음 · 검정 · 잔고바와 같은 글자 크기
//
// ②의 근본 버그 클래스: **라이트 테마에 다크 테마 색을 그대로 재사용** → 흰 배경에 흰 글자
// (`.mwdet .sh{color:#ffffff}`, `td.k{color:#e6e9ee}`)라 글자가 안 보였다. 같은 실수를 막는다.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

function bodyOf(sel) {
  const re = new RegExp('(?:^|[},\\n])\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = src.match(re);
  return m ? m[1] : null;
}
const propOf = (sel, prop) => {
  const b = bodyOf(sel); if (b === null) return null;
  const m = b.match(new RegExp(prop + '\\s*:\\s*([^;!]+)'));
  return m ? m[1].trim() : null;
};
function lum(c) {                       // #rgb/#rrggbb → 0(검정)~765(흰색)
  const m = /#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(c || ''); if (!m) return null;
  let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16);
}

// ── ① 타임프레임 = MT5 파랑 ──
const tfRule = bodyOf('.terminal.light .tf b,.terminal.light .tf b:hover,.terminal.light .tf b.on');
if (tfRule === null)
  bad('타임프레임 파랑 규칙이 없다 — hover(.tf b:hover)·선택(.tf b.on) 규칙이 색을 덮으므로 세 상태를 함께 지정해야 한다');
else if (!/#1668b8/i.test(tfRule))
  bad(`타임프레임 색이 MT5 파랑(#1668b8)이 아니다: '${tfRule.trim()}'`);
// 파랑 규칙은 hover/선택 규칙보다 **뒤에** 와야 이긴다
const iTf = src.indexOf('.terminal.light .tf b,.terminal.light .tf b:hover');
const iHover = src.indexOf('.terminal.light .tf b:hover{');
const iOn = src.indexOf('.terminal.light .tf b.on,');
if (iTf > -1 && ((iHover > -1 && iTf < iHover) || (iOn > -1 && iTf < iOn)))
  bad('타임프레임 파랑 규칙이 hover/선택 규칙보다 앞에 있다 — 나중 규칙이 색을 덮어 파랑이 사라진다');

// ── ② Details = MT5 화이트 (흰 배경에 흰 글자 금지) ──
for (const [sel, label] of [['.terminal.light .mwdet .sh', 'Details 심볼 제목'],
                            ['.terminal.light .mwdet td.k', 'Details 라벨(td.k)']]) {
  const c = propOf(sel, 'color');
  if (c === null) { bad(`${label} 의 라이트 색 규칙이 없다`); continue; }
  const L = lum(c);
  if (L !== null && L > 600) bad(`${label} 색이 '${c}' — 흰 배경에 흰 글자라 안 보인다 (다크 테마 색 재사용 버그)`);
}
if (!/#1668b8/i.test(propOf('.terminal.light .mwdet .sh', 'color') || ''))
  bad('Details 심볼 제목은 MT5 파랑(#1668b8) 이어야 한다');
if (bodyOf('.terminal.light .mwdet td.v') === null || !/background/.test(bodyOf('.terminal.light .mwdet td.v') || ''))
  bad('Details 값 열(td.v)에 옅은 회색 배경이 없다 — MT5는 값 열을 회색으로 구분한다');
if (/font-weight:\s*600/.test(bodyOf('.terminal.light .mwdet td.k') || ''))
  bad('Details 라벨이 굵게(600) 남아 있다 — MT5는 보통 굵기');

// ── ③ Ticks = 흰 배경 ──
if (!/#ffffff/i.test(propOf('.terminal.light .mwtick', 'background') || ''))
  bad('.terminal.light .mwtick 배경이 흰색이 아니다 — Ticks 탭이 검게 남는다');
if (!/const th=\s*legend \? \{ bg:'#ffffff'/.test(src))
  bad('TickChart 가 라이트에서 흰 배경 팔레트를 쓰지 않는다 (CHART_THEME.light 는 메인 차트용 제트블랙이라 그대로 쓰면 안 된다)');
if (/bid=mk\(legend\?'#00FF55'/.test(src))
  bad('Ticks 의 bid 선이 형광 초록(#00FF55) — 흰 배경에서 안 보인다');

// ── ④ 합계 손익 셀 ──
if (/className=\{"pl-total "[^}]*\}[^<]*<span className="k"[^>]*>P\/L<\/span>/.test(src) || /<span className="k"[^>]*>P\/L<\/span>/.test(src))
  bad("합계 손익 셀에 'P/L' 라벨이 남아 있다 — MT5 는 숫자만 표시");
const plSize = propOf('table.pos td.pl-total', 'font-size');
if (plSize !== '11.5px')
  bad(`합계 손익 글자 크기가 '${plSize}' — 잔고바(.acctline 11.5px)와 같아야 한다`);
if (propOf('.acctline', 'font-size') !== '11.5px')
  bad('.acctline 글자 크기가 11.5px 가 아니다 — 손익 셀과 락스텝이 깨졌으니 둘 다 맞출 것');
if (!/#000000/i.test(propOf('.terminal.light table.pos td.pl-total', 'color') || ''))
  bad('라이트 테마 합계 손익이 순수 검정(#000000)이 아니다 — 2026-08-17 툴박스 글자 통일');
if (/className=\{"pl-total "\+\(floating>=0\?'up':'down'\)\}/.test(src))
  bad("합계 손익에 up/down 색 클래스가 남아 있다 — 사장님 지시는 '검은색으로'");

if (fail) { console.error(`\n🔴 FAIL — ${fail} 건.`); process.exit(1); }
console.log('🟢 PASS: 타임프레임 MT5 파랑 · Details 화이트(파란 제목/검은 라벨/회색 값열) · Ticks 흰 배경 · 합계 손익 라벨없음+검정+잔고바와 동일 크기.');
