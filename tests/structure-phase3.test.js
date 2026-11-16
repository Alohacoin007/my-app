#!/usr/bin/env node
// Alpexa — 앱 분석 3단계: 구조 개선 (2026-11-16 사장님 "3단계 진행해 · 전부 진행하고 마무리 해서 알려줘")
// ============================================================================
// 정적 핀 · 네트워크 0 · 돈 0. 구조를 옮긴 상태를 고정한다 (되돌리기·복붙으로 옛 구조가 살아나면 🔴).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const has = (f) => fs.existsSync(path.join(REPO, f));
const rd = (f) => (has(f) ? fs.readFileSync(path.join(REPO, f), 'utf8') : '');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const bs = require('../tools/build-site.js');
const pub = new Set(bs.publicFiles());
const stubs = typeof bs.retiredStubs === 'function' ? bs.retiredStubs() : {};

// ── ③ 크립토 PC 대시보드: dev/ 밖으로 · 제목의 (DEV) 삭제 ─────────────────────
// 왜: PC 고객이 로그인하면 가는 **정식 화면**인데 주소가 /dev/… 이고 브라우저 탭 제목이 "(DEV)" 였다 (개발 중처럼 보임).
// 옛 주소(/dev/crypto-dashboard.html)는 새 주소로 보내는 쪽지를 남긴다 — 즐겨찾기 고객이 404 를 보지 않게 (주소 뒤 ?… #… 유지).
const cd = rd('crypto-dashboard.html');
ok('③ 대시보드 파일이 루트에 있다 (crypto-dashboard.html) · dev/ 에는 없다', !!cd && !has('dev/crypto-dashboard.html'));
ok('③ 탭 제목에 (DEV) 없음', /<title>ALPEXA Crypto — Dashboard<\/title>/.test(cd) && !/\(DEV\)/.test((cd.match(/<title>[^<]*<\/title>/) || [''])[0]));
ok('③ 대시보드 안의 상대 경로가 루트 기준 (../ 0개)', !!cd && !/["'(]\.\.\//.test(cd), (cd.match(/["'(]\.\.\/[^"')]*/g) || []).join(' '));
const users = ['login.html', 'sports-dashboard.html', 'webtrade.html', 'terminal.html'];
const stale = users.filter((f) => /dev\/crypto-dashboard\.html/.test(rd(f)));
ok('③ 대시보드로 보내는 4곳(login · sports-dashboard · webtrade · terminal)이 새 주소를 쓴다', stale.length === 0, '옛 주소 남음: ' + stale.join(', '));
ok('③ 로그인 라우팅: PC 크립토 = crypto-dashboard.html (2곳)', (rd('login.html').match(/'crypto-dashboard\.html'/g) || []).length === 2);
ok('③ 공개 묶음에 새 주소가 있다', pub.has('crypto-dashboard.html'));
const st = stubs['dev/crypto-dashboard.html'] || '';
ok('③ 옛 주소엔 이동 쪽지 (→ ../crypto-dashboard.html · ?… #… 유지)',
   /location\.replace\(/.test(st) && /\.\.\/crypto-dashboard\.html/.test(st) && /location\.search/.test(st) && /location\.hash/.test(st));

console.log(`\n${fail ? '🔴' : '🟢'} structure-phase3 — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
