-- Alpexa — crypto_trade (server-centre, safe by construction)
-- Executes a crypto BUY/SELL at the SERVER price (from `prices`, kept fresh by the
-- crypto-price Edge function). The client NEVER sets the fill price, so a frozen/
-- stale client price can't be exploited (the RPC rejects a stale server price).
--
-- VERIFIED model (matches app_transfer):
--   • crypto_holdings(acct_no, asset, qty)  — EXISTS already; PK (acct_no, asset).
--       asset='USDT' = USD cash;  asset='BTC'/'ETH'/… = coin quantity.
--   • Crypto money lives in crypto_holdings (NOT accounts.balance, NOT ledger).
--   • BUY  p_usd: debit USDT qty by p_usd, credit coin qty = (p_usd − fee)/price.
--   • SELL p_usd-worth: sell qty = p_usd/price; credit USDT by (gross − fee).
--   • SELL p_all=true: sell the ENTIRE coin holding (qty-based) — avoids the
--       client/server price-gap rejection when liquidating a full position.
-- crypto_holdings is created/managed elsewhere — this script does NOT recreate it.

-- 1) Idempotency lock + server-side trade history.
create table if not exists public.crypto_trades (
  ref        text primary key,
  cust_id    text,
  acct_no    text,
  asset      text,
  side       text,
  usd        numeric,
  qty        numeric,
  price      numeric,
  fee        numeric,
  created_at timestamptz not null default now()
);
alter table public.crypto_trades enable row level security;
drop policy if exists crypto_trades_read on public.crypto_trades;
create policy crypto_trades_read on public.crypto_trades for select using (true);

-- 2) Price freshness: stamp `prices` so the RPC can reject a frozen feed.
alter table public.prices add column if not exists updated_at timestamptz not null default now();
create or replace function public.touch_prices() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_prices_touch on public.prices;
create trigger trg_prices_touch before insert or update on public.prices
  for each row execute function public.touch_prices();

-- 3) The trade RPC. (Drop the old 6-arg signature first so adding p_all doesn't
--    create an ambiguous overload.)
drop function if exists public.crypto_trade(text, text, text, numeric, text, numeric);
create or replace function public.crypto_trade(
  p_ref text, p_acct text, p_symbol text, p_usd numeric, p_side text,
  p_markup numeric default 0, p_all boolean default false
) returns jsonb language plpgsql security definer
  set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text;
        v_price numeric; v_pts timestamptz; v_cash numeric; v_have numeric;
        v_qty numeric; v_net numeric; v_fee numeric; v_gross numeric; v_mk numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not p_all and (p_usd is null or p_usd <= 0) then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if p_side not in ('buy','sell') then return jsonb_build_object('ok',false,'error','bad side'); end if;
  if p_symbol = 'USDT' then return jsonb_build_object('ok',false,'error','cannot trade USDT'); end if;

  -- ownership: this crypto account belongs to the signed-in user
  select * into v_acct from public.accounts where acct_no = p_acct and server = 'crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from public.players p where p.id = v_acct.player_id and p.auth_id = v_uid) then
    return jsonb_build_object('ok',false,'error','not your account');
  end if;
  select cust_id into v_cust from public.players where id = v_acct.player_id;

  -- idempotent: same ref never double-applies
  if exists (select 1 from public.crypto_trades where ref = p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  -- SERVER price + freshness (reject if missing or older than 120s = feed frozen)
  select mid, updated_at into v_price, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_price is null or v_price <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_symbol); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  v_mk := least(greatest(coalesce(p_markup,0),0),50);  -- house markup %, cap 50

  if p_side = 'buy' then
    select coalesce(qty,0) into v_cash from public.crypto_holdings where acct_no = p_acct and asset = 'USDT';
    if coalesce(v_cash,0) < p_usd then return jsonb_build_object('ok',false,'error','insufficient balance','balance',coalesce(v_cash,0)); end if;
    v_fee   := round(p_usd * (v_mk / 100.0), 2);
    v_net   := p_usd - v_fee;
    v_qty   := round((v_net / v_price)::numeric, 8);
    v_gross := p_usd;
  else  -- sell
    select coalesce(qty,0) into v_have from public.crypto_holdings where acct_no = p_acct and asset = p_symbol;
    if p_all then
      v_qty := round(coalesce(v_have,0), 8);                 -- liquidate the whole position
    else
      v_qty := round((p_usd / v_price)::numeric, 8);
    end if;
    if v_qty <= 0 then return jsonb_build_object('ok',false,'error','nothing to sell'); end if;
    if coalesce(v_have,0) < v_qty - 1e-9 then return jsonb_build_object('ok',false,'error','insufficient holdings','have',coalesce(v_have,0)); end if;
    v_gross := round((v_qty * v_price)::numeric, 2);
    v_fee   := round(v_gross * (v_mk / 100.0), 2);
    v_net   := v_gross - v_fee;
  end if;

  -- lock FIRST (idempotency), then move holdings — mirrors app_transfer's order.
  insert into public.crypto_trades(ref,cust_id,acct_no,asset,side,usd,qty,price,fee)
    values (p_ref, v_cust, p_acct, p_symbol, p_side, v_gross, v_qty, v_price, v_fee);

  if p_side = 'buy' then
    update public.crypto_holdings set qty = round((qty - p_usd)::numeric, 8), updated_at = now()
      where acct_no = p_acct and asset = 'USDT';
    insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
      values (p_acct, p_symbol, v_qty, now())
      on conflict (acct_no, asset) do update set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();
  else  -- sell
    update public.crypto_holdings set qty = round((qty - v_qty)::numeric, 8), updated_at = now()
      where acct_no = p_acct and asset = p_symbol;
    insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
      values (p_acct, 'USDT', round(v_net::numeric, 8), now())
      on conflict (acct_no, asset) do update set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();
  end if;

  return jsonb_build_object('ok',true,'side',p_side,'qty',v_qty,'price',v_price,'fee',v_fee,'usd',v_gross,'net',v_net);
end;$$;
