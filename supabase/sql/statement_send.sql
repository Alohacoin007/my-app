-- statement_send — backend support for the monthly statement email (step 3).
--
-- Numbers come from get_statement (already deployed & verified) so the email always ties to the
-- ledger. This file adds only (1) an idempotency ledger of who was sent which month, and (2) a
-- recipient list RPC. Both are SERVICE_ROLE-only (the send-statements Edge Function), never
-- client-callable. Moves no money.
--
-- Deploy: run in Supabase SQL editor (USER).

-- Idempotency: one row per (account, month) → the cron can retry and never double-send.
create table if not exists public.statement_sends (
  id      bigint generated always as identity primary key,
  acct_no text not null,
  month   text not null,                 -- 'YYYY-MM'
  email   text,
  sent_at timestamptz not null default now(),
  unique (acct_no, month)
);
alter table public.statement_sends enable row level security;
-- No policies → no client (anon/authenticated) access at all; only SECURITY DEFINER fns below.

-- Who gets a statement for p_month: sports accounts that are reachable, allowed, and had value
-- or activity that month — minus anyone already sent. Excludes closed + currently self-excluded
-- (responsible gaming / deliverability), per the agreed targeting.
create or replace function public.list_statement_recipients(p_month text)
returns table(acct_no text, cust_id text, name text, email text)
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz; v_end timestamptz;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then return; end if;
  v_start := ((p_month || '-01')::timestamp) at time zone 'America/Los_Angeles';
  v_end   := (((p_month || '-01')::date + interval '1 month')::timestamp) at time zone 'America/Los_Angeles';
  return query
    select a.acct_no, pl.cust_id, pl.name, pl.email
      from public.accounts a
      join public.players pl on pl.id = a.player_id
     where a.server = 'sports'
       and pl.email is not null and pl.email <> ''
       and coalesce(pl.status, 'active') <> 'closed'
       and coalesce(pl.self_exclude_until, 0) <= v_now_ms
       and ( coalesce(a.balance, 0) > 0
             or exists (select 1 from public.ledger l
                         where l.acct_no = a.acct_no and l.created_at >= v_start and l.created_at < v_end) )
       and not exists (select 1 from public.statement_sends s
                        where s.acct_no = a.acct_no and s.month = p_month);
end $$;

revoke all on function public.list_statement_recipients(text) from public, anon, authenticated;
grant execute on function public.list_statement_recipients(text) to service_role;

-- Record a successful send (idempotent).
create or replace function public.mark_statement_sent(p_acct text, p_month text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.statement_sends(acct_no, month, email)
       values (p_acct, p_month, p_email)
  on conflict (acct_no, month) do nothing;
end $$;

revoke all on function public.mark_statement_sent(text, text, text) from public, anon, authenticated;
grant execute on function public.mark_statement_sent(text, text, text) to service_role;

-- ── After deploy: schedule monthly (pg_cron), 1st of month 08:10 UTC ≈ 00:10/01:10 PDT.
--   The Edge function defaults to LAST month, so running on the 1st covers the month just ended.
--   select cron.schedule('monthly-statements', '10 8 1 * *', $$
--     select net.http_post(
--       url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/send-statements?token=<CRON_SECRET>',
--       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_OR_PUBLISHABLE>"}'::jsonb,
--       body := '{}'::jsonb);
--   $$);
