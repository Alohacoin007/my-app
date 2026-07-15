-- Alpexa — Crypto EXTERNAL withdrawal: mandatory 2FA (AAL2) + address allowlist (24h)
-- ============================================================================
-- Closes P1: today a crypto on-chain withdrawal (Send → 0x…) creates a back-office
-- `requests` row with NO server-side 2FA and NO destination allowlist. The client
-- 2FA (alpexa.twofa) and the whitelist panel were client-only → bypassable by a
-- stolen session or a modified client. This moves BOTH checks to the server so a
-- withdrawal request cannot even be INSERTED unless it clears its amount tier:
--   < $1,000  → nothing (frictionless everyday sends)
--   ≥ $1,000  → session is AAL2 (the user just passed TOTP 2FA)
--   ≥ $5,000  → AAL2 AND destination on the caller's active allowlist (added ≥24h ago)
--
-- Invariant: on-chain crypto withdraw request exists ⟹ (amt<1000) OR (amt≥1000 ∧ AAL2);
--   AND (amt≥5000 ⟹ dest ∈ active allowlist). Non-crypto (bank/card/wire) withdrawals
--   are untouched; internal Alpexa→Alpexa sends don't create requests, so untouched too.
-- Real money still only moves on operator APPROVAL (apply_crypto_withdraw_holding);
--   this is account-takeover defense-in-depth, enforced where it can't be skipped.
-- ============================================================================

-- ① Allowlist table — one row per pre-approved destination address, per customer.
create table if not exists public.crypto_allowlist (
  id         uuid primary key default gen_random_uuid(),
  cust_id    text not null,
  label      text not null default '',
  address    text not null,
  network    text not null default 'ERC-20',
  created_at timestamptz not null default now(),
  active_at  timestamptz not null default (now() + interval '24 hours')  -- 24h delay
);
-- One address per customer (case-insensitive); re-adding just updates the label/timer.
create unique index if not exists crypto_allowlist_uq
  on public.crypto_allowlist (cust_id, lower(address));

-- ② active_at is SERVER-forced to created_at + 24h — a client can't pre-activate an
--    address by sending active_at=now(). (Admins may set it explicitly, e.g. support.)
create or replace function public.force_allowlist_delay()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then
    new.created_at := now();
    new.active_at  := now() + interval '24 hours';
  end if;
  return new;
end;$$;
drop trigger if exists trg_allowlist_delay on public.crypto_allowlist;
create trigger trg_allowlist_delay
  before insert on public.crypto_allowlist
  for each row execute function public.force_allowlist_delay();

-- ③ RLS — a customer manages ONLY their own allowlist; admins can read all.
alter table public.crypto_allowlist enable row level security;
drop policy if exists crypto_allowlist_own   on public.crypto_allowlist;
create policy crypto_allowlist_own   on public.crypto_allowlist
  for all    using (public.owns_cust(cust_id)) with check (public.owns_cust(cust_id));
drop policy if exists crypto_allowlist_admin on public.crypto_allowlist;
create policy crypto_allowlist_admin on public.crypto_allowlist
  for select using (public.is_admin());

-- ③b EMAIL-OTP 2FA (accessible alternative to an authenticator app) ───────────
-- The 'withdraw-otp' Edge function emails a 6-digit code (to the account's REGISTERED
-- email — server-decided, never client-supplied) and stores its HASH here. The user
-- enters the code → verify_withdraw_otp() opens a short 'unlocked_until' window that
-- the withdraw guard accepts in place of an authenticator-app AAL2 session.
create extension if not exists pgcrypto;   -- digest() for the code hash
create table if not exists public.withdraw_otp (
  cust_id        text primary key,
  code_hash      text,                 -- sha256(code); cleared on success (one-time)
  expires_at     timestamptz,          -- code valid until (≈10 min)
  attempts       int not null default 0,
  unlocked_until timestamptz,          -- verified window the guard honors (≈15 min)
  updated_at     timestamptz not null default now()
);
-- Service-role only: the Edge writes the code hash, the SECURITY DEFINER RPC reads it.
-- No user policies → RLS denies all direct client access (the code hash never leaks).
alter table public.withdraw_otp enable row level security;

-- Verify the code the user typed. On match: open a 15-min unlock and burn the code.
-- Rate-limited (max 5 tries) and time-boxed (10-min code). Returns {ok} / {ok:false,error}.
create or replace function public.verify_withdraw_otp(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_cust text; v_row public.withdraw_otp%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select cust_id into v_cust from public.players where auth_id = v_uid limit 1;
  if v_cust is null then return jsonb_build_object('ok',false,'error','no account'); end if;

  select * into v_row from public.withdraw_otp where cust_id = v_cust;
  if v_row.cust_id is null or v_row.code_hash is null then
    return jsonb_build_object('ok',false,'error','no code — request a new one'); end if;
  if v_row.expires_at is null or v_row.expires_at < now() then
    return jsonb_build_object('ok',false,'error','code expired — request a new one'); end if;
  if coalesce(v_row.attempts,0) >= 5 then
    return jsonb_build_object('ok',false,'error','too many attempts — request a new one'); end if;

  if v_row.code_hash <> encode(digest(coalesce(p_code,''), 'sha256'), 'hex') then
    update public.withdraw_otp set attempts = coalesce(attempts,0) + 1, updated_at = now() where cust_id = v_cust;
    return jsonb_build_object('ok',false,'error','incorrect code');
  end if;

  -- success: open the unlock window and burn the code (one-time use)
  update public.withdraw_otp
     set unlocked_until = now() + interval '15 minutes', code_hash = null, expires_at = null, attempts = 0, updated_at = now()
   where cust_id = v_cust;
  return jsonb_build_object('ok',true,'unlocked_minutes',15);
end;$$;
revoke all on function public.verify_withdraw_otp(text) from public;
grant execute on function public.verify_withdraw_otp(text) to authenticated;

-- ④ ENFORCEMENT — block an on-chain crypto withdraw request unless (2FA tier) AAL2 or
--    a fresh email-OTP unlock, and (allowlist tier) an active allowlisted destination.
--    Runs BEFORE INSERT on requests, alongside the existing withdrawable guard.
create or replace function public.guard_crypto_withdraw_security()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_is_chain boolean;
  v_amt numeric := coalesce(NEW.amount, 0);
  -- Convenience dial (tiered by USD amount):
  --   < $1,000            → nothing (everyday small sends stay frictionless)
  --   ≥ $1,000            → 2FA (AAL2)
  --   ≥ $5,000            → 2FA (AAL2) + active allowlist (24h hold)
  c_2fa_threshold constant numeric := 1000;
  c_wl_threshold  constant numeric := 5000;
begin
  -- Only gate ON-CHAIN crypto withdrawals. Bank/card/wire (network ACH/Wire/Card, or a
  -- non-crypto address) and internal transfers are NOT affected.
  v_is_chain := lower(coalesce(NEW.type,'')) = 'withdraw'
    and coalesce(NEW.address,'') <> ''
    and coalesce(NEW.network,'') ~* '^(erc|eth|btc|bitcoin|sol|trc)';
  if not v_is_chain then return NEW; end if;

  -- (1) 2FA at/above $1,000. Accept EITHER an authenticator-app AAL2 session OR a fresh
  --     email-OTP unlock (verify_withdraw_otp). Both are server-verified → un-bypassable.
  if v_amt >= c_2fa_threshold
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
     and not exists (
       select 1 from public.withdraw_otp w
        where w.cust_id = NEW.cust_id and w.unlocked_until is not null and w.unlocked_until > now()
     ) then
    raise exception 'Two-factor verification is required to withdraw $% or more to an external address.', c_2fa_threshold
      using errcode = 'check_violation';
  end if;

  -- (2) Allowlist + 24h at/above $5,000. The destination must be on THIS customer's
  --     allowlist and active (added ≥24h ago). Match on address (chain-unique).
  if v_amt >= c_wl_threshold then
    if not exists (
      select 1 from public.crypto_allowlist a
       where a.cust_id = NEW.cust_id
         and lower(a.address) = lower(NEW.address)
         and a.active_at <= now()
    ) then
      raise exception 'Withdrawals of $% or more must go to an address on your active allowlist (add it and wait 24h).', c_wl_threshold
        using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;$$;

drop trigger if exists trg_guard_crypto_withdraw_security on public.requests;
create trigger trg_guard_crypto_withdraw_security
  before insert on public.requests
  for each row execute function public.guard_crypto_withdraw_security();
