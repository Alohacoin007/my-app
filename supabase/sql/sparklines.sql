-- Alpexa — sparklines cache (instant mini-charts for the markets watchlist)
-- The sparkline-cache Edge (pg_cron, ~10–15 min) writes one row id='all' with a JSON
-- map { "<symbol>": [close, close, …] } (~48 recent points per symbol). The markets
-- page READS this row once on load and seeds each row's chart instantly — so the mini
-- charts show a real recent trend immediately instead of filling in over minutes.
--
-- Why this exists: fetching intraday history per symbol from the CLIENT would be
-- ~60 calls per user per tab and blow the free data-provider rate limit. Here the
-- SERVER fetches once per cron cycle (fixed, independent of how many users) and every
-- client just reads the cache — users never touch the provider, so no rate-limit risk.
-- Public market data → public SELECT; writes only via the service-role Edge.
create table if not exists public.sparklines (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.sparklines enable row level security;
drop policy if exists sparklines_read on public.sparklines;
create policy sparklines_read on public.sparklines for select using (true);
-- no INSERT/UPDATE/DELETE policy → only the service-role Edge (bypasses RLS) writes.
