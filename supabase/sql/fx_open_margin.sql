-- Alpexa — D13: fx_open enforces MARGIN server-side (DRAFT — TEST BEFORE PROD).
-- ============================================================================
-- Today neither the client (canPlace ignores balance) nor fx_open checks margin, so a
-- position of ANY size can be opened with $0 — unbounded house exposure. This adds a
-- server margin gate that mirrors the client's display math EXACTLY (proven in
-- tests/fx-margin.test.js): a new position is rejected unless the account's balance
-- covers (margin already used by open FX positions) + (this position's margin).
--
--   margin = notional_usd / leverage_cap[cls]
--   lot:      XAUUSD=100, XAGUSD=5000, cls FX=100000, else 1
--   notional: non-FX        → size*lot*price
--             FX quote=USD   → size*lot*price          (EURUSD, XAUUSD, XAGUSD)
--             FX base=USD    → size*lot                (USDJPY)
--             FX cross       → size*lot*ccyToUsd(base) (EURGBP)
--   lev cap:  FX=100, INDEX=20, STOCK=5, CRYPTO=5, else 1 (conservative)
--
-- ⚠️ TEST PLAN (run on a real session BEFORE trusting it):
--   1) balance $2000, open EURUSD 1.0 lot @~1.10 → OK (margin ~$1100, free ~$900).
--   2) immediately open another EURUSD 1.0 lot → REJECTED ('insufficient margin').
--   3) tiny size (0.01 lot) → OK. Compare the 'required' in the error to the app's
--      "Required margin" line — they must match.
--   4) a cross pair (e.g. EURGBP) → OK if EURUSD price exists; if the cross reference is
--      missing it is rejected ('margin unavailable') — that's the conservative side.
--   Keep the previous fx_open handy to roll back if a legit trade is wrongly rejected.
-- ============================================================================

-- USD value of 1 unit of a currency code, from the live prices table (live reference).
create or replace function public.fx_ccy_to_usd(p_code text)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select case
    when p_code = 'USD' then 1::numeric
    when (select mid from public.prices where symbol = p_code||'USD' limit 1) is not null
      then (select mid from public.prices where symbol = p_code||'USD' limit 1)
    when (select mid from public.prices where symbol = 'USD'||p_code limit 1) > 0
      then 1.0 / (select mid from public.prices where symbol = 'USD'||p_code limit 1)
    else null end;
$$;

-- Notional value in USD — mirrors trading.html getNotionalUSD exactly.
create or replace function public.fx_notional_usd(p_symbol text, p_cls text, p_size numeric, p_price numeric)
returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v_lot numeric; v_base text; v_quote text; v_conv numeric;
begin
  v_lot := case when p_symbol='XAUUSD' then 100 when p_symbol='XAGUSD' then 5000
                when p_cls='FX' then 100000 else 1 end;
  if p_cls <> 'FX' then return p_size * v_lot * p_price; end if;
  v_base := substr(p_symbol,1,3); v_quote := substr(p_symbol,4,3);
  if v_quote = 'USD' then return p_size * v_lot * p_price; end if;
  if v_base = 'USD' then return p_size * v_lot; end if;
  v_conv := public.fx_ccy_to_usd(v_base);            -- cross pair
  if v_conv is null then return null; end if;        -- no reference → caller rejects
  return p_size * v_lot * v_conv;
end;$$;

-- House leverage cap per class (the client's DEFAULT_LEVERAGE = the max allowed).
create or replace function public.fx_lev_cap(p_cls text)
returns numeric language sql immutable as $$
  select case p_cls when 'FX' then 100 when 'INDEX' then 20
                    when 'STOCK' then 5 when 'CRYPTO' then 5 else 1 end::numeric;
$$;

create or replace function public.fx_open(
  p_local_id text, p_symbol text, p_side text, p_size numeric
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_acct text; v_cust text; v_cls text;
  v_mid numeric; v_pts timestamptz; v_open numeric; v_side text;
  v_bal numeric; v_lev numeric; v_notional numeric; v_new_margin numeric; v_used numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_size is null or p_size <= 0 then return jsonb_build_object('ok',false,'error','bad size'); end if;
  v_side := upper(coalesce(p_side,''));
  if v_side not in ('BUY','SELL') then return jsonb_build_object('ok',false,'error','bad side'); end if;

  -- caller's FX account (via auth.uid())
  select a.acct_no, pl.cust_id into v_acct, v_cust
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid
   limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;

  -- class spec (reject unknown -> client fallback)
  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||p_symbol); end if;

  -- SERVER entry price + freshness
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_symbol); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;
  v_open := v_mid;

  -- idempotent: same local_id never creates two positions
  if exists (select 1 from public.positions where local_id = p_local_id and acct_no = v_acct and server = 'fx') then
    select open_price into v_open from public.positions where local_id = p_local_id and acct_no = v_acct and server = 'fx' limit 1;
    return jsonb_build_object('ok',true,'duplicate',true,'open',v_open);
  end if;

  -- ── D13 MARGIN GATE ─────────────────────────────────────────────────────
  -- Need: balance >= (margin already used by open FX positions) + (this margin).
  select balance into v_bal from public.accounts where acct_no = v_acct;
  v_lev := public.fx_lev_cap(v_cls);
  v_notional := public.fx_notional_usd(p_symbol, v_cls, p_size, v_open);
  if v_notional is null then
    return jsonb_build_object('ok',false,'error','margin unavailable (no FX reference for '||p_symbol||')');
  end if;
  v_new_margin := v_notional / v_lev;
  select coalesce(sum(
           public.fx_notional_usd(po.symbol, sp.cls, po.size, po.open_price) / public.fx_lev_cap(sp.cls)
         ), 0)
    into v_used
    from public.positions po
    join public.fx_specs sp on sp.symbol = po.symbol
   where po.acct_no = v_acct and po.server = 'fx' and po.status = 'open';
  if coalesce(v_bal,0) < v_used + v_new_margin - 0.000001 then
    return jsonb_build_object('ok',false,'error','insufficient margin',
      'required', round(v_new_margin,2), 'free', round(coalesce(v_bal,0) - v_used, 2));
  end if;
  -- ────────────────────────────────────────────────────────────────────────

  insert into public.positions(cust_id, acct_no, server, kind, local_id, symbol, side, size, open_price, pnl, status)
    values (v_cust, v_acct, 'fx', 'position', p_local_id, p_symbol, v_side, p_size, round(v_open::numeric,8), 0, 'open');

  return jsonb_build_object('ok',true,'open',round(v_open,6),'symbol',p_symbol,'side',v_side,'size',p_size,
                            'margin',round(v_new_margin,2));
end;$$;
