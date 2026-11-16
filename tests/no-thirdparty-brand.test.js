#!/usr/bin/env node
// Alpexa — 고객 화면에 남의 회사 상표를 쓰지 않는다 (2026-11-15 앱 분석 1단계 #5, 사장님 "1단계로 해")
// ============================================================================
// 발견: webtrade Navigator 맨 위 줄이 "Alpexa MetaTrader 5" 였다. MetaTrader 는 MetaQuotes 의 등록상표 —
// 우리 터미널 이름으로 쓰면 상표 문제가 된다. (코드 주석의 "MT5 처럼" 은 내부 메모라 대상 아님.)
// 검사: 고객 앱 파일에서 **화면에 찍히는 글자**(태그 본문 · 문자열 리터럴)에 MetaTrader/MetaQuotes 가 없다.
// 정적 핀 · 네트워크 0 · 돈 0.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const FILES = ['webtrade.html', 'terminal.html', 'fx-app.html', 'login.html', 'signup.html', 'fx.html', 'markets.html',
  'about.html', 'support.html', 'ib.html', 'crypto-live.html', 'src/crypto-live-app.jsx', 'dev/crypto-dashboard.html',
  'sports-live.html', 'sports-dashboard.html', 'index.html'];
// 태그 본문(>…) 또는 따옴표 문자열 안의 상표. 주석(<!-- … -->, // …, /* … */)은 > ' " 로 시작하지 않아 안 걸린다.
const SHOWN = /(>|'|"|`)[^<'"`\n]*(MetaTrader|MetaQuotes)/;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8');
  const hit = src.split('\n').map((l, i) => SHOWN.test(l) ? (i + 1) + ': ' + l.trim().slice(0, 90) : null).filter(Boolean);
  ok(`${f}: 화면 글자에 MetaTrader/MetaQuotes 없음`, hit.length === 0, hit.slice(0, 3).join(' | '));
}
const wt = fs.readFileSync(path.join(REPO, 'webtrade.html'), 'utf8');
ok('webtrade Navigator 맨 위 = 우리 이름 (Alpexa WebTrade)', /<li className="root">.*Alpexa WebTrade<\/li>/.test(wt));
console.log(`\n${fail ? '🔴' : '🟢'} no-thirdparty-brand — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
