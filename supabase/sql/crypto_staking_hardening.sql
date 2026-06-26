-- Alpexa — crypto STAKING hardening  (⚠ DRAFT — review before deploying; nothing calls these yet)
-- ============================================================================
-- Closes the staking half of the "fake balance" hole + fixes a real maturity bug.
--
-- MODEL (crypto_stakes, PK(acct_no,asset)):
--   usd     = compounded principal (stake-accrue grows it daily)
--   since   = last-accrual marker (ADVANCES each accrual)  ← do NOT use for maturity
--   period  = 'flexible' | '90d' | '1y'
-- App today: stake = debit USDT, +crypto_stakes.usd ; unstake = credit the asset
--            coins worth `usd`, delete the stake.
--
-- 🐛 BUG THIS FIXES: stakeMaturity = since + lockDays, but `since` advances with
--    accrual → a locked (90d/1y) stake's maturity keeps sliding forward and never
--    unlocks. FIX = an IMMUTABLE `staked_at` used only for maturity.
--
-- DEPLOY ORDER (later, reviewed, on test acct CR-529168):
--   1) Part A: ALTER staked_at + backfill.
--   2) Part B: stake_crypto + unstake_crypto RPCs.
--   3) App: onStakeConfirmed→stake_crypto, onUnstakeConfirmed→unstake_crypto.
--   4) App + stake-accrue: maturity from `staked_at` (not `since`); app select adds staked_at.
--   5) TEST stake/add/unstake (flexible + locked) on CR-529168.
--   6) Part C: crypto_stakes RLS lock — LAST.
-- (Only after 1–6 + the crypto_holdings lock is the hole actually closed.)
-- ============================================================================


-- ===== PART A — immutable original start (fixes lock-never-matures) =====
alter table public.crypto_stakes add column if not exists staked_at bigint;   -- epoch ms, like `since`
update public.crypto_stakes set staked_at = since where staked_at is null and since is not null;


-- ===== PART B — stake / unstake RPCs (SECURITY DEFINER, same safety as crypto_trade) =====

create or replace function public.stake_crypto(
  p_ref text, p_acct text, p_asset text, p_usd numeric, p_period text default 'flexible'
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text;
        v_cash numeric; v_now bigint := (extract(epoch from now())*1000)::bigint;
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

  -- fund the stake from USDT cash
  select coalesce(qty,0) into v_cash from public.crypto_holdings where acct_no=p_acct and asset='USDT';
  if coalesce(v_cash,0) < p_usd then
    return jsonb_build_object('ok',false,'error','insufficient USDT','balance',coalesce(v_cash,0)); end if;

  insert into public.crypto_trades(ref,cust_id,acct_no,asset,side,usd,qty,price,fee)
    values (p_ref, v_cust, p_acct, p_asset, 'stake', p_usd, 0, 0, 0);

  update public.crypto_holdings set qty = round((qty - p_usd)::numeric,8), updated_at=now()
    where acct_no=p_acct and asset='USDT';

  -- add to an existing stake (keep its term + clocks) or open a new one
  insert into public.crypto_stakes(acct_no, asset, usd, period, since, staked_at, updated_at)
    values (p_acct, p_asset, round(p_usd,2), p_period, v_now, v_now, now())
    on conflict (acct_no, asset) do update
      set usd = round((public.crypto_stakes.usd + excluded.usd)::numeric,2), updated_at=now();
      -- period / since / staked_at intentionally KEPT from the existing row

  return jsonb_build_object('ok',true,'staked',p_usd,'asset',p_asset,'period',p_period);
end;$$;


create or replace function public.unstake_crypto(
  p_ref text, p_acct text, p_asset text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
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

  select * into v_st from public.crypto_stakes where acct_no=p_acct and asset=p_asset;
  if v_st.acct_no is null or coalesce(v_st.usd,0) <= 0 then
    return jsonb_build_object('ok',false,'error','no stake'); end if;

  -- LOCK check via IMMUTABLE staked_at (NOT `since`, which advances with accrual)
  v_lockdays := case v_st.period when '90d' then 90 when '1y' then 365 else 0 end;
  if v_lockdays > 0 then
    v_mat := coalesce(v_st.staked_at, v_st.since) + v_lockdays::bigint * 86400000;
    if v_now < v_mat then
      return jsonb_build_object('ok',false,'error','still locked','maturity',v_mat); end if;
  end if;

  -- price the payout asset (USDT=1; else fresh server price)
  if p_asset = 'USDT' then v_price := 1; else
    select mid, updated_at into v_price, v_pts from public.prices where symbol=p_asset limit 1;
    if v_price is null or v_price <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_asset); end if;
    if v_pts is null or (now()-v_pts) > interval '120 seconds' then
      return jsonb_build_object('ok',false,'error','price unavailable (stale)'); end if;
  end if;

  -- NOTE: pays the stored (full-day-compounded) usd. The app's tiny sub-day pending
  -- accrual is forfeited on unstake (negligible). Match later if desired.
  v_qty := round((coalesce(v_st.usd,0) / v_price)::numeric, 8);

  insert into public.crypto_trades(ref,cust_id,acct_no,asset,side,usd,qty,price,fee)
    values (p_ref, v_cust, p_acct, p_asset, 'unstake', coalesce(v_st.usd,0), v_qty, v_price, 0);

  insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
    values (p_acct, p_asset, v_qty, now())
    on conflict (acct_no, asset) do update
      set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric,8), updated_at=now();
  delete from public.crypto_stakes where acct_no=p_acct and asset=p_asset;

  return jsonb_build_object('ok',true,'usd',coalesce(v_st.usd,0),'qty',v_qty,'asset',p_asset);
end;$$;


-- ===== PART C — crypto_stakes RLS lock (⚠ DO NOT RUN until B + app wired + tested) =====
-- ⚠ VERIFY existing policy names first (Supabase → Policies → crypto_stakes).
--   Keep owner READ; make WRITE admin/RPC-only (SECURITY DEFINER RPCs bypass RLS).
-- drop policy if exists crypto_stakes_rw on public.crypto_stakes;
-- create policy crypto_stakes_read on public.crypto_stakes
--   for select using (public.is_admin() OR public.owns_acct(acct_no));
-- create policy crypto_stakes_admin_write on public.crypto_stakes
--   for all using (public.is_admin()) with check (public.is_admin());
