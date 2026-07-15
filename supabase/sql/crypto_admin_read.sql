-- Alpexa — back office reads crypto holdings/stakes DIRECTLY (#5/B).
-- ============================================================================
-- The manager now reads each customer's crypto positions straight from the SERVER
-- truth tables (crypto_holdings / crypto_stakes) instead of a client-pushed mirror in
-- `positions` (that mirror is retired). For the admin session to see EVERY customer's
-- rows, admins need a SELECT policy on both tables — added ALONGSIDE the existing
-- owner-read policies (RLS policies are OR'd), so customers still see only their own.
--
-- Writes stay locked to RPC/admin (crypto_trade / swap / stake) — this only adds READ.
-- ============================================================================

drop policy if exists crypto_holdings_admin_read on public.crypto_holdings;
create policy crypto_holdings_admin_read on public.crypto_holdings
  for select using (public.is_admin());

drop policy if exists crypto_stakes_admin_read on public.crypto_stakes;
create policy crypto_stakes_admin_read on public.crypto_stakes
  for select using (public.is_admin());

-- Verify (run as the admin session, NOT the SQL editor which bypasses RLS):
--   the manager's customer detail should list each customer's coins (Holding) and
--   stakes (Staked) read from these tables.
