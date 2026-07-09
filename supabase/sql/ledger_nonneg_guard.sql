-- Alpexa — CONCURRENCY GUARD: ledger can never overdraw an account (#2 harness fix)
-- ============================================================================
-- The money RPCs (place_bet, withdraw_hold, app_transfer, cash_out) do check-then-act:
--     select balance into v_bal ...;  if v_bal < amt then reject;  insert ledger(-amt);
-- with NO `select ... for update`. Two overlapping calls both read the old balance,
-- both pass the check, and both debit → balance goes NEGATIVE (double-spend).
--
-- Fix at the single chokepoint every balance move already flows through: the
-- apply_ledger trigger. Its UPDATE takes the account row lock and re-reads the CURRENT
-- balance, so concurrent debits SERIALIZE here. If a debit would drive the balance
-- below zero, we raise → that transaction rolls back (its ledger row never commits, no
-- debit applied). An overdrawn balance becomes UNREPRESENTABLE regardless of the race —
-- exactly the invariant proved GREEN in tests/concurrency-integrity-harness.test.js.
--
-- Safe: credits (positive amounts) and settlements never trip it; the app-level check
-- still handles the common case cleanly, so this only fires on a genuine race (or a
-- tampered client) — turning a silent double-spend into a clean rejection.
--
-- ⚠️ Balance-backed servers only (sports/fx via the ledger). Crypto lives in
-- crypto_holdings (separate) — its overdraw guard is a follow-up (CHECK qty >= 0 /
-- FOR UPDATE in crypto_trade & crypto_send_internal).
--
-- Deploy: run this whole file in the Supabase SQL editor. Idempotent (CREATE OR REPLACE).
-- Rollback: re-create apply_ledger without the guard block.
-- ============================================================================

create or replace function public.apply_ledger()
 returns trigger language plpgsql security definer as $function$
declare v_new numeric;
begin
  update public.accounts
     set balance = round((coalesce(balance,0) + new.amount)::numeric, 2)
   where acct_no = new.acct_no
   returning balance into v_new;   -- new balance, read under the row lock (serializes concurrent debits)

  if v_new < -0.005 then           -- would overdraw → reject this txn (no double-spend)
    raise exception 'ledger overdraw blocked on % (resulting balance %)', new.acct_no, v_new
      using errcode = '23514';     -- check_violation
  end if;

  return new;
end $function$;

-- Verify (run each as an overlapping pair on a $100 sports account; the second must fail):
--   select public.place_bet(...$60...);   -- both concurrently → exactly one succeeds,
--   select public.place_bet(...$60...);   -- the other errors 'ledger overdraw blocked', balance stays $40.
