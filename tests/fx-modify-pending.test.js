#!/usr/bin/env node
// Alpexa — fx_modify_pending SQL contract pin (2026-09-21, 사장님 승인 "2 A")
// 대기주문 SL/TP 를 Activity 에서 설정하는 유일한 서버 경로. 돈 이동 0 · 본인 pending 행만 · 트리거 기준 방향 검증.
'use strict';
const fs = require('fs'), path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'fx_modify_pending.sql'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx_modify_pending — SQL 계약 핀');
ok('시그니처: fx_modify_pending(p_local_id text, p_sl numeric default null, p_tp numeric default null) — fx_modify 와 동일 모양', /create or replace function public\.fx_modify_pending\(p_local_id text, p_sl numeric default null, p_tp numeric default null\)/.test(sql));
ok('security definer + search_path public (다른 RPC 와 동일 보안 모양)', /security definer set search_path to 'public'/.test(sql));
ok('인증: auth.uid() 필수 → 본인 FX 계좌 조회 (players.auth_id 조인)', /v_uid uuid := auth\.uid\(\)/.test(sql) && /pl\.auth_id = v_uid/.test(sql) && /a\.server = 'fx'/.test(sql));
ok('소유·상태: 본인 acct_no 의 행만, status <> pending 이면 거절 (filled/cancelled 감사행 불변)', /where local_id = p_local_id and acct_no = v_acct and server = 'fx'/.test(sql) && /if v_status <> 'pending' then return jsonb_build_object\('ok',false/.test(sql));
ok('방향 검증 = fx_place_pending 과 자구 동일 (BUY sl<trigger<tp · SELL tp<trigger<sl)',
   /p_sl is not null and \(\(v_side='BUY' and p_sl >= v_trigger\) or \(v_side='SELL' and p_sl <= v_trigger\)\)/.test(sql) &&
   /p_tp is not null and \(\(v_side='BUY' and p_tp <= v_trigger\) or \(v_side='SELL' and p_tp >= v_trigger\)\)/.test(sql));
ok('쓰기 = fx_pending.sl/tp 한 문장, 조건에 status = pending 재확인 (원자)', /update public\.fx_pending set sl = p_sl, tp = p_tp\s*\n\s*where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'pending'/.test(sql));
ok('돈 이동 0: ledger·accounts·positions·settlements 언급 0', !/ledger|accounts\.balance|into public\.positions|settlements/.test(sql.replace(/--[^\n]*/g, '')));
ok('권한: anon/public revoke · authenticated 만 execute', /revoke all on function public\.fx_modify_pending\(text,numeric,numeric\) from public, anon;/.test(sql) && /grant execute on function public\.fx_modify_pending\(text,numeric,numeric\) to authenticated;/.test(sql));
ok('음수·0 레벨 거절 (bad SL / bad TP)', /p_sl <= 0 then return jsonb_build_object\('ok',false,'error','bad SL'\)/.test(sql) && /p_tp <= 0 then return jsonb_build_object\('ok',false,'error','bad TP'\)/.test(sql));
// 앱 쪽: 대기주문 SL/TP 는 이 RPC 로만 (직접 update 0)
const app = fs.readFileSync(path.join(__dirname, '..', 'fx-app.html'), 'utf8');
ok('앱: 대기주문 SL/TP 저장 = rpc fx_modify_pending 만 (fx_pending 직접 update 0)', /rpc\(kind==='pos'\?'fx_modify':'fx_modify_pending'/.test(app) && !/from\('fx_pending'\)[\s\S]{0,120}\.update\(/.test(app));
console.log('\n' + (fail ? `🔴 fx_modify_pending FAIL — ${fail}건` : `🟢 fx_modify_pending — ${pass} pass`));
process.exit(fail ? 1 : 0);
