// Alpexa — trading.html(모바일 앱) 청산 "돈은 서버만" 게이트 (정적 핀, 네트워크 0, 돈 0)
//
// 계약 (2026-07-23 "1번 고" — 클라 청산 잔재 폐쇄):
//  ① 클라 정산 폴백 0 — settlements insert 금지 · clientClose/bankFallback/__alpexaSettle 제거
//  ② fx_close 거절/네트워크 실패 → 돈 안 움직이고 UI 원복 + 정직한 실패 토스트 (closeFailed)
//  ③ 클라 스탑아웃 0 — 강제청산은 서버 fx_stopout(30%) 단독, 클라는 마진콜 경고까지만
//  ④ positions 클라 쓰기 = pnl-only UPDATE + eq(status,'open') — insert/upsert/delete 0
//     (upsert status:'open'이 서버가 방금 청산한 행을 부활시키던 이중 정산 경합 폐쇄)
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('trading close server-only — 클라 청산 잔재 폐쇄 게이트');

const src = fs.readFileSync(path.join(REPO, 'trading.html'), 'utf8');

// ① 클라 정산 폴백 제거
ok('① settlements 클라 insert 0건', !/from\(\s*['"]settlements['"]\s*\)\s*\.\s*insert/.test(src));
ok('① clientClose/bankFallback 흔적 0', !/clientClose|bankFallback/.test(src));
ok('① __alpexaSettle 정의·호출 0 (주석만 허용)', !/__alpexaSettle\s*=\s*function/.test(src) && !/__alpexaSettle\s*\(/.test(src) && !/__alpexaSettle&&/.test(src));

// ② 실패 = 정직 (돈 무이동 + 원복)
ok('② closeFailed: UI 원복(setLiveOrders 복원) + Close failed 토스트',
   /function closeFailed\(sub\)\{[\s\S]{0,400}\[order,\.\.\.prev\]/.test(src) && /'Close failed — '\+order\.sym/.test(src));
ok('② fx_close 거절·네트워크·오프라인 3분기 전부 closeFailed (클라 정산 아님)',
   (src.match(/closeFailed\(/g) || []).length >= 4);

// ③ 클라 스탑아웃 제거 (경고는 유지)
ok('③ 클라 스탑아웃 청산 0 (liquidated to protect 문구 제거)', !/liquidated to protect/.test(src));
ok('③ 마진콜 경고는 유지 (Margin call 토스트)', /Margin call — /.test(src));

// ④ positions 클라 쓰기 최소화
ok('④ positions insert/upsert/delete 0건', !/from\(\s*['"]positions['"]\s*\)\s*\.\s*(insert|upsert|delete)/.test(src));
ok('④ pnl-only UPDATE + status=open 가드 (닫힌 행 부활 불가)',
   /from\('positions'\)\.update\(\{pnl:[\s\S]{0,160}\.eq\('status','open'\)/.test(src));
ok('④ positions update 페이로드 = pnl 단독 (status/open_price/size 재기록 없음)',
   /from\('positions'\)\.update\(\{pnl:Math\.round\(\(\+o\.pnl\|\|0\)\*100\)\/100\}\)/.test(src) &&
   !/from\('positions'\)\.update\(\{[^}]*(status|open_price|size)\s*:/.test(src));

console.log((fail ? '🔴' : '🟢') + ' trading-close-server-only — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
