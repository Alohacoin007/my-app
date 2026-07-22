-- Alpexa — 대기주문 서버 매칭 엔진 v1 (2026-07-22 사장님 "gogo")
-- ============================================================================
-- 지금까지 대기주문은 클라(trading.html)가 감시·체결(fx_open 호출) → 브라우저를 닫으면
-- 영영 안 터지는 구조. 이 파일은 매칭을 서버로 옮긴다:
--   fx_place_pending / fx_cancel_pending (고객 RPC) + fx_pending_fill (크론/에지 스위프)
--   + fx_sweep_all (fx_sltp + fx_pending_fill 한 방 — 에지 초단위용)
--
-- 불변식:
--  · 체결 엔진은 한 곳 — fx_fill_internal. fx_open(시장가) v4와 fx_pending_fill(대기)이
--    같은 코어를 호출한다 (스프레드 체결·신선도·멱등·마진 게이트가 자구 동일).
--    ※ 스왑 누락 사건(결함-로그 2026-07-22)의 "부분 복제" 클래스 원천 차단.
--  · 이중 체결 구조적 불가 — 포지션 local_id = 대기주문 local_id. 구클라(trading.html)가
--    같은 주문을 클라 체결해도 멱등(duplicate)으로 한 번만 열린다.
--  · 트리거 판정(MT5, 서버 bid/ask = mid ∓ half):
--      BUY LIMIT: ask ≤ trigger · BUY STOP: ask ≥ trigger
--      SELL LIMIT: bid ≥ trigger · SELL STOP: bid ≤ trigger
--  · fail-safe: 시세 없음/신선도 초과/장마감 → 그 주문 스킵(돈은 추측으로 안 움직임).
--    체결 시점 마진 부족 → status 'rejected' + meta.reason (MT5 동일 — 조용히 안 사라짐).
--
-- 선행: fx_open_margin.sql · fx_open_session.sql(v3) · fx_pending.sql(테이블) 배포 상태.
-- 배포: 이 파일 전체 1회 실행 (재실행 안전).
-- ============================================================================

-- 0) 레거시 테이블 보강 (meta/filled_at — 재실행 안전)
alter table public.fx_pending add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.fx_pending add column if not exists filled_at timestamptz;
-- 레거시 테이블이 PK 없이 Realtime 발행에 등록돼 있어 UPDATE가 55000으로 거부됨(2026-07-22 실전 발견,
-- 스위프의 filled 선점이 매번 실패) → 유니크 인덱스를 replica identity로 지정 (재실행 안전)
alter table public.fx_pending replica identity using index fx_pending_acct_localid_uidx;

-- 1) 단일 체결 코어 — fx_open v3의 본문을 그대로 옮긴 내부 함수 (auth 없음 — 호출자가 신원 보증).
--    클라 직접 호출 불가(revoke). 시장가(fx_open)와 대기 체결(fx_pending_fill)이 공유.
create or replace function public.fx_fill_internal(
  p_cust text, p_acct text, p_local_id text, p_symbol text, p_side text, p_size numeric,
  p_leverage numeric default null,
  p_requested_price numeric default null,
  p_max_slippage numeric default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_cls text; v_mid numeric; v_pts timestamptz; v_open numeric; v_side text := upper(coalesce(p_side,''));
  v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0;
  v_bal numeric; v_cap numeric; v_lev numeric; v_notional numeric; v_new_margin numeric; v_used numeric;
begin
  if p_size is null or p_size <= 0 then return jsonb_build_object('ok',false,'error','bad size'); end if;
  if v_side not in ('BUY','SELL') then return jsonb_build_object('ok',false,'error','bad side'); end if;

  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||p_symbol); end if;

  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_symbol); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  if v_cls = 'FX' then
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = p_symbol limit 1;
    select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = p_symbol limit 1;
    v_pip := case when p_symbol like '%JPY' then 0.01 when p_symbol='XAUUSD' then 0.01
                  when p_symbol='XAGUSD' then 0.001 else 0.0001 end;
    v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
    v_open := v_mid + (case when v_side = 'BUY' then v_half else -v_half end);
  else
    v_open := v_mid;
  end if;

  if exists (select 1 from public.positions where local_id = p_local_id and acct_no = p_acct and server = 'fx') then
    select open_price into v_open from public.positions where local_id = p_local_id and acct_no = p_acct and server = 'fx' limit 1;
    return jsonb_build_object('ok',true,'duplicate',true,'open',v_open);
  end if;

  if p_requested_price is not null and p_max_slippage is not null and p_max_slippage >= 0 then
    if (v_side = 'BUY'  and v_open > p_requested_price + p_max_slippage)
    or (v_side = 'SELL' and v_open < p_requested_price - p_max_slippage) then
      return jsonb_build_object('ok',false,'error','slippage exceeded','code','SLIPPAGE',
        'requested', round(p_requested_price,6), 'server', round(v_open,6),
        'max', p_max_slippage, 'side', v_side);
    end if;
  end if;

  v_cap := public.fx_lev_cap(v_cls);
  v_lev := least(v_cap, greatest(1, coalesce(p_leverage, v_cap)));
  select balance into v_bal from public.accounts where acct_no = p_acct;
  v_notional := public.fx_notional_usd(p_symbol, v_cls, p_size, v_open);
  if v_notional is null then
    return jsonb_build_object('ok',false,'error','margin unavailable (no FX reference for '||p_symbol||')');
  end if;
  v_new_margin := v_notional / v_lev;
  select coalesce(sum(
           public.fx_notional_usd(po.symbol, sp.cls, po.size, po.open_price) / public.fx_lev_cap(sp.cls)
         ), 0)
    into v_used
    from public.positions po
    join public.fx_specs sp on sp.symbol = po.symbol
   where po.acct_no = p_acct and po.server = 'fx' and po.status = 'open';
  if coalesce(v_bal,0) < v_used + v_new_margin - 0.000001 then
    return jsonb_build_object('ok',false,'error','insufficient margin','code','MARGIN',
      'required', round(v_new_margin,2), 'free', round(coalesce(v_bal,0) - v_used, 2), 'leverage', v_lev);
  end if;

  insert into public.positions(cust_id, acct_no, server, kind, local_id, symbol, side, size, open_price, pnl, status)
    values (p_cust, p_acct, 'fx', 'position', p_local_id, p_symbol, v_side, p_size, round(v_open::numeric,8), 0, 'open');

  return jsonb_build_object('ok',true,'open',round(v_open,6),'symbol',p_symbol,'side',v_side,'size',p_size,
                            'margin',round(v_new_margin,2),'leverage',v_lev);
end;$$;
revoke all on function public.fx_fill_internal(text,text,text,text,text,numeric,numeric,numeric,numeric) from public, anon, authenticated;

-- 2) fx_open v4 — 얇은 래퍼: auth + 계좌 해석 + 세션 게이트 → 코어 호출. 시그니처 동일(클라 무변경).
create or replace function public.fx_open(
  p_local_id text, p_symbol text, p_side text, p_size numeric,
  p_leverage numeric default null,
  p_requested_price numeric default null,
  p_max_slippage numeric default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_acct text; v_cust text; v_cls text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select a.acct_no, pl.cust_id into v_acct, v_cust
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;
  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||p_symbol); end if;
  if not public.fx_market_open(v_cls) then
    return jsonb_build_object('ok',false,'error','market closed','code','MARKET_CLOSED','symbol',p_symbol);
  end if;
  return public.fx_fill_internal(v_cust, v_acct, p_local_id, p_symbol, p_side, p_size,
                                 p_leverage, p_requested_price, p_max_slippage);
end;$$;

-- 3) 대기주문 접수 — 방향 검증(MT5) + 멱등. sl/tp는 트리거가 기준(체결 후 meta로 이식).
create or replace function public.fx_place_pending(
  p_local_id text, p_symbol text, p_side text, p_otype text, p_size numeric,
  p_trigger numeric, p_sl numeric default null, p_tp numeric default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_acct text; v_cust text; v_cls text;
  v_side text := upper(coalesce(p_side,'')); v_ot text := upper(coalesce(p_otype,''));
  v_mid numeric; v_pts timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_size is null or p_size <= 0 then return jsonb_build_object('ok',false,'error','bad size'); end if;
  if p_trigger is null or p_trigger <= 0 then return jsonb_build_object('ok',false,'error','bad trigger price'); end if;
  if v_side not in ('BUY','SELL') then return jsonb_build_object('ok',false,'error','bad side'); end if;
  if v_ot not in ('LIMIT','STOP') then return jsonb_build_object('ok',false,'error','bad order type'); end if;

  select a.acct_no, pl.cust_id into v_acct, v_cust
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;
  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||p_symbol); end if;

  -- 방향 검증: 현재 mid 기준 (MT5 — Buy Limit은 아래·Buy Stop은 위, Sell 반전). 신선가 필수(fail-safe).
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 or v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;
  if (v_side='BUY'  and v_ot='LIMIT' and p_trigger >= v_mid)
  or (v_side='BUY'  and v_ot='STOP'  and p_trigger <= v_mid)
  or (v_side='SELL' and v_ot='LIMIT' and p_trigger <= v_mid)
  or (v_side='SELL' and v_ot='STOP'  and p_trigger >= v_mid) then
    return jsonb_build_object('ok',false,'error','trigger on wrong side of market');
  end if;
  -- sl/tp는 트리거 기준 방향 검증 (BUY: sl<trigger<tp · SELL: tp<trigger<sl)
  if p_sl is not null and ((v_side='BUY' and p_sl >= p_trigger) or (v_side='SELL' and p_sl <= p_trigger)) then
    return jsonb_build_object('ok',false,'error','SL on wrong side of trigger'); end if;
  if p_tp is not null and ((v_side='BUY' and p_tp <= p_trigger) or (v_side='SELL' and p_tp >= p_trigger)) then
    return jsonb_build_object('ok',false,'error','TP on wrong side of trigger'); end if;

  insert into public.fx_pending(cust_id, acct_no, server, local_id, ticket, symbol, side, size, otype, trigger, sl, tp, status)
    values (v_cust, v_acct, 'fx', p_local_id, p_local_id, p_symbol, v_side, p_size, v_ot, p_trigger, p_sl, p_tp, 'pending')
    on conflict (acct_no, local_id) do nothing;
  return jsonb_build_object('ok',true,'local_id',p_local_id,'otype',v_ot,'trigger',p_trigger,'sl',p_sl,'tp',p_tp);
end;$$;
revoke all on function public.fx_place_pending(text,text,text,text,numeric,numeric,numeric,numeric) from public, anon;
grant execute on function public.fx_place_pending(text,text,text,text,numeric,numeric,numeric,numeric) to authenticated;

-- 4) 대기주문 취소 — 본인 소유 + pending 상태만 (원자적)
create or replace function public.fx_cancel_pending(p_local_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select a.acct_no into v_acct
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;
  update public.fx_pending set status = 'cancelled'
   where local_id = p_local_id and acct_no = v_acct and status = 'pending';
  if not found then return jsonb_build_object('ok',false,'error','pending order not found'); end if;
  return jsonb_build_object('ok',true,'cancelled',p_local_id);
end;$$;
revoke all on function public.fx_cancel_pending(text) from public, anon;
grant execute on function public.fx_cancel_pending(text) to authenticated;

-- 5) 매칭 스위프 — 트리거 교차 시 원자적 선점 후 단일 코어로 체결. 크론(분)+에지(초) 공용.
create or replace function public.fx_pending_fill(p_max int default 200)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r record; v_mid numeric; v_pts timestamptz; v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric;
  v_bid numeric; v_ask numeric; v_hit boolean; v_res jsonb; v_filled int := 0; v_rejected int := 0;
begin
  for r in
    select fp.*, s.cls from public.fx_pending fp join public.fx_specs s on s.symbol = fp.symbol
     where fp.status = 'pending' limit p_max
  loop
    if not public.fx_market_open(r.cls) then continue; end if;              -- 장마감 → 스킵
    select mid, updated_at into v_mid, v_pts from public.prices where symbol = r.symbol limit 1;
    if v_mid is null or v_mid <= 0 then continue; end if;
    if v_pts is null or (now() - v_pts) > interval '120 seconds' then continue; end if;

    -- bid/ask = fx_fill_internal과 동일 half 공식 (판정가와 체결가가 같은 수식)
    if r.cls = 'FX' then
      select coalesce(spr_pts,0) into v_spr from public.prices where symbol = r.symbol limit 1;
      select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = r.symbol limit 1;
      v_pip := case when r.symbol like '%JPY' then 0.01 when r.symbol='XAUUSD' then 0.01
                    when r.symbol='XAGUSD' then 0.001 else 0.0001 end;
      v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
    else v_half := 0; end if;
    v_bid := v_mid - v_half; v_ask := v_mid + v_half;

    v_hit := case
      when r.side='BUY'  and r.otype='LIMIT' then v_ask <= r.trigger
      when r.side='BUY'  and r.otype='STOP'  then v_ask >= r.trigger
      when r.side='SELL' and r.otype='LIMIT' then v_bid >= r.trigger
      when r.side='SELL' and r.otype='STOP'  then v_bid <= r.trigger
      else false end;
    if not v_hit then continue; end if;

    -- 원자적 선점: pending→filled로 먼저 뺏은 쪽만 체결 (구클라 경합 시에도 1회)
    update public.fx_pending set status = 'filled', filled_at = now()
     where local_id = r.local_id and acct_no = r.acct_no and status = 'pending';
    if not found then continue; end if;

    v_res := public.fx_fill_internal(r.cust_id, r.acct_no, r.local_id, r.symbol, r.side, r.size, null, null, null);
    if coalesce((v_res->>'ok')::boolean, false) then
      v_filled := v_filled + 1;
      if r.sl is not null or r.tp is not null then                          -- SL/TP 이식 (fx_sltp가 발동)
        update public.positions set meta = coalesce(meta,'{}'::jsonb)
             || jsonb_build_object('sl', r.sl, 'tp', r.tp)
         where local_id = r.local_id and acct_no = r.acct_no and server = 'fx' and status = 'open';
      end if;
    else
      -- 체결 실패(마진 부족 등) → rejected + 사유 보존 (MT5 동일 — 조용히 안 사라짐)
      update public.fx_pending set status = 'rejected',
             meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('reason', v_res->>'error')
       where local_id = r.local_id and acct_no = r.acct_no;
      v_rejected := v_rejected + 1;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'filled',v_filled,'rejected',v_rejected);
end;$$;
revoke all on function public.fx_pending_fill(int) from public, anon, authenticated;
grant execute on function public.fx_pending_fill(int) to service_role;

-- 6) 통합 스위프 — 에지(초단위)가 한 번에 호출: SL/TP + 대기주문
create or replace function public.fx_sweep_all()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_a jsonb; v_b jsonb;
begin
  v_a := public.fx_sltp();
  v_b := public.fx_pending_fill();
  return jsonb_build_object('ok',true,'sltp',v_a,'pending',v_b);
end;$$;
revoke all on function public.fx_sweep_all() from public, anon, authenticated;
grant execute on function public.fx_sweep_all() to service_role;

-- 7) 크론 폴백 — 매분 (에지가 초단위 주력, 이건 안전망)
select cron.unschedule('fx_pending_fill') where exists (select 1 from cron.job where jobname='fx_pending_fill');
select cron.schedule('fx_pending_fill', '* * * * *', $$ select public.fx_pending_fill(); $$);

-- 8) 확인(읽기 전용):
--   select public.fx_market_open('FX');
--   select local_id, symbol, side, otype, trigger, status from fx_pending order by created_at desc limit 10;
--   select jobname, active from cron.job where jobname in ('fx_pending_fill','fx_sltp');
