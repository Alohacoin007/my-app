-- Alpexa — B8: secure the EXISTING money/state cron jobs (token in the URL).
-- ============================================================================
-- sports-settle (pays bets) and stake-accrue (credits stake interest) FAIL CLOSED
-- once redeployed: no CRON_SECRET → 503; with one set → require ?token=<CRON_SECRET>.
--
-- ⚠️ This project ALREADY runs these on a cron, under these jobnames (verified in
--    cron.job): `sports-settle-5m` (*/5 * * * *) and `stake-accrue-daily` (0 0 * * *).
--    cron.schedule() with an EXISTING jobname REPLACES its command — so this UPDATES
--    the real jobs in place. Do NOT invent new jobnames (that created duplicates).
--
-- To close B8:
--   1) Set CRON_SECRET in each function's env (Supabase → Edge Functions → Secrets):
--        openssl rand -hex 32
--   2) Redeploy:  supabase functions deploy sports-settle && supabase functions deploy stake-accrue
--   3) Replace <CRON_SECRET> below with the value and run this ONCE.
--      Without the token these jobs will 503 and settlement/accrual will STOP.
-- (Price feeds — crypto-prices/fx-prices/etc — are unchanged; fx-prices is called by
--  the client and is not money-moving.)
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Update the EXISTING jobs in place (same jobname = replace command, no duplicate).
-- Keep their established cadence: settle every 5 min, accrue once daily at 00:00.
select cron.schedule('sports-settle-5m', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/sports-settle?token=<CRON_SECRET>'
  );
$$);

select cron.schedule('stake-accrue-daily', '0 0 * * *', $$
  select net.http_get(
    url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/stake-accrue?token=<CRON_SECRET>'
  );
$$);

-- Verify:  select jobname, schedule, active from cron.job order by jobname;
-- Confirm a settle run after a tick: select max(created_at) from settlements;
