-- Alpexa — fx_open SESSION GATE (server-side market-hours enforcement)  ⚠ DRAFT — TEST BEFORE PROD
-- =============================================================================================
-- Mirrors the webtrade.html client `marketOpen()` so the server REJECTS an order when the symbol's
-- market is closed — the client gate is display-only; THIS is the real gate (CLAUDE.md #5).
-- Sessions (UTC): Crypto 24/7 · Forex Sun 22:00 → Fri 22:00 · US stocks Mon–Fri 13:30–20:00 minus
-- US market holidays. NOTE: the stock window is EDT-fixed (13:30–20:00 UTC); add a DST rule for EST.
--
-- Claude cannot deploy or test SQL — deploy this yourself and verify with a weekend order (must be
-- rejected with 'market closed') and a weekday order (must pass) BEFORE relying on it.
-- =============================================================================================

-- Asset class from the symbol (matches the client SYM_CAT: only these symbols are tradeable).
create or replace function public.fx_symbol_class(p_symbol text)
returns text language sql immutable as $$
  select case
    when upper(p_symbol) in ('BTCUSD','ETHUSD','SOLUSD','XRPUSD','DOGEUSD') then 'CRYPTO'
    when upper(p_symbol) in ('AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META') then 'STOCK'
    else 'FX'
  end;
$$;

-- US market holidays (extend yearly). Keep in lockstep with the client US_MARKET_HOLIDAYS set.
create or replace function public.fx_is_us_holiday(p_day date)
returns boolean language sql immutable as $$
  select p_day in (
    date '2026-01-01', date '2026-01-19', date '2026-02-16', date '2026-04-03', date '2026-05-25',
    date '2026-06-19', date '2026-07-03', date '2026-09-07', date '2026-11-26', date '2026-12-25',
    date '2027-01-01'
  );
$$;

-- TRUE when the symbol's session is open at p_at (default now). Pure UTC math.
create or replace function public.fx_market_open(p_symbol text, p_at timestamptz default now())
returns boolean language plpgsql immutable as $$
declare
  v_cls  text := public.fx_symbol_class(p_symbol);
  v_at   timestamptz := p_at at time zone 'UTC';
  v_dow  int := extract(dow from v_at);          -- 0=Sun … 6=Sat
  v_min  int := extract(hour from v_at)*60 + extract(minute from v_at);
begin
  if v_cls = 'CRYPTO' then
    return true;                                  -- 24/7
  elsif v_cls = 'FX' then
    if v_dow = 6 then return false; end if;        -- Sat closed
    if v_dow = 0 then return v_min >= 22*60; end if;-- Sun opens 22:00 UTC
    if v_dow = 5 then return v_min <  22*60; end if;-- Fri closes 22:00 UTC
    return true;                                    -- Mon–Thu
  else                                              -- STOCK
    if v_dow = 0 or v_dow = 6 then return false; end if;
    if public.fx_is_us_holiday((v_at)::date) then return false; end if;
    return v_min >= 13*60+30 and v_min < 20*60;     -- 13:30–20:00 UTC (ET 09:30–16:00 EDT)
  end if;
end;
$$;

-- ── WIRING: add this guard at the TOP of fx_open (right after resolving p_symbol), before any
--    price read / margin check / insert. Reject closed markets with the same shape as other errors:
--
--   if not public.fx_market_open(p_symbol) then
--     return jsonb_build_object('ok', false, 'error', 'market closed', 'code', 'MARKET_CLOSED');
--   end if;
--
-- Keep fx_open otherwise unchanged. The client already shows 🔒 + refuses; this makes it enforceable.
