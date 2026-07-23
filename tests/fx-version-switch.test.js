// Alpexa — Legend 1/2 버전 스위처 게이트 (정적 핀, 네트워크 0, 돈 0)
//
// 계약 (2026-07-23 사장님 "고고" — 다크 폐지, Legend 1=webtrade 레전드 / Legend 2=터미널):
//  ① terminal.html = 정식 승격된 레전드 터미널 (dev/fx-terminal.html은 리다이렉트 스텁)
//  ② webtrade: 마지막 사용이 legend2면 진입 즉시 terminal.html로 (stay=1 탈출구),
//     아니면 legend1 기록 — location.replace 후에도 다음 줄이 실행되므로 else 필수 (기억 파괴 함정)
//  ③ terminal: 로드 = legend2 기록 · Settings Legend 1 클릭 = legend1 기록 후 webtrade로
//  ④ login.html의 fx-terminal 라우팅도 정식 경로로
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

// ② webtrade 리다이렉트 + 기억
ok('② legend2 기억 → terminal.html 리다이렉트 + stay=1 탈출구',
   /getItem\('alpexa\.fx\.version'\)==='legend2' && !\/\[\?&\]stay=1\//.test(wt) && /location\.replace\('terminal\.html'\)/.test(wt));
ok('② else로 legend1 기록 (replace 후 실행 함정 방지)',
   /else \{ localStorage\.setItem\('alpexa\.fx\.version','legend1'\); \}/.test(wt));
ok('② View 메뉴 = Legend 1(체크)/Legend 2 · theme.toggle 폐지',
   /\{l:'Legend 1 — Classic', cmd:'ver\.set', arg:'legend1', ver:'legend1'/.test(wt) &&
   /\{l:'Legend 2 — Terminal', cmd:'ver\.set', arg:'legend2'/.test(wt) && !/cmd:'theme\.toggle'/.test(wt));

// ③ terminal 쪽
ok('③ terminal 로드 = legend2 기록', /setItem\('alpexa\.fx\.version','legend2'\)/.test(term));
ok('③ Settings Legend 1 버튼 → legend1 기록 + webtrade.html 이동',
   /sgVer1/.test(term) && /setItem\('alpexa\.fx\.version','legend1'\)/.test(term) && /location\.href='webtrade\.html'/.test(term));

// ④ 라우팅·스모크
ok('④ login.html fx-terminal 라우팅 = terminal.html', /return 'terminal\.html'/.test(login) && !/dev\/fx-terminal/.test(login));
ok('④ visual-smoke가 terminal.html 렌더 감시', /'terminal\.html'/.test(smoke));

console.log((fail ? '🔴' : '🟢') + ' fx-version-switch — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
