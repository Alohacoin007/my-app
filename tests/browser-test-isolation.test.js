#!/usr/bin/env node
// PIN — 시세 앱 브라우저 테스트는 네트워크 0 (2026-10-21)
// 왜: terminal.html·webtrade.html 은 실서버(prices REST · Supabase Realtime WS · Binance WS)에 붙는다. 스텁만 주입하고
//     네트워크를 안 막은 테스트는 FX 장중엔 실 EURUSD 가 스텁을 덮어 🔴, 주말엔 시세가 멈춰 🟢 — 코드와 무관하게
//     요일 따라 verify 가 뒤집혔다 (10-18 일 🟢 → 10-21 수 🔴 4건, 깨끗한 HEAD 에서도 재현). 결함-로그 10-21.
// 계약: 이 페이지들을 띄우는 *.test.js 는 page.route(비-localhost abort) + page.routeWebSocket 둘 다 건다.
'use strict';
const fs = require('fs'), path = require('path');
// 검토된 예외 — 가격을 단언하지 않는 UI 전용 테스트 (실피드가 들어와도 판정 불변)
const ACCEPTED = {
  'click-target-stability.test.js': 'UI 클릭 타깃 좌표만 본다 — 가격 단언 없음',
  'fx-terminal-i18n.test.js': '문구 번역만 본다 — 가격 단언 없음',
  'fx-terminal-real-candles.test.js': '캔들 엔드포인트를 route 로 자체 스텁 — 실 prices 와 무관',
  'browser-test-isolation.test.js': '이 핀 자신',
};
const dir = __dirname;
let bad = 0, n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.test.js')).sort()) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  if (!/browser\.newPage|newContext\(/.test(s) || !/(terminal|webtrade)\.html/.test(s)) continue;
  if (ACCEPTED[f]) continue;
  n++;
  const http = /page\.route\(u => !\/\^\(http:\\\/\\\/localhost/.test(s);
  const ws = /page\.routeWebSocket\(/.test(s);
  if (!http || !ws) { bad++; console.log(`  🔴 ${f} — 네트워크 미차단 (${http ? '' : 'HTTP '}${ws ? '' : 'WS'}) → 장중/주말에 따라 결과가 바뀐다`); }
}
if (bad) { console.log(`\n🔴 browser-test-isolation FAIL — ${bad}/${n} 시세 앱 테스트가 실서버에 붙는다`); process.exit(1); }
console.log(`🟢 browser-test-isolation — 시세 앱 브라우저 테스트 ${n}개 전부 네트워크 0`);
