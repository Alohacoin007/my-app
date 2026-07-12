-- Alpexa — SL/TP for open FX positions: fx_modify (set) + fx_sltp (enforce)   ⚠ DRAFT — TEST BEFORE PROD
-- =============================================================================================
-- The webtrade terminal writes SL/TP into positions.meta (jsonb) via fx_modify, and a 1-minute cron
-- (fx_sltp) force-closes a position the instant the live mid crosses its SL or TP — using the SAME
-- close path as fx_stopout (atomic claim + settlements insert → trg_settlement_balance banks it).
-- Claude cannot deploy or test SQL — deploy this and verify (set a tight SL on a demo position and
-- watch it auto-close on the next sweep) BEFORE relying on it.
-- =============================================================================================

-- 1) fx_modify — the trader's own open FX position gets sl/tp written into meta. Auth + side check.
create or replace function public.fx_modify(p_local_id text, p_sl numeric default null, p_tp numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_acct text; v_side text; v_sym text; v_mid numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select a.acct_no into v_acct
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;

  select side, symbol into v_side, v_sym from public.positions
   where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'open' limit 1;
  if v_side is null then return jsonb_build_object('ok',false,'error','position not found'); end if;

  -- SL/TP must be on the correct side of the CURRENT market (null = clear the level)
  select mid into v_mid from public.prices where symbol = v_sym limit 1;
  if v_mid is not null and v_mid > 0 then
    if p_sl is not null and ((upper(v_side)='BUY' and p_sl >= v_mid) or (upper(v_side)='SELL' and p_sl <= v_mid))
      then return jsonb_build_object('ok',false,'error','SL on wrong side of market'); end if;
    if p_tp is not null and ((upper(v_side)='BUY' and p_tp <= v_mid) or (upper(v_side)='SELL' and p_tp >= v_mid))
      then return jsonb_build_object('ok',false,'error','TP on wrong side of market'); end if;
  end if;

  update public.positions
     set meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('sl', p_sl, 'tp', p_tp)
   where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'open';
  return jsonb_build_object('ok',true,'sl',p_sl,'tp',p_tp);
end;$function$;
revoke all on function public.fx_modify(text,numeric,numeric) from public, anon;
grant execute on function public.fx_modify(text,numeric,numeric) to authenticated;

-- 2) fx_sltp — cron sweep: force-close any open FX position whose live mid has crossed its SL or TP.
--    Reuses fx_realized_pnl (the shared helper fx_stopout uses) + the same atomic-claim/settlement
--    close, so realized P&L and balance move identically. Skips unpriced/stale symbols (safe).
create or replace function public.fx_sltp(p_max int default 1000)
returns jsonb language plpgsql as $function$
declare
  r_pos record; v_sl numeric; v_tp numeric; v_mid numeric; v_pts timestamptz;
  v_side text; v_hit text; v_pnl numeric; v_closed int := 0;
begin
  for r_pos in
    select po.* from public.positions po
     where po.server = 'fx' and po.status = 'open'
       and ((po.meta ? 'sl' and (po.meta->>'sl') is not null)
         or (po.meta ? 'tp' and (po.meta->>'tp') is not null))
     limit p_max
  loop
    v_sl := nullif(r_pos.meta->>'sl','')::numeric;
    v_tp := nullif(r_pos.meta->>'tp','')::numeric;
    if v_sl is null and v_tp is null then continue; end if;

    select mid, updated_at into v_mid, v_pts from public.prices where symbol = r_pos.symbol limit 1;
    if v_mid is null or v_mid <= 0 then continue; end if;                          -- can't price → skip (safe)
    if v_pts is null or (now() - v_pts) > interval '120 seconds' then continue; end if;  -- stale → skip

    v_side := upper(r_pos.side); v_hit := null;
    if v_side = 'BUY' then
      if    v_sl is not null and v_mid <= v_sl then v_hit := 'SL';
      elsif v_tp is not null and v_mid >= v_tp then v_hit := 'TP'; end if;
    else -- SELL
      if    v_sl is not null and v_mid >= v_sl then v_hit := 'SL';
      elsif v_tp is not null and v_mid <= v_tp then v_hit := 'TP'; end if;
    end if;
    if v_hit is null then continue; end if;

    v_pnl := public.fx_realized_pnl(r_pos.symbol, r_pos.side, r_pos.open_price, r_pos.size);
    if v_pnl is null then continue; end if;

    update public.positions set status = 'closed', pnl = v_pnl
      where local_id = r_pos.local_id and acct_no = r_pos.acct_no and server = 'fx' and status = 'open';
    if found then   -- atomic claim: only the sweep that flips 'open'→'closed' banks it (no double vs manual close)
      insert into public.settlements(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail)
        values (r_pos.cust_id, r_pos.acct_no, 'fx', 'fx_close', r_pos.local_id, r_pos.symbol, r_pos.size, v_pnl,
                v_hit||' '||v_side||' '||r_pos.size||' @ '||r_pos.open_price||' → '||round(v_mid,6));
      v_closed := v_closed + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'closed', v_closed);
end;$function$;
revoke all on function public.fx_sltp(int) from public, anon, authenticated;   -- cron / postgres only

-- 3) schedule the sweep every minute (alongside fx_stopout)
select cron.unschedule('fx_sltp') where exists (select 1 from cron.job where jobname = 'fx_sltp');
select cron.schedule('fx_sltp', '* * * * *', $$ select public.fx_sltp(); $$);

-- verify:  update positions set meta = meta || '{"sl":1.14}'::jsonb where local_id='...';  select public.fx_sltp();
