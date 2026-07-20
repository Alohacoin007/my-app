-- Alpexa — FX 스왑 엔진 (2026-07-19 사장님 지시 "스왑도 앱이랑 같이 셋팅").
-- ============================================================================
-- 불변식: 앱/터미널에 표시되는 스왑 == 청산 시 실제 정산되는 스왑.
--   진실은 positions.meta.swap 한 곳 — 야간 크론이 적립하고, fx_close가 그 값을
--   실현손익에 포함해 settlements로 지급(잔고 반영은 기존 트리거 경로 그대로).
-- 멱등: meta.swap_date 날짜 스탬프 — 크론이 하루에 몇 번 돌아도 적립은 1회.
-- fail-safe: 환산 가격 없으면 그 포지션 스킵(적립 0 — 돈은 추측으로 안 움직임).
-- MT5 표준: 롤오버=뉴욕 17시(21:00 UTC, 크론 21:05), FX 주말 무스왑 + 수요일 3배.
-- 레이트 = 터미널 dev/fx-terminal.html SWAP_PIPS와 동일 값(락스텝) · 핍/夜 · [롱, 숏].
-- 배포: 사장님이 SQL 에디터에서 실행. 이 파일 전체 1회 붙여넣기.
-- ============================================================================

-- 1) 심볼별 스왑 레이트 (핍/夜)
alter table public.fx_specs add column if not exists swap_long_pts  numeric not null default -0.50;
alter table public.fx_specs add column if not exists swap_short_pts numeric not null default -0.30;
update public.fx_specs set swap_long_pts = v.l, swap_short_pts = v.s
from (values
  ('EURUSD',-0.62, 0.21),('GBPUSD',-0.42,-0.05),('USDJPY', 0.55,-1.31),('AUDUSD',-0.35,-0.11),
  ('USDCAD', 0.12,-0.60),('USDCHF', 0.68,-1.42),('NZDUSD',-0.28,-0.18),('GBPJPY', 0.85,-1.95),
  ('AUDJPY', 0.42,-1.10),('EURJPY', 0.30,-1.25)
) as v(sym,l,s) where fx_specs.symbol = v.sym;

-- 2) 야간 적립 — service_role 전용(크론). 열려 있는 FX 포지션에 하루 1회.
create or replace function public.fx_swap_accrue()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r record; v_today text := to_char(now() at time zone 'utc','YYYY-MM-DD');
  v_dow int := extract(isodow from (now() at time zone 'utc'));   -- 1=월 … 7=일 (21:05 UTC 실행 기준)
  v_mult numeric; v_rate numeric; v_pip numeric; v_qusd numeric; v_amt numeric; v_n int := 0;
begin
  if v_dow in (6,7) then return jsonb_build_object('ok',true,'skipped','weekend'); end if;   -- FX 주말 무스왑
  v_mult := case when v_dow = 3 then 3 else 1 end;                                           -- 수요일 = 3배(주말분)
  for r in select p.id, p.symbol, p.side, p.size, p.meta, s.cls, s.swap_long_pts, s.swap_short_pts
             from public.positions p join public.fx_specs s on s.symbol = p.symbol
            where p.server = 'fx' and p.status = 'open' and s.cls = 'FX'
  loop
    if coalesce(r.meta->>'swap_date','') = v_today then continue; end if;                    -- 멱등: 하루 1회
    v_rate := case when upper(r.side) = 'BUY' then r.swap_long_pts else r.swap_short_pts end;
    v_pip  := case when r.symbol like '%JPY' then 0.01
                   when r.symbol = 'XAUUSD' then 0.01
                   when r.symbol = 'XAGUSD' then 0.001 else 0.0001 end;                      -- fx-prices pip 락스텝
    v_qusd := public.fx_ccy_to_usd(substr(r.symbol,4,3));
    if v_qusd is null then continue; end if;                                                 -- 환산가 없으면 스킵(fail-safe)
    v_amt := round(v_mult * r.size * v_rate * v_pip * 100000 * v_qusd, 2);
    update public.positions
       set meta = coalesce(meta,'{}'::jsonb)
                  || jsonb_build_object('swap', round(coalesce((meta->>'swap')::numeric,0) + v_amt, 2),
                                        'swap_date', v_today)
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok',true,'accrued',v_n,'mult',v_mult);
end;$$;
revoke all on function public.fx_swap_accrue() from public, anon, authenticated;
grant execute on function public.fx_swap_accrue() to service_role;

-- 3) 크론 — 매일 21:05 UTC (뉴욕 17:05 롤오버 직후)
select cron.unschedule('fx-swap-nightly') where exists (select 1 from cron.job where jobname='fx-swap-nightly');
select cron.schedule('fx-swap-nightly','5 21 * * *', $$ select public.fx_swap_accrue(); $$);

-- 4) 확인(읽기 전용):  select public.fx_swap_accrue();  -- 주말이면 skipped, 평일이면 accrued N
--    select symbol, side, size, meta->>'swap' as swap, meta->>'swap_date' from positions where server='fx' and status='open';

-- ── 2026-07-20 추가 (사장님 "청산은 초단위로"): 펌프 Edge(fx-stream·crypto-prices)가
--    service_role로 fx_sltp를 직접 호출할 수 있게 실행 권한 부여. 1분 pg_cron은 폴백으로 유지.
grant execute on function public.fx_sltp(int) to service_role;
