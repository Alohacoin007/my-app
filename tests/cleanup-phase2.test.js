#!/usr/bin/env node
// Alpexa — 앱 분석 2단계: 필요 없는 부분 정리 (2026-11-15 사장님 "2단계 진행해")
// ============================================================================
// 고객에게 보이는 빈 껍데기와, 아무도 부르지 않는 죽은 코드를 걷어낸 상태를 고정한다.
// 지운 것이 다시 살아나면(복붙·되돌리기) 여기서 🔴. 정적 핀 · 네트워크 0 · 돈 0.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };

// ── ① 크립토 데스크탑: Open orders 위젯 은퇴 ───────────────────────────────────
// 왜: 이 위젯은 모바일 앱이 폰에 저장한 지정가·스탑 주문(localStorage alpexa.pendingOrders)을 읽어 보여주기만 했다.
//     1단계에서 모바일의 지정가·스탑 탭을 숨겼으므로(아무도 체결하지 않던 주문) 새 주문이 생길 길이 없다 = 영원히 빈 위젯.
//     서버 지정가 주문이 생기면 RETIRED_WIDGETS 에서 빼면 된다 (위젯 코드는 보존).
const cd = rd('dev/crypto-dashboard.html');
ok('① 대시보드: RETIRED_WIDGETS 에 orders', /const RETIRED_WIDGETS\s*=\s*new Set\(\['orders'\]\)/.test(cd));
ok('① 대시보드: Add widget 메뉴가 은퇴 위젯을 뺀다', /Object\.keys\(WIDGET_TITLES\)\.filter\(id=>!RETIRED_WIDGETS\.has\(id\)\)/.test(cd));
ok('① 대시보드: 예전에 꺼내 둔 고객 화면에서도 강제로 숨긴다 (저장된 배치 무시)',
   /RETIRED_WIDGETS\.forEach\(id=>\{ if\(layout\[id\]\) layout\[id\]\.hidden=true; \}\)/.test(cd));

console.log(`\n${fail ? '🔴' : '🟢'} cleanup-phase2 — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
