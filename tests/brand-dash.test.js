#!/usr/bin/env node
// Alpexa — 모바일 앱 회사명 표기 (2026-10-31 사장님 "우리 회사는 Alpexa-FX, Alpexa-Sports, Alpexa-crypto 야… 중간에 데쉬를 넣어줘")
// 모바일 앱(크립토·FX·스포츠·로그인·가입) 화면 글자에 "Alpexa FX/Sports/Crypto"(띄어쓰기) 0 · 대시 표기 존재. 배포 컴파일본 포함.
// 2026-10-31 사장님 "데스크탑이랑 웹사이트도 대시 넣어줘" — 데스크탑(웹트레이드·터미널·대시보드)·웹사이트·내역서·백오피스 추가. 대문자(ALPEXA SPORTS)도.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const FILES = ['fx-app.html', 'sports-live.html', 'login.html', 'signup.html', 'src/crypto-live-app.jsx', 'src/trading-app.jsx', 'vendor/crypto-live-compiled.js', 'vendor/trading-compiled.js',
  'webtrade.html', 'terminal.html', 'sports-dashboard.html', 'dev/crypto-dashboard.html', 'index.html', 'about.html', 'fx.html', 'fx-risk.html', 'ib.html', 'markets.html',
  'support.html', 'statement.html', 'manager-mobile.html', 'site/index.html', 'site/sports.html', 'site/legal.html', 'site/promotions.html', 'site/introducing-broker.html'];
let fail = 0;
for (const f of FILES) {
  const s = fs.readFileSync(path.join(REPO, f), 'utf8');
  const bad = (s.match(/Alpexa (FX|Sports|Crypto)\b|ALPEXA (FX|SPORTS|CRYPTO)\b/g) || []);
  const good = (s.match(/Alpexa-(FX|Sports|Crypto)\b|ALPEXA-(FX|SPORTS|CRYPTO)\b/gi) || []).length;
  const okf = bad.length === 0 && good > 0;
  if (!okf) fail++;
  console.log(`  ${okf ? '✅' : '❌'} ${f}: 대시 표기 ${good} · 띄어쓰기 ${bad.length}`);
}
console.log(`\n${fail ? '🔴' : '🟢'} brand-dash — ${FILES.length - fail} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
