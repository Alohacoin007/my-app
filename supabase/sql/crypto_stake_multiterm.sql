-- Alpexa — multi-term staking (same coin in flexible / 90d / 1y at the same time)
-- ============================================================================
-- Today crypto_stakes is keyed by (acct_no, asset) — ONE stake per coin, term
-- locked to the first stake. Only USDT & ALPXS are stakeable, and the welcome
-- bonus already locks ALPXS to 1y, so a user can never use flexible/90d. Fix:
-- key by (acct_no, asset, period) so a coin can hold multiple terms at once.
-- ============================================================================

-- ① Schema: PK (acct_no, asset) → (acct_no, asset, period).
--    Existing rows (one per asset) stay valid (distinct period). period is NOT NULL
--    on every insert path, so the new PK is safe.
do $$
declare pk text;
begin
  select conname into pk from pg_constraint
   where conrelid = 'public.crypto_stakes'::regclass and contype = 'p';
  if pk is not null then execute format('alter table public.crypto_stakes drop constraint %I', pk); end if;
end $$;
alter table public.crypto_stakes alter column period set not null;
alter table public.crypto_stakes add constraint crypto_stakes_pkey primary key (acct_no, asset, period);

-- ② stake_crypto: on-conflict now targets (acct_no, asset, period) so a new term
--    creates a SEPARATE row instead of merging into the existing one.
create or replace function public.stake_crypto(p_ref text, p_acct text, p_asset text, p_usd numeric, p_period text DEFAULT 'flexible'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text;
        v_price numeric; v_pts timestamptz; v_have numeric; v_qty numeric;
        v_now bigint := (extract(epoch from now())*1000)::bigint;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_usd is null or p_usd <= 0 then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if p_period not in ('flexible','90d','1y') then return jsonb_build_object('ok',false,'error','bad period'); end if;
  select * into v_acct from public.accounts where acct_no=p_acct and server='crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from public.players p where p.id=v_acct.player_id and p.auth_id=v_uid) then
    return jsonb_build_object('ok',false,'error','not your account'); end if;
  select cust_id into v_cust from public.players where id=v_acct.player_id;
  if exists (select 1 from public.crypto_trades where ref=p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true); end if;

  if p_asset='USDT' then v_price:=1; else
    select mid, updated_at into v_price, v_pts from public.prices where symbol=p_asset limit 1;
    if v_price is null or v_price<=0 then return jsonb_build_object('ok',false,'error','no price for '||p_asset); end if;
    if v_pts is null or (now()-v_pts) > interval '120 seconds' then
      return jsonb_build_object('ok',false,'error','price unavailable (stale)'); end if;
  end if;
  v_qty := round((p_usd / v_price)::numeric, 8);

  select coalesce(qty,0) into v_have from public.crypto_holdings where acct_no=p_acct and asset=p_asset;
  if coalesce(v_have,0) < v_qty - 1e-9 then
    return jsonb_build_object('ok',false,'error','insufficient '||p_asset,'have',coalesce(v_have,0)); end if;

  insert into public.crypto_trades(ref,cust_id,acct_no,asset,side,usd,qty,price,fee)
    values (p_ref, v_cust, p_acct, p_asset, 'stake', p_usd, v_qty, v_price, 0);

  update public.crypto_holdings set qty = round((qty - v_qty)::numeric,8), updated_at=now()
    where acct_no=p_acct and asset=p_asset;

  insert into public.crypto_stakes(acct_no, asset, usd, period, since, staked_at, updated_at)
    values (p_acct, p_asset, round(p_usd,2), p_period, v_now, v_now, now())
    on conflict (acct_no, asset, period) do update
      set usd = round((public.crypto_stakes.usd + excluded.usd)::numeric,2),
          staked_at = coalesce(public.crypto_stakes.staked_at, excluded.staked_at),
          updated_at = now();

  return jsonb_build_object('ok',true,'staked',p_usd,'qty',v_qty,'asset',p_asset,'period',p_period);
end;$function$;

-- ③ unstake_crypto: now takes p_period and targets that specific (asset, period) row.
drop function if exists public.unstake_crypto(text, text, text);
create or replace function public.unstake_crypto(p_ref text, p_acct text, p_asset text, p_period text DEFAULT 'flexible'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text;
        v_st public.crypto_stakes%rowtype; v_lockdays int; v_mat bigint;
        v_price numeric; v_pts timestamptz; v_qty numeric;
        v_now bigint := (extract(epoch from now())*1000)::bigint;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  select * into v_acct from public.accounts where acct_no=p_acct and server='crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from public.players p where p.id=v_acct.player_id and p.auth_id=v_uid) then
    return jsonb_build_object('ok',false,'error','not your account'); end if;
  select cust_id into v_cust from public.players where id=v_acct.player_id;
  if exists (select 1 from public.crypto_trades where ref=p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true); end if;

  select * into v_st from public.crypto_stakes where acct_no=p_acct and asset=p_asset and period=p_period;
  if v_st.acct_no is null or coalesce(v_st.usd,0) <= 0 then
    return jsonb_build_object('ok',false,'error','no stake'); end if;

  v_lockdays := case v_st.period when '90d' then 90 when '1y' then 365 else 0 end;
  if v_lockdays > 0 then
    v_mat := coalesce(v_st.staked_at, v_st.since) + v_lockdays::bigint * 86400000;
    if v_now < v_mat then
      return jsonb_build_object('ok',false,'error','still locked','maturity',v_mat); end if;
  end if;

  if p_asset = 'USDT' then v_price := 1; else
    select mid, updated_at into v_price, v_pts from public.prices where symbol=p_asset limit 1;
    if v_price is null or v_price <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_asset); end if;
    if v_pts is null or (now()-v_pts) > interval '120 seconds' then
      return jsonb_build_object('ok',false,'error','price unavailable (stale)'); end if;
  end if;

  v_qty := round((coalesce(v_st.usd,0) / v_price)::numeric, 8);

  insert into public.crypto_trades(ref,cust_id,acct_no,asset,side,usd,qty,price,fee)
    values (p_ref, v_cust, p_acct, p_asset, 'unstake', coalesce(v_st.usd,0), v_qty, v_price, 0);

  insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
    values (p_acct, p_asset, v_qty, now())
    on conflict (acct_no, asset) do update
      set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric,8), updated_at=now();
  delete from public.crypto_stakes where acct_no=p_acct and asset=p_asset and period=p_period;

  return jsonb_build_object('ok',true,'usd',coalesce(v_st.usd,0),'qty',v_qty,'asset',p_asset,'period',p_period);
end;$function$;
