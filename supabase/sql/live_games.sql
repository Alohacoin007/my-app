-- Alpexa — live_games table
-- One row (id='all') holding the current games array, written by the
-- sports-games Edge Function and read by every client (app + website).
create table if not exists public.live_games (
  id          text primary key,
  data        jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.live_games enable row level security;

-- Anyone (anon/publishable key) may READ games. Writes are done by the Edge
-- Function with the service role, which bypasses RLS — so there is NO public
-- write policy on purpose.
drop policy if exists "live_games read" on public.live_games;
create policy "live_games read" on public.live_games for select using (true);
