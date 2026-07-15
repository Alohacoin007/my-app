-- Alpexa — CONCURRENCY GUARD: crypto_holdings can never go negative (#24 crypto follow-up)
-- ============================================================================
-- Crypto money lives in crypto_holdings(acct_no, asset, qty) — NOT the ledger. Every
-- crypto debit path does the same check-then-act with NO `for update`:
--     crypto_trade  : select qty ...; if qty < spend reject; update qty = qty - spend
--     crypto_send_internal / crypto_stake_* : same shape on the sender/holder row
-- so two overlapping calls can both read the old qty, both pass, and both debit → the
-- holding goes NEGATIVE (crypto double-spend), the exact analog of the ledger race (#24).
--
-- Fix at the single chokepoint every crypto balance move already flows through: a table
-- CHECK on crypto_holdings.qty. Any UPDATE takes the row lock and re-reads the current
-- qty, so concurrent debits serialize; if a debit would drive qty below zero the CHECK
-- raises → that transaction rolls back (no debit). A negative holding becomes
-- UNREPRESENTABLE across crypto_trade / crypto_send_internal / crypto_stake_* at once.
--
-- Why `>= 0` is safe (no false-rejects): every debit RPC pre-checks with a 1e-9 tolerance
-- and stores qty rounded to 8 dp, so a legitimate exact-spend rounds to 0.00000000, never
-- a tiny negative. (If a future write path ever trips it on rounding, widen to `>= -1e-8`.)
--
-- Live-table-safe deploy: added NOT VALID so it enforces on ALL new inserts/updates
-- immediately WITHOUT scanning/validating existing rows (an old bad row, if any, won't
-- block the migration — the pre-check query below surfaces them for manual review).
--
-- Deploy: run this whole file in the Supabase SQL editor. Idempotent (drop-if-exists).
-- Rollback: alter table public.crypto_holdings drop constraint crypto_holdings_qty_nonneg;
-- ============================================================================

-- ① Pre-check — see any pre-existing negatives before you enforce (should be empty):
--    select acct_no, asset, qty from public.crypto_holdings where qty < 0 order by qty;

-- ② Clean up rounding-noise residue only (never silently zero a real negative — those
--    stay for the pre-check above to surface):
update public.crypto_holdings set qty = 0 where qty < 0 and qty >= -0.00000001;

-- ③ The guard. NOT VALID → enforced on every new insert/update immediately; existing
--    rows are not re-scanned (safe on a live table).
alter table public.crypto_holdings drop constraint if exists crypto_holdings_qty_nonneg;
alter table public.crypto_holdings
  add constraint crypto_holdings_qty_nonneg check (qty >= 0) not valid;

-- ④ (optional, later) once the pre-check returns zero rows, validate the whole table:
--    alter table public.crypto_holdings validate constraint crypto_holdings_qty_nonneg;

-- Verify (run two overlapping sells of the full holding; the second must fail):
--   select public.crypto_trade(... sell all ...);   -- both concurrently → one succeeds,
--   select public.crypto_trade(... sell all ...);   -- the other errors (check_violation), qty stays >= 0.
