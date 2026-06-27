-- Alpexa — B8: secure cron schedules for the MONEY/STATE edge functions.
-- ============================================================================
-- sports-settle (pays bets) and stake-accrue (credits stake interest) now FAIL
-- CLOSED: with no CRON_SECRET set they refuse to run (503), and with one set they
-- require ?token=<CRON_SECRET>. So you MUST:
--   1) Set CRON_SECRET in each function's env (Supabase → Edge Functions → Secrets).
--      Use one strong random value, e.g.:  openssl rand -hex 32
--   2) Schedule them WITH the token (below). Replace <CRON_SECRET> with the value.
--      Without the token these jobs will 503 and settlement/accrual will STOP.
-- Run ONCE in the Supabase SQL editor. (Price feeds like crypto-prices/fx-prices
-- are unchanged — fx-prices is called by the client and is not money-moving.)
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any existing token-less schedules first (ignore errors if absent).
do $$ begin
  perform cron.unschedule('sports-settle');   exception when others then null; end $$;
do $$ begin
  perform cron.unschedule('stake-accrue');    exception when others then null; end $$;

-- Settle bets every 3 minutes (idempotent: betpay-<id> + claim-by-delete).
select cron.schedule('sports-settle', '*/3 * * * *', $$
  select net.http_get(
    url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/sports-settle?token=<CRON_SECRET>'
  );
$$);

-- Accrue stake interest once daily (00:10 UTC). Idempotent per accrual day.
select cron.schedule('stake-accrue', '10 0 * * *', $$
  select net.http_get(
    url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/stake-accrue?token=<CRON_SECRET>'
  );
$$);

-- Verify:  select jobname, schedule from cron.job order by jobname;
-- Then confirm a settle run: check `settlements`/`ledger` updated_at after a tick.
