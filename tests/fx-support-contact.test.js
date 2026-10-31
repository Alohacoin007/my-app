#!/usr/bin/env node
// Alpexa — FX 모바일 Support 연락처 (2026-10-31 사장님 "전화번호를 미국 1-917-826-7505 이메일을 support@alpexa-fx.com 으로 변경")
// FX 모바일 두 화면(fx-app.html · 옛 trading.html = src/trading-app.jsx + 컴파일본) 모두: 새 번호·새 이메일 있음 · 옛 +41 22 555 9900 / support@alpexa.com 0.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let fail = 0;
for (const f of ['fx-app.html', 'src/trading-app.jsx', 'vendor/trading-compiled.js']) {
  const s = fs.readFileSync(path.join(REPO, f), 'utf8');
  const okf = /\+1 917-826-7505/.test(s) && /tel:\+19178267505/.test(s) && /mailto:support@alpexa-fx\.com/.test(s) && !/\+41 ?22 ?555 ?9900|tel:\+41225559900|support@alpexa\.com/.test(s);
  if (!okf) fail++; console.log(`  ${okf ? '✅' : '❌'} ${f}: 새 연락처(+1 917-826-7505 · support@alpexa-fx.com) · 옛 연락처 0`);
}
console.log(`\n${fail ? '🔴' : '🟢'} fx-support-contact — ${3 - fail} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
