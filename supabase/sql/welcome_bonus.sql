-- Alpexa — $300 welcome bonus (server-enforced on signup)
-- ============================================================================
-- New accounts open with: Sports $100 cash, FX $100 cash, Crypto $100 as a
-- 1-year ALPXS stake (locked, 18% APY). All server-forced so the client can't
-- pick its own opening balance, and the crypto bonus is locked (anti-abuse +
-- showcases staking + uses the company's own token = near-zero real cost).
-- (Cash $200 can't be withdrawn either — the integrity/withdrawal guard blocks
--  withdrawing more than was deposited.)
--
-- Admin/back-office account creation is exempt (can set any balance, no stake).
-- ============================================================================

-- ① Force the opening cash balance per server (non-admin = signup).
create or replace function public.force_opening_balance()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then
    new.balance := case new.server
      when 'sports' then 100
      when 'crypto' then 100
      when 'fx'     then 100
      else 0 end;
  end if;
  return new;
end;$$;

drop trigger if exists trg_force_opening_balance on public.accounts;
create trigger trg_force_opening_balance
  before insert on public.accounts
  for each row execute function public.force_opening_balance();

-- ② On crypto account creation → auto-create the $100 ALPXS 1-year welcome stake.
--    (crypto_stakes is RLS-locked to admin/SECURITY DEFINER, so this trigger seeds it.)
create or replace function public.seed_crypto_welcome_stake()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_now bigint := (extract(epoch from now())*1000)::bigint;
begin
  if NEW.server = 'crypto' and not public.is_admin() then
    insert into public.crypto_stakes(acct_no, asset, usd, period, since, staked_at, updated_at)
      values (NEW.acct_no, 'ALPXS', 100, '1y', v_now, v_now, now())
      on conflict (acct_no, asset) do nothing;
  end if;
  return NEW;
end;$$;

drop trigger if exists trg_seed_crypto_welcome on public.accounts;
create trigger trg_seed_crypto_welcome
  after insert on public.accounts
  for each row execute function public.seed_crypto_welcome_stake();
