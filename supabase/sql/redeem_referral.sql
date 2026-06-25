-- Alpexa — referral redemption (server-enforced, one per customer)
--
-- The referral bonus used to be gated by a localStorage flag (alpexa.referralRedeemed)
-- and credited client-side, so clearing storage let a user re-claim the ~$150 ALPXS
-- bonus repeatedly. This moves the gate + credit to the server: redeem_referral inserts
-- a unique row per customer (fails on the 2nd attempt) and credits ALPXS to
-- crypto_holdings atomically. Run ONCE in the Supabase SQL editor. Idempotent.

create table if not exists public.referral_redemptions (
  cust_id    text primary key,           -- one redemption per customer
  acct_no    text,
  code       text,
  created_at timestamptz not null default now()
);
alter table public.referral_redemptions enable row level security;  -- no client policies; only the SECURITY DEFINER RPC touches it

create or replace function public.redeem_referral(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct text; v_cust text; v_qty numeric := 100;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_code is null or length(btrim(p_code)) < 4 then return jsonb_build_object('ok',false,'error','invalid code'); end if;
  select a.acct_no, pl.cust_id into v_acct, v_cust
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'crypto' and pl.auth_id = v_uid
   limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no crypto account'); end if;
  -- one redemption per customer — the primary key makes the 2nd attempt fail
  begin
    insert into public.referral_redemptions(cust_id, acct_no, code) values (v_cust, v_acct, upper(btrim(p_code)));
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','already redeemed');
  end;
  -- credit the bonus to crypto_holdings (qty model), server-side
  insert into public.crypto_holdings(acct_no, asset, qty)
    values (v_acct, 'ALPXS', v_qty)
    on conflict (acct_no, asset) do update set qty = public.crypto_holdings.qty + v_qty;
  return jsonb_build_object('ok', true, 'asset', 'ALPXS', 'qty', v_qty);
end;$$;
