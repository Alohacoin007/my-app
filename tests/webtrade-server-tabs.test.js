#!/usr/bin/env node
// REGRESSION (2026-07-15) — 서버 전환 탭: 대시보드 헤더의 +와 같은 역할을 웹트레이더에도.
// 툴바 브랜드(ALPEXA WebTrade) 앞 + 버튼 → Alpexa Sports(웹 대시보드) / Alpexa Crypto(예고).
// 계약:
//   · 이동은 window.top 기준 — 터미널이 대시보드 iframe 안에 떠 있을 때
//     같은 창 안에 대시보드가 또 열리는 중첩(nesting)을 막는다.
//   · 크립토 컴퓨터용은 미구현 — "Coming this week" 예고만, 경로 발명 금지.
//   · 메뉴는 전용 .srvmenu(툴바 다크 팔레트) — 서버명은 정확히 Alpexa FX/Sports/Crypto.
'use strict';
const fs = require('fs');
const path = require('path');
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const pin = (re, m) => { if (!re.test(wt)) bad(m); };
const ban = (re, m) => { if (re.test(wt)) bad('[금지] ' + m); };

// 새 설계 (2026-08-13 사장님 "드랍다운 불편"): 드랍다운 폐지 → 크립토·스포츠 직접 이동 버튼 2개(심플 아이콘)
pin(/title="Alpexa Crypto" onClick=\{\(\)=>goSrv\('\/dev\/crypto-dashboard\.html'\)\}/, '크립토 버튼 → 크립토 대시보드 직접 이동(goSrv)');
pin(/title="Alpexa Sports" onClick=\{\(\)=>goSrv\('\/sports-dashboard\.html'\)\}/, '스포츠 버튼 → 스포츠 대시보드 직접 이동(goSrv)');
pin(/window\.top[\s\S]{0,120}location\.href|top\.location\.href/, '이동은 window.top — iframe 중첩 방지');
ban(/onClick=\{\(e\)=>\{e\.stopPropagation\(\);setSrvMenu/, '드랍다운 토글 폐지 — 직접 이동 버튼만 (불편한 드랍다운 제거)');
ban(/iframe[^>]{0,80}sports-dashboard/, '터미널 안에 대시보드 iframe 중첩 — 이동(navigation)만 허용');

if (fail) { console.error('\n🔴 FAIL — webtrade 서버 탭 ' + fail + '건'); process.exit(1); }
console.log('🟢 PASS: webtrade 서버 전환 탭 — + 메뉴/착지/top 이동/ctxmenu 재사용.');
