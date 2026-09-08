// Alpexa — FX 포지션 정정 (백오피스) 계약 핀. 2026-09-08 사장님 요청.
// ============================================================================
// MT5 매니저의 "Position Modify" 상당: 관리자가 열린 FX 포지션의 side/open_price/size 를
// 정정한다. 계약은 하나 — **정정 사실은 지울 수 없게 남고, 돈은 한 푼도 직접 움직이지 않는다.**
//
//   C1  is_admin() 게이트 (고객 JWT 는 거절)
//   C2  사유 필수 (빈 사유 거절 — 무기록 개입 불가)
//   C3  대상은 server='fx' AND status='open' 만 (닫힌 포지션·스포츠 베팅 불가)
//   C4  FOR UPDATE 행 잠금 (스탑아웃 크론·고객 청산과 경합 방지)
//   C5  잔고·원장·pnl 컬럼을 건드리지 않는다 (ledger / accounts / balance / pnl 쓰기 0줄)
//   C6  admin_audit_log 에 전→후·사유 기록 (기존 _sbdesk_audit 헬퍼 재사용 — 새 로그 경로 금지)
//   C7  포지션 행에 이력을 남기지 않는다 (meta.corrections 금지 — 기록은 백오피스 한 곳)
//   C8  멱등: 변화 없으면 update 도 감사 기록도 없다
//   C9  데스크 UI: 사유 없이 RPC 호출 불가 + confirmModal/opRun 관문 경유
//   C10 데스크 UI: 포지션 테이블 직접 update 금지 (RPC 만)
'use strict';
const fs = require('fs'), path = require('path');
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

const SQL_PATH = path.join(__dirname, '..', 'supabase', 'sql', 'fx_admin_correct_position.sql');
const DESK_PATH = path.join(__dirname, '..', 'pamm-desk.html');

console.log('\n=== FX 포지션 정정 — SQL 계약 ===');
ok('SQL 파일이 있다', fs.existsSync(SQL_PATH));
const sql = fs.existsSync(SQL_PATH) ? fs.readFileSync(SQL_PATH, 'utf8') : '';
const fn = (() => {   // 정정 RPC 본문만 잘라낸다 (조회 RPC 와 섞이지 않게)
  const m = sql.match(/create or replace function public\.fx_admin_correct_position[\s\S]*?\n\$\$;/);
  return m ? m[0] : '';
})();
ok('fx_admin_correct_position RPC 가 정의돼 있다', fn.length > 0);
ok('C1 is_admin() 게이트', /if not public\.is_admin\(\)/.test(fn));
ok('C2 사유 필수 (빈 사유 거절)', /p_reason/.test(fn) && /REASON_REQUIRED/.test(fn));
ok("C3 대상 server='fx' and status='open'", /server\s*=\s*'fx'\s+and\s+status\s*=\s*'open'/.test(fn));
ok('C4 FOR UPDATE 행 잠금', /for update/i.test(fn));
ok('C5 ledger 쓰기 0줄', !/insert into public\.ledger|insert into ledger/.test(fn));
ok('C5 accounts/balance 쓰기 0줄', !/update public\.accounts|update accounts|balance\s*=/.test(fn));
ok('C5 pnl 컬럼을 쓰지 않는다', !/set[^;]*\bpnl\s*=/.test(fn));
ok('C6 _sbdesk_audit 헬퍼로 기록 (action fx_position_correct)', /perform public\._sbdesk_audit\('fx_position_correct'/.test(fn));
ok('C6 감사 detail 에 before/after/reason 전부', /'before'/.test(fn) && /'after'/.test(fn) && /'reason'/.test(fn));
ok('C7 포지션 행에 이력 없음 (meta 갱신 금지)', !/set[^;]*\bmeta\s*=/.test(fn) && !/corrections/.test(fn));
ok('C8 변화 없으면 조기 반환 (v_before = v_after)', /v_before\s*=\s*v_after/.test(fn));
ok('side 는 BUY/SELL 만', /in \('BUY','SELL'\)/.test(fn));
ok('가격·수량 양수 검증', /v_price\s*<=\s*0/.test(fn) && /v_size\s*<=\s*0/.test(fn));
ok('SECURITY DEFINER + search_path 고정', /security definer/.test(fn) && /set search_path/.test(fn));
ok('anon 호출 차단 (revoke)', /revoke all on function public\.fx_admin_correct_position[^;]*from public, anon/.test(sql));
ok('이력 조회 RPC fx_admin_correction_log 도 is_admin 게이트', /function public\.fx_admin_correction_log[\s\S]*?if not public\.is_admin\(\)/.test(sql));

console.log('\n=== FX 포지션 정정 — 데스크 UI 계약 ===');
const desk = fs.readFileSync(DESK_PATH, 'utf8');
ok('데스크가 fx_admin_correct_position 을 부른다', /fx_admin_correct_position/.test(desk));
ok('C9 opRun 경유 (confirmModal 관문 공통 경로)', /opRun\('fx_admin_correct_position'/.test(desk));
ok('C9 사유 비면 호출 전에 막는다', /p_reason/.test(desk) && /reason/i.test(desk) && /Reason required|사유/.test(desk));
ok("C10 positions 테이블 직접 update 없음", !/from\('positions'\)\s*\.\s*(update|insert|delete|upsert)/.test(desk));
ok('이력 열람은 fx_admin_correction_log 로', /fx_admin_correction_log/.test(desk));

console.log('\n' + (pass ? '🟢 FX 포지션 정정: 기록은 지울 수 없고, 돈은 직접 안 움직인다' : '🔴 FX 포지션 정정 계약 깨짐') + '\n');
process.exit(pass ? 0 : 1);
