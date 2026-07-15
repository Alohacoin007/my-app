#!/usr/bin/env node
// REGRESSION (2026-07-15) — 서버 전환 탭: 대시보드 헤더의 +와 같은 역할을 웹트레이더에도.
// 툴바 브랜드(ALPEXA WebTrade) 앞 + 버튼 → Alpexa Sports(웹 대시보드) / Alpexa Crypto(예고).
// 계약:
//   · 이동은 window.top 기준 — 터미널이 대시보드 iframe 안에 떠 있을 때
//     같은 창 안에 대시보드가 또 열리는 중첩(nesting)을 막는다.
//   · 크립토 컴퓨터용은 미구현 — "Coming this week" 예고만, 경로 발명 금지.
//   · 메뉴는 웹트레이더 자체 문법(.ctxmenu MT5 스타일) 재사용 — 대시보드 스타일 수입 금지.
'use strict';
const fs = require('fs');
const path = require('path');
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const pin = (re, m) => { if (!re.test(wt)) bad(m); };
const ban = (re, m) => { if (re.test(wt)) bad('[금지] ' + m); };

pin(/Switch server/, '+ 버튼 타이틀 리터럴 Switch server');
pin(/Alpexa Sports/, '메뉴 항목: Alpexa Sports (웹 대시보드)');
pin(/sports-dashboard\.html/, '스포츠 착지 = sports-dashboard.html (컴퓨터용)');
pin(/Alpexa Crypto/, '메뉴 항목: Alpexa Crypto');
pin(/Coming this week/, '크립토 컴퓨터용 미출시 안내 리터럴');
pin(/window\.top[\s\S]{0,120}location\.href|top\.location\.href/, '이동은 window.top — iframe 중첩 방지');
pin(/ctxmenu/, '메뉴는 웹트레이더 자체 ctxmenu 문법 재사용');
ban(/iframe[^>]{0,80}sports-dashboard/, '터미널 안에 대시보드 iframe 중첩 — 이동(navigation)만 허용');

if (fail) { console.error('\n🔴 FAIL — webtrade 서버 탭 ' + fail + '건'); process.exit(1); }
console.log('🟢 PASS: webtrade 서버 전환 탭 — + 메뉴/착지/top 이동/ctxmenu 재사용.');
