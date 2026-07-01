-- portfolio_total_history — REAL moving chart for the "Portfolio overview" (multi-account total).
--
-- The overview total (Crypto + FX + Sports) had no stored value-over-time, so the chart drew a
-- FLAT line (honest — we refuse to fake movement on a money screen, CLAUDE.md #5). This adds the
-- real history: periodic snapshots of each account's value, then a combined series for the chart.
--
-- Reuses the existing public.portfolio_snapshots table + RLS from portfolio_history.sql.
-- Read-only history — moves NO money. A user reads only their own accounts (auth.uid gated).
-- Deploy: SQL editor (USER). Then schedule the cron at the bottom (every ~15 min).

-- ① Snapshot — crypto valued LIVE from prices (holdings×mid + stakes), sports/fx from balance.
--    Frequent-safe: a 5-min per-account guard dedupes rapid/double calls (cron every ≥5 min is fine).
create or replace function public.snapshot_portfolios()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer; v_ts timestamptz := now();
begin
  insert into public.portfolio_snapshots (acct_no, server, value_usd, ts)
  select q.acct_no, q.server, q.val, v_ts from (
    select a.acct_no, a.server,
      round( case when a.server = 'crypto'
        then coalesce((select sum(case when h.asset = 'USDT' then h.qty
                                        else h.qty * coalesce(pr.mid, 0) end)
                         from public.crypto_holdings h
                         left join public.prices pr on pr.symbol = h.asset
                        where h.acct_no = a.acct_no), 0)
           + coalesce((select sum(usd) from public.crypto_stakes where acct_no = a.acct_no), 0)
        else coalesce(a.balance, 0) end, 2) as val
      from public.accounts a
     where not exists (select 1 from public.portfolio_snapshots ps
                        where ps.acct_no = a.acct_no and ps.ts > v_ts - interval '5 minutes')
  ) q
  where q.val > 0.005;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ② Combined history for the calling user's Portfolio overview chart.
--    At each snapshot time we CARRY-FORWARD each account's latest value ≤ that time and SUM them,
--    so the line is a correct total even if accounts were snapshotted at slightly different times
--    (or seeded by the per-ledger-event backfill). Points are the real recorded totals.
create or replace function public.get_portfolio_total_history(p_range text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_since timestamptz; v_rows jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not authenticated'); end if;
  v_since := case upper(p_range)
    when '1D'  then now() - interval '1 day'      when '1W'  then now() - interval '7 days'
    when '1M'  then now() - interval '1 month'    when '3M'  then now() - interval '3 months'
    when 'YTD' then (date_trunc('year', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
    when '1Y'  then now() - interval '1 year'     else '-infinity'::timestamptz end;

  with mine as (
    select a.acct_no from public.accounts a
      join public.players pl on pl.id = a.player_id
     where pl.auth_id = v_uid
  ),
  times as (
    select distinct ps.ts from public.portfolio_snapshots ps
     where ps.acct_no in (select acct_no from mine) and ps.ts >= v_since
  ),
  totals as (
    select t.ts,
      (select coalesce(sum(latest.value_usd), 0) from (
         select distinct on (ps.acct_no) ps.value_usd
           from public.portfolio_snapshots ps
          where ps.acct_no in (select acct_no from mine) and ps.ts <= t.ts
          order by ps.acct_no, ps.ts desc
       ) latest) as v
      from times t
  )
  select coalesce(jsonb_agg(jsonb_build_object('ts', ts, 'v', round(v, 2)) order by ts), '[]'::jsonb)
    into v_rows from totals;

  return jsonb_build_object('ok', true, 'range', upper(p_range), 'points', v_rows);
end $$;

revoke all on function public.get_portfolio_total_history(text) from public, anon;
grant execute on function public.get_portfolio_total_history(text) to authenticated, service_role;
revoke all on function public.snapshot_portfolios() from public, anon, authenticated;
grant execute on function public.snapshot_portfolios() to service_role;

-- Schedule (pg_cron) — every 15 min. More frequent = smoother line (crypto price moves too).
--   select cron.schedule('portfolio-snapshot-15m', '*/15 * * * *',
--                        $$ select public.snapshot_portfolios(); $$);
-- Optional one-time seed of past cashflow steps:  select public.backfill_portfolio_snapshots();
-- Verify:  select public.snapshot_portfolios();   select public.get_portfolio_total_history('1D');
