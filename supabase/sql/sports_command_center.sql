-- 북오피스 사령탑 — 노출(Liability) + 손익(P&L). 로드맵 P0.
-- 일일 감사(run_sports_audit)가 "데이터 깨졌나"를 본다면, 이건 "우리가 물렸나 / 돈 버나"를 본다.
-- 데이터는 이미 있는 positions / ledger / settlements 로 집계만 한다. 돈 안 움직임(읽기 전용).
-- 배포: SQL 에디터(사용자). 백오피스/일일메일에서 호출.

-- ① 실시간 노출 — 열린 베팅을 (경기 × 픽)으로 집계. "이 픽이 맞으면 우리가 얼마 지급?"
--    net_liability = 그 픽 지급액 − 그 경기에 받은 총 스테이크. (싱글 기준 근사 — 파레이는 첫 leg로.)
create or replace function public.sports_liability()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_total numeric; v_worst numeric;
begin
  with ex as (
    select p.meta->'legs'->0->>'gid'              as gid,
           max(coalesce(p.game,''))               as game,
           p.meta->'legs'->0->>'sel'              as pick,
           count(*)                               as bets,
           round(sum(coalesce(p.stake,0)),2)      as stake,
           round(sum(coalesce(p.potential,0)),2)  as payout_if_wins
      from public.positions p
     where p.server='sports' and p.status='open'
     group by p.meta->'legs'->0->>'gid', p.meta->'legs'->0->>'sel'
  ),
  ev as (  -- 경기별 총 스테이크 (받은 돈)
    select gid, sum(stake) as event_stake from ex group by gid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'gid', ex.gid, 'game', ex.game, 'pick', ex.pick, 'bets', ex.bets,
           'stake', ex.stake, 'payout_if_wins', ex.payout_if_wins,
           'net_liability', round(ex.payout_if_wins - ev.event_stake, 2)
         ) order by ex.payout_if_wins desc), '[]'::jsonb)
    into v
    from ex join ev on ev.gid = ex.gid;

  select coalesce(sum(coalesce(potential,0)),0), coalesce(max(coalesce(potential,0)),0)
    into v_total, v_worst
    from public.positions where server='sports' and status='open';

  return jsonb_build_object('ok',true,'as_of',now(),
    'open_bets',(select count(*) from public.positions where server='sports' and status='open'),
    'total_payout_if_all_win', round(v_total,2),   -- 최악 가정 상한
    'biggest_single_payout', round(v_worst,2),
    'by_event_pick', v);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- ② 손익 — 기간(기본 7일). Handle(총베팅)·Payouts(지급)·GGR·Hold%.
create or replace function public.sports_pnl(p_from timestamptz default now() - interval '7 days',
                                             p_to   timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare handle numeric; payouts numeric; ggr numeric; nbets int; nwon int; nlost int;
begin
  -- Handle = 받은 스테이크 합 = −Σ(kind='bet' amount)  (bet는 음수 차감)
  select coalesce(-sum(amount),0), count(*) into handle, nbets
    from public.ledger where server='sports' and kind='bet' and created_at >= p_from and created_at < p_to;
  -- Payouts = 당첨 지급 합
  select coalesce(sum(amount),0) into payouts
    from public.ledger where server='sports' and kind='bet_won' and created_at >= p_from and created_at < p_to;
  ggr := round(handle - payouts, 2);
  begin
    select count(*) filter (where kind='bet_won'), count(*) filter (where kind='bet_lost')
      into nwon, nlost
      from public.settlements where server='sports' and created_at >= p_from and created_at < p_to;
  exception when others then nwon := null; nlost := null; end;
  return jsonb_build_object('ok',true,'from',p_from,'to',p_to,
    'handle', round(handle,2), 'payouts', round(payouts,2), 'ggr', ggr,
    'hold_pct', case when handle>0 then round(ggr/handle*100,2) else 0 end,
    'bets', nbets, 'won', nwon, 'lost', nlost);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

revoke all on function public.sports_liability()                    from public, anon;
revoke all on function public.sports_pnl(timestamptz, timestamptz)  from public, anon;
-- 백오피스(admin) + 백엔드(service_role)만. is_admin 있으면 authenticated에 줘도 RLS로 막히지만,
-- 안전하게 service_role + (있으면) admin만. 일단 service_role.
grant execute on function public.sports_liability()                   to service_role;
grant execute on function public.sports_pnl(timestamptz, timestamptz) to service_role;

-- 확인:  select public.sports_liability();   select public.sports_pnl();
