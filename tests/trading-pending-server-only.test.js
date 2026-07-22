// Alpexa — trading.html 대기주문 "진실은 한 곳" 게이트 (정적 핀, 네트워크 0, 돈 0)
//
// 계약 (2026-07-22 "고고" — 구식 클라 대기주문 감시 제거):
//  ① 클라는 fx_pending에 직접 쓰지 않는다 (upsert/delete/insert/update 0건 — 감사 행 보존)
//  ② 접수 = rpc(fx_place_pending) 8인자 · 취소 = rpc(fx_cancel_pending)
//  ③ 클라 트리거 판정 코드 0건 — 판정·체결은 서버 fx_pending_fill 단독 (워터마크+원자 선점)
//  ④ 서버 거절 → 로컬 행 회수 + 사유 토스트 (조용한 유령 대기주문 금지)
//  ⑤ 수정 = 취소 + 새 local_id 재접수 (cancelled 행의 키 점유로 재-upsert가 침묵 무시되는 함정 회피)
//  ⑥ 체결/거절 알림은 Realtime status 전환에서 (filled → 토스트·사운드 · rejected → 사유)
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('trading pending server-only — 이중 경로 폐쇄 게이트');

const src = fs.readFileSync(path.join(REPO, 'trading.html'), 'utf8');
const term = fs.readFileSync(path.join(REPO, 'dev/fx-terminal.html'), 'utf8');

// ① 직접 테이블 쓰기 0건 (SELECT는 표시용으로 허용)
ok('① trading: fx_pending 직접 쓰기(upsert/delete/insert/update) 0건',
   !/from\(\s*['"]fx_pending['"]\s*\)\s*\.\s*(insert|upsert|update|delete)/.test(src));
ok('① terminal: fx_pending 직접 쓰기 0건 (RPC만)',
   !/from\(\s*['"]fx_pending['"]\s*\)\s*\.\s*(insert|upsert|update|delete)/.test(term));

// ② RPC 배선
ok('② 접수 = rpc(fx_place_pending) 8인자 (local_id/symbol/side/otype/size/trigger/sl/tp)',
   /rpc\('fx_place_pending',\{ p_local_id:[\s\S]{0,200}p_otype:[\s\S]{0,200}p_trigger:[\s\S]{0,200}p_tp:/.test(src));
ok('② 취소 = rpc(fx_cancel_pending, {p_local_id})', /rpc\('fx_cancel_pending',\{ p_local_id:String\(id\) \}\)/.test(src));

// ③ 클라 트리거 판정 제거 (서버 fx_pending_fill 단독)
ok('③ 클라 LIMIT/STOP 판정식 0건 (px<=p.trigger 류)',
   !/px<=p\.trigger|px>=p\.trigger/.test(src));
ok('③ 트리거→fx_open 클라 체결 루프 제거 (fxPendingDelete 흔적 0)',
   !/fxPendingDelete|fxPendingInsert|fxPendingRow/.test(src));

// ④ 서버 거절 → 로컬 회수 + 사유
ok('④ 접수 거절 핸들러 (Pending order rejected + 로컬 filter 회수)',
   /Pending order rejected/.test(src) && /fxPendingPlace\(newPending, function\(err\)\{[\s\S]{0,200}prev\.filter\(p=>p\.id!==id\)/.test(src));

// ⑤ 수정 = 취소 + 새 id 재접수
ok('⑤ modifyPending: fxPendingCancel(구 id) + fxPendingPlace(새 id)',
   /fxPendingCancel\(p\.id\); fxPendingPlace\(np/.test(src) && /const nid=Date\.now\(\)/.test(src));

// ⑥ Realtime 전환 알림
ok('⑥ filled → 체결 토스트(triggered)+사운드+알림 (fill_px 우선)',
   /n\.status==='filled'/.test(src) && /meta\.fill_px/.test(src) && /triggered\(\)/.test(src));
ok('⑥ rejected → 사유 토스트 (meta.reason)',
   /n\.status==='rejected'/.test(src) && /meta\.reason/.test(src));

console.log((fail ? '🔴' : '🟢') + ' trading-pending-server-only — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
