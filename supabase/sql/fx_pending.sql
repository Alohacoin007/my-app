-- Alpexa — fx_pending table (server-centre storage for FX pending/limit/stop orders)
--
-- Pending orders used to live ONLY in localStorage (alpexa.fxPending), so they were
-- device-bound and invisible to the back office. This table stores them server-side,
-- one row per pending order, owned by the placing account (RLS via auth.uid()).
-- The app keeps localStorage as a fast cache/fallback and mirrors every
-- create/cancel/modify/fill into this table. Trigger-watching + fill stay client-side
-- (fill is still authoritative via fx_open); this table is the durable record.
--
-- Run ONCE in the Supabase SQL editor. Idempotent.

create table if not exists public.fx_pending (
  cust_id    text,
  acct_no    text not null,
  server     text not null default 'fx',
  local_id   text not null,
  ticket     text,
  symbol     text,
  side       text,
  size       numeric,
  otype      text,                 -- 'LIMIT' | 'STOP'
  trigger    numeric,
  sl         numeric,
  tp         numeric,
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);

-- one row per pending order per account
create unique index if not exists fx_pending_acct_localid_uidx
  on public.fx_pending (acct_no, local_id);

-- ── Row Level Security: a row belongs to the caller if its acct_no maps to one of
--    the caller's accounts (accounts → players → auth_id = auth.uid()). ──
alter table public.fx_pending enable row level security;

drop policy if exists fx_pending_owner_sel on public.fx_pending;
create policy fx_pending_owner_sel on public.fx_pending for select
  using ( acct_no in (
    select a.acct_no from public.accounts a
    join public.players pl on pl.id = a.player_id
    where pl.auth_id = auth.uid() ) );

drop policy if exists fx_pending_owner_ins on public.fx_pending;
create policy fx_pending_owner_ins on public.fx_pending for insert
  with check ( acct_no in (
    select a.acct_no from public.accounts a
    join public.players pl on pl.id = a.player_id
    where pl.auth_id = auth.uid() ) );

drop policy if exists fx_pending_owner_upd on public.fx_pending;
create policy fx_pending_owner_upd on public.fx_pending for update
  using ( acct_no in (
    select a.acct_no from public.accounts a
    join public.players pl on pl.id = a.player_id
    where pl.auth_id = auth.uid() ) );

drop policy if exists fx_pending_owner_del on public.fx_pending;
create policy fx_pending_owner_del on public.fx_pending for delete
  using ( acct_no in (
    select a.acct_no from public.accounts a
    join public.players pl on pl.id = a.player_id
    where pl.auth_id = auth.uid() ) );

-- ── Realtime: let other devices see create/cancel/fill near-instantly ──
do $$ begin
  begin
    alter publication supabase_realtime add table public.fx_pending;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
