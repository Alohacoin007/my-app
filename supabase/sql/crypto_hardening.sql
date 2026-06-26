-- Alpexa — crypto_holdings hardening (close the "fake balance" hole #3)
-- ============================================================================
-- GOAL: clients must NOT be able to write crypto_holdings directly. Today the
-- client mirrors local `balances` to the server (crypto-live.html:13511 upsert),
-- which means a user could console-write arbitrary qty. We move EVERY balance-
-- changing op to a SECURITY DEFINER RPC (server validates + writes), then lock
-- crypto_holdings writes to admin/RPC only.
--
-- STATUS OF EACH OP (audit 2026-06-26):
--   buy / sell ............. crypto_trade RPC            ✅ already server-side
--   deposit / withdraw ..... DB triggers                ✅ already server-side
--   transfer ............... app_transfer RPC           ✅ already server-side
--   referral credit ........ redeem_referral RPC        ✅ already server-side
--   security redeem ........ = a SELL → REUSE crypto_trade(side='sell')   (app change only)
--   liquidate all .......... = SELL each coin → REUSE crypto_trade(p_all=true) (app change only)
--   swap (coin→coin) ....... swap_crypto RPC            ⬇ NEW (this file)
--   stake / unstake ........ touches crypto_stakes      ⬜ TODO (needs stake_crypto/unstake_crypto RPC — next session)
--
-- ORDER TO DEPLOY:
--   1) Deploy swap_crypto (below).                          [this file, part A]
--   2) App: route swap/redeem/liquidate through RPCs (no local setBalances+push).
--   3) Build + deploy stake_crypto / unstake_crypto (next session).
--   4) App: route stake/unstake through RPCs.
--   5) TEST everything on test acct CR-529168.
--   6) ONLY THEN apply the RLS lock (part B) — locking earlier breaks swap/redeem/etc.
-- ============================================================================


-- ===== PART A — swap_crypto RPC (safe to deploy now; nothing calls it yet) =====
-- Atomic coin→coin (or to/from USDT) swap at SERVER prices. Mirrors crypto_trade:
-- client never sets the price; stale feed (>120s) is rejected; idempotent by ref.
create or replace function public.swap_crypto(
  p_ref text, p_acct text, p_from text, p_to text, p_usd numeric, p_markup numeric default 0
) returns jsonb language plpgsql security definer
  set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text;
        v_fp numeric; v_tp numeric; v_fpts timestamptz; v_tpts timestamptz;
        v_have numeric; v_fromqty numeric; v_fee numeric; v_net numeric; v_toqty numeric; v_mk numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_usd is null or p_usd <= 0 then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if p_from = p_to then return jsonb_build_object('ok',false,'error','same asset'); end if;

  -- ownership: this crypto account belongs to the signed-in user
  select * into v_acct from public.accounts where acct_no = p_acct and server = 'crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from public.players p where p.id = v_acct.player_id and p.auth_id = v_uid) then
    return jsonb_build_object('ok',false,'error','not your account');
  end if;
  select cust_id into v_cust from public.players where id = v_acct.player_id;

  -- idempotent: same ref never double-applies (reuses crypto_trades as the lock+log)
  if exists (select 1 from public.crypto_trades where ref = p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  -- SERVER prices (USDT = 1, always fresh). Reject stale feed for real assets.
  if p_from = 'USDT' then v_fp := 1; else
    select mid, updated_at into v_fp, v_fpts from public.prices where symbol = p_from limit 1;
    if v_fp is null or v_fp <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_from); end if;
    if v_fpts is null or (now() - v_fpts) > interval '120 seconds' then
      return jsonb_build_object('ok',false,'error','price unavailable (stale)'); end if;
  end if;
  if p_to = 'USDT' then v_tp := 1; else
    select mid, updated_at into v_tp, v_tpts from public.prices where symbol = p_to limit 1;
    if v_tp is null or v_tp <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_to); end if;
    if v_tpts is null or (now() - v_tpts) > interval '120 seconds' then
      return jsonb_build_object('ok',false,'error','price unavailable (stale)'); end if;
  end if;

  v_mk := least(greatest(coalesce(p_markup,0),0),50);  -- house markup %, cap 50

  -- sell p_usd worth of `from`
  v_fromqty := round((p_usd / v_fp)::numeric, 8);
  select coalesce(qty,0) into v_have from public.crypto_holdings where acct_no = p_acct and asset = p_from;
  if coalesce(v_have,0) < v_fromqty - 1e-9 then
    return jsonb_build_object('ok',false,'error','insufficient holdings','have',coalesce(v_have,0)); end if;

  v_fee   := round(p_usd * (v_mk / 100.0), 2);
  v_net   := p_usd - v_fee;
  v_toqty := round((v_net / v_tp)::numeric, 8);
  if v_toqty <= 0 then return jsonb_build_object('ok',false,'error','amount too small'); end if;

  -- lock+log FIRST (idempotency), then move holdings — mirrors crypto_trade order.
  insert into public.crypto_trades(ref, cust_id, acct_no, asset, side, usd, qty, price, fee)
    values (p_ref, v_cust, p_acct, p_from||'>'||p_to, 'swap', p_usd, v_toqty, v_tp, v_fee);

  update public.crypto_holdings set qty = round((qty - v_fromqty)::numeric, 8), updated_at = now()
    where acct_no = p_acct and asset = p_from;
  insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
    values (p_acct, p_to, v_toqty, now())
    on conflict (acct_no, asset) do update
      set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();

  return jsonb_build_object('ok',true,'fromQty',v_fromqty,'toQty',v_toqty,'fee',v_fee,'net',v_net,'price',v_tp);
end;$$;


-- ===== PART B — RLS LOCK (⚠ DO NOT RUN until steps 1–5 above are done + tested) =====
-- This is what actually CLOSES the hole. Run it LAST. Until swap/stake/unstake all
-- go through RPCs, running this breaks those features (they can't write holdings).
--
-- ⚠ VERIFY the existing policy names first (Supabase → Auth → Policies → crypto_holdings).
--   The reminder noted the current policy is roughly "is_admin() OR owns_acct(acct_no)".
--   We keep READ for the owner, but make WRITE admin/RPC-only (SECURITY DEFINER RPCs
--   bypass RLS, so trade/swap/stake keep working).
--
-- -- 1) keep owner READ (adjust name to the real one):
-- drop policy if exists crypto_holdings_rw on public.crypto_holdings;
-- create policy crypto_holdings_read on public.crypto_holdings
--   for select using (public.is_admin() OR public.owns_acct(acct_no));
-- -- 2) WRITE = admin only (RPCs are SECURITY DEFINER → unaffected):
-- create policy crypto_holdings_admin_write on public.crypto_holdings
--   for all using (public.is_admin()) with check (public.is_admin());
