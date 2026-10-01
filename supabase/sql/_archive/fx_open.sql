-- Alpexa — fx_open RPC (server-centre)
-- Opens an FX/CFD position with a SERVER-decided entry price (from `prices`, fresh)
-- and creates the positions row server-side, so the entry price can't be forged by
-- a client to manufacture P&L at close. Mirrors fx_close. Idempotent by local_id.
-- Safe by default: missing spec / missing or stale price -> REJECT, and the app
-- falls back to its existing (feed-anchored) client open.
--
-- Entry = server mid (symmetric with fx_close which exits at mid; the house spread
-- can be layered on later via prices.spr_pts). Opening reserves margin client-side
-- and does NOT move cash — realized P&L is banked at close (fx_close).

create or replace function public.fx_open(
  p_local_id text, p_symbol text, p_side text, p_size numeric
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_acct text; v_cust text; v_cls text;
  v_mid numeric; v_pts timestamptz; v_open numeric; v_side text;
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

  -- SERVER entry price + freshness (reject if missing/stale -> client fallback)
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

  insert into public.positions(cust_id, acct_no, server, kind, local_id, symbol, side, size, open_price, pnl, status)
    values (v_cust, v_acct, 'fx', 'position', p_local_id, p_symbol, v_side, p_size, round(v_open::numeric,8), 0, 'open');

  return jsonb_build_object('ok',true,'open',round(v_open,6),'symbol',p_symbol,'side',v_side,'size',p_size);
end;$$;
