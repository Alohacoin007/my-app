-- ═══════════════════════════════════════════════════════════════════════════════
-- 스포츠북 데스크 (sportsbook-desk.html) — Phase 1 읽기 전용 리포트 RPC
--
-- 원칙: 돈 안 움직임(SELECT만). is_admin() 게이트 — 어드민 JWT로만 호출 가능.
--   • 기존 sports_liability()/sports_pnl() 재사용 + 데스크 위젯용 집계 추가.
--   • positions는 정산 시 삭제(claim)되므로 "열린 티켓"의 유일 소스, 이력은 settlements.
--   • 새 시크릿/Edge 없음 — 데스크는 어드민 로그인(manager와 동일 체계) 후 이 RPC 하나.
--
-- 배포: Supabase SQL 에디터에서 이 파일 전체 실행 (사용자).
-- 확인: 어드민 세션에서  select public.sbdesk_report(7);
--       비어드민 세션 →  {"ok":false,"error":"not admin"}  이어야 정상.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.sbdesk_report(p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_liab jsonb; v_pnl jsonb; v_pnl_daily jsonb; v_open jsonb; v_settled jsonb;
  v_queue jsonb; v_cust jsonb; v_audit jsonb; v_today jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;

  -- ① 노출 매트릭스 + ② 기간 P&L (기존 사령탑 RPC 재사용 — 정의 중복 금지)
  v_liab := public.sports_liability();
  v_pnl  := public.sports_pnl(now() - make_interval(days => greatest(1,p_days)), now());

  -- ②b 오늘(UTC 아닌 서버 기준 24h) 정산 손익 — 전광판 "오늘 얼마 벌었나"
  select jsonb_build_object(
      'handle',  round(coalesce(-sum(amount) filter (where kind='bet'),0),2),
      'payouts', round(coalesce( sum(amount) filter (where kind='bet_won'),0),2))
    into v_today
    from public.ledger
   where server='sports' and kind in ('bet','bet_won') and created_at >= now() - interval '24 hours';

  -- ③ 일별 P&L (막대차트) — 최근 p_days일, 날짜별 handle/payouts/ggr
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', d.day, 'handle', d.handle, 'payouts', d.payouts,
           'ggr', round(d.handle - d.payouts,2)) order by d.day), '[]'::jsonb)
    into v_pnl_daily
    from (
      select date_trunc('day', created_at)::date as day,
             round(coalesce(-sum(amount) filter (where kind='bet'),0),2)     as handle,
             round(coalesce( sum(amount) filter (where kind='bet_won'),0),2) as payouts
        from public.ledger
       where server='sports' and kind in ('bet','bet_won')
         and created_at >= now() - make_interval(days => greatest(1,p_days))
       group by 1
    ) d;

  -- ④ 베팅 티커 — 열린 티켓 전수 (최신순). legs는 meta에서 그대로.
  select coalesce(jsonb_agg(t order by t->>'created_at' desc), '[]'::jsonb) into v_open
    from (
      select jsonb_build_object(
        'local_id', p.local_id, 'ticket', coalesce(p.meta->>'ticket',''),
        'cust_id', p.cust_id, 'type', coalesce(p.symbol,'Bet'), 'game', coalesce(p.game,''),
        'pick', coalesce(p.pick,''), 'odds', p.odds,
        'stake', round(coalesce(p.stake,0),2), 'potential', round(coalesce(p.potential,0),2),
        'legs', coalesce(p.meta->'legs','[]'::jsonb), 'created_at', p.created_at) as t
      from public.positions p
     where p.server='sports' and p.status='open'
    ) s;

  -- ⑤ 최근 정산 이력 (티커 하단 / 정산 로그)
  select coalesce(jsonb_agg(t order by t->>'created_at' desc), '[]'::jsonb) into v_settled
    from (
      select jsonb_build_object(
        'kind', s.kind, 'ticket', coalesce(s.ticket,''), 'symbol', coalesce(s.symbol,'Bet'),
        'cust_id', s.cust_id, 'stake', round(coalesce(s.stake,0),2),
        'pnl', round(coalesce(s.pnl,0),2), 'created_at', s.created_at) as t
      from public.settlements s
     where s.server='sports'
     order by s.created_at desc limit 40
    ) s;

  -- ⑥ 정산 큐(근사) — 전 leg 킥오프가 3시간 이상 지났는데 아직 열린 티켓.
  --    kt 없는 옛 티켓은 36시간 초과로 근사(approx=true). 실행은 sports-settle 몫 — 여긴 조회만.
  select coalesce(jsonb_agg(t order by t->>'last_kick'), '[]'::jsonb) into v_queue
    from (
      select jsonb_build_object(
        'local_id', p.local_id, 'ticket', coalesce(p.meta->>'ticket',''),
        'cust_id', p.cust_id, 'game', coalesce(p.game,''), 'pick', coalesce(p.pick,''),
        'stake', round(coalesce(p.stake,0),2), 'potential', round(coalesce(p.potential,0),2),
        'last_kick', k.last_kick, 'approx', k.last_kick is null, 'created_at', p.created_at) as t
      from public.positions p
      cross join lateral (
        select max(nullif(l->>'kt','')::timestamptz) as last_kick
          from jsonb_array_elements(coalesce(p.meta->'legs','[]'::jsonb)) l
      ) k
     where p.server='sports' and p.status='open'
       and ( (k.last_kick is not null and k.last_kick < now() - interval '3 hours')
          or (k.last_kick is null     and p.created_at < now() - interval '36 hours') )
    ) s;

  -- ⑦ 고객 리스크 — 계정별 오픈 노출 + 정산 전적(승률·순손익 = 하우스 관점) + sharp 플래그
  select coalesce(jsonb_agg(t order by (t->>'open_potential')::numeric desc), '[]'::jsonb) into v_cust
    from (
      select jsonb_build_object(
        'cust_id', c.cust_id,
        'name',  coalesce(pl.name,''), 'email', coalesce(pl.email,''),
        'balance', round(coalesce(a.balance,0),2),
        'open_bets', c.open_bets, 'open_stake', c.open_stake, 'open_potential', c.open_potential,
        'won', coalesce(w.won,0), 'lost', coalesce(w.lost,0),
        'player_net', coalesce(w.player_net,0),                      -- 고객이 딴 순액 (+면 하우스가 짐)
        'sharp', (coalesce(w.won,0)+coalesce(w.lost,0)) >= 5 and coalesce(w.player_net,0) > 0) as t
      from (
        select cust_id, count(*) as open_bets,
               round(sum(coalesce(stake,0)),2) as open_stake,
               round(sum(coalesce(potential,0)),2) as open_potential
          from public.positions where server='sports' and status='open' group by cust_id
      ) c
      left join public.players  pl on pl.cust_id = c.cust_id
      left join public.accounts a  on a.player_id = pl.id and a.server='sports'
      left join lateral (
        select count(*) filter (where s.kind='bet_won')  as won,
               count(*) filter (where s.kind='bet_lost') as lost,
               round(sum(coalesce(s.pnl,0)),2)           as player_net
          from public.settlements s
         where s.server='sports' and s.cust_id = c.cust_id
      ) w on true
    ) s;

  -- ⑧ 최근 감사 결과 (알람 피드 상단)
  select to_jsonb(t) into v_audit
    from (select ran_at, verdict, red, yellow from public.audit_reports order by ran_at desc limit 1) t;

  return jsonb_build_object('ok',true,'as_of',now(),'days',p_days,
    'liability',v_liab,'pnl',v_pnl,'today',v_today,'pnl_daily',v_pnl_daily,
    'open_tickets',v_open,'recent_settlements',v_settled,'settle_queue',v_queue,
    'customers',v_cust,'audit_last',coalesce(v_audit,'null'::jsonb));
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end $$;

-- 게이트: 함수 안 is_admin()이 관문 — authenticated에 줘도 비어드민은 'not admin'만 받는다.
revoke all on function public.sbdesk_report(int) from public, anon;
grant execute on function public.sbdesk_report(int) to authenticated, service_role;
