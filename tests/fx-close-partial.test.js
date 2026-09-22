#!/usr/bin/env node
// Alpexa — fx_close_partial SQL contract pin (2026-09-22, 사장님 "4번 부분청산도 진행해")
// MT5 Position Close-By-Volume 상당. 돈 이동 = settlements insert 1행(trg_settlement_balance) — fx_close 와 같은 단일 경로.
// 불변식: 청산 슬라이스의 손익 = fx_realized_pnl(sym, side, open, p_size) (fx_close·stopout·SL/TP 와 같은 함수) + 스왑 비례분 ·
//         positions.size 는 정확히 p_size 만큼 감소(같은 local_id·open_price 유지) · p_ref 로 멱등(더블탭 = 1회) · 잔여 ≥ 0.01.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx_close_partial — SQL 계약 핀');
let sql = ''; try { sql = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'fx_close_partial.sql'), 'utf8'); } catch (_) {}
const body = sql.replace(/--[^\n]*/g, '');
ok('파일 존재: supabase/sql/fx_close_partial.sql', sql.length > 0);
ok('시그니처: fx_close_partial(p_local_id text, p_size numeric, p_ref text) · security definer · search_path public', /create or replace function public\.fx_close_partial\(p_local_id text, p_size numeric, p_ref text\)/.test(sql) && /security definer set search_path to 'public'/.test(sql));
ok('인증 + 본인 열린 FX 포지션만 + 행 잠금 (FOR UPDATE OF p) — fx_close 와 자구 동일', /auth\.uid\(\) is null then return jsonb_build_object\('ok',false,'error','not authenticated'\)/.test(sql) && /where p\.local_id = p_local_id and p\.server = 'fx' and p\.status = 'open'\s*\n\s*and pl\.auth_id = auth\.uid\(\)\s*\n\s*limit 1\s*\n\s*for update of p/.test(sql));
ok('멱등: p_ref(≥6자) 필수 · settlements 에 같은 local_id=p_ref 가 있으면 duplicate 반환(돈 0)', /p_ref is null or length\(p_ref\) < 6/.test(sql) && /if exists \(select 1 from public\.settlements where local_id = p_ref and server = 'fx'\) then return jsonb_build_object\('ok',true,'duplicate',true/.test(sql));
ok('수량 검증: 0.01 단위 · 0 초과 · 전량 이상이면 거절(FULL_CLOSE → fx_close 사용) · 잔여 ≥ 0.01', /p_size <> round\(p_size, 2\)/.test(sql) && /p_size >= v_size - 0\.005/.test(sql) && /'code','FULL_CLOSE'/.test(sql) && /v_rest < 0\.01/.test(sql));
ok('세션 게이트 = fx_market_open(cls) 재사용 (fx_open/fx_close 와 락스텝) · MARKET_CLOSED', /if not public\.fx_market_open\(v_cls, now\(\)\) then/.test(sql) && /'code','MARKET_CLOSED'/.test(sql));
ok('손익 = fx_realized_pnl(sym, side, open, p_size) 단일 진실 · null(스테일/무가격) 이면 거절 — 자체 손익 수식 0', /v_pnl := public\.fx_realized_pnl\(v_sym, v_side, v_open, p_size\)/.test(sql) && /if v_pnl is null then return jsonb_build_object\('ok',false,'error','price unavailable \(stale\)'\)/.test(sql) && !/v_dist\s*:=/.test(body));
ok('스왑 비례 분할: 청산분 = swap×p_size/size (2dp) 실현 · 잔여분은 meta.swap 에 남김 (표시==정산 불변식)', /v_swap_part := round\(v_swap \* p_size \/ v_size, 2\)/.test(sql) && /v_swap_rest := round\(v_swap - v_swap_part, 2\)/.test(sql) && /jsonb_build_object\('swap', v_swap_rest/.test(sql));
ok('포지션 갱신 = size 감소 1문장 (status open 유지 · size = 잠금 시점 값 재확인) · 못 찾으면 duplicate', /update public\.positions set size = v_rest, meta = coalesce\(meta,'\{\}'::jsonb\) \|\| jsonb_build_object\('swap', v_swap_rest, 'partials', coalesce\(\(meta->>'partials'\)::int,0\) \+ 1\)\s*\n\s*where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'open' and size = v_size/.test(sql) && /if not found then return jsonb_build_object\('ok',true,'duplicate',true\)/.test(sql));
ok('돈 이동 = settlements insert 1행 (kind fx_close · local_id = p_ref · stake = p_size · 스왑 포함 pnl) — ledger 직접 쓰기 0', /insert into public\.settlements\(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail\)\s*\n\s*values \(v_cust, v_acct, 'fx', 'fx_close', p_ref, v_sym, p_size, v_pnl,/.test(sql) && !/into public\.ledger/.test(body) && !/update public\.accounts/.test(body));
ok('detail = "PARTIAL SIDE size @ open -> close (of total, #pos)" — 앱 3종 파서(BUY|SELL size @ open -> close) 호환', /'PARTIAL '\|\|v_side\|\|' '\|\|p_size\|\|' @ '\|\|v_open\|\|' -> '\|\|round\(v_close,5\)\|\|' \(of '\|\|v_size\|\|', #'\|\|p_local_id\|\|'\)'/.test(sql));
ok('반환: ok · pnl · close · closed · remaining', /return jsonb_build_object\('ok',true,'pnl',v_pnl,'close',round\(v_close,6\),'closed',p_size,'remaining',v_rest/.test(sql));
ok('권한: anon/public revoke · authenticated 만 execute', /revoke all on function public\.fx_close_partial\(text,numeric,text\) from public, anon;/.test(sql) && /grant execute on function public\.fx_close_partial\(text,numeric,text\) to authenticated;/.test(sql));
// 앱 3종 파서 호환 — 실제 detail 샘플을 각 앱의 정규식으로 파싱해 side/size/open/close 가 나오는지 확인
{ const sample = 'PARTIAL BUY 0.05 @ 1.15712 -> 1.15975 (of 0.10, #R-ABC-1234)';
  const rh = sample.match(/(BUY|SELL)\s+([\d.]+)\s+@\s+([\d.]+)\s*(?:→|->)\s*([\d.]+)/i);
  const wt = { s: sample.match(/(BUY|SELL)/i), p: sample.match(/@\s*([\d.]+)(?:\s*->\s*([\d.]+))?/) };
  ok('파서 호환: fx-app/trading 정규식 → BUY 0.05 @ 1.15712 -> 1.15975', !!rh && rh[1] === 'BUY' && +rh[2] === 0.05 && +rh[3] === 1.15712 && +rh[4] === 1.15975);
  ok('파서 호환: webtrade _mapSettle 정규식 → side/open/close', !!wt.s && !!wt.p && +wt.p[1] === 1.15712 && +wt.p[2] === 1.15975); }
console.log('\n' + (fail ? `🔴 fx_close_partial FAIL — ${fail}건` : `🟢 fx_close_partial — ${pass} pass`));
process.exit(fail ? 1 : 0);
