-- Alpexa — back office (manager) must see ALL customers/accounts.
-- ============================================================================
-- The manager only shows what the LOGGED-IN session can read via RLS. Logged in as a
-- normal customer it sees only its own player → "Customers · 1". To see everyone, the
-- manager account must be an ADMIN (is_admin()=true) AND the tables must grant admins a
-- read. This does both. (B5: manager = Supabase login whose uid is in `admins`.)
--
-- ⚠️ Set <ADMIN_UID> to the account you use for the manager. Below it's pre-filled with
--    zbnyme@gmail.com's uid (the "Christian Kang" account currently logged into manager).
--    For production, use a DEDICATED owner account, not a customer's.
-- ============================================================================

-- ① Register the manager/owner account as an admin (is_admin() → true for it).
insert into public.admins(uid)
values ('edaf03b8-a4d8-4c3d-8655-1151f6c4035d')   -- <ADMIN_UID> : zbnyme@gmail.com
on conflict do nothing;

-- ② Grant admins READ on every table the back office shows. These are ADDED alongside
--    existing owner-read policies (RLS policies are OR'd), so customers still see only
--    their own data; admins see all.
drop policy if exists players_admin_read     on public.players;
create policy players_admin_read     on public.players     for select using (public.is_admin());

drop policy if exists accounts_admin_read    on public.accounts;
create policy accounts_admin_read    on public.accounts    for select using (public.is_admin());

drop policy if exists requests_admin_read    on public.requests;
create policy requests_admin_read    on public.requests    for select using (public.is_admin());

drop policy if exists settlements_admin_read on public.settlements;
create policy settlements_admin_read on public.settlements for select using (public.is_admin());

drop policy if exists positions_admin_read   on public.positions;
create policy positions_admin_read   on public.positions   for select using (public.is_admin());

-- Verify (run as the manager's session, NOT the SQL editor which bypasses RLS):
--   the manager should now load every player → "Customers · N" = total signups.
