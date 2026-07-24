-- ═══════════════════════════════════════════════════════════════════════════════
-- 스포츠북 데스크 Phase 3 — 개입 도구 (2026-07-24, 사장님 승인 후 배포)
--
-- 원칙 (READ-BEFORE-WRITE 표 승인분):
--   • 모든 개입 = is_admin() 게이트 RPC로만. 테이블 직접 쓰기 경로 없음.
--   • 모든 지급/환불 = 멱등 ref (betpay-/void-) + 삭제 선점(claim) — 자동 정산 엔진
--     (sports-settle)과 동시에 돌아도 이중지급이 구조적으로 불가능.
--   • 모든 개입은 admin_audit_log에 자동 기록 (RPC 안에서 강제 — 무기록 개입 불가).
--   • place_bet 게이트: 거절만 늘린다. 차감·기록 로직 무변경 (별도 파일 참조).
--
-- 배포 순서: ① 이 파일 전체 실행 → ② place_bet_server_odds.sql (게이트 반영판) 실행.
-- 확인: select public.sbdesk_set_game_lock('TEST_GID', true, '테스트');
--       select * from public.admin_audit_log order by at desc limit 3;
--       select public.sbdesk_set_game_lock('TEST_GID', false, '테스트 해제');
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 감사 로그: 누가 언제 무엇을 (개입 도구의 전제조건) ──
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_uid uuid,
  admin_email text,
  action text not null,          -- game_lock / game_unlock / margin / halt / void / settle_manual
  target text not null default '',
  detail jsonb not null default '{}'::jsonb
);
alter table public.admin_audit_log enable row level security;
drop policy if exists audit_log_admin_read on public.admin_audit_log;
create policy audit_log_admin_read on public.admin_audit_log for select using (public.is_admin());
-- 쓰기 정책 없음 = RPC(security definer)만 쓸 수 있다.

-- ── 경기별 잠금 ──
create table if not exists public.game_locks (
  gid text primary key,
  note text not null default '',
  locked_by text not null default '',
  locked_at timestamptz not null default now()
);
alter table public.game_locks enable row level security;
drop policy if exists game_locks_admin_read on public.game_locks;
create policy game_locks_admin_read on public.game_locks for select using (public.is_admin());

-- 내부 헬퍼 — 개입 기록 (RPC들만 호출)
create or replace function public._sbdesk_audit(p_action text, p_target text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit_log(admin_uid, admin_email, action, target, detail)
  values (auth.uid(),
          coalesce((current_setting('request.jwt.claims', true)::jsonb)->>'email',''),
          p_action, coalesce(p_target,''), coalesce(p_detail,'{}'::jsonb));
end $$;
revoke all on function public._sbdesk_audit(text,text,jsonb) from public, anon, authenticated;

-- ── ① 경기 잠금/해제 ──
create or replace function public.sbdesk_set_game_lock(p_gid text, p_locked boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if coalesce(p_gid,'') = '' then return jsonb_build_object('ok',false,'error','bad gid'); end if;
  if p_locked then
    insert into public.game_locks(gid, note, locked_by)
      values (p_gid, coalesce(p_note,''), coalesce((current_setting('request.jwt.claims', true)::jsonb)->>'email',''))
      on conflict (gid) do nothing;                                   -- 멱등
  else
    delete from public.game_locks where gid = p_gid;                  -- 멱등
  end if;
  perform public._sbdesk_audit(case when p_locked then 'game_lock' else 'game_unlock' end,
                               p_gid, jsonb_build_object('note', coalesce(p_note,'')));
  return jsonb_build_object('ok',true,'gid',p_gid,'locked',p_locked);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- ── ② 배당 마진 조절 (0~15%, 기존 pricing.spread_mult 재사용 — 표시·재가격 모두 이 값) ──
create or replace function public.sbdesk_set_margin(p_mult numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_mult is null or p_mult < 0 or p_mult > 15 then
    return jsonb_build_object('ok',false,'error','margin must be 0~15'); end if;
  update public.pricing set spread_mult = p_mult where server = 'sports';   -- pricing에 unique 제약 가정 없이 (update→없으면 insert)
  if not found then insert into public.pricing(server, spread_mult) values ('sports', p_mult); end if;
  perform public._sbdesk_audit('margin', 'sports', jsonb_build_object('spread_mult', p_mult));
  return jsonb_build_object('ok',true,'spread_mult',p_mult);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- ── ③ 전체 중단 / 라이브베팅 스위치 (controls 키 allowlist — 임의 키 조작 불가) ──
create or replace function public.sbdesk_set_control(p_key text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_key not in ('trading_halt','live_betting') then
    return jsonb_build_object('ok',false,'error','key not allowed'); end if;
  update public.controls set val = case when p_on then '1' else '0' end where key = p_key;   -- unique 제약 가정 없이
  if not found then insert into public.controls(key, val) values (p_key, case when p_on then '1' else '0' end); end if;
  perform public._sbdesk_audit('control', p_key, jsonb_build_object('on', p_on));
  return jsonb_build_object('ok',true,'key',p_key,'on',p_on);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- ── ④ 보이드 (기존 admin_void_bet 재사용 + 감사 기록 랩) ──
create or replace function public.sbdesk_void_bet(p_local_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  v := public.admin_void_bet(p_local_id);                             -- 멱등 void- ref + 삭제 선점 (검증된 경로)
  perform public._sbdesk_audit('void', p_local_id, v);
  return v;
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- ── ⑤ 수동 정산 — sports-settle 엔진과 같은 규율: 삭제 선점 + betpay- 멱등 ref ──
--     엔진이 놓친 티켓(정산 큐)을 사람이 결과 보고 정산. 승=potential 지급, 패=지급 0.
create or replace function public.sbdesk_settle_manual(p_local_id text, p_won boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pos public.positions%rowtype; v_payout numeric;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  -- 삭제로 선점(claim): 자동 엔진과 동시 실행돼도 한쪽만 행을 가져간다.
  delete from public.positions
   where local_id = p_local_id and server='sports' and kind='bet' and status='open'
   returning * into v_pos;
  if v_pos.local_id is null then
    return jsonb_build_object('ok',false,'error','bet not found or already settled'); end if;
  v_payout := case when p_won then round(coalesce(v_pos.potential,0),2) else 0 end;
  if p_won and v_payout > 0
     and not exists (select 1 from public.ledger where ref = 'betpay-'||p_local_id) then   -- 엔진과 동일 ref = 이중지급 불가
    insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
      values (v_pos.acct_no, v_pos.cust_id, 'sports', 'bet_won', v_payout, 'betpay-'||p_local_id);
  end if;
  insert into public.settlements(cust_id, acct_no, server, kind, local_id, ticket, symbol, stake, pnl, detail)
    values (v_pos.cust_id, v_pos.acct_no, 'sports',
            case when p_won then 'bet_won' else 'bet_lost' end,
            p_local_id, coalesce(v_pos.meta->>'ticket',''), coalesce(v_pos.symbol,'Bet'),
            coalesce(v_pos.stake,0),
            case when p_won then v_payout - coalesce(v_pos.stake,0) else -coalesce(v_pos.stake,0) end,
            jsonb_build_object('manual', true)::text);
  perform public._sbdesk_audit('settle_manual', p_local_id,
    jsonb_build_object('won', p_won, 'payout', v_payout, 'stake', coalesce(v_pos.stake,0),
                       'game', coalesce(v_pos.game,''), 'cust', v_pos.cust_id));
  return jsonb_build_object('ok',true,'won',p_won,'payout',v_payout);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- ── 감사 로그 조회 (데스크 위젯) ──
create or replace function public.sbdesk_audit_log(p_limit int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb) into v
    from (select at, admin_email, action, target, detail
            from public.admin_audit_log order by at desc limit greatest(1,least(200,p_limit))) t;
  return jsonb_build_object('ok',true,'rows',v);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- ── 게이트: 전부 authenticated 허용 + 함수 안 is_admin이 관문 ──
revoke all on function public.sbdesk_set_game_lock(text,boolean,text) from public, anon;
revoke all on function public.sbdesk_set_margin(numeric)              from public, anon;
revoke all on function public.sbdesk_set_control(text,boolean)        from public, anon;
revoke all on function public.sbdesk_void_bet(text)                   from public, anon;
revoke all on function public.sbdesk_settle_manual(text,boolean)      from public, anon;
revoke all on function public.sbdesk_audit_log(int)                   from public, anon;
grant execute on function public.sbdesk_set_game_lock(text,boolean,text) to authenticated, service_role;
grant execute on function public.sbdesk_set_margin(numeric)              to authenticated, service_role;
grant execute on function public.sbdesk_set_control(text,boolean)        to authenticated, service_role;
grant execute on function public.sbdesk_void_bet(text)                   to authenticated, service_role;
grant execute on function public.sbdesk_settle_manual(text,boolean)      to authenticated, service_role;
grant execute on function public.sbdesk_audit_log(int)                   to authenticated, service_role;
