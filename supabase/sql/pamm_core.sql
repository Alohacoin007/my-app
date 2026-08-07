-- ============================================================================
-- Alpexa — PAMM 코어 (2026-08-03 사장님 승인 "레전드 기반으로 팜을 만들어 보자")
-- ============================================================================
-- 모델: 펀드 = 전용 FX 계좌 1개 + 유닛/NAV 장부. 기존 돈 코어(fx_open/close·ledger·
-- apply_ledger·음수가드)는 한 줄도 수정하지 않는다 — PAMM은 그 위의 "지분 장부"다.
--
--   · NAV(1유닛 가치) = 펀드 계좌 잔고 ÷ 총유닛. 최초 1.0에서 시작.
--   · 참여(join)  = 투자자 FX잔고 → 펀드 계좌로 이동(ledger, 멱등) + 그 시점 NAV로 유닛 발행
--   · 회수(leave) = 유닛 × NAV 를 돌려주고 유닛 소각. 수익분엔 성과보수(하이워터마크 초과분만)
--                   → 보수는 매니저 유닛으로 전환(현금 이동 없음 = 단순·오차 0)
--   · 배분 = 별도 정산 없음. 매니저가 거래해 펀드 잔고가 변하면 NAV가 변하고,
--            모든 유닛 보유자가 지분율만큼 자동으로 이익/손실을 진다 (MT5 PAMM 정통).
--
-- 불변식:
--   [P1] Σ(멤버 유닛) == funds.total_units  (유닛은 발행/소각 경로 밖에서 변할 수 없다)
--   [P2] 펀드 계좌의 돈은 pamm-% ref 경로와 FX 거래 손익으로만 드나든다
--        (일반 출금/이체는 트리거가 차단 — 투자자 돈을 매니저가 빼돌리는 것 구조적 불가)
--   [P3] join/leave는 열린 포지션이 없을 때만 (플로팅 손익으로 NAV 조작/불공정 방지, MT5 롤오버 규칙)
--   [P4] 모든 참여/회수/보수 = pamm_ops에 멱등 ref 기록 (재전송 = 무효과)
--
-- 배포: 이 파일 전체를 SQL 에디터에서 Run (멱등 — 재실행 안전).
-- ============================================================================

-- ① 펀드 원장
create table if not exists public.pamm_funds (
  fund_acct   text primary key,              -- 전용 FX 계좌 (accounts.acct_no, server='fx')
  name        text not null,
  manager_cust text not null,                -- 매니저(계좌 주인) cust_id
  perf_fee_pct numeric not null default 20 check (perf_fee_pct >= 0 and perf_fee_pct <= 50),
  min_join    numeric not null default 100 check (min_join >= 0),
  status      text not null default 'active' check (status in ('active','paused','closed')),
  total_units numeric not null default 0 check (total_units >= 0),
  created_at  timestamptz not null default now()
);

create table if not exists public.pamm_members (
  fund_acct  text not null references public.pamm_funds(fund_acct),
  cust_id    text not null,
  units      numeric not null default 0 check (units >= 0),
  cost_basis numeric not null default 0,     -- 넣은 원금 누계 (표시·보수 계산 참고)
  hwm_nav    numeric not null default 1,     -- 하이워터마크: 이 NAV 초과 수익에만 보수
  joined_at  timestamptz not null default now(),
  primary key (fund_acct, cust_id)
);

create table if not exists public.pamm_ops (   -- 멱등 + 감사 장부 (분쟁 방어)
  ref        text primary key,
  fund_acct  text not null,
  cust_id    text not null,
  kind       text not null check (kind in ('join','leave','fee','create')),
  usd        numeric not null default 0,
  units      numeric not null default 0,
  nav        numeric not null default 1,
  created_at timestamptz not null default now()
);

alter table public.pamm_funds   enable row level security;
alter table public.pamm_members enable row level security;
alter table public.pamm_ops     enable row level security;
-- 읽기: 펀드 목록은 공개(투자자가 골라야 하니), 멤버/장부는 본인·매니저·어드민만
drop policy if exists pamm_funds_read on public.pamm_funds;
create policy pamm_funds_read on public.pamm_funds for select using (true);
drop policy if exists pamm_members_read on public.pamm_members;
create policy pamm_members_read on public.pamm_members for select using (
  public.is_admin()
  or cust_id = (select cust_id from public.players where auth_id = auth.uid() limit 1)
  or fund_acct in (select fund_acct from public.pamm_funds f join public.players p on p.cust_id = f.manager_cust where p.auth_id = auth.uid())
);
drop policy if exists pamm_ops_read on public.pamm_ops;
create policy pamm_ops_read on public.pamm_ops for select using (
  public.is_admin()
  or cust_id = (select cust_id from public.players where auth_id = auth.uid() limit 1)
  or fund_acct in (select fund_acct from public.pamm_funds f join public.players p on p.cust_id = f.manager_cust where p.auth_id = auth.uid())
);
-- 쓰기 정책 0 — 모든 변경은 아래 SECURITY DEFINER RPC만.

-- ② NAV (1유닛 가치). 유닛 0이면 1.0 (개설 직후).
create or replace function public.pamm_nav(p_fund text)
returns numeric language sql stable as $$
  select case when coalesce(f.total_units,0) <= 0 then 1
              else round(coalesce(a.balance,0) / f.total_units, 8) end
    from public.pamm_funds f join public.accounts a on a.acct_no = f.fund_acct
   where f.fund_acct = p_fund;
$$;

-- ③ [P2] 펀드 계좌 보호 — pamm 경로/FX거래손익 외의 유출 차단 (트리거)
create or replace function public.pamm_guard_ledger()
returns trigger language plpgsql as $$
begin
  if NEW.amount < 0
     and exists (select 1 from public.pamm_funds where fund_acct = NEW.acct_no and total_units > 0)
     and NEW.ref not like 'pamm-%' then
    raise exception 'PAMM fund account: outbound money only via PAMM ops (ref pamm-*)';
  end if;
  return NEW;
end;$$;
drop trigger if exists trg_pamm_guard on public.ledger;
create trigger trg_pamm_guard before insert on public.ledger
  for each row execute function public.pamm_guard_ledger();

-- ④ 펀드 개설 (어드민 승인제 — 아무나 매니저 불가)
create or replace function public.pamm_create_fund(p_ref text, p_acct text, p_name text, p_fee_pct numeric, p_min numeric default 100)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_acct accounts%rowtype; v_mgr text;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_ref is null or length(p_ref) < 6 then return jsonb_build_object('ok',false,'error','bad ref'); end if;
  if exists (select 1 from pamm_ops where ref = p_ref) then return jsonb_build_object('ok',true,'duplicate',true); end if;
  select * into v_acct from accounts where acct_no = p_acct and server = 'fx';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','fx account not found'); end if;
  if exists (select 1 from pamm_funds where fund_acct = p_acct) then return jsonb_build_object('ok',false,'error','already a fund'); end if;
  select cust_id into v_mgr from players where id = v_acct.player_id;
  -- 개설 시점 잔고 = 매니저 자기자본 → NAV 1.0으로 매니저 유닛 발행 (돈 이동 없음)
  insert into pamm_funds(fund_acct, name, manager_cust, perf_fee_pct, min_join, total_units)
    values (p_acct, p_name, v_mgr, greatest(0, least(50, coalesce(p_fee_pct,20))), greatest(0,coalesce(p_min,100)), greatest(0, coalesce(v_acct.balance,0)));
  insert into pamm_members(fund_acct, cust_id, units, cost_basis, hwm_nav)
    values (p_acct, v_mgr, greatest(0, coalesce(v_acct.balance,0)), greatest(0, coalesce(v_acct.balance,0)), 1);
  insert into pamm_ops(ref, fund_acct, cust_id, kind, usd, units, nav)
    values (p_ref, p_acct, v_mgr, 'create', coalesce(v_acct.balance,0), greatest(0, coalesce(v_acct.balance,0)), 1);
  return jsonb_build_object('ok',true,'fund',p_acct,'manager',v_mgr);
end;$$;

-- ⑤ 참여 — 본인 FX잔고 → 펀드. NAV로 유닛 발행. [P3] 열린 포지션 있으면 거절.
create or replace function public.pamm_join(p_ref text, p_fund text, p_usd numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_acct text; v_cust text; v_f pamm_funds%rowtype;
  v_nav numeric; v_units numeric; v_bal numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_usd is null or p_usd <= 0 then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if p_ref is null or length(p_ref) < 6 or p_ref not like 'pamm-%' then return jsonb_build_object('ok',false,'error','bad ref'); end if;
  if exists (select 1 from pamm_ops where ref = p_ref) then return jsonb_build_object('ok',true,'duplicate',true); end if;
  select * into v_f from pamm_funds where fund_acct = p_fund;
  if v_f.fund_acct is null or v_f.status <> 'active' then return jsonb_build_object('ok',false,'error','fund not open'); end if;
  if p_usd < v_f.min_join then return jsonb_build_object('ok',false,'error','below minimum','min',v_f.min_join); end if;
  -- 투자자 = 호출자 본인 FX 계좌만
  select a.acct_no, pl.cust_id into v_acct, v_cust
    from accounts a join players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;
  if v_acct = p_fund then return jsonb_build_object('ok',false,'error','manager cannot join own fund (already owns units)'); end if;
  -- [P3] 공정 가격: 열린 포지션 있으면 대기
  if exists (select 1 from positions where acct_no = p_fund and server = 'fx' and status = 'open') then
    return jsonb_build_object('ok',false,'error','fund has open positions — try after rollover'); end if;
  select balance into v_bal from accounts where acct_no = v_acct;
  if coalesce(v_bal,0) < p_usd then return jsonb_build_object('ok',false,'error','insufficient balance'); end if;

  v_nav := public.pamm_nav(p_fund);
  v_units := round(p_usd / v_nav, 8);
  -- 멱등 기록 먼저 (PK가 원자 백스톱) → 돈 이동(ledger, apply_ledger가 잔고 반영·음수가드 백업)
  insert into pamm_ops(ref, fund_acct, cust_id, kind, usd, units, nav)
    values (p_ref, p_fund, v_cust, 'join', p_usd, v_units, v_nav);
  insert into ledger(acct_no, cust_id, server, kind, amount, ref)
    values (v_acct, v_cust, 'fx', 'pamm_join', -p_usd, p_ref || '-out');
  insert into ledger(acct_no, cust_id, server, kind, amount, ref)
    values (p_fund, v_f.manager_cust, 'fx', 'pamm_join', p_usd, p_ref || '-in');
  insert into pamm_members(fund_acct, cust_id, units, cost_basis, hwm_nav)
    values (p_fund, v_cust, v_units, p_usd, v_nav)
    on conflict (fund_acct, cust_id) do update
      set units = pamm_members.units + excluded.units,
          cost_basis = pamm_members.cost_basis + excluded.cost_basis,
          hwm_nav = greatest(pamm_members.hwm_nav, excluded.hwm_nav);
  update pamm_funds set total_units = total_units + v_units where fund_acct = p_fund;
  return jsonb_build_object('ok',true,'units',v_units,'nav',v_nav);
end;$$;

-- ⑥ 회수 — 유닛 × NAV 반환. HWM 초과 수익에만 성과보수(매니저 유닛으로 전환).
create or replace function public.pamm_leave(p_ref text, p_fund text, p_units numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_acct text; v_cust text; v_f pamm_funds%rowtype; v_m pamm_members%rowtype;
  v_nav numeric; v_units numeric; v_gross numeric; v_fee numeric := 0; v_fee_units numeric := 0; v_net numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_ref is null or length(p_ref) < 6 or p_ref not like 'pamm-%' then return jsonb_build_object('ok',false,'error','bad ref'); end if;
  if exists (select 1 from pamm_ops where ref = p_ref) then return jsonb_build_object('ok',true,'duplicate',true); end if;
  select * into v_f from pamm_funds where fund_acct = p_fund;
  if v_f.fund_acct is null then return jsonb_build_object('ok',false,'error','fund not found'); end if;
  select a.acct_no, pl.cust_id into v_acct, v_cust
    from accounts a join players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;
  select * into v_m from pamm_members where fund_acct = p_fund and cust_id = v_cust for update;
  if v_m.cust_id is null or v_m.units <= 0 then return jsonb_build_object('ok',false,'error','no units'); end if;
  if v_cust = v_f.manager_cust and v_f.total_units > v_m.units then
    return jsonb_build_object('ok',false,'error','manager capital stays while investors hold units'); end if;
  if exists (select 1 from positions where acct_no = p_fund and server = 'fx' and status = 'open') then
    return jsonb_build_object('ok',false,'error','fund has open positions — try after rollover'); end if;

  v_units := least(coalesce(p_units, v_m.units), v_m.units);
  if v_units <= 0 then return jsonb_build_object('ok',false,'error','bad units'); end if;
  v_nav := public.pamm_nav(p_fund);
  v_gross := round(v_units * v_nav, 2);
  -- 성과보수: HWM 초과 수익분에만 (잃었다 복구한 구간 과금 금지)
  if v_nav > v_m.hwm_nav and v_cust <> v_f.manager_cust then
    v_fee := round(v_units * (v_nav - v_m.hwm_nav) * v_f.perf_fee_pct / 100.0, 2);
    v_fee_units := case when v_nav > 0 then round(v_fee / v_nav, 8) else 0 end;
  end if;
  v_net := v_gross - v_fee;

  insert into pamm_ops(ref, fund_acct, cust_id, kind, usd, units, nav)
    values (p_ref, p_fund, v_cust, 'leave', v_net, v_units, v_nav);
  if v_fee > 0 then
    insert into pamm_ops(ref, fund_acct, cust_id, kind, usd, units, nav)
      values (p_ref || '-fee', p_fund, v_f.manager_cust, 'fee', v_fee, v_fee_units, v_nav);
    insert into pamm_members(fund_acct, cust_id, units, cost_basis, hwm_nav)
      values (p_fund, v_f.manager_cust, v_fee_units, 0, v_nav)
      on conflict (fund_acct, cust_id) do update set units = pamm_members.units + excluded.units;
  end if;
  -- 돈 반환: 펀드 → 투자자 (net만. fee는 유닛 전환이라 현금 이동 없음)
  insert into ledger(acct_no, cust_id, server, kind, amount, ref)
    values (p_fund, v_f.manager_cust, 'fx', 'pamm_leave', -v_net, p_ref || '-out');
  insert into ledger(acct_no, cust_id, server, kind, amount, ref)
    values (v_acct, v_cust, 'fx', 'pamm_leave', v_net, p_ref || '-in');
  update pamm_members set units = units - v_units,
         hwm_nav = greatest(hwm_nav, v_nav)
   where fund_acct = p_fund and cust_id = v_cust;
  update pamm_funds set total_units = total_units - v_units + v_fee_units where fund_acct = p_fund;
  return jsonb_build_object('ok',true,'gross',v_gross,'fee',v_fee,'net',v_net,'nav',v_nav);
end;$$;

-- ⑦ 데스크 리포트 — 매니저(자기 펀드) 또는 어드민(전체). 화면 3종의 단일 데이터 소스.
create or replace function public.pamm_desk_report(p_fund text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_cust text; v_out jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select cust_id into v_cust from players where auth_id = v_uid limit 1;
  select jsonb_build_object('ok',true,'funds', coalesce(jsonb_agg(f), '[]'::jsonb)) into v_out
  from (
    select fd.fund_acct, fd.name, fd.manager_cust, fd.perf_fee_pct, fd.min_join, fd.status,
           fd.total_units,
           -- MT5: Equity = Balance(실현) + Σ플로팅. 라이브 NAV=Equity/units (표시 전용).
           --   거래용 public.pamm_nav(잔고 기반)는 무변경 — join/leave는 P3 롤오버 게이트로 플로팅=0일 때만.
           coalesce(a.balance,0) as balance,
           fl.flt as float,
           coalesce(a.balance,0) + fl.flt as equity,
           case when fd.total_units > 0 then round((coalesce(a.balance,0) + fl.flt) / fd.total_units, 6)
                else public.pamm_nav(fd.fund_acct) end as nav,
           (select count(*) from pamm_members m where m.fund_acct = fd.fund_acct and m.units > 0) as members,
           case when public.is_admin() or fd.manager_cust = v_cust then
             -- 투자자 value = share × 펀드 Equity (플로팅 pro-rata 반영). 플로팅=0이면 units×pamm_nav와 동일.
             (select jsonb_agg(jsonb_build_object('cust',m.cust_id,'name',pl.name,'units',m.units,
                     'basis',m.cost_basis,
                     'value',round(m.units / nullif(fd.total_units,0) * (coalesce(a.balance,0) + fl.flt),2),
                     'hwm',m.hwm_nav,'joined',m.joined_at))
                from pamm_members m left join players pl on pl.cust_id = m.cust_id
               where m.fund_acct = fd.fund_acct and m.units > 0)
           else null end as roster,
           case when public.is_admin() or fd.manager_cust = v_cust then
             (select jsonb_agg(jsonb_build_object('ref',o.ref,'cust',o.cust_id,'kind',o.kind,'usd',o.usd,'units',o.units,'nav',o.nav,'at',o.created_at) order by o.created_at desc)
                from (select * from pamm_ops where fund_acct = fd.fund_acct order by created_at desc limit 50) o)
           else null end as ops,
           case when public.is_admin() or fd.manager_cust = v_cust then
             -- 플로팅 P&L = 서버 실시간 mid 마크(fx_realized_pnl) + 적립 스왑 — stop-out 엔진과 동일 함수.
             -- ⚠️ 저장된 p.pnl 컬럼은 청산 시점에만 기록되는 스테일값 → 열린 포지션엔 쓰지 않는다.
             --    이래야 "플로팅==서버 실현" 불변식 유지(가짜 ± 금지). 미가격 심볼은 null → UI '—'.
             (select jsonb_agg(jsonb_build_object('local_id',p.local_id,'symbol',p.symbol,'side',p.side,'size',p.size,'open_price',p.open_price,
                     'pnl', case when public.fx_realized_pnl(p.symbol,p.side,p.open_price,p.size) is null then null
                                 else round(public.fx_realized_pnl(p.symbol,p.side,p.open_price,p.size) + coalesce((p.meta->>'swap')::numeric,0),2) end))
                from positions p where p.acct_no = fd.fund_acct and p.server = 'fx' and p.status = 'open')
           else null end as positions
      from pamm_funds fd
      join accounts a on a.acct_no = fd.fund_acct
      -- 총 플로팅 = 열린 포지션 fx_realized_pnl(+swap) 합 (미가격 심볼은 0 기여). stop-out 엔진과 동일 함수.
      cross join lateral (
        select coalesce(sum(case when public.fx_realized_pnl(p.symbol,p.side,p.open_price,p.size) is null then 0
                  else public.fx_realized_pnl(p.symbol,p.side,p.open_price,p.size) + coalesce((p.meta->>'swap')::numeric,0) end),0) as flt
          from positions p where p.acct_no = fd.fund_acct and p.server = 'fx' and p.status = 'open'
      ) fl
     where (p_fund is null or fd.fund_acct = p_fund)
       and (public.is_admin() or fd.manager_cust = v_cust or fd.status = 'active')
  ) f;
  return v_out;
end;$$;

-- ⑧ 어드민: 펀드 일시정지/재개 (리스크 개입)
create or replace function public.pamm_set_status(p_fund text, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_status not in ('active','paused','closed') then return jsonb_build_object('ok',false,'error','bad status'); end if;
  update pamm_funds set status = p_status where fund_acct = p_fund;
  if not found then return jsonb_build_object('ok',false,'error','fund not found'); end if;
  return jsonb_build_object('ok',true,'fund',p_fund,'status',p_status);
end;$$;

grant execute on function public.pamm_nav(text) to authenticated;
grant execute on function public.pamm_create_fund(text,text,text,numeric,numeric) to authenticated;
grant execute on function public.pamm_join(text,text,numeric) to authenticated;
grant execute on function public.pamm_leave(text,text,numeric) to authenticated;
grant execute on function public.pamm_desk_report(text) to authenticated;
grant execute on function public.pamm_set_status(text,text) to authenticated;

-- ⑨ 어드민: 성과보수 변경 (2026-08-05 사장님 "커스텀 가능하게") — 테이블 CHECK(0~50)가 백스톱
create or replace function public.pamm_set_fee(p_fund text, p_fee numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_fee is null or p_fee < 0 or p_fee > 50 then return jsonb_build_object('ok',false,'error','fee must be 0~50%'); end if;
  update pamm_funds set perf_fee_pct = p_fee where fund_acct = p_fund;
  if not found then return jsonb_build_object('ok',false,'error','fund not found'); end if;
  return jsonb_build_object('ok',true,'fund',p_fund,'fee',p_fee);
end;$$;
grant execute on function public.pamm_set_fee(text, numeric) to authenticated;

-- ⑩ 투자자 리포트 (2026-08-06 사장님 "투자자가 자기 잔고 보는 화면") — 앱/웹트레이더 PAMM 탭 단일 소스.
--    active 펀드 목록 + 호출자 본인 지분(mine). roster/ops 없음(투자자는 남의 것 못 봄).
create or replace function public.pamm_investor_report()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_cust text; v_out jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select cust_id into v_cust from players where auth_id = v_uid limit 1;
  select jsonb_build_object('ok',true,'cust',v_cust,'funds', coalesce(jsonb_agg(f order by f->>'name'), '[]'::jsonb)) into v_out
  from (
    select jsonb_build_object(
      'fund_acct', fd.fund_acct, 'name', fd.name, 'perf_fee_pct', fd.perf_fee_pct,
      'min_join', fd.min_join, 'status', fd.status,
      -- 라이브 NAV = (잔고 + Σ플로팅)/units. 데스크와 동일 소스 — 매니저 열린 포지션 손익이
      --   투자자 value/pnl에 실시간 pro-rata 반영. 거래용 public.pamm_nav(잔고)는 무변경 —
      --   join/leave는 P3 롤오버 게이트로 플로팅=0일 때만 → 유닛 산수에 플로팅 안 섞임(표시 전용).
      'nav', fl.lnav,
      'ret', round(fl.lnav - 1, 6),                                -- 개설 이후 누적 수익률(라이브 NAV−1)
      'float', fl.flt,
      'is_manager', (fd.manager_cust = v_cust),
      'mine', (select case when m.units > 0 then jsonb_build_object(
                 'units', m.units, 'basis', m.cost_basis,
                 'value', round(m.units * fl.lnav, 2),
                 'pnl', round(m.units * fl.lnav - m.cost_basis, 2),
                 'hwm', m.hwm_nav) else null end
               from pamm_members m where m.fund_acct = fd.fund_acct and m.cust_id = v_cust)
    ) as f
    from pamm_funds fd
    join accounts a on a.acct_no = fd.fund_acct
    -- 총 플로팅 + 라이브 NAV (표시 전용). fx_realized_pnl = stop-out 엔진과 동일 마크 함수.
    cross join lateral (
      select fx.flt,
             case when fd.total_units > 0 then round((coalesce(a.balance,0) + fx.flt) / fd.total_units, 8)
                  else public.pamm_nav(fd.fund_acct) end as lnav
      from (select coalesce(sum(case when public.fx_realized_pnl(p.symbol,p.side,p.open_price,p.size) is null then 0
                     else public.fx_realized_pnl(p.symbol,p.side,p.open_price,p.size) + coalesce((p.meta->>'swap')::numeric,0) end),0) as flt
              from positions p where p.acct_no = fd.fund_acct and p.server = 'fx' and p.status = 'open') fx
    ) fl
    where fd.status <> 'closed'
       or exists (select 1 from pamm_members m where m.fund_acct = fd.fund_acct and m.cust_id = v_cust and m.units > 0)
  ) g;
  return v_out;
end;$$;
grant execute on function public.pamm_investor_report() to authenticated;

-- ⑪ PAMM 월간 명세서 지원 (2026-08-06 사장님 "가입 고객에게 월 1회 이메일") — 읽기 전용 리포팅.
--    기존 스포츠 명세서(server='sports')와 완전 분리: PAMM 투자자(FX계좌+유닛 보유)만 대상.
--    발송 Edge = pamm-statements (send-statements 패턴 미러). 돈 이동 0 — 순수 스냅샷.
create table if not exists public.pamm_statement_sends (   -- 멱등: 같은 (cust,month) 재발송 차단
  cust_id text not null, month text not null, email text, sent_at timestamptz not null default now(),
  primary key (cust_id, month)
);
alter table public.pamm_statement_sends enable row level security;   -- 클라 정책 0 (service_role만)

-- 수신자: 이번 달 기준 유닛>0인 투자자(매니저 제외 — 매니저는 운용자, 투자자 아님)
create or replace function public.pamm_statement_recipients(p_month text)
returns table(cust_id text, name text, email text) language plpgsql security definer set search_path = public as $$
begin
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then return; end if;
  return query
    select distinct pl.cust_id, pl.name, pl.email
      from public.pamm_members m
      join public.pamm_funds f on f.fund_acct = m.fund_acct
      join public.players pl on pl.cust_id = m.cust_id
     where m.units > 0 and m.cust_id <> f.manager_cust
       and pl.email is not null and pl.email <> ''
       and coalesce(pl.status,'active') <> 'closed';
end;$$;
revoke all on function public.pamm_statement_recipients(text) from public, anon, authenticated;
grant execute on function public.pamm_statement_recipients(text) to service_role;

-- 명세서 본문 데이터: 한 투자자의 모든 펀드 지분 스냅샷 + 이번 달 활동(join/leave/fee).
create or replace function public.pamm_statement(p_cust text, p_month text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_end timestamptz; v_out jsonb;
begin
  if p_month !~ '^\d{4}-\d{2}$' then return jsonb_build_object('ok',false,'error','bad month'); end if;
  v_start := ((p_month || '-01')::timestamp) at time zone 'America/Los_Angeles';
  v_end   := (((p_month || '-01')::date + interval '1 month')::timestamp) at time zone 'America/Los_Angeles';
  select jsonb_build_object('ok',true,'cust',p_cust,'month',p_month,
    'total_value', coalesce(sum(round(m.units * public.pamm_nav(m.fund_acct),2)),0),
    'total_basis', coalesce(sum(m.cost_basis),0),
    'funds', coalesce(jsonb_agg(jsonb_build_object(
       'name', f.name, 'nav', public.pamm_nav(m.fund_acct),
       'ret', round(public.pamm_nav(m.fund_acct) - 1, 6),
       'basis', m.cost_basis, 'value', round(m.units * public.pamm_nav(m.fund_acct),2),
       'pnl', round(m.units * public.pamm_nav(m.fund_acct) - m.cost_basis, 2),
       'month_ops', (select coalesce(jsonb_agg(jsonb_build_object('kind',o.kind,'usd',o.usd,'at',o.created_at) order by o.created_at),'[]'::jsonb)
                       from pamm_ops o where o.fund_acct = m.fund_acct and o.cust_id = p_cust
                        and o.created_at >= v_start and o.created_at < v_end and o.kind in ('join','leave'))
     ) order by f.name), '[]'::jsonb))
    into v_out
    from pamm_members m join pamm_funds f on f.fund_acct = m.fund_acct
   where m.cust_id = p_cust and m.units > 0;
  return coalesce(v_out, jsonb_build_object('ok',true,'cust',p_cust,'month',p_month,'funds','[]'::jsonb));
end;$$;
revoke all on function public.pamm_statement(text,text) from public, anon, authenticated;
grant execute on function public.pamm_statement(text,text) to service_role, authenticated;   -- authenticated=본인 확인은 Edge/앱 몫; 여기선 조회만

create or replace function public.mark_pamm_statement_sent(p_cust text, p_month text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.pamm_statement_sends(cust_id, month, email) values (p_cust, p_month, p_email)
  on conflict (cust_id, month) do nothing;
end;$$;
revoke all on function public.mark_pamm_statement_sent(text,text,text) from public, anon, authenticated;
grant execute on function public.mark_pamm_statement_sent(text,text,text) to service_role;
