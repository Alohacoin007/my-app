-- Alpexa — admin ALPXS token grant (server-authoritative, idempotent)
-- ============================================================================
-- Give a customer ALPXS tokens from the back office (manager-mobile "🪙 Give
-- ALPXS token"). Mirrors redeem_referral's crypto_holdings credit, but:
--   • is_admin()-gated — only a real admin JWT (adminSignIn) can call it.
--   • repeatable — the admin may grant any qty, any number of times (unlike the
--     one-per-customer referral). Each grant is an EXPLICIT idempotent record
--     keyed by ref, so a network retry (same ref) never double-credits.
--
-- Crypto money model: all crypto money lives in crypto_holdings(acct_no, asset,
-- qty) — NOT accounts.balance, NOT ledger. asset='ALPXS' is a coin quantity.
-- Client NEVER writes crypto_holdings — this SECURITY DEFINER RPC is the only path.
--
-- Deploy: run this whole file in the Supabase SQL editor (idempotent — safe to re-run).
-- ============================================================================

-- ① idempotency + audit record for admin token grants (ref = atomic backstop)
create table if not exists public.admin_grants (
  ref        text primary key,
  acct_no    text,
  asset      text,
  qty        numeric,
  created_at timestamptz not null default now()
);
alter table public.admin_grants enable row level security;  -- no client policies; only the SECURITY DEFINER RPC touches it

create or replace function public.admin_give_alpxs(p_ref text, p_acct text, p_qty numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_ref is null or length(btrim(p_ref)) < 6 then return jsonb_build_object('ok',false,'error','bad ref'); end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('ok',false,'error','qty must be > 0'); end if;
  if not exists (select 1 from public.accounts where acct_no = p_acct and server = 'crypto') then
    return jsonb_build_object('ok',false,'error','crypto account not found');
  end if;

  -- idempotency gate (check BEFORE any mutation)
  if exists (select 1 from public.admin_grants where ref = p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true,'ref',p_ref);
  end if;

  -- record FIRST (PK on ref = atomic idempotency backstop), then credit the coin.
  -- A concurrent call with the same ref loses the PK race → caught → duplicate, no double-credit.
  begin
    insert into public.admin_grants(ref, acct_no, asset, qty) values (p_ref, p_acct, 'ALPXS', p_qty);
  exception when unique_violation then
    return jsonb_build_object('ok',true,'duplicate',true,'ref',p_ref);
  end;

  insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
    values (p_acct, 'ALPXS', round(p_qty::numeric, 8), now())
    on conflict (acct_no, asset)
      do update set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();

  return jsonb_build_object('ok',true,'asset','ALPXS','qty',p_qty,'acct',p_acct);
end;$$;

grant execute on function public.admin_give_alpxs(text, text, numeric) to authenticated;
