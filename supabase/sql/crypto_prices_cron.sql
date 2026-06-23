-- Alpexa — schedule crypto-prices so the server `prices` table stays FRESH.
-- The crypto-prices Edge function pulls real spot prices from CoinGecko and
-- upserts them into `prices`. Without this schedule those rows go stale, which
-- (a) blanks/sticks crypto prices for any client where Binance is blocked, and
-- (b) makes crypto_trade reject with "price unavailable (stale)".
--
-- CoinGecko free tier: one call (~30 ids) per minute is well within limits, so
-- run every 60 seconds.
--
-- Run ONCE in the Supabase SQL editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- If you set a CRON_SECRET on the crypto-prices function, append it as a query
-- param:  .../crypto-prices?token=<CRON_SECRET>   (omit if no secret is set).
select cron.schedule('crypto-prices-60s', '60 seconds', $$
  select net.http_get(
    url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/crypto-prices'
  );
$$);

-- To stop:   select cron.unschedule('crypto-prices-60s');
-- To verify: select * from cron.job;   then check the prices table updated_at.
