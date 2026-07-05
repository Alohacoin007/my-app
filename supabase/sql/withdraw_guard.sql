-- Alpexa — withdrawable amount + auto-reject over-withdrawal (server-enforced)
-- ============================================================================
-- Rule (proven in tests/withdrawable.test.js):
--   sports/fx :  withdrawable = max(0, balance − bonus)   (bonus = welcome, never withdrawable)
--   crypto    :  withdrawable = spendable USDT holdings    (welcome ALPXS is a locked stake)
-- A withdraw REQUEST is auto-rejected at insert if amount > withdrawable — covers all
-- three apps in one place (sports withdraw_hold, FX/crypto pushRequest).
-- ============================================================================

-- ① Track the non-withdrawable welcome bonus per account.
alter table public.accounts add column if not exists bonus numeric not null default 0;
-- Backfill existing accounts: sports/fx welcome = $100; crypto cash bonus = $0 (it's the stake).
update public.accounts set bonus = 100 where server in ('sports','fx') and coalesce(bonus,0) = 0;

-- ② Set bonus on signup alongside the forced opening balance (non-admin only).
create or replace function public.force_opening_balance()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then
    new.balance := case new.server when 'sports' then 100 when 'crypto' then 0 when 'fx' then 100 else 0 end;
    new.bonus   := case new.server when 'sports' then 100 when 'fx' then 100 else 0 end;
  end if;
  return new;
end;$$;

-- ③ Withdrawable amount for an account.
create or replace function public.withdrawable_for(p_acct text)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare v_acct public.accounts%rowtype; v_usdt numeric;
begin
  select * into v_acct from public.accounts where acct_no = p_acct;
  if v_acct.acct_no is null then return 0; end if;
  if v_acct.server in ('sports','fx') then
    return greatest(0, round((coalesce(v_acct.balance,0) - coalesce(v_acct.bonus,0))::numeric, 2));
  elsif v_acct.server = 'crypto' then
    -- crypto withdrawals are USDT cash; the welcome ALPXS is a locked stake (excluded).
    select coalesce(qty,0) into v_usdt from public.crypto_holdings where acct_no = p_acct and asset = 'USDT';
    return greatest(0, round(coalesce(v_usdt,0)::numeric, 2));
  end if;
  return 0;
end;$$;

-- ④ AUTO-REJECT: block any withdraw request that exceeds withdrawable, for ALL apps.
create or replace function public.guard_withdraw_request()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_w numeric; v_pending numeric;
begin
  if lower(coalesce(NEW.type,'')) = 'withdraw' and coalesce(NEW.acct_no,'') <> '' then
    -- LOWER bound: reject zero/negative/missing amounts. (NaN/Infinity are caught by the
    -- upper-bound check below — in Postgres NaN and Infinity compare greater than any
    -- finite withdrawable, so they fail 'amount > withdrawable'.)
    if NEW.amount is null or NEW.amount <= 0 then
      raise exception 'Withdrawal amount must be greater than zero.'
        using errcode = 'check_violation';
    end if;
    v_w := public.withdrawable_for(NEW.acct_no);
    -- UPPER bound must include ALREADY-PENDING withdrawals for this account, or a user
    -- could stack N pending requests that each pass alone but together exceed the
    -- balance (FX/crypto debit on approval, so the funds aren't reserved at request time).
    select coalesce(sum(amount),0) into v_pending
      from public.requests
     where acct_no = NEW.acct_no and lower(type) = 'withdraw' and status = 'pending';
    if NEW.amount + coalesce(v_pending,0) > v_w + 0.001 then
      raise exception 'Amount plus pending withdrawals ($%) exceeds your withdrawable balance (max $%)',
        v_pending, v_w using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;$$;

drop trigger if exists trg_guard_withdraw on public.requests;
create trigger trg_guard_withdraw
  before insert on public.requests
  for each row execute function public.guard_withdraw_request();
