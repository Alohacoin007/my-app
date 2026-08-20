#!/usr/bin/env node
// REGRESSION — 설치형 앱 제목줄 중복 (2026-08-19 사장님 "로그인 페이지에 이거 보이는데 제거 가능해?").
//
// 설치형 창의 제목은 `매니페스트 name - 페이지 <title>` 로 이어붙는다. 둘 다 브랜드를 달고 있어
//   "Alpexa WebTrade Terminal - ALPEXA SUISSE — Login"
// 처럼 이름이 두 번 겹쳐 보였다.
//
// 계약: 매니페스트 name 은 짧게, 페이지는 **앱으로 열렸을 때만** 짧은 제목으로 바꾼다.
//       브라우저 탭에서는 검색·즐겨찾기 때문에 브랜드가 필요하므로 원래 <title> 을 건드리지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest-terminal.json'), 'utf8'));
if ((tm.name || '').length > 20) bad(`매니페스트 name 이 길다('${tm.name}') — 앱 제목줄 앞부분이라 짧아야 한다`);

for (const [f, want] of [['login.html', "'Login'"], ['webtrade.html', "'FX Terminal'"]]) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (!/display-mode: standalone[\s\S]{0,160}document\.title\s*=/.test(s))
    bad(`${f}: 앱으로 열렸을 때 제목을 줄이지 않는다 — 제목줄에 브랜드가 두 번 나온다`);
  if (!s.includes('document.title = ' + want))
    bad(`${f}: 앱 제목이 ${want} 가 아니다`);
  // 브라우저 탭 제목(원래 <title>)은 그대로여야 한다 — 검색·즐겨찾기용 브랜드
  if (!/<title>[^<]*ALPEXA|<title>[^<]*Alpexa/i.test(s))
    bad(`${f}: 브라우저 탭 <title> 에서 브랜드가 사라졌다 — 앱 제목만 줄여야 한다`);
}
if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 앱 제목줄은 짧게(Alpexa Terminal - Login / - FX Terminal), 브라우저 탭 제목은 브랜드 유지.');
