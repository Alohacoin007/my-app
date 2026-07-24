-- ═══════════════════════════════════════════════════════════════════════════════
-- 일일 DB 스냅샷 백업 — 돈 데이터 보호 1층 (2026-07-24)
--
-- 배경(결함-로그 2026-07-24): GitHub daily-backup이 시크릿 미설정 + RLS 잠금으로
-- 3주+ 동안 돈 테이블 0행(빈 백업)을 "성공"으로 올리고 있었다. 게다가 레포가 public이라
-- 제대로 백업했다면 고객 데이터 유출이 됐을 구조. → 데이터는 Supabase 밖으로 안 내보내고
-- 여기(backup 스키마) 안에 스냅샷한다. backup 스키마는 PostgREST 미노출 = API로 접근 불가.
--
-- 지키는 것: 실수 삭제/오염(가장 현실적인 사고 클래스)에서 어제/그제 상태로 복구할 재료.
-- 방식: 매일 09:00 UTC(베가스 새벽 2시) 핵심 테이블을 backup.<t>_YYYYMMDD 로 통째 복사.
--       멱등(같은 날 2번 = 1번 효과) · 14일 보존 · snapshot_log에 행수 기록.
-- 감시: backup_status() (is_admin/service) → 데스크 알람 + GitHub 검증 액션이 신선도 체크.
--
-- 배포: SQL 에디터에서 전체 실행 (사용자). 확인: select public.run_backup_snapshot();
--       → {"ok":true,...} 이어야 하고, select * from backup.snapshot_log; 에 행수가 보인다.
-- 복구(예): create table public.ledger_restore as select * from backup.ledger_20260724;
-- ═══════════════════════════════════════════════════════════════════════════════

create schema if not exists backup;

create table if not exists backup.snapshot_log (
  id bigint generated always as identity primary key,
  day date not null,
  table_name text not null,
  rows bigint not null,
  taken_at timestamptz not null default now(),
  unique(day, table_name)                      -- 멱등: 같은 날 재실행 = 덮지 않고 스킵
);

create or replace function public.run_backup_snapshot()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tables text[] := array['players','accounts','ledger','positions','settlements',
                           'crypto_holdings','requests','payments','pricing','controls','fx_pending'];
  v_t text; v_day text := to_char(now(),'YYYYMMDD');
  v_dst text; v_rows bigint; v_done jsonb := '[]'::jsonb; v_skipped int := 0;
  r record; v_dropped int := 0;
begin
  foreach v_t in array v_tables loop
    begin
      v_dst := v_t || '_' || v_day;
      if to_regclass('backup.' || quote_ident(v_dst)) is not null then
        v_skipped := v_skipped + 1; continue;               -- 오늘 것 이미 있음 (멱등)
      end if;
      if to_regclass('public.' || quote_ident(v_t)) is null then continue; end if;   -- 없는 테이블은 조용히 스킵
      execute format('create table backup.%I as select * from public.%I', v_dst, v_t);
      execute format('select count(*) from backup.%I', v_dst) into v_rows;
      insert into backup.snapshot_log(day, table_name, rows)
        values (current_date, v_t, v_rows) on conflict (day, table_name) do nothing;
      v_done := v_done || jsonb_build_object('table', v_t, 'rows', v_rows);
    exception when others then
      v_done := v_done || jsonb_build_object('table', v_t, 'error', SQLERRM);
    end;
  end loop;

  -- 보존 14일: backup.<t>_YYYYMMDD 중 날짜 지난 것 드랍 (snapshot_log는 이력으로 남김)
  for r in select table_name from information_schema.tables
            where table_schema='backup' and table_name ~ '_[0-9]{8}$' loop
    if to_date(right(r.table_name, 8), 'YYYYMMDD') < current_date - 14 then
      execute format('drop table if exists backup.%I', r.table_name);
      v_dropped := v_dropped + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'day', v_day, 'snapshots', v_done,
                            'skipped_existing', v_skipped, 'dropped_old', v_dropped);
exception when others then return jsonb_build_object('ok', false, 'error', SQLERRM); end $$;

-- 상태 조회 — 데스크 알람 + 검증 액션용. is_admin 또는 service만.
create or replace function public.backup_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_last date; v_age numeric;
begin
  if not (public.is_admin() or current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role') then
    return jsonb_build_object('ok', false, 'error', 'not admin');
  end if;
  select max(day) into v_last from backup.snapshot_log;
  if v_last is null then return jsonb_build_object('ok', true, 'never_ran', true); end if;
  select round(extract(epoch from (now() - max(taken_at)))/3600, 1) into v_age
    from backup.snapshot_log where day = v_last;
  select coalesce(jsonb_object_agg(table_name, rows), '{}'::jsonb) into v
    from backup.snapshot_log where day = v_last;
  return jsonb_build_object('ok', true, 'last_day', v_last, 'age_hours', v_age, 'tables', v,
    'stale', v_age > 30,                                    -- 매일 도는데 30h 넘게 침묵 = 이상
    'money_empty', coalesce((v->>'ledger')::bigint, 0) = 0  -- ledger 0행 스냅샷 = 가짜 백업
  );
exception when others then return jsonb_build_object('ok', false, 'error', SQLERRM); end $$;

revoke all on function public.run_backup_snapshot() from public, anon, authenticated;
grant execute on function public.run_backup_snapshot() to service_role;
revoke all on function public.backup_status() from public, anon;
grant execute on function public.backup_status() to authenticated, service_role;   -- 게이트는 함수 안

-- 매일 09:00 UTC (베가스 새벽 2시) 자동 실행 + 즉시 1회 실행으로 오늘치 생성
select cron.unschedule('daily-backup-snapshot') where exists
  (select 1 from cron.job where jobname='daily-backup-snapshot');
select cron.schedule('daily-backup-snapshot', '0 9 * * *', $$select public.run_backup_snapshot();$$);
select public.run_backup_snapshot();
