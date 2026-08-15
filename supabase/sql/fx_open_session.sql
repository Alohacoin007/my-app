-- Alpexa — fx_open v3 CONSOLIDATED (세션 게이트 + 마진 + 레버리지 클램프 + 슬리피지)
-- ============================================================================
-- SUPERSEDES fx_open_slippage.sql (v2). fx_open_margin.sql의 fx_ccy_to_usd / fx_notional_usd /
-- fx_lev_cap을 재사용하므로 그 파일이 먼저 배포돼 있어야 한다 (이미 라이브).
--
-- 세션 게이트 (2026-07-22, 차이감사 #2 → 사장님 "고고"): 클라 게이트(webtrade marketOpen ·
-- 터미널 fxMarketOpen)는 표시용일 뿐 — 서버가 진짜 관문(CLAUDE.md #5). 장 닫힌 심볼의 주문은
-- 여기서 거절된다(주말 동결가 체결 구멍 폐쇄). 자산군은 심볼 목록 이중화 없이 fx_specs.cls
-- (서버의 진실)로 판정. 캘린더는 클라와 락스텝 — tests/fx-session-gate.test.js가 2주 전수 대조.
-- 세션(뉴욕 현지시각): CRYPTO 24/7 · FX 일 17:00 ET → 금 17:00 ET ·
--                     STOCK/INDEX 월–금 09:30–16:00 ET (반일 13:00) − 미 휴일.
-- 배포: 이 파일 전체 1회 실행 (fx_open 교체는 재실행 안전).
-- ============================================================================

-- 1) 미국 휴일 (매년 연장 — 클라 US_MARKET_HOLIDAYS/FX_US_HOLIDAYS 셋과 락스텝)
create or replace function public.fx_is_us_holiday(p_day date)
returns boolean language sql immutable as $$
  select p_day in (
    date '2026-01-01', date '2026-01-19', date '2026-02-16', date '2026-04-03', date '2026-05-25',
    date '2026-06-19', date '2026-07-03', date '2026-09-07', date '2026-11-26', date '2026-12-25',
    date '2027-01-01'
  );
$$;

-- 1b) 미국 증시 조기폐장일 = 13:00 ET 마감 (추수감사절 다음날 · 크리스마스이브).
-- 없으면 그날 13:00~16:00 ET 세 시간 동안 **장은 닫혔는데 우리는 열려 있다** = 정지가 차익거래.
-- 휴일 목록과 같은 창(2027-01-01)까지만 채워져 있다 — 매년 같이 연장할 것.
create or replace function public.fx_is_us_half_day(p_day date)
returns boolean language sql immutable as $$
  select p_day in (date '2026-11-27', date '2026-12-24');
$$;

-- 2) 자산군(fx_specs.cls) 기준 세션 판정.
--
-- ⚠️ 경계는 **UTC 고정 시각이 아니라 뉴욕 현지시각**에 붙어 있다 (2026-08-15 사장님 지적으로 교체).
--   구버전은 주식 13:30–20:00 UTC · FX 22:00 UTC 로 박혀 있었다. 그건 각각 EDT·EST **한 계절
--   전용 값**이라 1년 내내 둘 중 하나가 틀렸다:
--     · 겨울 13:30–14:30 UTC — 미장 개장 전인데 거래 허용 → 정지가 차익거래(세션 게이트의 존재 이유)
--     · 겨울 20:00–21:00 UTC — 장중인데 거절 → 정상 고객 차단
--     · 여름 금 21:00–22:00 UTC — FX 주간 마감(NY 17:00) 후인데 열어둠
--   실제 브로커(MT5)는 서버시간을 GMT+2/+3 로 두어 경계가 NY 17:00 에 고정되게 한다 — 같은 규율.
--   그래서 여기서는 `at time zone 'America/New_York'` 로 벽시계를 뽑고 ET 로 판정한다.
--   → 네임드 타임존 변환은 IMMUTABLE 이 아니므로 volatility 는 **stable**. (immutable 로 두면
--     플랜 캐싱이 굳은 값을 재사용할 수 있다.)
--   클라 3종(webtrade·terminal·모바일)과 tests/fx-session-gate.test.js 가 DST 전환주까지 전수 대조.
--
-- 구 DRAFT(fx_market_open(p_symbol,…)·fx_symbol_class)가 배포돼 있으면 파라미터명 변경 불가(42P13) → 먼저 제거
drop function if exists public.fx_market_open(text, timestamptz);
drop function if exists public.fx_symbol_class(text);
create or replace function public.fx_market_open(p_cls text, p_at timestamptz default now())
returns boolean language plpgsql stable as $$
declare
  v_et  timestamp := p_at at time zone 'America/New_York';   -- 뉴욕 벽시계 (DST 자동 반영)
  v_day date := v_et::date;
  v_dow int := extract(dow from v_et);                       -- 0=일 … 6=토
  v_min int := extract(hour from v_et)*60 + extract(minute from v_et);
begin
  if upper(coalesce(p_cls,'')) = 'CRYPTO' then
    return true;                                             -- 24/7
  elsif upper(p_cls) = 'FX' then
    if v_dow = 6 then return false; end if;                  -- 토 휴장
    if v_dow = 0 then return v_min >= 17*60; end if;         -- 일 17:00 ET 개장
    if v_dow = 5 then return v_min <  17*60; end if;         -- 금 17:00 ET 폐장
    return true;                                             -- 월–목
  else                                                       -- STOCK / INDEX
    if v_dow = 0 or v_dow = 6 then return false; end if;
    if public.fx_is_us_holiday(v_day) then return false; end if;
    return v_min >= 9*60+30
       and v_min <  (case when public.fx_is_us_half_day(v_day) then 13*60 else 16*60 end);
  end if;
end;
$$;

-- 3) fx_open v3 — v2(슬리피지) 전체 + 세션 게이트 한 줄. 시그니처 동일(클라 무변경).
create or replace function public.fx_open(
  p_local_id text, p_symbol text, p_side text, p_size numeric,
  p_leverage numeric default null,
  p_requested_price numeric default null,
  p_max_slippage numeric default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_acct text; v_cust text; v_cls text;
  v_mid numeric; v_pts timestamptz; v_open numeric; v_side text;
  v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0;
  v_bal numeric; v_cap numeric; v_lev numeric; v_notional numeric; v_new_margin numeric; v_used numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_size is null or p_size <= 0 then return jsonb_build_object('ok',false,'error','bad size'); end if;
  v_side := upper(coalesce(p_side,''));
  if v_side not in ('BUY','SELL') then return jsonb_build_object('ok',false,'error','bad side'); end if;

  select a.acct_no, pl.cust_id into v_acct, v_cust
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid
   limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;

  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||p_symbol); end if;

  -- ── SESSION GATE (v3): 장 닫힘 = 즉시 거절. 클라 게이트는 표시용, 여기가 진짜 관문 ──
  if not public.fx_market_open(v_cls) then
    return jsonb_build_object('ok',false,'error','market closed','code','MARKET_CLOSED','symbol',p_symbol);
  end if;
  -- ────────────────────────────────────────────────────────────────────────

  -- SERVER entry price + freshness
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_symbol); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  -- SPREAD ON FILL (FX only): BUY fills at ASK (mid+half), SELL at BID (mid-half).
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

  -- idempotent: same local_id never opens twice (a retry returns the original fill).
  if exists (select 1 from public.positions where local_id = p_local_id and acct_no = v_acct and server = 'fx') then
    select open_price into v_open from public.positions where local_id = p_local_id and acct_no = v_acct and server = 'fx' limit 1;
    return jsonb_build_object('ok',true,'duplicate',true,'open',v_open);
  end if;

  -- ── SLIPPAGE GUARD: 불리한 이탈만 거절(유리한 가격은 항상 체결) ──
  if p_requested_price is not null and p_max_slippage is not null and p_max_slippage >= 0 then
    if (v_side = 'BUY'  and v_open > p_requested_price + p_max_slippage)
    or (v_side = 'SELL' and v_open < p_requested_price - p_max_slippage) then
      return jsonb_build_object('ok',false,'error','slippage exceeded','code','SLIPPAGE',
        'requested', round(p_requested_price,6), 'server', round(v_open,6),
        'max', p_max_slippage, 'side', v_side);
    end if;
  end if;

  -- ── MARGIN GATE with CLAMPED client leverage ──
  v_cap := public.fx_lev_cap(v_cls);
  v_lev := least(v_cap, greatest(1, coalesce(p_leverage, v_cap)));
  select balance into v_bal from public.accounts where acct_no = v_acct;
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
   where po.acct_no = v_acct and po.server = 'fx' and po.status = 'open';
  if coalesce(v_bal,0) < v_used + v_new_margin - 0.000001 then
    return jsonb_build_object('ok',false,'error','insufficient margin','code','MARGIN',
      'required', round(v_new_margin,2), 'free', round(coalesce(v_bal,0) - v_used, 2), 'leverage', v_lev);
  end if;

  insert into public.positions(cust_id, acct_no, server, kind, local_id, symbol, side, size, open_price, pnl, status)
    values (v_cust, v_acct, 'fx', 'position', p_local_id, p_symbol, v_side, p_size, round(v_open::numeric,8), 0, 'open');

  return jsonb_build_object('ok',true,'open',round(v_open,6),'symbol',p_symbol,'side',v_side,'size',p_size,
                            'margin',round(v_new_margin,2),'leverage',v_lev);
end;$$;

-- 4) 확인(읽기 전용):
--   select public.fx_market_open('FX'),  public.fx_market_open('CRYPTO'), public.fx_market_open('STOCK');
--   select public.fx_market_open('FX', '2026-07-25 12:00Z');   -- 토요일 → false
--   select public.fx_market_open('FX', '2026-07-20 12:00Z');   -- 월요일 → true
