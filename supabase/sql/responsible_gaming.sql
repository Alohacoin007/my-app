-- Alpexa — C4 responsible-gaming enforcement (self-exclusion is ONE-WAY).
-- ============================================================================
-- The sports app stores self-exclusion + deposit/loss limits in `players` columns
-- (server-owned) and re-pulls them on every load (pullRG), so clearing localStorage
-- no longer hides them. The remaining hole: a customer could WRITE self_exclude_until
-- back to 0 (pushRG sends all fields) and lift their own exclusion.
--
-- This trigger makes self-exclusion MONOTONIC for non-admins: the value can only go
-- up (extend), never down (shorten/clear). Only an admin can reduce or clear it.
-- self_exclude_until = epoch milliseconds (the client sends Math.round(ms)).
-- ============================================================================

-- ① Columns the app syncs (no-op if they already exist).
alter table public.players add column if not exists self_exclude_until bigint  not null default 0;
alter table public.players add column if not exists deposit_limit      numeric not null default 0;
alter table public.players add column if not exists loss_limit         numeric not null default 0;
alter table public.players add column if not exists reality_check_min   int    not null default 0;

-- ② One-way clamp on self-exclusion for non-admins.
create or replace function public.guard_self_exclusion()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.is_admin() then
    return new;  -- admins (back office) may shorten/clear an exclusion.
  end if;
  -- Customer can extend but never shorten or clear: keep the larger of old/new.
  if coalesce(new.self_exclude_until,0) < coalesce(old.self_exclude_until,0) then
    new.self_exclude_until := old.self_exclude_until;
  end if;
  return new;
end;$$;

drop trigger if exists trg_guard_self_exclusion on public.players;
create trigger trg_guard_self_exclusion
  before update on public.players
  for each row execute function public.guard_self_exclusion();

-- ③ (Deeper layer, requires place_bet) — once place_bet is committed to the repo,
--    add at the top of the bet RPC:
--      if exists (select 1 from public.players p
--                 join public.accounts a on a.player_id = p.id
--                 where a.acct_no = p_acct
--                   and coalesce(p.self_exclude_until,0) > (extract(epoch from now())*1000))
--      then return jsonb_build_object('ok',false,'error','self-excluded'); end if;
--    so a self-excluded customer cannot place a bet even via a crafted request.
