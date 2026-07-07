-- Alpexa — price_alerts (dedup + audit state for the price-monitor Edge)
-- The price-monitor function writes one row when it emails an alert; it reads the latest
-- row to avoid re-emailing the same problem more often than RENOTIFY_MIN. Locked to the
-- service-role/SECURITY DEFINER (no client access).
create table if not exists public.price_alerts (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  sig        text,   -- normalized problem signature (dedup key)
  detail     text    -- human-readable problem list (for the back office / audit)
);
alter table public.price_alerts enable row level security;
-- no client policies — only the service-role Edge writes/reads it.
create index if not exists price_alerts_created_idx on public.price_alerts (created_at desc);
