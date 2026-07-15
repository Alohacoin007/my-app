-- Alpexa — register the FX app's crypto CFDs in fx_specs so fx_open can price + margin-check
-- them (no more client-fallback bypass). cls='CRYPTO' → leverage cap 5x, lot 1 (see
-- fx_open_margin.sql). The matching USD-pair prices (BTCUSD ...) are written by the
-- crypto-prices Edge function (now emits both BTC and BTCUSD) + its 5s cron.
-- ============================================================================
insert into public.fx_specs(symbol, cls) values
  ('BTCUSD','CRYPTO'), ('ETHUSD','CRYPTO'), ('SOLUSD','CRYPTO'), ('XRPUSD','CRYPTO'),
  ('ADAUSD','CRYPTO'), ('DOGEUSD','CRYPTO'), ('BNBUSD','CRYPTO'), ('DOTUSD','CRYPTO'),
  ('AVAXUSD','CRYPTO'), ('LINKUSD','CRYPTO')
on conflict (symbol) do update set cls = excluded.cls;

-- Verify: should return 10 rows.
-- select symbol, cls from public.fx_specs where cls='CRYPTO' order by symbol;
