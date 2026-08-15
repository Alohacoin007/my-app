#!/usr/bin/env node
// REGRESSION (webtrade 툴박스 라이트) — 2026-08-15 사장님이 **연속 5건**을 지적했다:
//   PAMM 버튼 · 회사&라이선스 · 알림 추가행 · 메일박스 · 저널.
// 하나씩 고치면 여섯 번째가 나온다. 근본 원인은 하나였다:
//   **툴박스 전체에 라이트 테마 커버리지가 없었다** — 규칙이 아예 없거나(pammbtn·cinfo·alert-add·
//   tbxempty), 있어도 값이 다크였다(table.mbx: 흰 배경에 헤더 #0E1015 · 글자 #e6e9ee).
//
// 계약: 툴박스에서 **글자색을 지정하는 다크 규칙**에는 라이트 대응 규칙이 있어야 하고,
//       라이트 값은 흰 배경에서 읽히는 어두운 색이어야 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const ruleBody = (sel) => {
  const m = src.match(new RegExp('(?:^|[},\\n])\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
};
const colorOf = (sel) => { const b = ruleBody(sel); if (b === null) return null;
  const m = b.match(/(?:^|;)\s*color\s*:\s*([^;]+)/); return m ? m[1].trim() : null; };
// #rgb/#rrggbb → 밝기 0(검정)~765(흰색)
const lum = (c) => { const m = /#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(c || ''); if (!m) return null;
  let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16); };

// ── 라이트에서 **어두운 글자**여야 하는 지점 (흰 배경 위) ──
const mustBeDark = [
  ['.terminal.light .cinfo-hd', '회사 제목'],
  ['.terminal.light table.cinfo-tbl td.cv', '회사 값'],
  ['.terminal.light table.cinfo-tbl td.ck', '회사 라벨'],
  ['.terminal.light table.jrnl td', '저널 본문'],
  ['.terminal.light table.jrnl td.ok', '저널 성공 로그'],
  ['.terminal.light table.mbx td', '메일박스 셀'],
  ['.terminal.light table.mbx th', '메일박스 헤더'],
  ['.terminal.light .tbxempty', '빈 패널 안내'],
];
for (const [sel, label] of mustBeDark) {
  const c = colorOf(sel);
  if (c === null) { bad(`${label}: ${sel} 라이트 규칙이 없다 — 다크 색이 흰 배경에 그대로 걸린다`); continue; }
  const L = lum(c);
  if (L !== null && L > 450) bad(`${label}: 라이트 색이 '${c}' (밝기 ${L}/765) — 흰 배경에서 안 읽힌다`);
}
// 저널 성공 로그는 초록이면 안 된다 (사장님 "글짜는 검은색으로", 실제 MT5 저널도 검정)
const jok = colorOf('.terminal.light table.jrnl td.ok') || '';
if (/#(0{0,2}[0-9a-f]?[0-9a-f]f{0,2}|[0-9a-f]{0,2}c8[0-9a-f]{0,2})/i.test(jok) && /^#(00|1a7|59c)/i.test(jok))
  bad(`저널 성공 로그가 아직 초록 계열('${jok}') — 검정이어야 한다`);

// ── 메일박스 라이트 규칙이 **다크 값**으로 남아 있지 않은지 (있는데 틀린 케이스) ──
const mbxTh = ruleBody('.terminal.light table.mbx th') || '';
if (/background:\s*#0E1015/i.test(mbxTh)) bad('메일박스 헤더 라이트 규칙의 배경이 아직 다크(#0E1015)다');

// ── 알림 추가행: 셀렉트/입력/버튼이 라이트로 칠해져 있어야 한다 ──
if (!ruleBody('.terminal.light .alert-add select,.terminal.light .alert-add input'))
  bad('알림 추가행의 select/input 라이트 규칙이 없다 — 다크 컨트롤이 밝은 툴박스에 얹힌다');
const alBtn = ruleBody('.terminal.light .alert-add button') || '';
if (!/#1668b8/i.test(alBtn)) bad('Add Alert 버튼이 MT5 파랑(#1668b8)이 아니다');

// ── PAMM 버튼 = MT5 문법 (각진 모서리 · 1px 테두리 · 라이트 대응) ──
const pb = ruleBody('.pammbtn') || '';
if (!/border-radius:\s*2px/.test(pb)) bad('PAMM 버튼이 MT5 각진 모서리(2px)가 아니다');
if (/border-radius:\s*5px/.test(pb)) bad('PAMM 버튼에 예전 라운드 5px 이 남아 있다');
if (/#00c805/i.test(src.slice(src.indexOf('.pammbtn'), src.indexOf('.pammbtn') + 900)))
  bad('PAMM Join 이 아직 로빈후드 형광초록(#00c805) — MT5 컨셉과 이질적');
for (const sel of ['.terminal.light .pammbtn', '.terminal.light .pammbtn.join', '.terminal.light .pammbtn.out'])
  if (!ruleBody(sel)) bad(`${sel} 라이트 규칙이 없다`);

// ── 차트: TP 라인이 포지션 라인(초록/빨강)과 다른 색이어야 한다 ──
const tpLine = src.match(/meta\.tp[^\n]*createPriceLine\(\{[^}]*color:'([^']+)'/);
if (!tpLine) bad('TP 라인 색을 찾을 수 없다');
else {
  const c = tpLine[1].toLowerCase();
  if (c === '#00ff00' || c === '#00c800') bad(`TP 라인이 BUY 포지션과 같은 초록('${c}') — 진입가와 목표가가 구분되지 않는다`);
  if (!/^#2f9bff$/.test(c)) bad(`TP 라인 색이 '${c}' — 사장님 지시는 파랑(#2f9bff)`);
}
// 드래그 프리뷰도 같은 색이어야 한다 (드래그 중에만 색이 튀면 안 된다)
if (!/d\.eff==='sl'\?'#ff2020':'#2f9bff'/.test(src))
  bad('SL/TP 드래그 프리뷰의 tp 색이 확정 라인(#2f9bff)과 다르다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 툴박스 5개 영역이 MT5 라이트 스킨으로 읽히고(PAMM·회사·알림·메일박스·저널), PAMM 버튼은 MT5 각진 문법, TP 라인은 포지션과 구분되는 파랑.');
