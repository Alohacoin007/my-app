-- Alpexa — CRITICAL: close the settlements money-printing hole + tamper locks
-- ============================================================================
-- FOUND (2026-07-05, master audit): trg_settlement_balance /
-- apply_settlement_to_balance() adds NEW.pnl to accounts.balance on ANY insert
-- with server='fx' — no ownership, no kind, no idempotency check. Combined with
-- the settlements INSERT policy being open to {authenticated} AND the crypto/
-- sports apps inserting settlements directly from the browser, ANY logged-in
-- user could POST { server:'fx', acct_no:<any>, pnl:1e6 } and mint balance.
--
-- INVARIANT (proven in tests/settlements-rls.test.js):
--   FX P&L is banked ONLY by the fx_close RPC (server, SECURITY DEFINER).
--   A CLIENT-authored fx settlement is UNREPRESENTABLE.
--
-- fx_close is SECURITY DEFINER owned by a privileged role → it BYPASSES RLS, so
-- it keeps inserting fx settlements and banking P&L. Client (PostgREST) inserts
-- of server='fx' are refused by the policy below. Non-fx history inserts
-- (crypto_fee, sports cashout, …) are unchanged.
--
-- ⚠️ AFTER DEPLOY: smoke-test an FX close (open + close a small FX position) and
-- confirm the P&L still lands — this proves the RPC path still bypasses RLS.
-- ============================================================================

-- ── settlements ─────────────────────────────────────────────────────────────
-- Replace the permissive demo INSERT/UPDATE/DELETE with money-safe policies.
-- (Leave settlements_sel / settlements_admin_read untouched — the agent portal
--  reads settlements as anon for commission; scoping that needs agent auth and
--  is tracked as a backlog privacy item, NOT a money-printing vector.)
drop policy if exists settlements_ins on public.settlements;
create policy settlements_ins on public.settlements
  for insert to authenticated
  with check ( public.is_admin() or coalesce(server,'') <> 'fx' );

drop policy if exists settlements_upd on public.settlements;
create policy settlements_upd on public.settlements
  for update using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists settlements_del on public.settlements;
create policy settlements_del on public.settlements
  for delete using ( public.is_admin() );

-- ── agents ──────────────────────────────────────────────────────────────────
-- Keep SELECT open (the anon agent portal checks PIN against this table — a
-- structural weakness tracked as backlog), but stop anyone from WRITING it:
-- a forged fx_per_lot / sports_net_pct would defeat the payout guard.
drop policy if exists agents_all_demo on public.agents;
create policy agents_sel on public.agents for select using ( true );
create policy agents_write on public.agents
  for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ── agent_links ─────────────────────────────────────────────────────────────
-- SELECT stays open (portal reads its own links as anon). INSERT: a customer
-- may link only THEIR OWN cust_id (signup path, authenticated post-OTP); admin
-- may link anyone. UPDATE/DELETE admin only.
drop policy if exists agent_links_all_demo on public.agent_links;
create policy agent_links_sel on public.agent_links for select using ( true );
create policy agent_links_ins on public.agent_links
  for insert to authenticated
  with check ( public.is_admin() or public.owns_cust(cust_id) );
create policy agent_links_upd on public.agent_links
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy agent_links_del on public.agent_links
  for delete using ( public.is_admin() );

-- ── agent_payouts ───────────────────────────────────────────────────────────
-- SELECT + INSERT stay open (the anon portal requests payouts); the money logic
-- is enforced by guard_agent_payout() (agent_payout_guard.sql): portal inserts
-- are forced pending + bounded, adjust/approve are admin-only. Add RLS locks on
-- UPDATE/DELETE as defense-in-depth so status can't be flipped outside admin.
drop policy if exists agent_payouts_all_demo on public.agent_payouts;
create policy agent_payouts_sel on public.agent_payouts for select using ( true );
create policy agent_payouts_ins on public.agent_payouts for insert with check ( true );
create policy agent_payouts_upd on public.agent_payouts
  for update using ( public.is_admin() ) with check ( public.is_admin() );
create policy agent_payouts_del on public.agent_payouts
  for delete using ( public.is_admin() );
