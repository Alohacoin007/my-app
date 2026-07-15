-- Alpexa — internal crypto P2P transfer (#25). Server-authoritative, qty-conserving.
--
-- Replaces the old fake "send to another Alpexa user" (which only inserted a `payments`
-- row and moved balances on the CLIENT — reverted on reload, no real coins moved, and the
-- recipient credited with no matching debit = money from nothing). This RPC moves COIN QTY
-- in crypto_holdings atomically: debit sender qty, credit recipient the SAME qty. Idempotent
-- by ref. USDT qty == USD (1:1); other coins are coin units (client sends qty).
--
-- Deploy: run this whole file in the Supabase SQL editor (idempotent — safe to re-run).

-- ① idempotency + audit ledger for P2P sends
create table if not exists public.crypto_transfers (
  ref        text primary key,
  from_acct  text not null,
  to_acct    text not null,
  asset      text not null,
  qty        numeric not null,
  from_cust  text,
  to_cust    text,
  created_at timestamptz not null default now()
);
alter table public.crypto_transfers enable row level security;
-- no client policies → clients can't read/write it directly; the SECURITY DEFINER RPC does.

-- ② resolve an email to that user's CRYPTO account (was called by the client but never defined).
--    SECURITY DEFINER so the lookup works under RLS; returns only the account number.
create or replace function public.acct_for_email(p_email text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_acct text;
begin
  if p_email is null or length(trim(p_email)) = 0 then return null; end if;
  select a.acct_no into v_acct
    from public.accounts a
    join public.players p on p.id = a.player_id
   where a.server = 'crypto' and lower(p.email) = lower(trim(p_email))
   limit 1;
  return v_acct;
end;$$;

-- ③ the transfer. Sender is ALWAYS the caller's own crypto account (derived from auth.uid);
--    you can only send FROM yourself. Recipient is any existing crypto account.
create or replace function public.crypto_send_internal(p_ref text, p_to_acct text, p_asset text, p_qty numeric)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_from_acct text; v_from_cust text;
  v_to accounts%rowtype; v_to_cust text;
  v_have numeric;
begin
  if v_uid is null then return json_build_object('ok',false,'error','not authenticated'); end if;
  if p_qty is null or p_qty <= 0 then return json_build_object('ok',false,'error','amount must be positive'); end if;
  if p_asset is null or length(p_asset) = 0 then return json_build_object('ok',false,'error','no asset'); end if;
  if p_ref is null or length(p_ref) < 6 then return json_build_object('ok',false,'error','bad ref'); end if;

  -- idempotency gate (check BEFORE any mutation)
  if exists (select 1 from crypto_transfers where ref = p_ref) then
    return json_build_object('ok',true,'duplicate',true,'ref',p_ref);
  end if;

  -- sender = the caller's OWN crypto account
  select a.acct_no, pl.cust_id into v_from_acct, v_from_cust
    from accounts a join players pl on pl.id = a.player_id
   where pl.auth_id = v_uid and a.server = 'crypto'
   limit 1;
  if v_from_acct is null then return json_build_object('ok',false,'error','no crypto account'); end if;

  -- recipient must be an existing crypto account, and not yourself
  select * into v_to from accounts where acct_no = p_to_acct and server = 'crypto';
  if v_to.acct_no is null then return json_build_object('ok',false,'error','recipient not found'); end if;
  if v_to.acct_no = v_from_acct then return json_build_object('ok',false,'error','cannot send to yourself'); end if;
  select cust_id into v_to_cust from players where id = v_to.player_id;

  -- sender must actually hold p_qty of this coin
  select coalesce(qty,0) into v_have from crypto_holdings where acct_no = v_from_acct and asset = p_asset;
  if coalesce(v_have,0) < p_qty then
    return json_build_object('ok',false,'error','insufficient balance','asset',p_asset,'have',coalesce(v_have,0));
  end if;

  -- record FIRST (PK on ref is the atomic idempotency backstop), then move the coins
  insert into crypto_transfers(ref, from_acct, to_acct, asset, qty, from_cust, to_cust)
    values (p_ref, v_from_acct, v_to.acct_no, p_asset, p_qty, v_from_cust, v_to_cust);

  update crypto_holdings set qty = round((qty - p_qty)::numeric, 8), updated_at = now()
    where acct_no = v_from_acct and asset = p_asset;

  insert into crypto_holdings(acct_no, asset, qty, updated_at)
    values (v_to.acct_no, p_asset, round(p_qty::numeric, 8), now())
    on conflict (acct_no, asset) do update
      set qty = round((crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();

  return json_build_object('ok',true,'ref',p_ref,'from',v_from_acct,'to',v_to.acct_no,'asset',p_asset,'qty',p_qty);
end;$$;

grant execute on function public.acct_for_email(text) to authenticated;
grant execute on function public.crypto_send_internal(text, text, text, numeric) to authenticated;
