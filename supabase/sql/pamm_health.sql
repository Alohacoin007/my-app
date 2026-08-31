-- Alpexa — PAMM 건전성 리포트 (읽기 전용 감시용)
-- ============================================================================
-- 왜 만드나 (2026-08-23): 사장님이 "PAMM 포지션 다 닫혔어?"라고 물어봐서야 펀드에
-- EURUSD 8.1랏이 **17일째 열려 있다**는 걸 알았다. 3시간 감시(daily-selfcheck)는
-- 스포츠 미청산만 보고 PAMM 은 아무도 안 보고 있었다 — 2026-08-19 블랙아웃과 똑같은
-- "조용한 쪽" 구조다. 그때 교훈: **화면에 안 보이는 곳이 진짜 위험한 곳이다.**
--
-- 이 함수가 감시하는 것 (전부 읽기 전용 · 돈 이동 0):
--   ① ghost_positions — **정산 기록이 있는데 positions.status 가 아직 'open'** 인 행.
--      있으면 🔴 돈 문제: 펀드 Equity 에 가짜 플로팅이 섞이고, NAV 가 왜곡되고,
--      join/leave 가 영구히 잠긴다. (2026-08-23 실측에선 0건이었다 — 그 상태를 고정한다.)
--   ② units_ok — 불변식 **pamm_funds.total_units == Σ pamm_members.units**.
--      깨지면 유닛이 허공에서 생겼거나 사라진 것 = 투자자 지분 왜곡.
--   ③ join_leave_locked / oldest_open_days — 열린 포지션이 있으면 pamm_join·pamm_leave
--      가 거절된다(P3 롤오버 게이트, 설계된 동작). 고객이 못 들어오고 못 나가는 상태가
--      며칠째인지 사람이 알아야 한다. 이건 결함이 아니라 **운영 사실**이라 경고만.
--   ④ nav vs nav_trade — 표시용 NAV(Equity 기준)와 거래용 NAV(잔고 기준)의 차이.
--      플로팅이 있는 동안만 벌어지고, 그 동안은 join/leave 가 막혀 있어 안전하다.
--      둘이 벌어졌는데 잠기지 않았다면 그게 사고다.
--   ⑤ unpriced_positions / priced — **"계산 불가"와 "손익 0"은 다른 값이다** (2026-08-30).
--      `fx_realized_pnl` 은 시세가 120초 넘게 늙으면 null 을 준다(스테일로 청산 안 하려는
--      옳은 설계). 예전엔 이 함수가 그 null 을 **0 으로 접어서**, 주말마다 84% 물린 펀드가
--      `플로팅 0% · NAV 1.0` = 멀쩡한 것처럼 보였다. 감시 도구가 감시 대상과 똑같이 눈이
--      멀어 있었던 셈이다. 이제 하나라도 미가격이면 float_pct·nav 는 **null** 을 돌려주고
--      몇 건이 미가격인지 함께 알린다. 돈에서 0 은 "안전"으로 읽히므로, 모를 때 0 을 주는
--      fail-open 은 **가장 위험한 방향으로** 거짓말한다. 잔고 기반 nav_trade 는 항상 유효.
--
-- 🔒 노출 정책: **절대 금액(잔고·Equity)은 반환하지 않는다.** anon 키로 호출되므로
--    비율(float_pct)·NAV·건수만 내보낸다. 고객 식별자(cust_id·이메일)도 없다.
--    투자자 명부·개별 포지션은 기존 pamm_desk_report(인증 필요)가 담당한다.
--
-- 배포: Supabase SQL Editor 에서 이 파일 전체 실행. 되돌리기 = drop function 한 줄.
-- ============================================================================

create or replace function public.pamm_health()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'ok', true,
    'at', now(),
    'funds', coalesce(jsonb_agg(to_jsonb(x) order by x.fund_acct), '[]'::jsonb)
  )
  from (
    select
      f.fund_acct,
      f.name,
      f.status,
      f.total_units,
      p.n                                        as open_positions,
      p.lots                                     as open_lots,
      p.oldest_days                              as oldest_open_days,
      p.ghosts                                   as ghost_positions,
      p.unpriced                                 as unpriced_positions,
      (p.unpriced = 0)                           as priced,
      (p.n > 0)                                  as join_leave_locked,
      -- 플로팅 비중(%) — 절대 금액 대신. **모르면 null** (0 이 아니다 — 아래 ⑤ 참조).
      case when p.flt is null then null
           when (coalesce(a.balance,0) + p.flt) <> 0
             then round(p.flt / (coalesce(a.balance,0) + p.flt) * 100, 2)
           else 0 end                            as float_pct,
      -- 표시용 NAV = Equity / units (플로팅 반영, pamm_desk_report 와 동일 정의)
      case when p.flt is null then null
           when f.total_units > 0
             then round((coalesce(a.balance,0) + p.flt) / f.total_units, 6) end as nav,
      -- 거래용 NAV = 잔고 / units (pamm_nav 와 동일 — join/leave 가 쓰는 값)
      case when f.total_units > 0
           then round(coalesce(a.balance,0) / f.total_units, 6) end          as nav_trade,
      m.members,
      round(coalesce(m.units_sum, 0), 6)         as members_units,
      (abs(f.total_units - coalesce(m.units_sum, 0)) < 0.000001) as units_ok
    from pamm_funds f
    join accounts a on a.acct_no = f.fund_acct
    cross join lateral (
      select
        count(*)                                                    as n,
        coalesce(sum(q.size), 0)                                    as lots,
        count(*) filter (
          where public.fx_realized_pnl(q.symbol, q.side, q.open_price, q.size) is null) as unpriced,
        -- 플로팅 = 실시간 mid 마크 + 적립 스왑. stop-out 엔진·데스크와 **같은 함수**를 쓴다
        -- (다른 계산식을 새로 만들면 화면과 감시가 어긋난다).
        -- 진실 규칙: 0건 → 0 · 하나라도 미가격 → null(모름) · 전부 가격 있음 → 합계.
        case when count(*) = 0 then 0
             when count(*) filter (
                    where public.fx_realized_pnl(q.symbol, q.side, q.open_price, q.size) is null) > 0 then null
             else sum(public.fx_realized_pnl(q.symbol, q.side, q.open_price, q.size)
                      + coalesce((q.meta->>'swap')::numeric, 0)) end          as flt,
        -- ⚠️ positions 에는 created_at 이 없다. updated_at 을 개시 시각의 근사로 쓴다
        --    (클라가 pnl-only UPDATE 를 하면 갱신될 수 있어 실제보다 짧게 나올 수 있다 —
        --     즉 이 값은 **보수적**이다: 길게 나오면 진짜로 오래된 것).
        coalesce(max(extract(epoch from (now() - q.updated_at)) / 86400), 0)::int as oldest_days,
        -- 유령 행: 같은 local_id 로 이미 정산 기록이 있는데 아직 open
        count(*) filter (
          where exists (select 1 from settlements s
                         where s.local_id = q.local_id and s.acct_no = q.acct_no)) as ghosts
      from positions q
      where q.acct_no = f.fund_acct and q.server = 'fx' and q.status = 'open'
    ) p
    cross join lateral (
      select count(*) filter (where mm.units > 0) as members,
             sum(mm.units)                        as units_sum
        from pamm_members mm where mm.fund_acct = f.fund_acct
    ) m
  ) x;
$$;

comment on function public.pamm_health() is
  'PAMM 펀드 건전성 (읽기 전용 감시). 유령 open 행·유닛 불변식·롤오버 잠김·NAV 이중값을 본다. 절대 금액과 고객 식별자는 반환하지 않는다.';

-- 감시 스크립트(anon 키)가 호출해야 하므로 실행 권한을 연다. 읽기 전용·집계·무 PII.
revoke all on function public.pamm_health() from public;
grant execute on function public.pamm_health() to anon, authenticated, service_role;

-- 확인용 (배포 직후 한 번 돌려보세요):
--   select jsonb_pretty(public.pamm_health());
--
-- 되돌리기:
--   drop function if exists public.pamm_health();
