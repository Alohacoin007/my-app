-- Alpexa — B8: secure ALL cron-called Edge functions (token in the URL).
-- ============================================================================
-- ⚠️ CRON_SECRET IS A SINGLE GLOBAL ENV VAR. The moment it is set, EVERY function that
--    checks it (`if (CRON_SECRET && token !== CRON_SECRET) → 401/503`) starts requiring
--    ?token=. So EVERY cron that calls such a function MUST pass the token — not just the
--    money ones. We learned this the hard way (defect #17): setting the secret to lock
--    sports-settle/stake-accrue silently 401'd the price feeds (crypto/fx/stock/games/odds)
--    → stale prices → "price unavailable (stale)" on trades. This script locks ALL SEVEN.
--
-- Functions that check CRON_SECRET (grep: `CRON_SECRET` in supabase/functions/*/index.ts):
--   MONEY (fail-closed):  sports-settle, stake-accrue
--   FEEDS (fail-open):    crypto-price, fx-prices, stock-prices, sports-games, sports-odds
--
-- To deploy:
--   1) Set CRON_SECRET in Edge Functions → Secrets (openssl rand -hex 32). It applies to ALL functions.
--   2) Redeploy the money fns (they fail-closed): supabase functions deploy sports-settle stake-accrue
--   3) Replace <CRON_SECRET> below and run this ONCE. Same jobname = replaces in place (no dup).
--      ⚠️ Run this in the SAME change window as setting the secret, or feeds/settlement 401 until you do.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── MONEY (every existing cadence kept) ──
select cron.schedule('sports-settle-5m', '*/5 * * * *', $$
  select net.http_get(url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/sports-settle?token=<CRON_SECRET>');
$$);
select cron.schedule('stake-accrue-daily', '0 0 * * *', $$
  select net.http_get(url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/stake-accrue?token=<CRON_SECRET>');
$$);

-- ── FEEDS (note: crypto function is `crypto-price` SINGULAR; sports-games is POST + header) ──
select cron.schedule('crypto-prices-60s', '5 seconds', $$
  select net.http_get(url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/crypto-price?token=<CRON_SECRET>');
$$);
select cron.schedule('fx-prices-10s', '3 seconds', $$
  select net.http_get(url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/fx-prices?token=<CRON_SECRET>');
$$);
select cron.schedule('stock-prices-1m', '* * * * *', $$
  select net.http_get(url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/stock-prices?token=<CRON_SECRET>');
$$);
select cron.schedule('sports-games-1min', '* * * * *', $$
  select net.http_post(
    url:='https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/sports-games?token=<CRON_SECRET>',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu"}'::jsonb
  );
$$);
select cron.schedule('sports-odds-10m', '* * * * *', $$
  select net.http_get(url:='https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/sports-odds?token=<CRON_SECRET>');
$$);

-- Verify (a minute later):  every feed fresh, no 401s.
--   select jobname, schedule, active from cron.job order by jobname;
--   select symbol, mid, (now()-updated_at) as age from public.prices order by age desc limit 10;
