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
  v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0; v_close numeric;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;

  -- find THIS caller's open FX position — WITH A ROW LOCK (FOR UPDATE OF p).
  -- Race hardening: the 30% stop-out cron and a user hammering the red ✕ can hit the SAME
  -- position at the same instant. FOR UPDATE serialises them — the 2nd caller BLOCKS until the
  -- 1st commits, then Postgres re-checks the WHERE against the new row version: status is now
  -- 'closed', so it no longer matches status='open' → this SELECT returns nothing → we reject as
  -- 'already closed'. So P&L is computed and banked EXACTLY once (no double-close, no double-bank).
  -- (The atomic UPDATE ... WHERE status='open' below stays as a second, independent backstop.)
  select p.* into v_pos
    from public.positions p
    join public.accounts a on a.acct_no = p.acct_no
    join public.players  pl on pl.id = a.player_id
   where p.local_id = p_local_id and p.server = 'fx' and p.status = 'open'
     and pl.auth_id = auth.uid()
   limit 1
   for update of p;
  if v_pos.local_id is null then return jsonb_build_object('ok',false,'error','position not found or already closed','code','ALREADY_CLOSED'); end if;
  v_acct := v_pos.acct_no; v_sym := v_pos.symbol; v_side := v_pos.side;
  v_open := coalesce(v_pos.open_price,0); v_size := coalesce(v_pos.size,0);
  v_cust := v_pos.cust_id;   -- positions carries cust_id (accounts does not)

  -- class spec (reject if unknown -> client fallback)
  select cls into v_cls from public.fx_specs where symbol = v_sym;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||v_sym); end if;

  -- SERVER close price + freshness (reject if missing/stale -> client fallback)
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = v_sym limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||v_sym); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  -- SPREAD ON CLOSE (FX only): a BUY position is closed by SELLING at BID (mid-half),
  -- a SELL position is closed by BUYING at ASK (mid+half). Mirrors fx_open's fill side
  -- so a round-trip pays the full spread once. Non-FX (crypto/stock/index) uses a
  -- bps-of-price spread instead (see else branch) — every instrument carries a spread.
  if v_cls = 'FX' then
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = v_sym limit 1;
    select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = v_sym limit 1;
    -- pip MUST mirror fx-prices Edge pip() that produced spr_pts (see fx_open_margin.sql):
    -- JPY=0.01, XAUUSD=0.01, XAGUSD=0.001, else 0.0001. Keep in lockstep with fx_open.
    v_pip := case when v_sym like '%JPY' then 0.01
                  when v_sym = 'XAUUSD' then 0.01
                  when v_sym = 'XAGUSD' then 0.001
                  else 0.0001 end;
    v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
  else
    -- NON-FX (crypto/stock/index): HYBRID — the greater of the house FLOOR (bps) and the
    -- REAL exchange spread (spr_pts, carried in BPS for these classes by crypto-prices
    -- bookTicker; 0 when no book → floor applies). Calm markets show the floor; volatile/
    -- illiquid pairs widen automatically. FULL round-trip bps; one-way = bps/2. MUST match
    -- trading.html ALPEXA_SPREAD_BPS + fxHalfSpread (lockstep) or floating ≠ realized.
    -- MT5 convention: every instrument carries a dealing spread — the house earns it.
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = v_sym limit 1;
    v_half := v_mid * greatest(
        (case v_cls when 'CRYPTO' then 10 when 'STOCK' then 8 when 'INDEX' then 6 else 0 end),
        coalesce(v_spr,0)
      ) / 10000.0 / 2.0;
  end if;
  v_close := v_mid + (case when upper(v_side) = 'BUY' then -v_half else v_half end);

  -- P&L (exact port of the client engine), USD
  v_lot  := case when v_sym = 'XAUUSD' then 100 when v_sym = 'XAGUSD' then 5000 when v_cls = 'FX' then 100000 else 1 end;
  v_dist := (v_close - v_open) * (case when upper(v_side) = 'BUY' then 1 else -1 end);
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

  -- SWAP (2026-07-19 fx_swap.sql): 야간 크론이 meta.swap에 적립한 스왑을 청산 실현에 포함 —
  -- "표시되는 스왑 == 정산되는 스왑" 불변식. 적립이 없으면 0 (기존 동작 그대로).
  v_pnl := round(v_pnl + coalesce((select (meta->>'swap')::numeric from public.positions
             where local_id = p_local_id and acct_no = v_acct and server = 'fx' limit 1), 0), 2);

  -- ATOMIC CLAIM: close only if still open (prevents double-bank across devices)
  update public.positions set status = 'closed', pnl = v_pnl
    where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'open';
  if not found then return jsonb_build_object('ok',true,'duplicate',true); end if;

  -- Record the settlement. settlements has trg_settlement_balance (AFTER INSERT)
  -- which applies pnl to accounts.balance — so this ONE insert both banks the P&L
  -- and writes the closed-trade history the app reads. (Do NOT also write `ledger`:
  -- it has its own balance trigger and would double-count.)
  insert into public.settlements(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail)
    values (v_cust, v_acct, 'fx', 'fx_close', p_local_id, v_sym, v_size, v_pnl,
            upper(v_side)||' '||v_size||' @ '||v_open||' -> '||round(v_close,5));

  return jsonb_build_object('ok',true,'pnl',v_pnl,'close',round(v_close,6),'side',upper(v_side),'size',v_size);
end;$$;
