-- Alpexa — fx_open CONSOLIDATED (margin gate + leverage clamp + SLIPPAGE guard).
-- ============================================================================
-- SUPERSEDES fx_open_margin.sql (4-arg) and fx_open_leverage.sql (5-arg). Deploy this AFTER
-- fx_open_margin.sql (it reuses fx_ccy_to_usd / fx_notional_usd / fx_lev_cap from there).
--
-- Why one function: PostgREST resolves an RPC by the set of argument names sent. Keeping a
-- 4-arg AND a 7-arg-with-defaults version makes a 4-name call AMBIGUOUS ("function is not
-- unique"). So we DROP the old signatures and ship ONE function whose extra params default to
-- NULL — callable with 4 names (old clients) or all 7 (slippage-aware client), unambiguously.
--
-- New params (both optional, NULL = feature off → 100% backward compatible):
--   p_requested_price : the price the trader SAW when they clicked (BUY=ask, SELL=bid).
--   p_max_slippage    : max ADVERSE deviation (price units) they'll accept.
-- SLIPPAGE GUARD: if the server fill (v_open, spread-adjusted) is worse than requested by more
-- than p_max_slippage in the adverse direction, the order is REJECTED (favorable moves still
-- fill — the trader never loses from a better price). This blocks the "clicked at 1.1000, the
-- 250-550ms ECN hop lands at 1.1050" spike-fill. Margin gate, entry price, spread-on-fill and
-- idempotency are unchanged from fx_open_margin/leverage.
-- ============================================================================

-- Remove the older overloads so the new one is the ONLY public.fx_open (no ambiguity).
drop function if exists public.fx_open(text, text, text, numeric);
drop function if exists public.fx_open(text, text, text, numeric, numeric);

create or replace function public.fx_open(
  p_local_id text, p_symbol text, p_side text, p_size numeric,
  p_leverage numeric default null,
  p_requested_price numeric default null,
  p_max_slippage numeric default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_acct text; v_cust text; v_cls text;
  v_mid numeric; v_pts timestamptz; v_open numeric; v_side text;
  v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0;
  v_bal numeric; v_cap numeric; v_lev numeric; v_notional numeric; v_new_margin numeric; v_used numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_size is null or p_size <= 0 then return jsonb_build_object('ok',false,'error','bad size'); end if;
  v_side := upper(coalesce(p_side,''));
  if v_side not in ('BUY','SELL') then return jsonb_build_object('ok',false,'error','bad side'); end if;

  select a.acct_no, pl.cust_id into v_acct, v_cust
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid
   limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;

  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||p_symbol); end if;

  -- SERVER entry price + freshness
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_symbol); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  -- SPREAD ON FILL (FX only): BUY fills at ASK (mid+half), SELL at BID (mid-half).
  -- Keep pip() in lockstep with fx-prices Edge (JPY=0.01, XAUUSD=0.01, XAGUSD=0.001, else 0.0001).
  if v_cls = 'FX' then
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = p_symbol limit 1;
    select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = p_symbol limit 1;
    v_pip := case when p_symbol like '%JPY' then 0.01 when p_symbol='XAUUSD' then 0.01
                  when p_symbol='XAGUSD' then 0.001 else 0.0001 end;
    v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
    v_open := v_mid + (case when v_side = 'BUY' then v_half else -v_half end);
  else
    v_open := v_mid;
  end if;

  -- idempotent: same local_id never opens twice (a retry returns the original fill, no
  -- slippage re-check — the trade already exists at its agreed price).
  if exists (select 1 from public.positions where local_id = p_local_id and acct_no = v_acct and server = 'fx') then
    select open_price into v_open from public.positions where local_id = p_local_id and acct_no = v_acct and server = 'fx' limit 1;
    return jsonb_build_object('ok',true,'duplicate',true,'open',v_open);
  end if;

  -- ── SLIPPAGE GUARD ──────────────────────────────────────────────────────
  -- Reject only when the server fill is ADVERSE beyond tolerance (better price always fills).
  --   BUY  rejected if v_open > requested + max   (paying more than accepted)
  --   SELL rejected if v_open < requested - max   (receiving less than accepted)
  if p_requested_price is not null and p_max_slippage is not null and p_max_slippage >= 0 then
    if (v_side = 'BUY'  and v_open > p_requested_price + p_max_slippage)
    or (v_side = 'SELL' and v_open < p_requested_price - p_max_slippage) then
      return jsonb_build_object('ok',false,'error','slippage exceeded','code','SLIPPAGE',
        'requested', round(p_requested_price,6), 'server', round(v_open,6),
        'max', p_max_slippage, 'side', v_side);
    end if;
  end if;
  -- ────────────────────────────────────────────────────────────────────────

  -- ── MARGIN GATE with CLAMPED client leverage ────────────────────────────
  v_cap := public.fx_lev_cap(v_cls);
  v_lev := least(v_cap, greatest(1, coalesce(p_leverage, v_cap)));   -- client may only be MORE conservative
  select balance into v_bal from public.accounts where acct_no = v_acct;
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
    return jsonb_build_object('ok',false,'error','insufficient margin','code','MARGIN',
      'required', round(v_new_margin,2), 'free', round(coalesce(v_bal,0) - v_used, 2), 'leverage', v_lev);
  end if;
  -- ────────────────────────────────────────────────────────────────────────

  insert into public.positions(cust_id, acct_no, server, kind, local_id, symbol, side, size, open_price, pnl, status)
    values (v_cust, v_acct, 'fx', 'position', p_local_id, p_symbol, v_side, p_size, round(v_open::numeric,8), 0, 'open');

  return jsonb_build_object('ok',true,'open',round(v_open,6),'symbol',p_symbol,'side',v_side,'size',p_size,
                            'margin',round(v_new_margin,2),'leverage',v_lev);
end;$$;

-- tests:
--   select public.fx_open('t-'||floor(random()*1e6)::text,'EURUSD','BUY',0.01, 100, 1.1400, 0.0015);  -- fills if server ask <= 1.1415
--   select public.fx_open('t-'||floor(random()*1e6)::text,'EURUSD','BUY',0.01, 100, 1.1000, 0.0005);  -- rejects (SLIPPAGE) if server ask > 1.1005
