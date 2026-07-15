-- Alpexa — positions de-duplication + guard against future duplicates
--
-- WHY: the FX client's position-sync used to do UPDATE-pnl-then-INSERT-if-missing.
-- Supabase RLS can hide an UPDATE's RETURNING rows even when the row exists, so the
-- client saw "0 updated" and re-INSERTed a fresh row every ~3s — producing dozens of
-- phantom open positions for one real position (all sharing the same local_id).
-- The client is now an UPSERT (see trading.html), and this script (1) removes the
-- duplicates already in the table and (2) adds the unique index the upsert needs.
--
-- Run this ONCE in the Supabase SQL editor. Safe to re-run (idempotent).

begin;

-- 1) Collapse duplicates: keep ONE physical row per (acct_no, server, local_id),
--    delete the rest. ctid is a built-in physical row id, so this needs no schema
--    knowledge. Only rows that carry a local_id can be duplicates of a position.
delete from public.positions a
using public.positions b
where a.ctid < b.ctid
  and a.local_id is not null
  and a.acct_no  is not distinct from b.acct_no
  and a.server   is not distinct from b.server
  and a.local_id is not distinct from b.local_id;

-- 2) Hard stop: one row per (acct_no, server, local_id) from now on.
--    NOTE: must be a FULL (non-partial) unique index. A PARTIAL index
--    (... where local_id is not null) cannot be used as the arbiter for the
--    client's upsert onConflict('acct_no,server,local_id') — PostgREST errors,
--    the upsert fails, and client-written rows (e.g. crypto/BTC positions that
--    fx_open rejects for lack of an fx_specs row) never persist, so pullPos
--    drops them after the 6s grace and the position "closes by itself".
--    NULLs are distinct in a unique index, so rows without a local_id never
--    collide even without a WHERE predicate.
drop index if exists public.positions_acct_server_localid_uidx;
create unique index if not exists positions_acct_server_localid_uidx
  on public.positions (acct_no, server, local_id);

commit;

-- ── OPTIONAL: clean-slate a single account's open FX positions ───────────────────
-- If after de-duping you still see stale/test positions you want gone, close them out
-- by deleting the open rows for that account (does NOT bank P&L — use the app's
-- "Close all" for real positions you want settled). Replace <ACCT_NO> first.
--
-- delete from public.positions
--  where acct_no = '<ACCT_NO>' and server = 'fx' and status = 'open';
