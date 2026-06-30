-- 스포츠 일일 마스터 감사 — 운영 데이터 점검 (스펙: 스포츠-마스터-감사.md C1~C9).
--
-- run_sports_audit(): 매일 한 번 돌려 "오늘 운영 데이터가 멀쩡했나"를 본다. 결과 1행을
-- audit_reports에 기록하고 리포트 JSON을 반환. 각 체크는 BEGIN/EXCEPTION으로 감싸서
-- 컬럼/테이블 이름이 실제 스키마와 다르면 그 체크만 'error'로 표시하고 나머지는 계속 돈다
-- (스펙 "처음 1회 컬럼명 대조"). 돈을 움직이지 않음 — 읽기/기록 전용.
--
-- 배포: SQL 에디터에서 실행(사용자). 그다음 Edge `sports-audit` + pg_cron 연결.

create table if not exists public.audit_reports (
  id      bigint generated always as identity primary key,
  ran_at  timestamptz not null default now(),
  verdict text not null,            -- 'green' | 'yellow' | 'red'
  red     int  not null default 0,
  yellow  int  not null default 0,
  report  jsonb not null
);
alter table public.audit_reports enable row level security;
-- 백오피스(admin)만 읽기. 쓰기는 SECURITY DEFINER 함수/service_role만.
drop policy if exists audit_admin_read on public.audit_reports;
do $$ begin
  if exists (select 1 from pg_proc where proname='is_admin') then
    execute 'create policy audit_admin_read on public.audit_reports for select using (public.is_admin())';
  end if;
exception when others then null; end $$;

create or replace function public.run_sports_audit()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rep jsonb := '{}'::jsonb;
  red int := 0; yel int := 0; v int; v2 int;
  verdict text;
begin
  -- C1 · 묵은 미정산 (경기 끝났는데 open 36h+) 🔴
  begin
    select count(*) into v from public.positions
      where server='sports' and status='open' and created_at < now() - interval '36 hours';
    rep := rep || jsonb_build_object('C1', jsonb_build_object('label','묵은 미정산','sev', case when v>0 then 'red' else 'green' end,'count',v));
    if v>0 then red := red+1; end if;
  exception when others then rep := rep || jsonb_build_object('C1', jsonb_build_object('label','묵은 미정산','sev','error','count',0,'err',SQLERRM)); end;

  -- C2 · 이중지급/이중차감 (멱등 ref 중복) 🔴🚨
  begin
    select count(*) into v from (
      select ref from public.ledger
       where server='sports' and ref like any (array['betpay-%','betstake-%','xfer-%','fix-%'])
       group by ref having count(*) > 1) q;
    rep := rep || jsonb_build_object('C2', jsonb_build_object('label','이중지급/차감','sev', case when v>0 then 'red' else 'green' end,'count',v));
    if v>0 then red := red+1; end if;
  exception when others then rep := rep || jsonb_build_object('C2', jsonb_build_object('label','이중지급/차감','sev','error','count',0,'err',SQLERRM)); end;

  -- C3 · 스테이크 차감 누락 (공짜 베팅) 🔴🚨  (positions + settlements 양쪽)
  begin
    select count(*) into v from public.positions p
      where p.server='sports'
        and not exists (select 1 from public.ledger l where l.ref = 'betstake-'||p.local_id);
    select count(*) into v2 from public.settlements s
      where s.server='sports'
        and not exists (select 1 from public.ledger l where l.ref = 'betstake-'||s.local_id);
    rep := rep || jsonb_build_object('C3', jsonb_build_object('label','차감 누락','sev', case when (v+v2)>0 then 'red' else 'green' end,'count',v+v2));
    if (v+v2)>0 then red := red+1; end if;
  exception when others then rep := rep || jsonb_build_object('C3', jsonb_build_object('label','차감 누락','sev','error','count',0,'err',SQLERRM)); end;

  -- C4 · 잔고 불변식 (balance == opening + Σledger) 🔴🚨
  begin
    select count(*) into v from (
      select a.acct_no
        from public.accounts a
        left join public.ledger l on l.acct_no = a.acct_no
       where a.server='sports'
       group by a.acct_no, a.balance, a.opening_balance
      having a.balance <> a.opening_balance + coalesce(sum(l.amount),0)) q;
    rep := rep || jsonb_build_object('C4', jsonb_build_object('label','잔고 불변식','sev', case when v>0 then 'red' else 'green' end,'count',v));
    if v>0 then red := red+1; end if;
  exception when others then rep := rep || jsonb_build_object('C4', jsonb_build_object('label','잔고 불변식','sev','error','count',0,'err',SQLERRM)); end;

  -- C5 · 정산 부호 오류 (이긴게 -pnl / 진게 +pnl) 🔴
  begin
    select count(*) into v from public.settlements
      where server='sports' and ((kind='bet_won' and pnl < 0) or (kind='bet_lost' and pnl > 0));
    rep := rep || jsonb_build_object('C5', jsonb_build_object('label','정산 부호','sev', case when v>0 then 'red' else 'green' end,'count',v));
    if v>0 then red := red+1; end if;
  exception when others then rep := rep || jsonb_build_object('C5', jsonb_build_object('label','정산 부호','sev','error','count',0,'err',SQLERRM)); end;

  -- C6 · phantom 델타 누수 (예상 못 한 kind가 잔고 움직임) 🟡→🔴
  begin
    select count(*) into v from (
      select 1 from public.ledger
       where server='sports' and kind not in ('bet','bet_won','bet_lost','bet_cashout','bet_void','deposit','withdraw','withdraw_hold','transfer','bonus','adjust','admin_adjust')
       group by cust_id, kind) q;
    rep := rep || jsonb_build_object('C6', jsonb_build_object('label','델타 누수','sev', case when v>0 then 'yellow' else 'green' end,'count',v));
    if v>0 then yel := yel+1; end if;
  exception when others then rep := rep || jsonb_build_object('C6', jsonb_build_object('label','델타 누수','sev','error','count',0,'err',SQLERRM)); end;

  -- C7 · 오즈 신선도 (15분+ 스테일) 🟡
  begin
    select count(*) into v from public.sports_odds where updated_at < now() - interval '15 minutes';
    rep := rep || jsonb_build_object('C7', jsonb_build_object('label','오즈 신선도','sev', case when v>0 then 'yellow' else 'green' end,'count',v));
    if v>0 then yel := yel+1; end if;
  exception when others then rep := rep || jsonb_build_object('C7', jsonb_build_object('label','오즈 신선도','sev','error','count',0,'err',SQLERRM)); end;

  -- C8 · 라이브 일정/점수 신선도 (5분+ 멈춤) 🟡
  begin
    select case when max(updated_at) < now() - interval '5 minutes' then 1 else 0 end into v
      from public.live_games where id='all';
    rep := rep || jsonb_build_object('C8', jsonb_build_object('label','일정 신선도','sev', case when coalesce(v,0)>0 then 'yellow' else 'green' end,'count',coalesce(v,0)));
    if coalesce(v,0)>0 then yel := yel+1; end if;
  exception when others then rep := rep || jsonb_build_object('C8', jsonb_build_object('label','일정 신선도','sev','error','count',0,'err',SQLERRM)); end;

  -- C9 · SGP 헤어컷 (정밀 검증은 수동/판단 — 여기선 최근 당첨 표본 수만 기록) 🟡(정보)
  begin
    select count(*) into v from (
      select 1 from public.settlements where server='sports' and kind='bet_won'
       order by created_at desc limit 50) q;
    rep := rep || jsonb_build_object('C9', jsonb_build_object('label','SGP 표본','sev','green','count',v,'note','정밀 헤어컷 검증은 §2 수동'));
  exception when others then rep := rep || jsonb_build_object('C9', jsonb_build_object('label','SGP 표본','sev','error','count',0,'err',SQLERRM)); end;

  verdict := case when red>0 then 'red' when yel>0 then 'yellow' else 'green' end;
  insert into public.audit_reports(verdict, red, yellow, report) values (verdict, red, yel, rep);
  return jsonb_build_object('ok',true,'verdict',verdict,'red',red,'yellow',yel,'report',rep);
end $$;

revoke all on function public.run_sports_audit() from public, anon, authenticated;
grant execute on function public.run_sports_audit() to service_role;

-- 직접 한 번 돌려보기 (첫 1회 컬럼 대조):  select public.run_sports_audit();
--   → report에 "sev":"error" 가 있으면 그 체크의 컬럼명을 실제 스키마와 맞춰야 함(err 메시지 참고).
