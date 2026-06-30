-- portfolio_history — REAL per-account value history for the wallet chart.
--
-- Replaces the synthesized "scale current total by a coin-price shape" chart (which never
-- showed deposits) with TRUE recorded values. Two truthful sources, no fabricated movement:
--   1. backfill_portfolio_snapshots(): for each past day that had ledger activity, the
--      end-of-day value = current balance − Σ(ledger after that day) — the SAME backward
--      derivation get_statement uses, so it ties exactly to accounts.balance. A $1M deposit
--      shows as a real step. (Crypto's past intraday PRICE drift is not reconstructable from
--      our data, so it's omitted — cashflow only. We do not invent it.)
--   2. snapshot_portfolios(): a daily cron appends today's live accounts.balance, so from now
--      on the history includes price moves too.
--
-- Read-only history — moves NO money. RLS: a user reads only their own account's snapshots.
-- Deploy: run in Supabase SQL editor (USER). Then schedule the daily cron (see bottom).

create table if not exists public.portfolio_snapshots (
  id        bigint generated always as identity primary key,
  acct_no   text not null,
  server    text not null,
  value_usd numeric not null,
  ts        timestamptz not null default now()
);
create index if not exists idx_psnap_acct_ts on public.portfolio_snapshots (acct_no, ts);
-- One row per account per Las Vegas day → the cron/backfill are idempotent (re-run = upsert).
create unique index if not exists uq_psnap_acct_day
  on public.portfolio_snapshots (acct_no, (date(ts at time zone 'America/Los_Angeles')));

alter table public.portfolio_snapshots enable row level security;
drop policy if exists psnap_owner_read on public.portfolio_snapshots;
create policy psnap_owner_read on public.portfolio_snapshots for select using (
  exists (select 1 from public.accounts a join public.players pl on pl.id = a.player_id
          where a.acct_no = portfolio_snapshots.acct_no and pl.auth_id = auth.uid())
);
-- No client INSERT/UPDATE/DELETE: only the SECURITY DEFINER functions / service_role write.

-- ── Daily snapshot (cron calls this) ─────────────────────────────────────────
create or replace function public.snapshot_portfolios()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.portfolio_snapshots (acct_no, server, value_usd, ts)
    select a.acct_no, a.server, round(coalesce(a.balance,0),2), now()
      from public.accounts a
     where coalesce(a.balance,0) <> 0
  on conflict (acct_no, (date(ts at time zone 'America/Los_Angeles')))
    do update set value_usd = excluded.value_usd, ts = excluded.ts;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── One-time backfill from the ledger (truthful cashflow history) ─────────────
create or replace function public.backfill_portfolio_snapshots()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.portfolio_snapshots (acct_no, server, value_usd, ts)
  select x.acct_no, x.server, x.val,
         -- store at noon of that Las Vegas day so date(ts at tz) = the day
         ((x.day::timestamp + interval '12 hours') at time zone 'America/Los_Angeles')
  from (
    select a.acct_no, a.server, d.day,
           round(coalesce(a.balance,0) - coalesce((
             select sum(l2.amount) from public.ledger l2
              where l2.acct_no = a.acct_no
                and l2.created_at >= (((d.day + 1)::timestamp) at time zone 'America/Los_Angeles')
           ),0), 2) as val
      from public.accounts a
      join lateral (
        select distinct date(l.created_at at time zone 'America/Los_Angeles') as day
          from public.ledger l where l.acct_no = a.acct_no
      ) d on true
     where coalesce(a.balance,0) <> 0
  ) x
  on conflict (acct_no, (date(ts at time zone 'America/Los_Angeles'))) do nothing;
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
-- snapshot/backfill are backend-only (cron / you in the SQL editor) — not granted to anon/authenticated.
revoke all on function public.snapshot_portfolios()          from public, anon, authenticated;
revoke all on function public.backfill_portfolio_snapshots() from public, anon, authenticated;
grant execute on function public.snapshot_portfolios()          to service_role;
grant execute on function public.backfill_portfolio_snapshots() to service_role;

-- ── After deploying, run ONCE to seed past history from the ledger: ───────────
--   select public.backfill_portfolio_snapshots();
-- Then verify a real account got a curve:
--   select ts, value_usd from public.portfolio_snapshots
--    where acct_no = (select acct_no from public.accounts order by balance desc limit 1)
--    order by ts;
--
-- ── Schedule the daily snapshot (pg_cron). 00:05 PDT = 07:05 UTC (PDT, summer): ─
--   select cron.schedule('portfolio-snapshot-daily', '5 7 * * *',
--                        $$ select public.snapshot_portfolios(); $$);
