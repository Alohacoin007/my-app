// Alpexa — Legend 1/2 버전 스위처 게이트 (정적 핀, 네트워크 0, 돈 0)
//
// 계약 (2026-11-15 사장님 "레전드는 숨기는 걸로" — Legend 2(터미널)는 고객에게 숨김, 파일은 보존):
//  ① terminal.html = 레전드 터미널 파일은 그대로 (dev/fx-terminal.html은 리다이렉트 스텁)
//  ② webtrade: 터미널로 보내는 길이 없다 (자동 이동·View 메뉴 둘 다) — 진입 시 항상 legend1 기록
//  ③ terminal: (직접 주소로 연 경우) Legend 1 버튼 = legend1 기록 후 webtrade로 — 나가는 길은 유지
//  ④ login.html 은 fx-terminal 복귀 토큰을 받아도 터미널로 보내지 않는다 (기기별 기본 FX 앱)
//  옛 계약(2026-07-23 "고고": webtrade ↔ 터미널 버전 스위처)은 계산 코드를 하나로 합친 뒤에만 되살린다.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx version switch — Legend 1/2 게이트');

const term = fs.readFileSync(path.join(REPO, 'terminal.html'), 'utf8');
const stub = fs.readFileSync(path.join(REPO, 'dev/fx-terminal.html'), 'utf8');
const wt = fs.readFileSync(path.join(REPO, 'webtrade.html'), 'utf8');
const login = fs.readFileSync(path.join(REPO, 'login.html'), 'utf8');
const smoke = fs.readFileSync(path.join(REPO, 'tests/visual-smoke.js'), 'utf8');

// ① 승격 + 스텁
ok('① terminal.html = 진짜 터미널 (서버 대기주문 배선 포함)', /fx_place_pending/.test(term) && /fx_cancel_pending/.test(term));
ok('① dev/fx-terminal.html = 리다이렉트 스텁 (쿼리 보존)',
   /location\.replace\('\.\.\/terminal\.html'\+\(location\.search\|\|''\)\)/.test(stub) && stub.length < 600);

// ② webtrade — Legend 2 숨김 (2026-11-15 사장님 "레전드는 숨기는 걸로").
//    왜: terminal.html 은 손익·마진 계산을 webtrade 에서 손으로 복사해 써서 서버와 어긋났다
//    (원클릭이 로그인 고객에게도 DEMO 체결 · DOGE/XRP/ADA 계약크기 1 · 주식/크립토 레버리지 5).
//    계산 코드를 하나로 합치기 전까지 고객을 터미널로 보내는 길을 전부 닫는다. 파일·테스트는 보존.
ok('② webtrade 는 terminal.html 로 보내지 않는다 (자동 이동·메뉴 이동 둘 다 없음)',
   !/location\.(replace|href)\s*(=|\()\s*'terminal\.html'/.test(wt));
ok('② legend2 를 기억하던 고객도 여기 남는다 — 진입 시 항상 legend1 기록',
   /localStorage\.setItem\('alpexa\.fx\.version','legend1'\)/.test(wt) && !/getItem\('alpexa\.fx\.version'\)==='legend2'/.test(wt));
ok('② View 메뉴에 버전 항목 없음 (Legend 1/2 · ver.set) · theme.toggle 폐지 유지',
   !/Legend 2 — Terminal/.test(wt) && !/Legend 1 — Classic/.test(wt) && !/ver\.set/.test(wt) && !/cmd:'theme\.toggle'/.test(wt));

// ③ terminal 쪽
ok('③ terminal 로드 = legend2 기록', /setItem\('alpexa\.fx\.version','legend2'\)/.test(term));
ok('③ Settings Legend 1 버튼 → legend1 기록 + webtrade.html 이동',
   /sgVer1/.test(term) && /setItem\('alpexa\.fx\.version','legend1'\)/.test(term) && /location\.href='webtrade\.html'/.test(term));
ok('③ ☰ 메뉴에도 Version 섹션 (Legend 1 즉시 이동 · Legend 2 체크)',
   /mact\('ver:legend1','Legend 1 — Classic'/.test(term) && /mact\('ver:legend2','Legend 2 — Terminal','',true\)/.test(term) &&
   /a==='ver:legend1'/.test(term));

// ④ 라우팅·스모크
ok('④ login.html 은 terminal.html 로 보내지 않는다 (fx-terminal 복귀 토큰 → 기기별 기본 FX 앱)',
   !/return 'terminal\.html'/.test(login) && !/dev\/fx-terminal/.test(login) && /return mobile\?'fx-app\.html':'webtrade\.html'/.test(login));
ok('④ visual-smoke가 terminal.html 렌더 감시', /'terminal\.html'/.test(smoke));

console.log((fail ? '🔴' : '🟢') + ' fx-version-switch — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
