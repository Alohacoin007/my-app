-- portfolio_history — REAL per-account value history for the wallet chart.
--
-- Replaces the synthesized "scale current total by a coin-price shape" chart (which never
-- showed deposits) with TRUE recorded values. No fabricated movement:
--   1. backfill_portfolio_snapshots(): one point per LEDGER EVENT = the running balance right
--      after it (value = current balance − Σ(ledger after that event)) + a leading "opening"
--      point before the first event. Same backward derivation as get_statement, so it ties to
--      accounts.balance — a deposit shows as a real step. (Crypto's past intraday PRICE drift
--      isn't reconstructable from our data, so it's omitted — cashflow only; we don't invent it.)
--   2. snapshot_portfolios(): a daily cron appends today's live accounts.balance, so from now
--      on the history also captures price moves. Idempotent via a 6h guard (no daily-unique
--      index, because the backfill stores multiple points per day).
--
-- Read-only history — moves NO money. RLS: a user reads only their own account's snapshots.
-- Deploy: run in Supabase SQL editor (USER). Then `select backfill_portfolio_snapshots();`
-- once, and schedule the daily cron (see bottom).

create table if not exists public.portfolio_snapshots (
  id        bigint generated always as identity primary key,
  acct_no   text not null,
  server    text not null,
  value_usd numeric not null,
  ts        timestamptz not null default now()
);
create index if not exists idx_psnap_acct_ts on public.portfolio_snapshots (acct_no, ts);

alter table public.portfolio_snapshots enable row level security;
drop policy if exists psnap_owner_read on public.portfolio_snapshots;
create policy psnap_owner_read on public.portfolio_snapshots for select using (
  exists (select 1 from public.accounts a join public.players pl on pl.id = a.player_id
          where a.acct_no = portfolio_snapshots.acct_no and pl.auth_id = auth.uid())
);
-- No client INSERT/UPDATE/DELETE: only the SECURITY DEFINER functions / service_role write.

-- ── Daily snapshot (cron). 6h guard = idempotent without a unique index. ──────
create or replace function public.snapshot_portfolios()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.portfolio_snapshots (acct_no, server, value_usd, ts)
    select a.acct_no, a.server, round(coalesce(a.balance,0),2), now()
      from public.accounts a
     where coalesce(a.balance,0) <> 0
       and not exists (select 1 from public.portfolio_snapshots ps
                        where ps.acct_no = a.acct_no and ps.ts > now() - interval '6 hours');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── One-time backfill: per-ledger-event running balance + leading opening point ─
create or replace function public.backfill_portfolio_snapshots()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.portfolio_snapshots (acct_no, server, value_usd, ts)
  with ev as (
    select l.acct_no, a.server, coalesce(a.balance,0) as bal, l.amount, l.created_at, l.id
      from public.ledger l join public.accounts a on a.acct_no = l.acct_no
     where coalesce(a.balance,0) <> 0
       and not exists (select 1 from public.portfolio_snapshots ps where ps.acct_no = l.acct_no)
  ),
  run as (
    select acct_no, server, created_at, id,
           round(bal - coalesce(sum(amount) over (partition by acct_no
                   order by created_at, id rows between 1 following and unbounded following),0),2) as val,
           round(bal - coalesce(sum(amount) over (partition by acct_no),0),2) as opening,
           row_number() over (partition by acct_no order by created_at, id) as rn,
           min(created_at) over (partition by acct_no) as first_at
      from ev
  )
  select acct_no, server, val, created_at from run
  union all
  select distinct acct_no, server, opening, first_at - interval '1 second' from run where rn = 1;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── Read history for the chart (owner-only; service_role for backend) ─────────
create or replace function public.get_portfolio_history(p_acct text, p_range text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_since timestamptz; v_rows jsonb;
begin
  select * into v_acct from public.accounts where acct_no = p_acct;
  if not found then return jsonb_build_object('ok', false, 'error', 'account not found'); end if;
  if v_uid is not null then
    if not exists (select 1 from public.players pl where pl.id = v_acct.player_id and pl.auth_id = v_uid)
      then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  end if;
  v_since := case upper(p_range)
    when '1D'  then now() - interval '2 days'
    when '1W'  then now() - interval '8 days'
    when '1M'  then now() - interval '1 month'
    when '3M'  then now() - interval '3 months'
    when 'YTD' then (date_trunc('year', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
    when '1Y'  then now() - interval '1 year'
    else '-infinity'::timestamptz  -- ALL
  end;
  select coalesce(jsonb_agg(jsonb_build_object('ts', ts, 'v', round(value_usd,2)) order by ts), '[]'::jsonb)
    into v_rows
    from public.portfolio_snapshots
   where acct_no = p_acct and ts >= v_since;
  return jsonb_build_object('ok', true, 'acct', p_acct, 'range', upper(p_range), 'points', v_rows);
end $$;

revoke all on function public.get_portfolio_history(text, text) from public, anon;
grant execute on function public.get_portfolio_history(text, text) to authenticated, service_role;
revoke all on function public.snapshot_portfolios()          from public, anon, authenticated;
revoke all on function public.backfill_portfolio_snapshots() from public, anon, authenticated;
grant execute on function public.snapshot_portfolios()          to service_role;
grant execute on function public.backfill_portfolio_snapshots() to service_role;

-- After deploying:  select public.backfill_portfolio_snapshots();   -- seed past (run once)
-- Daily cron (pg_cron) — 00:05 PDT = 07:05 UTC:
--   select cron.schedule('portfolio-snapshot-daily', '5 7 * * *',
--                        $$ select public.snapshot_portfolios(); $$);
