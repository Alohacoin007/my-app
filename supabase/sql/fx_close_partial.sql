-- Alpexa — fx_close_partial: close PART of the caller's own open FX/CFD position (2026-09-22, 사장님 "4번 부분청산도 진행해")
-- =============================================================================================
-- MT5 "Close By Volume" 상당. fx_close 와 **같은 돈 경로** — settlements 행 1건 insert → trg_settlement_balance 가 잔고 반영.
--
-- 계약:
--   • auth.uid() 본인의 열린 FX 포지션만 (players.auth_id 조인) · FOR UPDATE 행 잠금 — 스탑아웃 크론/SL·TP 집행/전량 청산과 직렬화.
--   • p_size = 청산 수량(0.01 단위). 전량 이상이면 거절(FULL_CLOSE) → fx_close 를 쓴다. 잔여 ≥ 0.01.
--   • p_ref = 클라가 만든 멱등 키(R-…). settlements.local_id 로 기록되고, 같은 p_ref 재호출은 duplicate(돈 0) —
--     더블탭·재시도가 두 번째 슬라이스를 닫지 못하게 **표현 불가능**으로 만든다.
--   • 손익 = public.fx_realized_pnl(sym, side, open, p_size) — fx_close·fx_stopout·fx_modify(SL/TP 집행)와 **같은 함수**
--     (세션·스프레드·계약크기·교차환산 전부 그 안). null(스테일/무가격) 이면 거절. 이 파일엔 손익 수식이 없다.
--   • 스왑: meta.swap 을 수량 비례로 분할 — 청산분은 이번 실현에 포함, 잔여분은 meta.swap 에 남긴다 ("표시되는 스왑 == 정산되는 스왑").
--   • 포지션 행은 같은 local_id·open_price·side 로 남고 size 만 줄어든다 (fx_modify SL/TP, 스탑아웃, 마진 계산, PAMM NAV 는
--     전부 positions.size 를 읽으므로 자동 반영 — grep 확인 2026-09-22: fx_open_margin·fx_pending_engine·fx_stopout·fx_swap·pamm_core).
--   • detail 은 "PARTIAL SIDE size @ open -> close (of total, #pos)" — fx-app/trading/webtrade 히스토리 파서 호환(핀에서 실제 파싱).
--
-- Deploy: Supabase SQL editor 에 파일 통째로 붙여넣기 (수동 — 돈 SQL). Pin: tests/fx-close-partial.test.js.
-- =============================================================================================

create or replace function public.fx_close_partial(p_local_id text, p_size numeric, p_ref text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_pos public.positions%rowtype;
  v_cust text; v_acct text; v_cls text; v_sym text; v_side text; v_open numeric; v_size numeric; v_rest numeric;
  v_mid numeric; v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0; v_close numeric;
  v_pnl numeric; v_swap numeric; v_swap_part numeric; v_swap_rest numeric;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_ref is null or length(p_ref) < 6 then return jsonb_build_object('ok',false,'error','bad ref'); end if;
  if p_size is null or p_size <= 0 then return jsonb_build_object('ok',false,'error','bad size'); end if;
  if p_size <> round(p_size, 2) then return jsonb_build_object('ok',false,'error','size must be in 0.01 steps'); end if;

  -- 멱등: 같은 p_ref 로 이미 정산됐으면 돈 0 으로 duplicate
  if exists (select 1 from public.settlements where local_id = p_ref and server = 'fx') then return jsonb_build_object('ok',true,'duplicate',true,'ref',p_ref); end if;

  -- 본인의 열린 FX 포지션 — 행 잠금 (fx_close 와 자구 동일: 크론/전량청산과 직렬화 → 슬라이스가 정확히 한 번)
  select p.* into v_pos
    from public.positions p
    join public.accounts a on a.acct_no = p.acct_no
    join public.players  pl on pl.id = a.player_id
   where p.local_id = p_local_id and p.server = 'fx' and p.status = 'open'
     and pl.auth_id = auth.uid()
   limit 1
   for update of p;
  if v_pos.local_id is null then return jsonb_build_object('ok',false,'error','position not found or already closed','code','ALREADY_CLOSED'); end if;
  v_acct := v_pos.acct_no; v_sym := v_pos.symbol; v_side := upper(v_pos.side); v_cust := v_pos.cust_id;
  v_open := coalesce(v_pos.open_price,0); v_size := coalesce(v_pos.size,0);

  -- 수량: 전량 이상이면 fx_close 로 (부분청산이 전량청산의 두 번째 경로가 되지 않게) · 잔여 최소 0.01
  if p_size >= v_size - 0.005 then return jsonb_build_object('ok',false,'error','use fx_close for a full close','code','FULL_CLOSE','size',v_size); end if;
  v_rest := round(v_size - p_size, 2);
  if v_rest < 0.01 then return jsonb_build_object('ok',false,'error','remaining size below 0.01'); end if;

  select cls into v_cls from public.fx_specs where symbol = v_sym;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||v_sym); end if;

  -- 세션 게이트 (fx_open/fx_close 와 같은 함수 — 마감 중 청산 불가)
  if not public.fx_market_open(v_cls, now()) then
    return jsonb_build_object('ok',false,'error','Market closed','code','MARKET_CLOSED');
  end if;

  -- 손익 = 단일 진실 함수 (스테일/무가격/환율 없음 → null → 거절)
  v_pnl := public.fx_realized_pnl(v_sym, v_side, v_open, p_size);
  if v_pnl is null then return jsonb_build_object('ok',false,'error','price unavailable (stale)'); end if;

  -- 청산가(표시·detail 용) — fx_realized_pnl 내부와 같은 스프레드 규칙 (돈은 위 v_pnl 이 진실, 이 값은 기록용)
  select mid, coalesce(spr_pts,0) into v_mid, v_spr from public.prices where symbol = v_sym limit 1;
  if v_cls = 'FX' then
    select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = v_sym limit 1;
    v_pip := case when v_sym like '%JPY' then 0.01 when v_sym = 'XAUUSD' then 0.01 when v_sym = 'XAGUSD' then 0.001 else 0.0001 end;
    v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
  else
    v_half := v_mid * greatest((case v_cls when 'CRYPTO' then 10 when 'STOCK' then 8 when 'INDEX' then 6 else 0 end), coalesce(v_spr,0)) / 10000.0 / 2.0;
  end if;
  v_close := v_mid + (case when v_side = 'BUY' then -v_half else v_half end);

  -- 스왑 비례 분할 (청산분 실현 · 잔여분 보존)
  v_swap := coalesce((v_pos.meta->>'swap')::numeric, 0);
  v_swap_part := round(v_swap * p_size / v_size, 2);
  v_swap_rest := round(v_swap - v_swap_part, 2);
  v_pnl := round(v_pnl + v_swap_part, 2);

  -- 포지션 갱신: size 만 감소 (같은 local_id·open_price·side, status open 유지). size = 잠금 시점 값 재확인 = 2차 백스톱.
  update public.positions set size = v_rest, meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('swap', v_swap_rest, 'partials', coalesce((meta->>'partials')::int,0) + 1)
    where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'open' and size = v_size;
  if not found then return jsonb_build_object('ok',true,'duplicate',true); end if;

  -- 돈 이동 = 이 insert 1행 (trg_settlement_balance → accounts.balance). ledger 는 쓰지 않는다(이중 반영).
  insert into public.settlements(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail)
    values (v_cust, v_acct, 'fx', 'fx_close', p_ref, v_sym, p_size, v_pnl,
            'PARTIAL '||v_side||' '||p_size||' @ '||v_open||' -> '||round(v_close,5)||' (of '||v_size||', #'||p_local_id||')');

  return jsonb_build_object('ok',true,'pnl',v_pnl,'close',round(v_close,6),'closed',p_size,'remaining',v_rest,'side',v_side,'symbol',v_sym,'ref',p_ref);
end;$$;
revoke all on function public.fx_close_partial(text,numeric,text) from public, anon;
grant execute on function public.fx_close_partial(text,numeric,text) to authenticated;
