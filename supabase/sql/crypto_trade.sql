-- Alpexa — crypto_trade (server-centre, safe by construction)
-- Executes a crypto BUY/SELL at the SERVER price (from the `prices` table, kept
-- fresh by the crypto-prices Edge function). The client NEVER sets the fill price,
-- so a frozen/stale client price can't be exploited. Holdings are stored as COIN
-- QUANTITY on the server (value = qty × live price). USD cash = the crypto
-- account's accounts.balance (same as the app's USDT). Atomic + idempotent (p_ref).
--
-- Model:
--   • accounts.balance (server='crypto') = USD cash (USDT).
--   • crypto_holdings = coin quantities (BTC, ETH, …) — NOT USDT.
--   • BUY  p_usd: deduct USD cash, add qty = (p_usd − markup_fee) / price.
--   • SELL p_usd-worth: add USD cash (− markup_fee), reduce qty = p_usd / price.

-- 1) Holdings store (coin quantities).
create table if not exists public.crypto_holdings (
  cust_id    text not null,
  acct_no    text not null,
  symbol     text not null,
  qty        numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (cust_id, symbol)
);
alter table public.crypto_holdings enable row level security;
drop policy if exists crypto_holdings_read on public.crypto_holdings;
create policy crypto_holdings_read on public.crypto_holdings for select using (true);

-- 2) Price freshness: stamp `prices` so the RPC can reject stale/frozen prices.
alter table public.prices add column if not exists updated_at timestamptz not null default now();
create or replace function public.touch_prices() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_prices_touch on public.prices;
create trigger trg_prices_touch before insert or update on public.prices
  for each row execute function public.touch_prices();

-- 3) The trade RPC.
create or replace function public.crypto_trade(
  p_ref text, p_acct text, p_symbol text, p_usd numeric, p_side text, p_markup numeric default 0
) returns jsonb language plpgsql security definer as $$
declare v_cust text; v_price numeric; v_pts timestamptz;
        v_bal numeric; v_qty numeric; v_net numeric; v_fee numeric; v_have numeric;
begin
  -- ownership: this crypto account must belong to the signed-in user
  select pl.cust_id into v_cust
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.acct_no = p_acct and a.server = 'crypto' and pl.auth_id = auth.uid()
   limit 1;
  if v_cust is null then return jsonb_build_object('ok',false,'error','not your account'); end if;

  -- idempotent: same ref never double-applies
  if exists(select 1 from public.ledger where ref = p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  -- SERVER price + freshness (reject if missing or older than 120s = feed frozen)
  select mid, updated_at into v_price, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_price is null or v_price <= 0 then return jsonb_build_object('ok',false,'error','no price'); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  if p_usd is null or p_usd <= 0 then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  v_fee := round(p_usd * (least(greatest(coalesce(p_markup,0),0),50) / 100.0), 2);  -- house markup (cap 50%)
  v_net := p_usd - v_fee;

  if p_side = 'buy' then
    select balance into v_bal from public.accounts where acct_no = p_acct and server = 'crypto';
    if coalesce(v_bal,0) < p_usd then return jsonb_build_object('ok',false,'error','insufficient balance'); end if;
    v_qty := v_net / v_price;
    insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
      values (p_acct, v_cust, 'crypto', 'crypto_buy', -p_usd, p_ref);
    insert into public.crypto_holdings(cust_id, acct_no, symbol, qty, updated_at)
      values (v_cust, p_acct, p_symbol, v_qty, now())
      on conflict (cust_id, symbol) do update
        set qty = public.crypto_holdings.qty + excluded.qty, acct_no = excluded.acct_no, updated_at = now();
    return jsonb_build_object('ok',true,'side','buy','qty',v_qty,'price',v_price,'fee',v_fee);

  elsif p_side = 'sell' then
    v_qty := p_usd / v_price;                      -- p_usd = USD worth to sell
    select qty into v_have from public.crypto_holdings where cust_id = v_cust and symbol = p_symbol;
    if coalesce(v_have,0) < v_qty - 1e-9 then return jsonb_build_object('ok',false,'error','insufficient holdings'); end if;
    insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
      values (p_acct, v_cust, 'crypto', 'crypto_sell', v_net, p_ref);
    update public.crypto_holdings set qty = qty - v_qty, updated_at = now()
      where cust_id = v_cust and symbol = p_symbol;
    return jsonb_build_object('ok',true,'side','sell','qty',v_qty,'price',v_price,'fee',v_fee);

  else
    return jsonb_build_object('ok',false,'error','bad side');
  end if;
end;$$;
