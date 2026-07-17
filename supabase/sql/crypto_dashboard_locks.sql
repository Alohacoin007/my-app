-- ═══════════════════════════════════════════════════════════════════════════
-- Alpexa — 크립토 대시보드 활성화 전 잠금 3건 (기획서 5절 / 스펙 §4.11)
-- 2026-07-17 · 사용자(사장님)가 Supabase SQL Editor에서 실행
--
-- 전제(이미 충족 — fidelity 게이트가 정적으로 보증):
--   · 앱(crypto-live.html)의 holdings/stakes 클라 write-back은 제거됨(A5/B).
--   · 대시보드(crypto-dashboard.html)는 SELECT + RPC만 (tests/crypto-dashboard-fidelity.test.js BAN).
--   · 모든 돈 이동 RPC(crypto_trade/swap/stake/unstake/send)는 SECURITY DEFINER
--     → RLS 잠금의 영향을 받지 않는다 (잠가도 거래는 그대로 동작).
--
-- 실행 순서: ① 사전 확인 → ② PART A → ③ PART B → ④ PART C → ⑤ 검증.
-- 문제가 생기면 각 PART의 ROLLBACK 주석으로 즉시 되돌릴 수 있다.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① 사전 확인: 현재 정책 이름 목록 (아래 drop 목록에 없는 write 정책이 보이면
--      그 이름을 drop에 추가하고 나서 진행) ──
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('crypto_holdings','crypto_stakes')
 order by tablename, policyname;

-- ═══ PART A — crypto_holdings: 읽기=본인/어드민 · 쓰기=어드민 전용 ═══
-- (RPC는 SECURITY DEFINER라 계속 쓸 수 있음. 클라 직접 write만 차단.)
do $$ begin
  -- 기존 광역 정책 후보들 제거 (없으면 조용히 통과)
  execute 'drop policy if exists crypto_holdings_rw on public.crypto_holdings';
  execute 'drop policy if exists crypto_holdings_all on public.crypto_holdings';
  execute 'drop policy if exists crypto_holdings_read on public.crypto_holdings';
  execute 'drop policy if exists crypto_holdings_admin_write on public.crypto_holdings';
end $$;
alter table public.crypto_holdings enable row level security;
create policy crypto_holdings_read on public.crypto_holdings
  for select using (public.is_admin() OR public.owns_acct(acct_no));
create policy crypto_holdings_admin_write on public.crypto_holdings
  for all using (public.is_admin()) with check (public.is_admin());
-- ROLLBACK(A): drop policy crypto_holdings_admin_write on public.crypto_holdings;
--              create policy crypto_holdings_rw on public.crypto_holdings
--                for all using (public.is_admin() OR public.owns_acct(acct_no))
--                with check (public.is_admin() OR public.owns_acct(acct_no));

-- ═══ PART B — crypto_stakes: 동일 잠금 ═══
do $$ begin
  execute 'drop policy if exists crypto_stakes_rw on public.crypto_stakes';
  execute 'drop policy if exists crypto_stakes_all on public.crypto_stakes';
  execute 'drop policy if exists crypto_stakes_read on public.crypto_stakes';
  execute 'drop policy if exists crypto_stakes_admin_write on public.crypto_stakes';
end $$;
alter table public.crypto_stakes enable row level security;
create policy crypto_stakes_read on public.crypto_stakes
  for select using (public.is_admin() OR public.owns_acct(acct_no));
create policy crypto_stakes_admin_write on public.crypto_stakes
  for all using (public.is_admin()) with check (public.is_admin());
-- ROLLBACK(B): PART A와 동형.

-- ═══ PART C — 포트폴리오 스냅샷 크론 2건 (차트가 flat인 원인 해소) ═══
-- (snapshot_portfolios()는 portfolio_history.sql/portfolio_total_history.sql에서
--  이미 배포된 SECURITY DEFINER 함수 — 여기선 스케줄만 건다.)
do $$ begin
  if exists (select 1 from cron.job where jobname='portfolio-snapshot-daily') then
    perform cron.unschedule('portfolio-snapshot-daily'); end if;
  if exists (select 1 from cron.job where jobname='portfolio-snapshot-15m') then
    perform cron.unschedule('portfolio-snapshot-15m'); end if;
end $$;
-- 15분마다 총액 스냅샷(라인 부드럽게) — 일일 크론은 15분 크론의 부분집합이라 15m 하나로 충분.
select cron.schedule('portfolio-snapshot-15m', '*/15 * * * *',
                     $$ select public.snapshot_portfolios(); $$);
-- 과거 구간 1회 시드(선택 — 있으면 차트가 과거부터 그려짐):
select public.backfill_portfolio_snapshots();
-- ROLLBACK(C): select cron.unschedule('portfolio-snapshot-15m');

-- ── ⑤ 검증 ──
-- 1) 정책: 아래 결과가 read(select) + admin_write(all) 두 줄씩이어야 한다.
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('crypto_holdings','crypto_stakes')
 order by tablename, policyname;
-- 2) 크론: next_run이 찍혀야 한다.
select jobname, schedule, active from cron.job where jobname like 'portfolio-%';
-- 3) 스냅샷 즉시 1회 + 차트 데이터 확인:
select public.snapshot_portfolios();
select public.get_portfolio_total_history('1D');
-- 4) (앱/대시보드에서) 로그인 → 매수 $1 → 성공해야 정상 (RPC는 잠금 영향 없음).
--    실패 시 위 ROLLBACK 주석 실행 후 보고.
