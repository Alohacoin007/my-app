-- Alpexa — fx_close RPC (server-centre, safe by construction)
-- Closes an OPEN FX/CFD position at the SERVER price (from `prices`, kept fresh by
-- the fx-prices/stock-prices Edge functions), computes realized P&L server-side
-- (so a frozen/stale CLIENT price can't be used to bank a wrong number), credits
-- the ledger (trigger applies it to accounts.balance), marks the position closed,
-- and records a settlement. The client never sets the fill price or the P&L.
--
-- Mirrors the client P&L engine exactly:
--   lot   = XAUUSD?100, XAGUSD?5000, FX?100000, else 1
--   distance = (close-open) * (BUY?+1:-1)
--   pnlQuote = distance * lot * size
--   if cls != 'FX': pnl_usd = pnlQuote
--   else (FX): quote=USD -> pnlQuote ; base=USD -> pnlQuote/close ;
--              cross -> pnlQuote * (quote->USD live from prices)
-- Safe by default: missing spec / missing or stale price / cross rate missing ->
-- the RPC REJECTS, and the app falls back to its existing client-side close.

-- 1) Per-symbol class (so the server knows lot size + whether to FX-convert).
create table if not exists public.fx_specs (symbol text primary key, cls text not null);
insert into public.fx_specs(symbol,cls) values
  ('EURUSD','FX'),('GBPUSD','FX'),('USDJPY','FX'),('AUDUSD','FX'),('USDCHF','FX'),
  ('USDCAD','FX'),('NZDUSD','FX'),('EURJPY','FX'),('EURGBP','FX'),('GBPJPY','FX'),
  ('EURAUD','FX'),('AUDJPY','FX'),('CHFJPY','FX'),('EURCHF','FX'),('USDKRW','FX'),
  ('USDCNH','FX'),('USDSGD','FX'),('USDMXN','FX'),('XAUUSD','FX'),('XAGUSD','FX'),
  ('SPACEX','STOCK'),('AAPL','STOCK'),('TSLA','STOCK'),('NVDA','STOCK'),('MSFT','STOCK'),
  ('GOOGL','STOCK'),('META','STOCK'),('AMZN','STOCK'),('NFLX','STOCK'),('AMD','STOCK'),
  ('JPM','STOCK'),('IONQ','STOCK'),('RGTI','STOCK'),('QBTS','STOCK'),('QUBT','STOCK'),
  ('ARQQ','STOCK'),('TSM','STOCK'),('INTC','STOCK'),('QCOM','STOCK'),('AVGO','STOCK'),
  ('ASML','STOCK'),('MU','STOCK'),('TXN','STOCK'),('AMAT','STOCK'),('LRCX','STOCK'),
  ('KLAC','STOCK'),('PLTR','STOCK'),('SMCI','STOCK'),('ANET','STOCK'),('CRWD','STOCK'),
  ('ARM','STOCK'),('ORCL','STOCK'),('NOW','STOCK'),('CRM','STOCK'),('SNOW','STOCK'),
  ('ADBE','STOCK'),
  ('BTCUSD','CRYPTO'),('ETHUSD','CRYPTO'),('SOLUSD','CRYPTO'),('XRPUSD','CRYPTO'),
  ('ADAUSD','CRYPTO'),('DOGEUSD','CRYPTO'),('BNBUSD','CRYPTO'),('DOTUSD','CRYPTO'),
  ('AVAXUSD','CRYPTO'),('LINKUSD','CRYPTO'),
  ('NAS100','INDEX'),('SPX500','INDEX'),('US30','INDEX'),('GER40','INDEX'),('UK100','INDEX'),
  ('JPN225','INDEX'),('HK50','INDEX'),('AUS200','INDEX'),('EUSTX50','INDEX'),('WTI','INDEX')
on conflict (symbol) do update set cls = excluded.cls;

-- 2) The close RPC.
create or replace function public.fx_close(p_local_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_pos public.positions%rowtype;
  v_cust text; v_acct text; v_cls text;
  v_mid numeric; v_pts timestamptz;
  v_side text; v_open numeric; v_size numeric; v_sym text;
  v_lot numeric; v_dist numeric; v_pnlq numeric; v_pnl numeric;
  v_base text; v_quote text; v_q2usd numeric; v_qmid numeric;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;

  -- find THIS caller's open FX position
  select p.* into v_pos
    from public.positions p
    join public.accounts a on a.acct_no = p.acct_no
    join public.players  pl on pl.id = a.player_id
   where p.local_id = p_local_id and p.server = 'fx' and p.status = 'open'
     and pl.auth_id = auth.uid()
   limit 1;
  if v_pos.local_id is null then return jsonb_build_object('ok',false,'error','position not found or already closed'); end if;
  v_acct := v_pos.acct_no; v_sym := v_pos.symbol; v_side := v_pos.side;
  v_open := coalesce(v_pos.open_price,0); v_size := coalesce(v_pos.size,0);
  select cust_id into v_cust from public.accounts where acct_no = v_acct;

  -- class spec (reject if unknown -> client fallback)
  select cls into v_cls from public.fx_specs where symbol = v_sym;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||v_sym); end if;

  -- SERVER close price + freshness (reject if missing/stale -> client fallback)
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = v_sym limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||v_sym); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  -- P&L (exact port of the client engine), USD
  v_lot  := case when v_sym = 'XAUUSD' then 100 when v_sym = 'XAGUSD' then 5000 when v_cls = 'FX' then 100000 else 1 end;
  v_dist := (v_mid - v_open) * (case when upper(v_side) = 'BUY' then 1 else -1 end);
  v_pnlq := v_dist * v_lot * v_size;
  if v_cls <> 'FX' then
    v_pnl := v_pnlq;
  else
    v_base := left(v_sym,3); v_quote := substr(v_sym,4,3);
    if v_quote = 'USD' then
      v_pnl := v_pnlq;
    elsif v_base = 'USD' then
      v_pnl := v_pnlq / v_mid;
    else
      -- cross pair: quote -> USD live from prices ('USD'+quote -> 1/mid, else quote+'USD' -> mid)
      select mid into v_qmid from public.prices where symbol = 'USD'||v_quote limit 1;
      if v_qmid is not null and v_qmid > 0 then v_q2usd := 1.0 / v_qmid;
      else
        select mid into v_qmid from public.prices where symbol = v_quote||'USD' limit 1;
        if v_qmid is not null and v_qmid > 0 then v_q2usd := v_qmid; end if;
      end if;
      if v_q2usd is null then return jsonb_build_object('ok',false,'error','no fx rate for '||v_quote); end if;
      v_pnl := v_pnlq * v_q2usd;
    end if;
  end if;
  v_pnl := round(v_pnl, 2);

  -- ATOMIC CLAIM: close only if still open (prevents double-bank across devices)
  update public.positions set status = 'closed', pnl = v_pnl
    where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'open';
  if not found then return jsonb_build_object('ok',true,'duplicate',true); end if;

  -- apply realized P&L to balance via the ledger (trigger updates accounts.balance)
  insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
    values (v_acct, v_cust, 'fx', 'fx_close', v_pnl, 'fxclose-'||p_local_id);

  -- record the settlement (closed-trade history; the app already reads these)
  insert into public.settlements(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail)
    values (v_cust, v_acct, 'fx', 'fx_close', p_local_id, v_sym, v_size, v_pnl,
            upper(v_side)||' '||v_size||' @ '||v_open||' -> '||round(v_mid,5));

  return jsonb_build_object('ok',true,'pnl',v_pnl,'close',round(v_mid,6),'side',upper(v_side),'size',v_size);
end;$$;
