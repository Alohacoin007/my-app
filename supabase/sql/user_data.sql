-- Alpexa — per-customer key/value store for cross-device app data
--
-- Some customer data was localStorage-only and so was lost on a new device:
--   • crypto withdrawal address whitelist (alpexa.whitelist)
--   • recurring-buy schedules           (alpexa.recurring)
--   • saved beneficiaries / payees       (alpexa.beneficiaries)
-- This generic table stores those as JSON per customer, owned via RLS. (Saved cards /
-- linked banks are deliberately NOT moved here — payment instruments should not be
-- stored server-side without PCI compliance; they stay device-local.)
-- Run ONCE in the Supabase SQL editor. Idempotent.

create table if not exists public.user_data (
  cust_id    text not null,
  key        text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (cust_id, key)
);

alter table public.user_data enable row level security;

-- A row belongs to the caller if its cust_id is one of the caller's (players.auth_id).
drop policy if exists user_data_owner_sel on public.user_data;
create policy user_data_owner_sel on public.user_data for select
  using ( cust_id in (select pl.cust_id from public.players pl where pl.auth_id = auth.uid()) );

drop policy if exists user_data_owner_ins on public.user_data;
create policy user_data_owner_ins on public.user_data for insert
  with check ( cust_id in (select pl.cust_id from public.players pl where pl.auth_id = auth.uid()) );

drop policy if exists user_data_owner_upd on public.user_data;
create policy user_data_owner_upd on public.user_data for update
  using ( cust_id in (select pl.cust_id from public.players pl where pl.auth_id = auth.uid()) );
