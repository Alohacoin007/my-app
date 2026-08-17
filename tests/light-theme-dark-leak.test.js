#!/usr/bin/env node
// POKA-YOKE — "라이트 테마인데 다크 색을 쓴다" 결함 클래스 전수 차단 (2026-08-17 사장님 "전수 조사 해줘").
//
// 왜 만들었나: 같은 버그를 **다섯 번** 따로 잡았다 — 툴박스 5종 · 우클릭 메뉴 3종 · New Order 모달 ·
// History 기간 바 · Modify(SL/TP) 모달 · 로그인 게이트. 매번 사장님이 화면에서 먼저 발견했다.
// 뿌리는 하나다: `.terminal.light` 블록을 만들어 놓고 **값은 다크 팔레트를 그대로 복사**한 것
// (#0E1015 / #000000 바탕, 로빈후드 형광 초록 #00c853·#00FF55 액센트, 흰 배경 위 흰 글자).
// 하나씩 고치면 여섯 번째가 나온다 → 규칙 텍스트를 기계로 훑어 **새로 생기는 순간** 잡는다.
//
// 판정
//   · 라이트 규칙인데 배경 밝기 < 330/765  → 다크 바탕 누수 의심
//   · 라이트 규칙인데 글자 밝기 > 560 이고 그 규칙이 어두운 배경을 같이 주지 않음 → 흰 배경 위 흰 글자
//   · 형광 초록 계열 액센트
// 오탐은 **지우지 말고 ACCEPTED 에 이유와 함께** 등록한다 (CLAUDE.md Control 루프).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── 검토된 예외 (선택자 기준. 줄 번호는 흔들리므로 쓰지 않는다) ──
const ACCEPTED = new Map([
  // 색을 **일부러 채운 버튼/CTA** — 어두운 채움 + 흰 글자가 정상
  ['.terminal.light .alert-add button:hover', 'Add Alert 버튼 hover (MT5 파랑)'],
  ['.terminal.light .pammbtn.join', 'PAMM Join 버튼 채움 (MT5 파랑)'],
  ['.terminal.light .pammbtn.join:hover', '同 hover'],
  ['.terminal.light .pammbtn.out:hover', 'PAMM Redeem 버튼 hover (빨강)'],
  ['.terminal.light .histbar .hb.on', 'History 활성 기간 = MT5 파랑 채움'],
  ['.terminal.light .logingate .lg-btn', '로그인 CTA (MT5 파랑)'],
  ['.terminal.light .om-btns .om-sell', '주문 매도 버튼 (빨강)'],
  ['.terminal.light .om-btns .om-buy', '주문 매수 버튼 (MT5 파랑)'],
  ['.terminal.light .omodal .obar .wb.x:hover', '주문창 닫기 hover (빨강 채움)'],
  ['.terminal.light .mpos .obar .x:hover', 'Modify 창 닫기 hover (빨강 채움)'],
  // MT5 실물 하락색 — 흰 배경에서도 이 주황빨강을 쓴다 (webtrade-legend-theme 이 값을 고정)
  ['.terminal.light .mwt td.tick-down', 'MT5 하락 틱 색 #ff4d00'],
  ['.terminal.light .mwt td.text-down', '同'],
  ['.terminal.light .mwt .ad', '同 (하락 화살표)'],
  ['.terminal.light .mwtp .sd.sell .pr', 'Trading 탭 SELL 가격 = 하락색'],
  // 차트 표면은 **라이트에서도 다크 유지**가 계약 (webtrade-legend-theme 이 흰색 금지를 못박음)
  ['.terminal.light .charts,.terminal.light .chartstage', '차트 스테이지는 제트블랙 유지'],
  ['.terminal.light .win', '차트 창 바탕은 제트블랙 유지'],
  // 활성 차트 타이틀바는 MT5 파랑 그라디언트 → 흰 글자가 맞다 (스캐너가 gradient 를 못 읽어 오탐)
  ['.terminal.light .win.active .cell-title', '활성 타이틀바(파랑 그라디언트) 위 흰 글자'],
  ['.terminal.light .win.active .cell-title .wc span', '同 (창 버튼)'],
  ['.terminal.light .win.active .cell-title .wc span:hover', '同'],
  ['.terminal.light .win.active .cell-title .wc span.cl:hover', '同'],
]);

const lum = (c) => { const m = /#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(c || ''); if (!m) return null;
  let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16); };
const NEON = /#(00ff55|00c853|00ff66|39ff14)\b/i;

const used = new Set();
for (const file of ['webtrade.html', 'terminal.html']) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (!/\.terminal\.light/.test(ln)) return;
    const re = /([^{};]*\.terminal\.light[^{}]*)\{([^}]*)\}/g; let m;
    while ((m = re.exec(ln))) {
      const sel = m[1].trim().replace(/\s+/g, ' '), body = m[2];
      const bg = (body.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/) || [])[1];
      const col = (body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/) || [])[1];
      const bgL = bg && !/gradient/.test(bg) ? lum(bg) : null;
      const cL = col ? lum(col) : null;
      const why = [];
      if (bgL !== null && bgL < 330) why.push(`다크 바탕 ${bg.trim()} (밝기 ${bgL}/765)`);
      if (cL !== null && cL > 560 && (bgL === null || bgL > 560)) why.push(`밝은 배경 위 밝은 글자 ${col.trim()} (밝기 ${cL})`);
      if (NEON.test(body)) why.push('형광 초록 액센트 (라이트에 로빈후드 색 잔재)');
      if (!why.length) continue;
      if (ACCEPTED.has(sel)) { used.add(sel); continue; }
      bad(`${file}:${i + 1}  ${sel}\n        → ${why.join(' · ')}\n        라이트 테마에 다크 값이 들어왔다. 고치거나, 의도한 거면 이 테스트의 ACCEPTED 에 이유와 함께 등록할 것.`);
    }
  });
}
// 예외가 낡으면(해당 규칙이 사라졌는데 목록에 남으면) 조용히 썩는다 → 알린다
for (const [sel, why] of ACCEPTED)
  if (!used.has(sel)) console.warn(`  ⚠️  ACCEPTED 에 남아 있지만 더는 감지되지 않음: ${sel} (${why}) — 정리 대상`);

if (fail) { console.error(`\n🔴 FAIL — 라이트 테마 다크 누수 ${fail}건.`); process.exit(1); }
console.log(`🟢 PASS: 라이트 테마에 다크 팔레트 누수 없음 (검토된 예외 ${ACCEPTED.size}건은 이유와 함께 등록됨).`);
